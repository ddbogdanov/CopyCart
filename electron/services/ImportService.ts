import fs from "fs"
import csv from "csv-parser"
import path from "path"
import log from 'electron-log'
import type { RendererEvents } from './RendererEvents.ts'
import type { SettingsService } from './SettingsService.ts'
import type { CsvColumns } from '../../shared/ipc'

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

/** One file's resolved header key per known field (undefined = column absent). */
type ResolvedColumns = Record<keyof CsvColumns, string | undefined>

/**
 * Every configured column is required (user rule 2026-09-28): a file without a
 * match for ANY configured header is skipped — never copied with blanks.
 */
const REQUIRED_COLUMN_FIELDS: Array<keyof CsvColumns> = ['orderName', 'sku', 'quantity', 'billingName', 'paidDate', 'paymentMethod']

/** Appended to skip notices when files were skipped for a missing required column. */
const MISSING_COLUMN_GUIDANCE = ' If the export renamed a column, set its new header in the ⚙ "Configure Import" dialog on the Import Orders card.'

/** BOM-safe, whitespace-tolerant comparison key used only for header matching. */
function normalizeHeader(header: string): string {
	return header.replace(/\uFEFF/g, '').trim().toLowerCase()
}

export class ImportService {
	private importCache: Array<any> = new Array()
	/** JSON of the csvColumns mapping the current cache was parsed under (null = nothing loaded). */
	private parsedColumns: string | null = null
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

	/**
	 * True when orders are loaded whose parse-time mapping differs from the
	 * mapping currently saved (e.g. a saved mapping change whose re-read was
	 * refused, leaving the older orders loaded). Copy must not run then — see
	 * the gate in FileCopyService.
	 */
	get mappingChangedSinceLoad(): boolean {
		return this.importCache.length > 0 && this.parsedColumns !== JSON.stringify(this.settingsService.settings.csvColumns)
	}

	deleteCache(): boolean {
		this.loadToken++
		this.importCache = []
		this.parsedColumns = null
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

		// The column mapping is read once per load; skipped files are counted so
		// the folded notices can add the fix-it guidance.
		const columns = this.settingsService.settings.csvColumns
		let missingColumnSkips = 0

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

				// Resolve the configured header names against this file's actual
				// headers — once per file, plain string comparison only. If ANY
				// configured column has no match, the file is skipped with a short
				// reason (before any dedupe/commit side effects) — no copies from
				// it at all. Header-only CSVs bypass the check.
				const resolvedColumns = this.resolveColumns(columns, rows)
				if (rows.length > 0) {
					const missingRequired = REQUIRED_COLUMN_FIELDS.filter((field) => !resolvedColumns[field])
					if (missingRequired.length > 0) {
						const listed = missingRequired.map((field) => `"${columns[field]}"`).join(', ')
						const plural = missingRequired.length > 1 ? 's' : ''
						skippedReport.push(`${path.basename(csvPath)} — missing column${plural} ${listed}`)
						missingColumnSkips++
						log.warn(`[ImportService] ${path.basename(csvPath)} — missing column${plural} ${listed}. Actual headers: ${Object.keys(rows[0]).join(', ')}`)
						continue
					}
				}

				const orders = this.toOrderRows(rows, resolvedColumns)

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
				const guidance = missingColumnSkips > 0 ? MISSING_COLUMN_GUIDANCE : ''
				this.events.send('toast', `No files could be read — skipped: ${formatSkipped(skippedReport)}${guidance}`)

				return false;
			}

			// Replace the previous set only after every file parsed — a failed
			// re-import must never wipe data that is already loaded.
			this.importCache = merged
			this.settingsService.setImports(keptPaths)
			this.parsedColumns = JSON.stringify(columns)
			committed = true

			this.events.send('import:status', { isParsing: false, fileCount: keptPaths.length, orderCount: merged.length })

			// Fold the smaller notices (duplicate rows, skipped files) into a
			// single toast rather than interrupting with one per file.
			const notices: string[] = []
			if (duplicateRows > 0) notices.push(`Ignored ${duplicateRows} duplicate order line(s) found across the selected files.`)
			if (conflictingRows > 0) notices.push(`${conflictingRows} of them had a different quantity in a later file — kept the first file's value.`)
			if (skippedReport.length > 0) {
				const guidance = missingColumnSkips > 0 ? MISSING_COLUMN_GUIDANCE : ''
				notices.push(`Skipped file(s): ${formatSkipped(skippedReport)}${guidance}`)
			}
			if (notices.length > 0) this.events.send('toast', notices.join(' '))

