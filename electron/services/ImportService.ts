import fs from "fs"
import csv from "csv-parser"
import path from "path"
import type { RendererEvents } from './RendererEvents.ts'
import type { SettingsService } from './SettingsService.ts'

/**
 * Parses and caches the order-import data (CSV only).
 *
 * Every load replaces the whole cache: the selected files are parsed, merged,
 * and deduplicated — identical paths, identical file contents, and order
 * lines already provided by an EARLIER file are collapsed occurrence-for-
 * occurrence (duplicate line items within ONE file are kept — they are
 * distinct purchases) — and the result is committed atomically, so a failed
 * load never corrupts data.
 *
 * Publishes the `settings:update` / `update:loading:state` / `toast` /
 * `import:status` events for the import flows.
 */
/** Joins skip reasons for user-facing notices, capped so huge selections stay readable. */
function formatSkipped(report: string[]): string {
	const MAX_DETAILS = 4
	if (report.length <= MAX_DETAILS) return report.join(', ')
	return `${report.slice(0, MAX_DETAILS).join(', ')}, +${report.length - MAX_DETAILS} more`
}

export class ImportService {
	private importCache: Array<any> = new Array()
	/** Incremented per load; an in-flight load is abandoned when it no longer matches. */
	private loadToken = 0
	private settingsService: SettingsService
	private events: RendererEvents

	constructor(settingsService: SettingsService, events: RendererEvents) {
		this.settingsService = settingsService
		this.events = events
	}

	/** Read-only view of the parsed order imports. */
	get imports(): Array<any> {
		return this.importCache
	}

	deleteCache(): boolean {
		this.loadToken++
		this.importCache = []
		this.settingsService.clearImports()
		this.events.send('settings:update', this.settingsService.settings)
		this.events.send('import:status', { isParsing: false, fileCount: 0, orderCount: 0 })
		this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select files to import'})
		return true;
	}

	/**
	 * Removes one file from the current selection and re-resolves the cache
	 * from the remaining files (same dedupe/merge pipeline as a normal load).
	 * Removing the last file clears the selection entirely.
	 */
	async removeFile(filePath: string): Promise<boolean> {
		const remaining = this.settingsService.settings.imports
			.filter((importedPath) => importedPath.toLowerCase() !== filePath.toLowerCase())

		if (remaining.length === 0) {
			this.deleteCache()
			return true
		}

		return this.cacheFiles(remaining)
	}

