/**
 * Sandboxed verification of the multi-file import flow (path/content/row dedupe,
 * replace semantics, persistence, cache clearing) and copy-pipeline accounting.
 *
 * Run: npm run verify:import
 * Uses a throwaway `userData` temp dir; exits non-zero on failure.
 */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Ordering matters: userData must be redirected before the settings services /
// electron-store are constructed (they capture app.getPath('userData') then).
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copycart-import-test-'))
app.setPath('userData', path.join(testRoot, 'userData'))

const { RendererEvents } = await import('../electron/services/RendererEvents.ts')
const { SettingsService } = await import('../electron/services/SettingsService.ts')
const { ImportService } = await import('../electron/services/ImportService.ts')
const { FileCopyService } = await import('../electron/services/FileCopyService.ts')

// Mirrors the production wiring in electron/main.ts, with a recorder wrapping
// the event bus so toasts / import:status payloads can be asserted.
function createServices() {
	const events = new RendererEvents()
	const sent = []
	const send = events.send.bind(events)
	events.send = (channel, payload) => {
		sent.push({ channel, payload })
		send(channel, payload)
	}

	const settingsService = new SettingsService(events)
	const importService = new ImportService(settingsService, events)
	return { settingsService, importService, events, sent }
}

const userDataPath = app.getPath('userData')
fs.mkdirSync(userDataPath, { recursive: true })