			console.log(`${merged.length} order imports cached from ${keptPaths.length} file(s)`);
			this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
			this.events.send('settings:update', this.settingsService.settings)

			return true;
		}
		finally {
			// On any early return (nothing usable) clear the spinner and
			// republish the counts actually in effect — the cache that is still
			// loaded — so the card can never show a stuck spinner or stale
			// numbers. On success the full status was already sent above.
			if (!committed) this.events.send('import:status', { isParsing: false, fileCount: 0, orderCount: this.importCache.length })
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
	 * Resolves the configured header names to this file's actual header keys.
	 * Plain string comparison only (no regex): an exact key wins first — a file
	 * with both `Name` and `name` keeps reading `Name`, as before — then a BOM/
	 * trim/case-insensitive match engages; the first qualifying header in file
	 * order wins. Called once per file.
	 */
	private resolveColumns(configured: CsvColumns, rows: any[]): ResolvedColumns {
		const headers = rows.length > 0 ? Object.keys(rows[0]) : []

		const resolve = (configuredName: string): string | undefined => {
			if (headers.includes(configuredName)) return configuredName

			const normalized = normalizeHeader(configuredName)
			return headers.find((header) => normalizeHeader(header) === normalized)
		}

		return {
			orderName: resolve(configured.orderName),
			sku: resolve(configured.sku),
			quantity: resolve(configured.quantity),
			billingName: resolve(configured.billingName),
			paidDate: resolve(configured.paidDate),
			paymentMethod: resolve(configured.paymentMethod)
		}
	}

	/**
	 * Normalizes raw CSV rows into order rows using the resolved header keys:
	 * strips '#' from order names (first one only), lowercases SKUs, and fills
	 * missing billing names, payment methods and paid dates from the last ones
	 * seen for the same order (they often ride only the first row of a group).
	 * Values pass through exactly as before — only the key lookup changed.
	 */
	private toOrderRows(rows: any[], columns: ResolvedColumns): any[] {
		const orders: any[] = []
		const lastBillingByOrder = new Map<string, string>()
		const lastPaymentMethodByOrder = new Map<string, string>()
		const lastPaidDateByOrder = new Map<string, string>()

		for (const row of rows) {
			const name = columns.orderName ? row[columns.orderName]?.replace('#', '') : undefined
			const sku = columns.sku ? row[columns.sku]?.toLowerCase() : undefined
			const quantity = columns.quantity ? row[columns.quantity] : undefined
			const billingName = columns.billingName ? row[columns.billingName]?.trim() : undefined
			// Payment method + paid date ride the copy file names (picked up from main)
			// and are configurable like the rest — a resolved key reads exactly the
			// same values as before under the shipped defaults.
			const paymentMethod = columns.paymentMethod ? row[columns.paymentMethod] : undefined
			const paidDate = columns.paidDate ? row[columns.paidDate] : undefined

			if (!name) continue

			let resolvedBilling = billingName
			if (billingName) {
				lastBillingByOrder.set(name, billingName)
			} else if (lastBillingByOrder.has(name)) {
				resolvedBilling = lastBillingByOrder.get(name)!
			}

			let resolvedPaymentMethod = paymentMethod
			if (resolvedPaymentMethod) {
				lastPaymentMethodByOrder.set(name, paymentMethod)
			} else if (lastPaymentMethodByOrder.has(name)) {
				resolvedPaymentMethod = lastPaymentMethodByOrder.get(name)!
			}

			let resolvedPaidDate = paidDate
			if (paidDate) {
				lastPaidDateByOrder.set(name, paidDate)
			} else if (lastPaidDateByOrder.has(name)) {
				resolvedPaidDate = lastPaidDateByOrder.get(name)!
			}

			orders.push({
				name: name,
				sku,
				quantity,
				billingName: resolvedBilling ?? '',
				paymentMethod: resolvedPaymentMethod ?? '',
				paidDate: resolvedPaidDate ?? ''
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