	async cacheFiles(filePaths: string[]): Promise<boolean> {
		if (filePaths.length === 0) return false

		// Collapse duplicate paths (the same file picked/dropped more than once).
		const seenPaths = new Set<string>()
		const uniquePaths = filePaths.filter((filePath) => {
			const key = filePath.toLowerCase()
			if (seenPaths.has(key)) return false
			seenPaths.add(key)
			return true
		})

		// Keep only CSVs; every ignored file gets a brief reason for the report.
		const csvPaths = uniquePaths.filter((filePath) => path.extname(filePath).toLowerCase() === '.csv')
		/** Human-readable "name — reason" entries for everything skipped. */
		const skippedReport = uniquePaths
			.filter((filePath) => path.extname(filePath).toLowerCase() !== '.csv')
			.map((filePath) => `${path.basename(filePath)} — not a .CSV file`)

		if (csvPaths.length === 0) {
			console.log(`No .CSV files among the selection: ${skippedReport.join('; ')}`)
			this.events.send('settings:update', this.settingsService.settings)
			this.events.send('toast', `No .CSV files to import — skipped: ${formatSkipped(skippedReport)}`)

			return false;
		}

		this.events.send('import:status', { isParsing: true })

		const token = ++this.loadToken
		let committed = false
		try {
			const keptPaths: string[] = []
			const merged: any[] = []
			/** Occurrence counts of lines provided by earlier files (multiset pool). */
			const remainingDuplicates = new Map<string, number>()
			const firstQuantityByOrder = new Map<string, string>()
			/** Fingerprint → name of the first file that provided it (names identical copies). */
			const contentOwners = new Map<string, string>()
			let duplicateRows = 0
			let conflictingRows = 0

			for (const csvPath of csvPaths) {
				let rows: any[]
				try {
					rows = await this.parseCSV(csvPath)
				} catch (error) {
					// Unreadable file (locked, deleted between pick and parse, ...).
					console.error(`Failed to parse import file ${csvPath}:`, error)
					skippedReport.push(`${path.basename(csvPath)} — ${this.briefErrorReason(error)}`)
					continue
				}

				const orders = this.toOrderRows(rows)

				// Content-level dedupe: re-adding an identical file (e.g. a second
				// download of the same export) must not inflate the row counts —
				// and the report names the file it duplicates.
				const fingerprint = JSON.stringify(orders)
				const contentOwner = contentOwners.get(fingerprint)
				if (contentOwner) {
					skippedReport.push(`${path.basename(csvPath)} — identical to ${contentOwner}`)
					continue
				}
				contentOwners.set(fingerprint, path.basename(csvPath))

				keptPaths.push(csvPath)

				// Cross-file dedupe only, and occurrence-aware: each line already
				// provided by an EARLIER file can absorb one duplicate here — the
				// same order+SKU from a second file is the same purchase and must
				// not be copied twice. Lines WITHIN one file are all kept (they are
				// distinct purchased items); an extra occurrence in a later file
				// (beyond the earlier file's count) is a genuine new item and stays.
				for (const order of orders) {
					const key = this.orderIdentity(order)
					const remaining = remainingDuplicates.get(key) ?? 0
					if (remaining > 0) {
						remainingDuplicates.set(key, remaining - 1)
						duplicateRows++
						if (firstQuantityByOrder.get(key) !== order.quantity) conflictingRows++
						continue
					}
					merged.push(order)
					if (!firstQuantityByOrder.has(key)) firstQuantityByOrder.set(key, order.quantity)
				}
				for (const order of orders) {
					const key = this.orderIdentity(order)
					remainingDuplicates.set(key, (remainingDuplicates.get(key) ?? 0) + 1)
				}
			}

			// A newer load (or a clear) superseded this one while parsing — let it
			// own the outcome instead of overwriting it with stale data.
			if (token !== this.loadToken) return false

			if (keptPaths.length === 0) {
				this.events.send('toast', `No files could be read — skipped: ${formatSkipped(skippedReport)}`)

				return false;
			}

			// Replace the previous set only after every file parsed — a failed
			// re-import must never wipe data that is already loaded.
			this.importCache = merged
			this.settingsService.setImports(keptPaths)
			committed = true

			this.events.send('import:status', { isParsing: false, fileCount: keptPaths.length, orderCount: merged.length })

			// Fold the smaller notices (duplicate rows, skipped files) into a
			// single toast rather than interrupting with one per file.
			const notices: string[] = []
			if (duplicateRows > 0) notices.push(`Ignored ${duplicateRows} duplicate order line(s) found across the selected files.`)
			if (conflictingRows > 0) notices.push(`${conflictingRows} of them had a different quantity in a later file — kept the first file's value.`)
			if (skippedReport.length > 0) notices.push(`Skipped file(s): ${formatSkipped(skippedReport)}`)
			if (notices.length > 0) this.events.send('toast', notices.join(' '))

			console.log(`${merged.length} order imports cached from ${keptPaths.length} file(s)`);
			this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
			this.events.send('settings:update', this.settingsService.settings)

			return true;
		}
		finally {
			// On any early return (nothing usable) clear the spinner; on success
			// the full status was already sent above.
			if (!committed) this.events.send('import:status', { isParsing: false })
		}
	}

	/**
	 * Identity used for cross-file duplicate detection: order + SKU. Quantity
	 * and billing are deliberately excluded — they describe the purchase, not
	 * which line it is; the same order+SKU from a second file is the same
	 * purchase and must never be copied twice. Quantity mismatches between
	 * files are counted and surfaced in the import notice instead.
	 */
	private orderIdentity(order: any): string {
		return JSON.stringify({ name: order.name, sku: order.sku })
	}

	/** One short phrase explaining why a file could not be read. */
	private briefErrorReason(error: any): string {
		const code = error?.code
		if (code === 'ENOENT') return 'file not found'
		if (code === 'EACCES' || code === 'EPERM') return 'no read access'
		if (code === 'EBUSY') return 'file is locked'
		if (code === 'EISDIR') return 'not a file'
		return 'could not be read'
	}

	/**
	 * Normalizes raw CSV rows into order rows: strips '#' from order names,
	 * lowercases SKUs, and fills missing billing names from the last one seen
	 * for the same order (billing info often rides only the first row of a group).
	 */
	private toOrderRows(rows: any[]): any[] {
		const orders: any[] = []
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

			orders.push({
				name: name,
				sku,
				quantity,
				billingName: resolvedBilling ?? ''
			})
		}

		return orders
	}

	private parseCSV(filePath: string): Promise<any[]> {
		return new Promise((resolve, reject) => {
			const results: any[] = []
			const readStream = fs.createReadStream(filePath)
			// Reject on BOTH the read stream (missing/locked/directory paths) and
			// the parser — listening only to the parser leaves source errors
			// unhandled, which would crash the whole process.
			readStream.on('error', reject)
			readStream
				.pipe(csv())
				.on('data', (data) => results.push(data))
				.on('end', () => resolve(results))
				.on('error', reject)
		})
	}
}
