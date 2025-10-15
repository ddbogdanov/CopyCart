import { app, BrowserWindow } from 'electron';
import type { FileFilter } from 'electron';
import fs from "fs";
import csv from "csv-parser";
import path from "path";

export class IoService {
	private importCache: Array<any> = new Array()
	private fileCache: Map<string, string> = new Map()
	printFiles: string = ''
	printFolder: string = ''
	settingsPath: string = ''
	mainWindow?: BrowserWindow

	constructor() {
		this.settingsPath = path.join(app.getPath('userData'), 'settings.json')
	}

	setMainWindow(mainWindow: BrowserWindow) {
		this.mainWindow = mainWindow
	}

	// param: properties - Electron.Dialog.properties.
	openFileDialog(dialog: Electron.Dialog, title: string, properties: ("openFile" | "openDirectory" | "multiSelections" | "showHiddenFiles" | "createDirectory" | "promptToCreate" | "noResolveAliases" | "treatPackageAsDirectory" | "dontAddToRecent")[], filters: FileFilter[]) {
		return dialog.showOpenDialog({
				title: title,
				buttonLabel: "Select",
				properties: properties,
				filters: filters
		});
 	}

	setPrintFiles(printFiles: string) {
		this.printFiles = printFiles
	}
	setPrintFolder(printFolder: string) {
		this.printFolder = printFolder
	}

	deleteCache(): boolean {
		this.importCache = new Array()
		return true;
	}
	deletePrintFiles(): boolean {
		this.printFiles = ''
		return true;
	}
	deletePrintFolder(): boolean {
		this.printFolder = ''
		return true;
	}

	saveSettings(): boolean {
		let settings = {
			'printFiles': this.printFiles,
			'printFolder': this.printFolder
		}

		try {
			fs.writeFileSync(this.settingsPath, JSON.stringify(settings), 'utf-8')
			return true
		} 
		catch (error) {
			console.error('Error saving settings:', error)
			return false
		}
	}
	loadSettings(): Record<string, any> {
		try {
			if(fs.existsSync(this.settingsPath ?? '')) {
				const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))

				this.printFiles = settings.printFiles
				this.printFolder = settings.printFolder

				console.log("Settings loaded from: " + this.settingsPath)

				return settings
			}
		} 
		catch (error) {
			console.error('Error reading settings:', error)
		}

		return {}
	}

	async cacheFile(filePath: string): Promise<boolean> {
		const ext = path.extname(filePath).toLowerCase()

		if (ext === '.json') {
			const data = fs.readFileSync(filePath, 'utf-8')
			this.importCache = JSON.parse(data)
			return true
		}

		if (ext === '.csv') {
			const rows = await this.parseCSV(filePath)

			this.importCache = []
			const lastBillingByOrder = new Map<string, string>()

			for (const row of rows) {
				const name = row['Name']?.replace('#', '')
				const sku = row['Lineitem sku']?.toLowerCase()
				const quantity = row['Lineitem quantity']
				const billingName = row['Billing Name']?.trim()

				if (!name) continue

				let resolvedBilling = billingName
				if (billingName) {
					lastBillingByOrder.set(name, billingName)
				} else if (lastBillingByOrder.has(name)) {
					resolvedBilling = lastBillingByOrder.get(name)!
				}

				this.importCache.push({
					name: name,
					sku,
					quantity,
					billingName: resolvedBilling ?? ''
				})
			}
		}

		else {
			throw new Error("Unsupported file type. Only .json or .csv allowed.");
		}

		console.log(`${this.importCache.length} order inputs cached from ${filePath}`);
		return true;
	}
	async processFiles(): Promise<boolean> {
		await fs.promises.mkdir(this.printFolder, { recursive: true })
		await this.cachePrintFiles()

		if (!this.importCache.length || !this.fileCache) {
      		throw new Error('File or Import cache is empty — did you load orders and print files first?');
    	}

		const sanitizePath = (str: string) => str.replace(/[<>:"/\\|?*]+/g, '_')
		const totalOrders = this.importCache.length

		for(let [index, order] of this.importCache.entries()) {
			const matchedOrder = this.fileCache.get(order.sku)
			if(!matchedOrder) continue
			
			const copyPromises = new Array<Promise<any>>()
			const ext = path.extname(matchedOrder)
			const orderName = order.name
			let destPath = ''

			for(let i = 0; i < order.quantity; i++) {
				const destPath = path.join(this.printFolder, sanitizePath(`${orderName}-${order.billingName}-${order.sku}-${i}-${index}${ext}`))

				console.log(`Copying: ${matchedOrder} --to--> ${destPath}`)
				copyPromises.push(fs.promises.copyFile(matchedOrder, destPath))
			}		
				
			try {
				await Promise.all(copyPromises)
				this.mainWindow?.webContents.send('update:loading:state', {'isLoading': true, 'progress': ((index / totalOrders)*100), 'status': `Copying... ${destPath}`})
			}
			catch(error) {
				console.error(error)
			}
		}
		
		this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 100, 'status': 'Done'})
		return true
	}

	private parseCSV(filePath: string): Promise<any[]> {
    	return new Promise((resolve, reject) => {
    		const results: any[] = [];
    		fs.createReadStream(filePath)
      			.pipe(csv())
      			.on("data", (data) => results.push(data))
				.on("end", () => resolve(results))
				.on("error", reject);
  		});
	}
	private async cachePrintFiles() {
		const files = await fs.promises.readdir(this.printFiles);
		this.fileCache.clear();

		for (const file of files) {
			const baseName = path.parse(file).name.toLowerCase();
			this.fileCache.set(baseName, path.join(this.printFiles, file));
		}

		console.log(`Cached ${this.fileCache.size} files from ${this.printFiles}`);
  }
}