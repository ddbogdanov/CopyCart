import { app, BrowserWindow } from 'electron';
import type { FileFilter } from 'electron';
import fs from "fs";
import csv from "csv-parser";
import path from "path";

export class IoService {
	private importCache: Array<any> = new Array()
	private fileCache: Map<string, string> = new Map()
	settings: any = {
		shouldSave: {
			imports: false,
			printFiles: true,
			printFolder: true,
		},
		imports: '',
		printFiles: '',
		printFolder: '',
	}
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
		this.settings.printFiles = printFiles
		this.mainWindow?.webContents.send('settings:update', this.settings)
	}
	setPrintFolder(printFolder: string) {
		this.settings.printFolder = printFolder
		this.mainWindow?.webContents.send('settings:update', this.settings)
	}

	deleteCache(): boolean {
		this.importCache = new Array()
		this.settings.imports = ''
		this.mainWindow?.webContents.send('settings:update', this.settings)
		this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select a file to import'})
		return true;
	}
	deletePrintFiles(): boolean {
		this.settings.printFiles = ''
		this.mainWindow?.webContents.send('settings:update', this.settings)
		this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select print files'})
		return true;
	}
	deletePrintFolder(): boolean {
		this.settings.printFolder = ''
		this.mainWindow?.webContents.send('settings:update', this.settings)
		this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select a print folder'})
		return true;
	}

	saveSettings(settings?: object, isClosing?: boolean): boolean {
		if(isClosing) {
			if(!this.settings.shouldSave.imports) this.settings.imports = ''
			if(!this.settings.shouldSave.printFiles) this.settings.printFiles = ''
			if(!this.settings.shouldSave.printFolder) this.settings.printFolder = ''
		}

		const settingsToSave = {...this.settings, ...settings}

		try {
			console.log(`Saving settings to: ${this.settingsPath}`)
			fs.writeFileSync(this.settingsPath, JSON.stringify(settingsToSave), 'utf-8')
			if(!isClosing) this.mainWindow?.webContents.send('settings:saved', true)		
			this.settings = settingsToSave

			return true
		} 
		catch (error) {
			console.error('Error saving settings:', error)
			if(isClosing) this.mainWindow?.webContents.send('settings:saved', false)
			return false
		}
	}
	loadSettings(): Record<string, any> {
		try {
			if(fs.existsSync(this.settingsPath ?? '')) {
				const settingsToRead = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'))

				this.settings.shouldSave = settingsToRead.shouldSave
				this.settings.imports = settingsToRead.imports
				this.settings.printFiles = settingsToRead.printFiles
				this.settings.printFolder = settingsToRead.printFolder

				if(this.settings.imports) {
					this.cacheFile(this.settings.imports)
				}

				this.mainWindow?.webContents.send('settings:update', this.settings)

				console.log("Settings loaded from: " + this.settingsPath)

				return this.settings
			}
		} 
		catch (error) {
			console.error('Error reading settings:', error)
		}

		return {}
	}

	async cacheFile(filePath: string): Promise<boolean> {
		this.settings.imports = filePath
		const ext = path.extname(filePath).toLowerCase()

		if (ext === '.json') {
			const data = fs.readFileSync(filePath, 'utf-8')
			this.importCache = JSON.parse(data)

			this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
			this.mainWindow?.webContents.send('settings:update', this.settings)
			return true
		}
		else if (ext === '.csv') {
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
			console.log("Unsupported file type. Only .json or .csv allowed.")
			this.mainWindow?.webContents.send('settings:update', this.settings)
			this.mainWindow?.webContents.send('toast', 'Error loading input file. Check that the .CSV has fields for <Name>, <Lineitem sku>, and <quantity>')

			return false;
		}

		console.log(`${this.importCache.length} order imports cached from ${filePath}`);
		this.mainWindow?.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
		this.mainWindow?.webContents.send('settings:update', this.settings)
		
		return true;
	}
	async processFiles(): Promise<boolean> {
		await fs.promises.mkdir(this.settings.printFolder, { recursive: true })
		await this.cachePrintFiles()

		if (!this.importCache.length || !this.fileCache) {
			this.mainWindow?.webContents.send('toast', 'File or Import cache is empty — did you load orders and print files first? Is your import file in a correct format?')
			return false
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
				const destPath = path.join(this.settings.printFolder, sanitizePath(`${orderName}-${order.billingName}-${order.sku}-${i}-${index}${ext}`))

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
		const files = await fs.promises.readdir(this.settings.printFiles);
		this.fileCache.clear();

		for (const file of files) {
			const baseName = path.parse(file).name.toLowerCase();
			this.fileCache.set(baseName, path.join(this.settings.printFiles, file));
		}

		console.log(`Cached ${this.fileCache.size} files from ${this.settings.printFiles}`);
  }
}