const failures = []
function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  PASS  ${name}`)
	} else {
		failures.push(name)
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
	}
}
const lastStatus = (sent) => [...sent].reverse().find((entry) => entry.channel === 'import:status')?.payload
const lastLoading = (sent) => [...sent].reverse().find((entry) => entry.channel === 'update:loading:state')?.payload
const toasts = (sent) => sent.filter((entry) => entry.channel === 'toast').map((entry) => String(entry.payload))

// --- Fixtures ---------------------------------------------------------------
const fixtureRoot = path.join(testRoot, 'fixtures')
fs.mkdirSync(fixtureRoot, { recursive: true })

const CSV_HEADER = 'Name,Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method\n'
function writeCsv(name, rows) {
	const filePath = path.join(fixtureRoot, name)
	// Pad the classic 4-cell rows so all six headers have a key (empties).
	fs.writeFileSync(filePath, CSV_HEADER + rows.map((row) => `${row},,`).join('\n') + '\n', 'utf-8')
	return filePath
}

const csvA = writeCsv('orders-a.csv', ['#1001,SKU-A,1,Alice', '#1002,SKU-B,2,Bob'])
const csvACopy = writeCsv('orders-a-copy.csv', ['#1001,SKU-A,1,Alice', '#1002,SKU-B,2,Bob'])
const csvB = writeCsv('orders-b.csv', ['#1002,SKU-B,2,Bob', '#2001,SKU-C,1,Carol'])
const txtFile = path.join(fixtureRoot, 'notes.txt')
fs.writeFileSync(txtFile, 'not a csv', 'utf-8')

const service = createServices()

console.log('\n[1] Multi-file load: merge rows, skip non-CSV, dedupe across files')
{
	const ok = await service.importService.cacheFiles([csvA, csvB, txtFile])
	const rows = service.importService.imports

	check('load reports success', ok === true)
	check('rows merged + deduped (1001, 1002, 2001)', rows.length === 3 && rows.map((row) => row.name).join(',') === '1001,1002,2001')
	check('saved paths exclude the non-CSV file', service.settingsService.settings.imports.length === 2 && service.settingsService.settings.imports[0] === csvA && service.settingsService.settings.imports[1] === csvB)
	check('final status carries counts', lastStatus(service.sent)?.fileCount === 2 && lastStatus(service.sent)?.orderCount === 3)
	check('toast reports the skipped file', toasts(service.sent).some((toast) => toast.includes('notes.txt')))
	check('skip toast gives a reason', toasts(service.sent).some((toast) => toast.includes('notes.txt — not a .CSV file')))
	check('cross-file duplicate row produces a notice', toasts(service.sent).some((toast) => toast.includes('duplicate order line')))
}

console.log('\n[2] Duplicate paths in one selection are collapsed')
{
	service.sent.length = 0
	const ok = await service.importService.cacheFiles([csvA, csvA])

	check('load reports success', ok === true)
	check('rows parsed once (no inflation)', service.importService.imports.length === 2)
	check('path saved once', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === csvA)
	check('no notices for an intentional re-add', toasts(service.sent).length === 0)
}

console.log('\n[3] Identical file contents are skipped')
{
	service.sent.length = 0
	const ok = await service.importService.cacheFiles([csvA, csvACopy])

	check('load reports success', ok === true)
	check('rows not inflated by the identical copy', service.importService.imports.length === 2)
	check('only the first copy is kept', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === csvA)
	check('toast reports the identical copy', toasts(service.sent).some((toast) => toast.includes('orders-a-copy.csv')))
	check('identical copy names the file it duplicates', toasts(service.sent).some((toast) => toast.includes('orders-a-copy.csv — identical to orders-a.csv')))
}

console.log('\n[4] Loads replace (not append) and survive a relaunch')
{
	await service.importService.cacheFiles([csvB])
	check('second load replaces the first', service.importService.imports.length === 2 && service.importService.imports[0].name === '1002')

	// Write-through: the selection hits disk immediately — no quit save needed.
	const importStorePath = path.join(testRoot, 'userData', 'config.json')
	const storedImports = fs.existsSync(importStorePath) ? JSON.parse(fs.readFileSync(importStorePath, 'utf-8')).imports : []
	check('import selection is written through immediately (no quit save needed)', storedImports.length === 1 && storedImports[0] === csvB)

	// Persist like the app does at quit (imports kept because shouldSave.imports is on).
	service.settingsService.settings.shouldSave.imports = true
	check('quit-time save succeeds', service.settingsService.save(undefined, true) === true)

	const relaunched = createServices()
	const restored = relaunched.settingsService.load()
	check('import paths restored from the store', restored.imports.length === 1 && restored.imports[0] === csvB)

	const restoredOk = await relaunched.importService.cacheFiles(restored.imports)
	check('restored paths load cleanly', restoredOk === true && relaunched.importService.imports.length === 2)
}

console.log('\n[5] Selection with no CSV files is rejected without touching state')
{
	service.sent.length = 0
	const ok = await service.importService.cacheFiles([txtFile])

	check('load reports failure', ok === false)
	check('previous rows untouched', service.importService.imports.length === 2)
	check('previous paths untouched', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === csvB)
	check('no-csv error toast shown', toasts(service.sent).some((toast) => toast.includes('No .CSV files to import')))
	check('no-csv toast explains why', toasts(service.sent).some((toast) => toast.includes('notes.txt — not a .CSV file')))
	check('no parse spinner was started', service.sent.filter((entry) => entry.channel === 'import:status' && entry.payload.isParsing).length === 0)
}

console.log('\n[6] Clearing the cache resets rows, paths, and status')
{
	service.sent.length = 0
	const ok = service.importService.deleteCache()

	check('clear reports success', ok === true)
	check('rows cleared', service.importService.imports.length === 0)
	check('paths cleared', service.settingsService.settings.imports.length === 0)
	check('status reset to empty counts', lastStatus(service.sent)?.isParsing === false && lastStatus(service.sent)?.fileCount === 0 && lastStatus(service.sent)?.orderCount === 0)
}

console.log('\n[7] Duplicate line items within ONE file are preserved')
{
	const csvD = writeCsv('orders-d.csv', ['#3001,SKU-D,1,Dana', '#3001,SKU-D,1,Dana'])
	service.sent.length = 0
	const ok = await service.importService.cacheFiles([csvD])

	check('load reports success', ok === true)
	check('both identical line items kept (no silent drop)', service.importService.imports.length === 2)
	check('no duplicate notice for in-file lines', toasts(service.sent).length === 0)
}

console.log('\n[8] Copy pipeline: one copy per ordered quantity, named by order')
{
	const printFilesDir = path.join(testRoot, 'print-files')
	const outputDir = path.join(testRoot, 'output')
	fs.mkdirSync(printFilesDir, { recursive: true })
	fs.mkdirSync(outputDir, { recursive: true })
	fs.writeFileSync(path.join(printFilesDir, 'SKU-A.png'), 'a')
	fs.writeFileSync(path.join(printFilesDir, 'sku-b.png'), 'b')

	service.settingsService.setPrintFiles(printFilesDir)
	service.settingsService.setPrintFolder(outputDir)
	await service.importService.cacheFiles([csvA])

	const copyService = new FileCopyService(service.settingsService, service.importService, service.events)
	service.sent.length = 0
	const ok = await copyService.processFiles()

	const output = fs.readdirSync(outputDir).sort()
	check('processing reports success', ok === true)
	check('3 copies produced (1 + 2 for quantity 2)', output.length === 3)
	check('case-insensitive file lookup (SKU-A.png -> sku-a)', output.includes('1001-Alice-sku-a---0-0.png'))
	check('copies named with order + customer + sku + date + payment + index', output.includes('1002-Bob-sku-b---0-1.png') && output.includes('1002-Bob-sku-b---1-1.png'))
	check('output set is exactly the merged naming formula (golden list)', JSON.stringify(output) === JSON.stringify(['1001-Alice-sku-a---0-0.png', '1002-Bob-sku-b---0-1.png', '1002-Bob-sku-b---1-1.png']))
	check('final status reports the copied count', String(lastLoading(service.sent)?.status ?? '').startsWith('Done — 3 file(s) copied'))
}

console.log('\n[9] Copy accounting: unmatched + invalid-quantity lines are reported')
{
	const outputDir2 = path.join(testRoot, 'output-2')
	fs.mkdirSync(outputDir2, { recursive: true })
	service.settingsService.setPrintFolder(outputDir2)

	// sku-b matches, sku-c has no print file
	await service.importService.cacheFiles([csvB])
	const copyService = new FileCopyService(service.settingsService, service.importService, service.events)
	service.sent.length = 0
	const ok = await copyService.processFiles()

	check('processing reports success', ok === true)
	check('only matched lines produce output', fs.readdirSync(outputDir2).length === 2)
	check('unmatched line reported in a toast', toasts(service.sent).some((toast) => toast.includes('No print file found for 1 order line(s)') && toast.includes('sku-c')))
	check('final status mentions the skipped line', String(lastLoading(service.sent)?.status ?? '').includes('1 order line(s) had no output'))

	// Invalid quantity guard: line is skipped and reported, never silently dropped.
	const csvE = writeCsv('orders-e.csv', ['#4001,SKU-A,,Eve'])
	const outputDir3 = path.join(testRoot, 'output-3')
	fs.mkdirSync(outputDir3, { recursive: true })
	service.settingsService.setPrintFolder(outputDir3)
	await service.importService.cacheFiles([csvE])
	service.sent.length = 0
	const copyService2 = new FileCopyService(service.settingsService, service.importService, service.events)
	await copyService2.processFiles()

	check('invalid quantity produces no output', fs.readdirSync(outputDir3).length === 0)
	check('invalid quantity reported', toasts(service.sent).some((toast) => toast.includes('missing/invalid quantity')))
}

console.log('\n[10] Cross-file resolution: same order+SKU once; extras kept; conflicts flagged')
{
	// Overlapping rows from two exports: the overlap copies once, the new line is added.
	const csvJ1 = writeCsv('orders-j1.csv', ['#7001,SKU-A,1,Jill', '#7001,SKU-A,1,Jill', '#7001,SKU-A,1,Jill'])
	const csvJ2 = writeCsv('orders-j2.csv', ['#7001,SKU-A,1,Jill', '#7001,SKU-A,1,Jill', '#7001,SKU-A,1,Jill', '#7099,SKU-B,1,Nia'])
	service.sent.length = 0
	await service.importService.cacheFiles([csvJ1, csvJ2])
	check('overlapping lines kept once (not six)', service.importService.imports.length === 4)
	check('three duplicates reported', toasts(service.sent).some((toast) => toast.includes('Ignored 3 duplicate order line(s)')))

	const outputDir4 = path.join(testRoot, 'output-4')
	fs.mkdirSync(outputDir4, { recursive: true })
	service.settingsService.setPrintFolder(outputDir4)
	const copyService = new FileCopyService(service.settingsService, service.importService, service.events)
	await copyService.processFiles()
	check('overlap copied once + new line added (4 files, not 7)', fs.readdirSync(outputDir4).length === 4)

	// A LATER file with an extra occurrence: the extra line is a real item and stays.
	const csvK1 = writeCsv('orders-k1.csv', ['#8001,SKU-A,1,Kim'])
	const csvK2 = writeCsv('orders-k2.csv', ['#8001,SKU-A,1,Kim', '#8001,SKU-A,1,Kim'])
	service.sent.length = 0
	await service.importService.cacheFiles([csvK1, csvK2])
	check('extra occurrence in a later file is kept', service.importService.imports.length === 2)
	check('only the shared occurrence counts as duplicate', toasts(service.sent).some((toast) => toast.includes('Ignored 1 duplicate order line(s)')))

	// A quantity mismatch between files: first file wins, mismatch is surfaced.
	const csvL1 = writeCsv('orders-l1.csv', ['#9001,SKU-A,2,Lena'])
	const csvL2 = writeCsv('orders-l2.csv', ['#9001,SKU-A,3,Lena'])
	service.sent.length = 0
	await service.importService.cacheFiles([csvL1, csvL2])
	check('conflicting quantity does not double the order', service.importService.imports.length === 1 && service.importService.imports[0].quantity === '2')
	check('quantity conflict flagged in the notice', toasts(service.sent).some((toast) => toast.includes('different quantity')))
}

console.log('\n[11] Removing a single file re-resolves the remaining selection')
{
	service.sent.length = 0
	await service.importService.cacheFiles([csvA, csvB])
	check('two files loaded', service.importService.imports.length === 3)

	const removedB = await service.importService.removeFile(csvB)
	check('remove reports success', removedB === true)
	check('only the removed file drops out', service.importService.imports.length === 2 && service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === csvA)

	const removedLast = await service.importService.removeFile(csvA)
	check('removing the last file clears the selection', removedLast === true && service.importService.imports.length === 0 && service.settingsService.settings.imports.length === 0)
	check('clear status broadcast on last remove', lastStatus(service.sent)?.fileCount === 0 && lastStatus(service.sent)?.orderCount === 0)
}

console.log('\n[12] Unreadable file is skipped with a brief reason')
{
	// A directory named *.csv passes the extension filter but cannot be read.
	const folderCsv = path.join(fixtureRoot, 'folder.csv')
	fs.mkdirSync(folderCsv, { recursive: true })

	service.sent.length = 0
	const ok = await service.importService.cacheFiles([csvA, folderCsv])
	check('load still succeeds with the readable files', ok === true && service.importService.imports.length === 2)

	const skipToast = toasts(service.sent).find((toast) => toast.includes('folder.csv'))
	check('unreadable file is reported with a reason', !!skipToast && skipToast.includes('folder.csv — '), JSON.stringify(skipToast))

	// A load in which EVERY file fails surfaces the reasons and leaves the previous selection alone.
	service.sent.length = 0
	const allFailed = await service.importService.cacheFiles([folderCsv])
	check('all-failed load reports failure', allFailed === false)
	const allFailedToast = toasts(service.sent).find((toast) => toast.includes('No files could be read'))
	check('all-failed toast names the file and reason', !!allFailedToast && allFailedToast.includes('No files could be read — skipped:') && allFailedToast.includes('folder.csv — '), JSON.stringify(allFailedToast))
	check('all-failed load keeps the previous selection', service.settingsService.settings.imports.length === 1 && service.importService.imports.length === 2)
}

console.log('\n[13] Recursive print-file search is opt-in and prefers the highest level')
{
	// Tree: top-level sku-r.png + sku-x.png, sub/sku-s.png + sub/sku-x.png, sub/deep/sku-t.png
	const treeRoot = path.join(testRoot, 'print-tree')
	fs.mkdirSync(path.join(treeRoot, 'sub', 'deep'), { recursive: true })
	fs.writeFileSync(path.join(treeRoot, 'sku-r.png'), 'r')
	fs.writeFileSync(path.join(treeRoot, 'sku-x.png'), 'x-top')
	fs.writeFileSync(path.join(treeRoot, 'sub', 'sku-s.png'), 's')
	fs.writeFileSync(path.join(treeRoot, 'sub', 'sku-x.png'), 'x-sub')
	fs.writeFileSync(path.join(treeRoot, 'sub', 'deep', 'sku-t.png'), 't')

	const csvR = writeCsv('orders-r.csv', ['#5001,SKU-R,1,Rita', '#5002,SKU-S,1,Sam', '#5003,SKU-X,1,Xena'])
	service.settingsService.setPrintFiles(treeRoot)

	// Default (off): subfolders are invisible — sku-r/sku-x match, sku-s is unmatched.
	service.settingsService.save({ recursivePrintFiles: false })
	const outputOff = path.join(testRoot, 'output-rec-off')
	fs.mkdirSync(outputOff, { recursive: true })
	service.settingsService.setPrintFolder(outputOff)
	await service.importService.cacheFiles([csvR])
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	const outputOffFiles = fs.readdirSync(outputOff).sort()
	check('recursion off: nested files are not used', outputOffFiles.length === 2 && !outputOffFiles.some((name) => name.includes('sku-s')), JSON.stringify(outputOffFiles))
	check('recursion off: unmatched nested SKU is reported', toasts(service.sent).some((toast) => toast.includes('sku-s')))

	// Enabled: nested files are found; the top-level sku-x wins the name collision.
	service.settingsService.save({ recursivePrintFiles: true })
	const outputOn = path.join(testRoot, 'output-rec-on')
	fs.mkdirSync(outputOn, { recursive: true })
	service.settingsService.setPrintFolder(outputOn)
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	const outputOnFiles = fs.readdirSync(outputOn).sort()
	check('recursion on: nested files are found (3 copies)', outputOnFiles.length === 3 && outputOnFiles.some((name) => name.includes('sku-s')), JSON.stringify(outputOnFiles))
	const xCopies = outputOnFiles.filter((name) => name.includes('sku-x'))
	check('recursion on: highest-level file wins the name collision', xCopies.length === 1 && fs.readFileSync(path.join(outputOn, xCopies[0]), 'utf-8') === 'x-top')
}

console.log('\n[14] Configurable CSV column names (defaults, tolerance, missing-column policy)')
{
	const DEFAULT_COLUMNS = { orderName: 'Name', sku: 'Lineitem sku', quantity: 'Lineitem quantity', billingName: 'Billing Name', paidDate: 'Paid at', paymentMethod: 'Payment Method' }
	const writeHeaderCsv = (name, header, rows) => {
		const filePath = path.join(fixtureRoot, name)
		fs.writeFileSync(filePath, rows.length > 0 ? `${header}\n${rows.join('\n')}\n` : `${header}\n`, 'utf-8')
		return filePath
	}

	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS } })
	service.importService.deleteCache()
	service.sent.length = 0

	// -- Full rename: every header changed (e.g. a Shopify export update).
	service.settingsService.save({ csvColumns: { orderName: 'Name of Order', sku: 'Variant SKU', quantity: 'Ordered Qty', billingName: 'Customer', paidDate: 'Date Paid', paymentMethod: 'Pay Method' } })
	const renamedCsv = writeHeaderCsv('orders-renamed.csv', 'Name of Order,Variant SKU,Ordered Qty,Customer,Date Paid,Pay Method', ['#9101,SKU-A,1,Ada,2026-07-01,Credit Card'])
	check('full rename: the file imports', await service.importService.cacheFiles([renamedCsv]) === true)
	check('full rename: values are read from the renamed headers',
		service.importService.imports.length === 1 &&
		service.importService.imports[0].name === '9101' &&
		service.importService.imports[0].sku === 'sku-a' &&
		service.importService.imports[0].quantity === '1' &&
		service.importService.imports[0].billingName === 'Ada' &&
		service.importService.imports[0].paidDate === '2026-07-01' &&
		service.importService.imports[0].paymentMethod === 'Credit Card')

	// -- Partial rename: only SKU differs; the other fields fall back to defaults.
	service.settingsService.save({ csvColumns: { sku: 'Variant SKU' } })
	check('partial mapping merges over the defaults',
		JSON.stringify(service.settingsService.settings.csvColumns) === JSON.stringify({ ...DEFAULT_COLUMNS, sku: 'Variant SKU' }))
	const partialCsv = writeHeaderCsv('orders-partial.csv', 'Name,Variant SKU,Lineitem quantity,Billing Name,Paid at,Payment Method', ['#9102,SKU-B,2,Bea,,'])
	check('partial rename: the file imports', await service.importService.cacheFiles([partialCsv]) === true)
	check('partial rename: other columns still read their defaults',
		service.importService.imports.length === 1 && service.importService.imports[0].name === '9102' && service.importService.imports[0].billingName === 'Bea')

	// -- Case / stray-space tolerance (normalized match engages only after an exact miss).
	service.settingsService.save({ csvColumns: { orderName: 'name of order', sku: ' variant sku ', quantity: 'ordered qty', billingName: 'customer' } })
	check('configured values are trimmed on save', service.settingsService.settings.csvColumns.sku === 'variant sku')
	const tolerantCsv = writeHeaderCsv('orders-tolerant.csv', 'Name of Order, Variant SKU ,Ordered Qty,Customer,Paid at,Payment Method', ['#9103,SKU-A,1,Cleo,,'])
	check('case/whitespace variance still matches', await service.importService.cacheFiles([tolerantCsv]) === true)
	check('tolerant match reads the right columns',
		service.importService.imports.length === 1 && service.importService.imports[0].name === '9103' && service.importService.imports[0].sku === 'sku-a')

	// -- BOM: the first header arrives with a UTF-8 BOM prefix; the resolver strips it.
	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS } })
	const bomCsv = path.join(fixtureRoot, 'orders-bom.csv')
	fs.writeFileSync(bomCsv, `\uFEFF${CSV_HEADER}#9104,SKU-B,1,Dana,,\n`, 'utf-8')
	check('BOM-prefixed header still matches (all columns)', await service.importService.cacheFiles([bomCsv]) === true)
	check('BOM file: values are read correctly',
		service.importService.imports.length === 1 && service.importService.imports[0].name === '9104' && service.importService.imports[0].billingName === 'Dana')

	// -- Missing columns: any unmatched configured column skips the file; other files still load.
	const goodCsv = writeHeaderCsv('orders-good.csv', 'Name,Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method', ['#9105,SKU-A,1,Ed,,'])
	const noNameCsv = writeHeaderCsv('orders-noname.csv', 'Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method', ['SKU-B,1,Fran,,'])
	const noSkuCsv = writeHeaderCsv('orders-nosku.csv', 'Name,Lineitem quantity,Billing Name,Paid at,Payment Method', ['#9106,1,Gil,,'])
	const noQtyCsv = writeHeaderCsv('orders-noqty.csv', 'Name,Lineitem sku,Billing Name,Paid at,Payment Method', ['#9107,SKU-A,Hana,,'])
	service.sent.length = 0
	const mixedOk = await service.importService.cacheFiles([goodCsv, noNameCsv, noSkuCsv, noQtyCsv])
	const mixedToast = toasts(service.sent).find((toast) => toast.includes('Skipped file(s)'))
	check('missing-column load still succeeds via the good file', mixedOk === true)
	check('only the good file\'s rows import', service.importService.imports.length === 1 && service.importService.imports[0].name === '9105')
	check('missing name column is no longer a silent 0-order load', !!mixedToast && mixedToast.includes('orders-noname.csv — missing column "Name"'), JSON.stringify(mixedToast))
	check('missing sku column is skipped with the short reason', !!mixedToast && mixedToast.includes('orders-nosku.csv — missing column "Lineitem sku"'))
	check('missing quantity column is skipped with the short reason', !!mixedToast && mixedToast.includes('orders-noqty.csv — missing column "Lineitem quantity"'))
	check('skip notice points at the ⚙ Configure Import dialog on the Import Orders card', !!mixedToast && mixedToast.includes('Configure Import') && mixedToast.includes('Import Orders card'))
	check('skipped files are excluded from the saved selection', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === goodCsv)

	// Every file skipped: the load fails cleanly and changes nothing.
	await service.importService.cacheFiles([goodCsv])
	service.sent.length = 0
	const allSkippedOk = await service.importService.cacheFiles([noNameCsv])
	const allSkippedToast = toasts(service.sent).find((toast) => toast.includes('No files could be read'))
	check('all-missing-column load reports failure', allSkippedOk === false && service.importService.imports.length === 1 && service.importService.imports[0].name === '9105')
	check('all-missing-column toast keeps the reason + guidance', !!allSkippedToast && allSkippedToast.includes('orders-noname.csv — missing column "Name"') && allSkippedToast.includes('Configure Import'))
	check('failed load keeps the previous selection', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === goodCsv)

	// Console/log lists the file's ACTUAL headers so a mistyped mapping is diagnosable.
	const loggedWarnings = []
	const log = (await import('electron-log')).default
	const originalWarn = log && typeof log.warn === 'function' ? log.warn : null
	if (originalWarn) log.warn = (...args) => loggedWarnings.push(args.map(String).join(' '))
	try {
		await service.importService.cacheFiles([noNameCsv])
	} finally {
		if (originalWarn) log.warn = originalWarn
	}
	check('actual headers are logged for a skipped file', loggedWarnings.some((warning) => warning.includes('Actual headers:') && warning.includes('Lineitem sku, Lineitem quantity, Billing Name')), JSON.stringify(loggedWarnings))

	// -- Missing billingName: SKIPPED like every other configured column (user rule: no match → no copy).
	const columnsPrintDir = path.join(testRoot, 'print-files-columns')
	fs.mkdirSync(columnsPrintDir, { recursive: true })
	fs.writeFileSync(path.join(columnsPrintDir, 'sku-r7.png'), 'r7')
	service.settingsService.setPrintFiles(columnsPrintDir)

	const noBillingCsv = writeHeaderCsv('orders-nobilling.csv', 'Name,Lineitem sku,Lineitem quantity,Paid at,Payment Method', ['#9108,SKU-R7,2,,'])
	service.sent.length = 0
	const noBillingOk = await service.importService.cacheFiles([noBillingCsv])
	const noBillingToast = toasts(service.sent).find((toast) => toast.includes('No files could be read'))
	check('missing billing column skips the file (no copies)',
		noBillingOk === false && !!noBillingToast && noBillingToast.includes('orders-nobilling.csv — missing column "Billing Name"'))
	check('the skip guidance points at the Configure Import dialog', !!noBillingToast && noBillingToast.includes('Configure Import'))
	check('refused load resets the parsing state (no stuck spinner)', lastStatus(service.sent)?.isParsing === false && lastStatus(service.sent)?.orderCount === service.importService.imports.length, JSON.stringify({ status: lastStatus(service.sent), cache: service.importService.imports.length }))

	// Empty values (column present but blank) are NOT the same as a missing column.
	const emptyBillingCsv = writeHeaderCsv('orders-emptybilling.csv', 'Name,Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method', ['#9108,SKU-R7,2,,,'])
	check('blank values (not a missing column) still import',
		await service.importService.cacheFiles([emptyBillingCsv]) === true && service.importService.imports.length === 1 && service.importService.imports[0].billingName === '')

	const columnsOutputDir = path.join(testRoot, 'output-columns')
	fs.mkdirSync(columnsOutputDir, { recursive: true })
	service.settingsService.setPrintFolder(columnsOutputDir)
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	const emptyBillingNames = fs.readdirSync(columnsOutputDir).sort()
	check('blank billing value: copy names keep the empty segment', JSON.stringify(emptyBillingNames) === JSON.stringify(['9108--sku-r7---0-0.png', '9108--sku-r7---1-0.png']), JSON.stringify(emptyBillingNames))

	// Copy with a selection but nothing loaded (refused restore): the toast must explain the real problem.
	service.importService.deleteCache()
	service.settingsService.setImports([emptyBillingCsv])
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	check('copy with an unreadable selection explains what to fix', toasts(service.sent).some((toast) => toast.includes('couldn\'t be read') && toast.includes('Configure Import')))
	service.settingsService.setImports([])
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	check('copy with nothing selected keeps the original hint', toasts(service.sent).some((toast) => toast.includes('import at least one .CSV export first')))

	// -- Stale-mapping gate: Copy refuses when the mapping changed after load; reloading clears it.
	const gatePrintDir = path.join(testRoot, 'print-files-gate')
	const gateOutputDir = path.join(testRoot, 'output-gate')
	fs.mkdirSync(gatePrintDir, { recursive: true })
	fs.mkdirSync(gateOutputDir, { recursive: true })
	fs.writeFileSync(path.join(gatePrintDir, 'sku-a.png'), 'a')
	service.settingsService.setPrintFiles(gatePrintDir)
	service.settingsService.setPrintFolder(gateOutputDir)
	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS } })
	await service.importService.cacheFiles([csvA])
	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS, sku: 'Wrong SKU' } })
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	check('stale mapping: Copy refuses instead of copying the old snapshot',
		toasts(service.sent).some((toast) => toast.includes('column mapping changed') && toast.includes('Configure Import')))
	check('stale mapping: nothing was copied', fs.readdirSync(gateOutputDir).length === 0)
	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS } })
	await service.importService.cacheFiles([csvA])
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	check('mapping restored + reloaded: Copy works again', fs.readdirSync(gateOutputDir).length === 1)

	// -- Header-only (empty-data) CSV keeps today's path: kept, 0 orders — column check bypassed.
	const emptyCsv = path.join(fixtureRoot, 'orders-empty.csv')
	fs.writeFileSync(emptyCsv, 'Foo,Bar\n', 'utf-8')
	service.sent.length = 0
	const emptyOk = await service.importService.cacheFiles([emptyCsv])
	check('header-only CSV is kept with 0 orders (not skipped)', emptyOk === true && service.importService.imports.length === 0)
	check('header-only CSV lands in the saved selection', service.settingsService.settings.imports.length === 1 && service.settingsService.settings.imports[0] === emptyCsv)
	check('header-only CSV produces no skip notice', !toasts(service.sent).some((toast) => toast.includes('orders-empty.csv')))

	// -- Exact-match precedence: `Name` wins over `name` (today's key reads, first exact).
	const bothNamesCsv = writeHeaderCsv('orders-both-names.csv', 'name,Name,Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method', ['wrong-9109,#9109,SKU-A,1,Ivy,,'])
	check('mixed-case duplicate headers: load succeeds', await service.importService.cacheFiles([bothNamesCsv]) === true)
	check('exact header wins over the case-variant duplicate', service.importService.imports.length === 1 && service.importService.imports[0].name === '9109')

	// -- Copy-parity: defaults on the golden fixture → byte-identical destinations.
	service.settingsService.save({ csvColumns: { ...DEFAULT_COLUMNS } })
	const parityPrintDir = path.join(testRoot, 'print-files-parity')
	const parityOutputDir = path.join(testRoot, 'output-parity')
	fs.mkdirSync(parityPrintDir, { recursive: true })
	fs.mkdirSync(parityOutputDir, { recursive: true })
	fs.writeFileSync(path.join(parityPrintDir, 'SKU-A.png'), 'a')
	fs.writeFileSync(path.join(parityPrintDir, 'sku-b.png'), 'b')
	service.settingsService.setPrintFiles(parityPrintDir)
	service.settingsService.setPrintFolder(parityOutputDir)
	await service.importService.cacheFiles([csvA])
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	const parityNames = fs.readdirSync(parityOutputDir).sort()
	check('default config on the golden fixture yields the byte-identical destinations',
		JSON.stringify(parityNames) === JSON.stringify(['1001-Alice-sku-a---0-0.png', '1002-Bob-sku-b---0-1.png', '1002-Bob-sku-b---1-1.png']), JSON.stringify(parityNames))
}

