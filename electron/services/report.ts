import fs from "fs"
import path from "path"
import { plural } from "../../shared/plural.ts"

export type CopyIssueKind = 'no-print-file' | 'invalid-quantity' | 'copy-failed'

/** One problem row for the error report. */
export type CopyIssue = {
	kind: CopyIssueKind
	/** 1-based position in the loaded orders list. */
	rowNumber: number
	row: any
	/** Explanation shown in the report's Detail column. */
	detail: string
}

const PROBLEM_LABELS: Record<CopyIssueKind, string> = {
	'no-print-file': 'No print file found',
	'invalid-quantity': 'Invalid quantity',
	'copy-failed': 'Copy failed'
}

/** Quotes and flattens a CSV field so Excel opens the report cleanly. */
function csvField(value: unknown): string {
	const text = value == null ? '' : String(value).replace(/\r?\n/g, ' ')
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Local-time file stamp: `Copy Cart issues 2026-09-30 14-22-05.csv`. */
function reportFileName(now: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0')
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
	return `Copy Cart issues ${stamp}`
}

/** Fixed table order in the report — mirrors the toast summary order. */
const KIND_ORDER: CopyIssueKind[] = ['no-print-file', 'invalid-quantity', 'copy-failed']

/**
 * Writes the issue rows to a timestamped CSV (UTF-8 BOM + CRLF for Excel).
 * Each problem kind gets its own stacked mini-table — heading, column header,
 * rows, quantity subtotal — separated by a blank row. Returns the file path.
 */
export async function writeIssuesReport(issues: CopyIssue[], folder: string): Promise<string> {
	await fs.promises.mkdir(folder, { recursive: true })

	const baseName = reportFileName(new Date())
	let filePath = path.join(folder, `${baseName}.csv`)
	for (let n = 2; fs.existsSync(filePath); n++) filePath = path.join(folder, `${baseName} (${n}).csv`)

	const header = ['Order', 'SKU', 'Quantity', 'Problem', 'Detail', 'Billing name', 'Paid at', 'Payment method', 'Row'].join(',')
	const lines: string[] = []

	for (const kind of KIND_ORDER) {
		const group = issues.filter((issue) => issue.kind === kind)
		if (group.length === 0) continue

		if (lines.length > 0) lines.push('')	// blank row between tables
		lines.push(csvField(`${PROBLEM_LABELS[kind]} — ${plural(group.length, 'row')}`))
		lines.push(header)
		for (const issue of group) {
			lines.push([
				csvField(issue.row?.name),
				csvField(issue.row?.sku),
				csvField(issue.row?.quantity),
				csvField(PROBLEM_LABELS[issue.kind]),
				csvField(issue.detail),
				csvField(issue.row?.billingName),
				csvField(issue.row?.paidDate),
				csvField(issue.row?.paymentMethod),
				csvField(issue.rowNumber)
			].join(','))
		}

		// Excel-style subtotal: the quantity sum sits under the Quantity column.
		const quantitySum = group.reduce((sum, issue) => sum + (Number(issue.row?.quantity) || 0), 0)
		lines.push(['Total', '', csvField(quantitySum), '', '', '', '', '', ''].join(','))
	}

	await fs.promises.writeFile(filePath, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf-8')
	return filePath
}
