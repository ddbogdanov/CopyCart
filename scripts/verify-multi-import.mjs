/**
 * Sandboxed verification of the multi-file order import flow
 * (row dedupe, path dedupe, content dedupe, replace semantics, persistence,
 * cache clearing) and of the copy pipeline accounting (one copy per ordered
 * quantity, unmatched/invalid lines reported instead of skipped silently).
 *
 * Run under Electron:  npm run verify:import
 *
 * Uses a throwaway temp directory as `userData`, so real user settings are
 * never read or written. Exits non-zero when any check fails.
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

const CSV_HEADER = 'Name,Lineitem sku,Lineitem quantity,Billing Name\n'
function writeCsv(name, rows) {
	const filePath = path.join(fixtureRoot, name)
	fs.writeFileSync(filePath, CSV_HEADER + rows.join('\n') + '\n', 'utf-8')
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
	check('case-insensitive file lookup (SKU-A.png -> sku-a)', output.includes('1001-Alice-sku-a-0-0.png'))
	check('copies named with order + customer + sku + index', output.includes('1002-Bob-sku-b-0-1.png') && output.includes('1002-Bob-sku-b-1-1.png'))
	check('output set is exactly the original naming formula (golden list)', JSON.stringify(output) === JSON.stringify(['1001-Alice-sku-a-0-0.png', '1002-Bob-sku-b-0-1.png', '1002-Bob-sku-b-1-1.png']))
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
	// The same 3 line items appear in both files (the second file additionally
	// contains one new line) -> the overlap is copied once, the new line is
	// added. (Whole files differ, like two real exports with overlapping rows.)
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

fs.rmSync(testRoot, { recursive: true, force: true })

console.log('')
if (failures.length > 0) {
	console.error(`${failures.length} check(s) FAILED.`)
	app.exit(1)
} else {
	console.log('All checks passed.')
	app.exit(0)
}
