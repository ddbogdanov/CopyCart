import fs from "fs"
import path from "path"
import log from 'electron-log'
import type { RendererEvents } from './RendererEvents.ts'
import type { SettingsService } from './SettingsService.ts'
import type { ImportService } from './ImportService.ts'

/**
 * Copies one file per ordered quantity into the print folder, streaming
 * progress updates to the renderer.
 */
export class FileCopyService {
	private fileCache: Map<string, string> = new Map()
	private settingsService: SettingsService
	private importService: ImportService
	private events: RendererEvents

	constructor(settingsService: SettingsService, importService: ImportService, events: RendererEvents) {
		this.settingsService = settingsService
		this.importService = importService
		this.events = events
	}

	async processFiles(): Promise<boolean> {
		const settings = this.settingsService.settings

		try {
			await fs.promises.mkdir(settings.printFolder, { recursive: true })
		}
		catch (error) {
			console.error('Failed to create the output folder:', error)
			const reason = (error as any)?.code === 'ENOENT' ? 'not found' : 'unavailable'
			this.events.send('toast', `Could not create the output folder — ${reason}. Reselect the Print Folder, then try again.`)
			return false
		}

		try {
			await this.cachePrintFiles()
		}
		catch (error) {
			console.error('Failed to read the print files folder:', error)
			const reason = (error as any)?.code === 'ENOENT' ? 'not found' : 'unreadable'
			this.events.send('toast', `Could not read the Print Files folder — ${reason}. Check that it still exists, then reselect it.`)
			return false
		}

		if (!this.importService.imports.length) {
			const hasSelection = this.settingsService.settings.imports.length > 0
			this.events.send('toast', hasSelection
				? 'No orders loaded \u2014 the selected file(s) couldn\'t be read. Re-import them, or fix the column mapping in the \u2699 "Configure Import" dialog, then try again.'
				: 'No orders loaded \u2014 import at least one .CSV export first.')
			return false
		}

		// Mapping changed since load — copying stale orders would contradict "no match → no copy".
		if (this.importService.mappingChangedSinceLoad) {
			this.events.send('toast', 'The column mapping changed since these orders were loaded \u2014 fix the mapping in \u2699 "Configure Import" and save (or re-import the files) so the orders reload, then try again.')
			return false
		}

		if (this.fileCache.size === 0) {
			this.events.send('toast', 'The print files folder is empty \u2014 pick a folder that contains your design files.')
			return false
    	}

		const sanitizePath = (str: string) => str.replace(/[<>:"/\\|?*]+/g, '_')
		const totalOrders = this.importService.imports.length

		let copiedFiles = 0
		let failedFiles = 0
		let invalidQuantityLines = 0
		const unmatchedLines: any[] = []

		for(let [index, order] of this.importService.imports.entries()) {
			const matchedOrder = order.sku ? this.fileCache.get(order.sku) : undefined
			if(!matchedOrder) {
				unmatchedLines.push(order)
				continue
			}

			const quantity = Number(order.quantity)
			if (!Number.isFinite(quantity) || quantity <= 0) {
				invalidQuantityLines++
				console.error(`Skipping order ${order.name} (${order.sku}): invalid quantity "${order.quantity}"`)
				continue
			}

			const ext = path.extname(matchedOrder)
			const destinations: string[] = []
			const copyPromises = new Array<Promise<void>>()

			for(let i = 0; i < quantity; i++) {
				const destPath = path.join(settings.printFolder, sanitizePath(`${order.name}-${order.billingName}-${order.sku}-${order.paidDate ?? ''}-${(order.paymentMethod ?? '').toLowerCase().replace(' ', '_')}-${i}-${index}${ext}`))
				destinations.push(destPath)

				console.log(`Copying: ${matchedOrder} --to--> ${destPath}`)
				copyPromises.push(fs.promises.copyFile(matchedOrder, destPath))
			}

			const results = await Promise.allSettled(copyPromises)
			for (let i = 0; i < results.length; i++) {
				const result = results[i]
				if (result?.status === 'fulfilled') copiedFiles++
				else {
					failedFiles++
					console.error(`Failed to copy ${destinations[i]}:`, result?.reason)
					log.error(`Failed to copy ${destinations[i]}:`, result?.reason)
				}
			}

			this.events.send('update:loading:state', {'isLoading': true, 'progress': ((index / totalOrders)*100), 'status': `Copying... ${destinations[destinations.length - 1]}`})
		}

		const unmatchedCopies = unmatchedLines.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0)

		const notices: string[] = []
		if (unmatchedLines.length > 0) {
			const skuCounts = new Map<string, number>()
			for (const order of unmatchedLines) {
				const sku = order.sku || '(missing sku)'
				skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
			}
			const topSkus = [...skuCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sku, count]) => `${sku} (${count})`)
			notices.push(`No print file found for ${unmatchedLines.length} order line(s) (${unmatchedCopies} copy/copies) — ${skuCounts.size} SKU(s): ${topSkus.join(', ')}${skuCounts.size > 5 ? ', ...' : ''}`)

			console.error('Unmatched order lines (no print file) — full list:')
			for (const order of unmatchedLines) console.error(`   ${order.name}  |  ${order.sku || '(missing sku)'}  |  qty ${order.quantity}`)
		}
		if (invalidQuantityLines > 0) notices.push(`${invalidQuantityLines} order line(s) skipped — missing/invalid quantity.`)
		
