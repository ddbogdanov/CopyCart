import fs from "fs"
import csv from "csv-parser"
import path from "path"
import log from 'electron-log'
import { plural } from '../../shared/plural.ts'
import type { RendererEvents } from './RendererEvents.ts'
import type { SettingsService } from './SettingsService.ts'
import type { CsvColumns } from '../../shared/ipc'

/**
 * Parses and caches the order-import data (CSV only).
 *
 * Publishes the `settings:update` / `update:loading:state` / `toast` /
 * `import:status` events for the import flows.
 */
function formatSkipped(report: string[]): string {
	const MAX_DETAILS = 4
	if (report.length <= MAX_DETAILS) return report.join(', ')
	return `${report.slice(0, MAX_DETAILS).join(', ')}, +${report.length - MAX_DETAILS} more`
}

type ResolvedColumns = Record<keyof CsvColumns, string | undefined>

const REQUIRED_COLUMN_FIELDS: Array<keyof CsvColumns> = ['orderName', 'sku', 'quantity', 'billingName', 'paidDate', 'paymentMethod']

const MISSING_COLUMN_GUIDANCE = ' If the export renamed a column, set its new header in the ⚙ "Configure Import" dialog on the Import Orders card.'

function normalizeHeader(header: string): string {
	return header.replace(/\uFEFF/g, '').trim().toLowerCase()
}

export class ImportService {
	private importCache: Array<any> = new Array()
	private parsedColumns: string | null = null
	private loadToken = 0
	private settingsService: SettingsService
	private events: RendererEvents

	constructor(settingsService: SettingsService, events: RendererEvents) {
		this.settingsService = settingsService
		this.events = events
	}

	get imports(): Array<any> {
		return this.importCache
	}

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

		const seenPaths = new Set<string>()
		const uniquePaths = filePaths.filter((filePath) => {
			const key = filePath.toLowerCase()
			if (seenPaths.has(key)) return false
			seenPaths.add(key)
			return true
		})

		const csvPaths = uniquePaths.filter((filePath) => path.extname(filePath).toLowerCase() === '.csv')
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

		const columns = this.settingsService.settings.csvColumns
		let missingColumnSkips = 0

		const token = ++this.loadToken
		let committed = false
		try {
			const keptPaths: string[] = []
			const merged: any[] = []
			const remainingDuplicates = new Map<string, number>()
			const firstQuantityByOrder = new Map<string, string>()
			const contentOwners = new Map<string, string>()
			let duplicateRows = 0
			let conflictingRows = 0

			for (const csvPath of csvPaths) {
				let rows: any[]
				try {
					rows = await this.parseCSV(csvPath)
				} catch (error) {
					console.error(`Failed to parse import file ${csvPath}:`, error)
					skippedReport.push(`${path.basename(csvPath)} — ${this.briefErrorReason(error)}`)
					continue
				}

				const resolvedColumns = this.resolveColumns(columns, rows)
				if (rows.length > 0) {
					const missingRequired = REQUIRED_COLUMN_FIELDS.filter((field) => !resolvedColumns[field])
					if (missingRequired.length > 0) {
						const listed = missingRequired.map((field) => `"${columns[field]}"`).join(', ')
						const pluralSuffix = missingRequired.length > 1 ? 's' : ''
						skippedReport.push(`${path.basename(csvPath)} — missing column${pluralSuffix} ${listed}`)
						missingColumnSkips++
						log.warn(`[ImportService] ${path.basename(csvPath)} — missing column${pluralSuffix} ${listed}. Actual headers: ${Object.keys(rows[0]).join(', ')}`)
						continue
					}
				}

				const orders = this.toOrderRows(rows, resolvedColumns)
				const fingerprint = JSON.stringify(orders)
				const contentOwner = contentOwners.get(fingerprint)
				if (contentOwner) {
					skippedReport.push(`${path.basename(csvPath)} — identical to ${contentOwner}`)
					continue
				}
				contentOwners.set(fingerprint, path.basename(csvPath))

				keptPaths.push(csvPath)

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

			if (token !== this.loadToken) return false

			if (keptPaths.length === 0) {
				const guidance = missingColumnSkips > 0 ? MISSING_COLUMN_GUIDANCE : ''
				this.events.send('toast', `No files could be read — skipped: ${formatSkipped(skippedReport)}${guidance}`)

				return false;
			}

			this.importCache = merged
			this.settingsService.setImports(keptPaths)
			this.parsedColumns = JSON.stringify(columns)
			committed = true

			this.events.send('import:status', { isParsing: false, fileCount: keptPaths.length, orderCount: merged.length })

			const notices: string[] = []
			if (duplicateRows > 0) notices.push(`Ignored ${plural(duplicateRows, 'duplicate order line')} found across the selected files.`)
			if (conflictingRows > 0) notices.push(`${conflictingRows} of them had a different quantity in a later file — kept the first file's value.`)
			if (skippedReport.length > 0) {
				const guidance = missingColumnSkips > 0 ? MISSING_COLUMN_GUIDANCE : ''
				notices.push(`Skipped ${plural(skippedReport.length, 'file')}: ${formatSkipped(skippedReport)}${guidance}`)
			}
			if (notices.length > 0) this.events.send('toast', notices.join(' '))

			console.log(`${plural(merged.length, 'order import')} cached from ${plural(keptPaths.length, 'file')}`);
			this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
			this.events.send('settings:update', this.settingsService.settings)

			return true;
		}
		finally {
			if (!committed) this.events.send('import:status', { isParsing: false, fileCount: 0, orderCount: this.importCache.length })
		}
	}

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
			readStream.on('error', reject)
			readStream
				.pipe(csv())
				.on('data', (data) => results.push(data))
				.on('end', () => resolve(results))
				.on('error', reject)
		})
	}
}