console.log('\n[15] Payment method + paid date (picked up from main)')
{
	// Second row (same order) inherits payment/date/billing from the first row.
	const newColsCsv = path.join(fixtureRoot, 'orders-newcols.csv')
	fs.writeFileSync(newColsCsv, 'Name,Lineitem sku,Lineitem quantity,Billing Name,Payment Method,Paid at\n' +
		'#9301,SKU-NC,1,Nova,Credit Card,2026-07-20 10:00:00 +0000\n' +
		'#9301,SKU-NC,1,,,\n', 'utf-8')

	service.sent.length = 0
	const ok = await service.importService.cacheFiles([newColsCsv])
	check('file with payment/date columns imports', ok === true && service.importService.imports.length === 2)
	check('payment method + paid date are read',
		service.importService.imports[0].paymentMethod === 'Credit Card' && service.importService.imports[0].paidDate === '2026-07-20 10:00:00 +0000')
	check('missing payment/date/billing values inherit from the last row of the order',
		service.importService.imports[1].paymentMethod === 'Credit Card' && service.importService.imports[1].paidDate === '2026-07-20 10:00:00 +0000' && service.importService.imports[1].billingName === 'Nova')

	// Copy names carry both segments (method lowercased, date sanitized).
	const newColsPrintDir = path.join(testRoot, 'print-files-newcols')
	const newColsOutputDir = path.join(testRoot, 'output-newcols')
	fs.mkdirSync(newColsPrintDir, { recursive: true })
	fs.mkdirSync(newColsOutputDir, { recursive: true })
	fs.writeFileSync(path.join(newColsPrintDir, 'sku-nc.png'), 'nc')
	service.settingsService.setPrintFiles(newColsPrintDir)
	service.settingsService.setPrintFolder(newColsOutputDir)
	service.sent.length = 0
	await new FileCopyService(service.settingsService, service.importService, service.events).processFiles()
	const newColsNames = fs.readdirSync(newColsOutputDir).sort()
	check('copy names carry the paid-date + payment-method segments',
		JSON.stringify(newColsNames) === JSON.stringify(['9301-Nova-sku-nc-2026-07-20 10_00_00 +0000-credit_card-0-0.png', '9301-Nova-sku-nc-2026-07-20 10_00_00 +0000-credit_card-0-1.png']), JSON.stringify(newColsNames))
}

fs.rmSync(testRoot, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
	console.error(`${failures.length} check(s) FAILED.`)
	app.exit(1)
} else {
	console.log('All checks passed.')
	app.exit(0)
}