		if (failedFiles > 0) notices.push(`${failedFiles} file(s) failed to copy — details in the log (%APPDATA%\\Copy Cart\\logs\\main.log).`)
		if (notices.length > 0) this.events.send('toast', notices.join(' '))

		const skippedLines = unmatchedLines.length + invalidQuantityLines
		let doneStatus = `Done — ${copiedFiles} file(s) copied`
		if (skippedLines > 0 || failedFiles > 0) {
			doneStatus += ` — ${skippedLines} order line(s) had no output${failedFiles > 0 ? `, ${failedFiles} copy failure(s)` : ''}. Check the notification and the log.`
		}

		this.events.send('update:loading:state', {'isLoading': false, 'progress': 100, 'status': doneStatus})
		console.log(`Process complete — ${copiedFiles} copied, ${failedFiles} failed, ${unmatchedLines.length} unmatched, ${invalidQuantityLines} invalid quantity (of ${totalOrders} order lines)`)
		return true
	}

	private async cachePrintFiles() {
		const printFilesPath = this.settingsService.settings.printFiles
		const recursive = this.settingsService.settings.recursivePrintFiles === true
		const files = await this.collectPrintFiles(printFilesPath, recursive)
		this.fileCache.clear()

		let collisions = 0
		for (const filePath of files) {
			const baseName = path.parse(filePath).name.toLowerCase()
			const keptPath = this.fileCache.get(baseName)
			if (keptPath) {
				collisions++
				// Shallowest file wins (breadth-first listing) on name collisions.
				console.warn(`Print files share the name "${baseName}" — keeping ${path.relative(printFilesPath, keptPath)} and ignoring ${path.relative(printFilesPath, filePath)}.`)
				continue
			}

			this.fileCache.set(baseName, filePath)
		}

		if (collisions > 0) console.warn(`${collisions} print file name collision(s) — rename the duplicates so every design can be matched.`)

		console.log(`Cached ${this.fileCache.size} file(s) from ${printFilesPath}${recursive ? ' (including subfolders)' : ''}`)
	}

	/**
	 * Lists candidate print files breadth-first (the collision policy keeps the
	 * first). Subfolders only when the recursive setting is on.
	 */
	private async collectPrintFiles(root: string, recursive: boolean): Promise<string[]> {
		const files: string[] = []
		const pendingDirs: string[] = [root]

		while (pendingDirs.length > 0) {
			const currentDir = pendingDirs.shift()!
			const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })

			for (const entry of entries) {
				const entryPath = path.join(currentDir, entry.name)
				if (entry.isDirectory()) {
					if (recursive) pendingDirs.push(entryPath)
				}
				else if (entry.isFile()) {
					files.push(entryPath)
				}
			}
		}

		return files
	}
}
