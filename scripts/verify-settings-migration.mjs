/**
 * Sandboxed verification of the settings migration (legacy `settings.json` ->
 * electron-store `config.json`).
 *
 * Run: npm run verify:settings-migration
 * Uses a throwaway `userData` temp dir; exits non-zero on failure.
 */
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Ordering matters: userData must be redirected before the settings services /
// electron-store are constructed (they capture app.getPath('userData') then).
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copycart-settings-test-'))
app.setPath('userData', path.join(testRoot, 'userData'))

const { RendererEvents } = await import('../electron/services/RendererEvents.ts')
const { SettingsService } = await import('../electron/services/SettingsService.ts')
const { ImportService } = await import('../electron/services/ImportService.ts')

// Mirrors electron/main.ts wiring; no window is attached (events are no-ops).
function createServices() {
	const events = new RendererEvents()
	const settingsService = new SettingsService(events)
	const importService = new ImportService(settingsService, events)
	return { settingsService, importService }
}

// Mirrors the did-finish-load restore in electron/main.ts.
function boot(services) {
	const settings = services.settingsService.load()
	if (settings.imports.length > 0) services.importService.cacheFiles(settings.imports)
	return settings
}

const userDataPath = app.getPath('userData')
const legacyPath = path.join(userDataPath, 'settings.json')
const backupPath = `${legacyPath}.bak`
const storePath = path.join(userDataPath, 'config.json')

const failures = []
function check(name, condition, detail = '') {
	if (condition) {
		console.log(`  PASS  ${name}`)
	} else {
		failures.push(name)
		console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
	}
}
function resetSandbox() {
	fs.rmSync(userDataPath, { recursive: true, force: true })
	fs.mkdirSync(userDataPath, { recursive: true })
}
function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf-8'))
}
function writeLegacy(content) {
	fs.writeFileSync(legacyPath, JSON.stringify(content, null, 2), 'utf-8')
}

// Realistic <= 1.4.x file; `printFolder: false` proves explicit flags survive.
const LEGACY_FIXTURE = {
	shouldSave: { imports: false, printFiles: true, printFolder: false },
	imports: '',
	printFiles: 'C:\\PrintFiles',
	printFolder: 'C:\\Output',
	themeColor: '#3b82f6'
}

console.log('\n[1] Fresh install (no legacy file)')
{
	resetSandbox()
	const fresh = createServices()
	const loaded = boot(fresh)

	check('defaults are used', loaded.printFiles === '' && loaded.themeColor === '#10b981' && loaded.shouldSave.printFiles === true)
	check('error-report defaults are present', loaded.reportFolder === '' && loaded.reportToPrintFolder === true)
	check('saving succeeds', fresh.settingsService.save({ ...loaded }) === true)
	check('error-report settings type-sanitize on save', fresh.settingsService.save({ reportFolder: 123, reportToPrintFolder: 'yes' }) === true && fresh.settingsService.settings.reportFolder === '' && fresh.settingsService.settings.reportToPrintFolder === true)
	check('store file written (config.json)', fs.existsSync(storePath))
	check('legacy file is NOT (re)created', !fs.existsSync(legacyPath))
	check('no legacy backup created', !fs.existsSync(backupPath))
}

console.log('\n[2] Migration from legacy settings.json (the auto-update path)')
{
	resetSandbox()
	const csvPath = path.join(testRoot, 'orders.csv')
	fs.writeFileSync(csvPath, 'Name,Lineitem sku,Lineitem quantity,Billing Name,Paid at,Payment Method\n#1001,SKU-A,2,Jane Doe,,\n', 'utf-8')
	writeLegacy({ ...LEGACY_FIXTURE, imports: csvPath })

	const upgraded = createServices()
	const migrated = boot(upgraded)

	check('all legacy values migrated', migrated.printFiles === 'C:\\PrintFiles' && migrated.printFolder === 'C:\\Output' && migrated.themeColor === '#3b82f6' && migrated.imports.length === 1 && migrated.imports[0] === csvPath)
	check('shouldSave flags migrated (incl. explicit false)', migrated.shouldSave.printFiles === true && migrated.shouldSave.printFolder === false && migrated.shouldSave.imports === false)

	const stored = readJson(storePath)
	check('store file contains migrated values', stored.themeColor === '#3b82f6' && stored.printFolder === 'C:\\Output')
	check('store file contains missing defaults', stored.shouldSave.imports === false)
	check('legacy file renamed to .bak', !fs.existsSync(legacyPath) && fs.existsSync(backupPath))
	check('backup preserves original content', readJson(backupPath).printFiles === 'C:\\PrintFiles')

	await new Promise(resolve => setTimeout(resolve, 300))
	check('import cache restored from migrated path', upgraded.importService.imports.length === 1)

	// Quit-time filtering must behave exactly as before (shouldSave.printFolder === false).
	check('quit-time save succeeds', upgraded.settingsService.save(undefined, true) === true)
	const afterQuit = readJson(storePath)
	check('quit-time filtering blanks printFolder', upgraded.settingsService.settings.printFolder === '' && afterQuit.printFolder === '')
	check('quit-time filtering keeps saved values', afterQuit.printFiles === 'C:\\PrintFiles' && afterQuit.themeColor === '#3b82f6')

	console.log('\n[3] Relaunch after migration (idempotence + safety)')
	const relaunch = createServices()
	const reloaded = boot(relaunch)
	check('migrated values still present', reloaded.themeColor === '#3b82f6' && reloaded.printFiles === 'C:\\PrintFiles')

	// Stale legacy file (rename failed / restored by hand): must not overwrite the new store.
	writeLegacy({ ...LEGACY_FIXTURE, themeColor: '#ef4444', printFiles: 'C:\\Stale' })
	const guarded = createServices()
	const guardedSettings = boot(guarded)
	check('stale legacy file does not overwrite migrated settings', guardedSettings.themeColor === '#3b82f6' && guardedSettings.printFiles === 'C:\\PrintFiles')
	fs.rmSync(legacyPath)

	// Store lost after migration: defaults are regenerated; migration must NOT
	// re-run (the `.bak` marks it as done).
	fs.rmSync(storePath)
	const regenerated = createServices()
	check('store file regenerated after loss', fs.existsSync(storePath))
	const regeneratedSettings = boot(regenerated)
	check('store loss yields defaults (migration never re-runs)', regeneratedSettings.themeColor === '#10b981' && regeneratedSettings.printFiles === '' && regeneratedSettings.printFolder === '')
	check('regenerated store saves normally', regenerated.settingsService.save({ themeColor: '#ef4444' }) === true && readJson(storePath).themeColor === '#ef4444')
	check('migration marker (.bak) left in place', fs.existsSync(backupPath))
}

console.log('\n[4] Corrupt legacy file (graceful failure + retry next launch)')
{
	resetSandbox()
	fs.writeFileSync(legacyPath, '{ this is not valid json', 'utf-8')

	let corruptHandled = true
	try {
		const corruptServices = createServices()
		const corruptSettings = boot(corruptServices)
		check('app starts with defaults when migration fails', corruptSettings.themeColor === '#10b981' && corruptSettings.printFiles === '')
	} catch (error) {
		corruptHandled = false
		console.error('   ', error)
	}
	check('migration failure does not crash the app', corruptHandled)
	check('legacy file left untouched after failure', fs.existsSync(legacyPath))

	// The file is "fixed" (or a transient failure clears up) -> next launch retries.
	writeLegacy(LEGACY_FIXTURE)
	const retried = createServices()
	const retriedSettings = boot(retried)
	check('migration retries and succeeds on next launch', retriedSettings.themeColor === '#3b82f6' && retriedSettings.printFiles === 'C:\\PrintFiles')
	check('legacy renamed after successful retry', !fs.existsSync(legacyPath) && fs.existsSync(backupPath))
}

console.log('\n[5] Corrupt store file (clearInvalidConfig fallback)')
{
	resetSandbox()
	fs.writeFileSync(storePath, 'not json at all', 'utf-8')

	let recoveredSettings
	let storeCorruptionHandled = true
	try {
		const recovered = createServices()
		recoveredSettings = boot(recovered)
		check('saving still works after corruption', recovered.settingsService.save({ themeColor: '#22c55e' }) === true)
	} catch (error) {
		storeCorruptionHandled = false
		console.error('   ', error)
	}
	check('app still starts with corrupt store file', storeCorruptionHandled)
	check('defaults used after corrupt store', recoveredSettings?.themeColor === '#10b981')
	check('store rewritten as valid JSON', readJson(storePath).themeColor === '#22c55e')
}

console.log('\n[6] Settings write through to disk immediately')
{
	resetSandbox()
	const immediate = createServices()
	boot(immediate)

	immediate.settingsService.setPrintFiles('C:\\Immediate')
	const afterFiles = fs.existsSync(storePath) ? readJson(storePath) : {}
	check('picking print files persists without a quit save', afterFiles.printFiles === 'C:\\Immediate')

	immediate.settingsService.setPrintFolder('C:\\OutNow')
	check('picking print folder persists without a quit save', readJson(storePath).printFolder === 'C:\\OutNow')

	immediate.settingsService.setReportFolder('C:\\Reports')
	check('picking the report folder persists immediately', readJson(storePath).reportFolder === 'C:\\Reports')

	immediate.settingsService.setReportToPrintFolder(false)
	check('toggling the report location persists immediately', readJson(storePath).reportToPrintFolder === false)

	immediate.settingsService.setImports(['C:\\a.csv', 'C:\\b.csv'])
	check('import selection persists without a quit save', JSON.stringify(readJson(storePath).imports) === JSON.stringify(['C:\\a.csv', 'C:\\b.csv']))

	immediate.settingsService.clearImports()
	check('clearing imports persists immediately', readJson(storePath).imports.length === 0)

	immediate.settingsService.deletePrintFiles()
	check('clearing print files persists immediately', readJson(storePath).printFiles === '')

	immediate.settingsService.deletePrintFolder()
	check('clearing print folder persists immediately', readJson(storePath).printFolder === '')
}

console.log('\n[7] Store unavailable (unwritable/misconfigured userData — app must still start)')
{
	// userData beneath a file: the guard must absorb it — session defaults, save
	// failures reported, never a startup crash.
	const blockedParent = path.join(testRoot, 'blocked-parent')
	fs.writeFileSync(blockedParent, 'not a directory', 'utf-8')
	app.setPath('userData', path.join(blockedParent, 'userData'))

	let handled = true
	try {
		const blocked = createServices()
		const blockedSettings = boot(blocked)
		check('defaults are used when the store cannot initialize', blockedSettings.themeColor === '#10b981' && blockedSettings.shouldSave.printFiles === true)
		check('saving reports failure instead of throwing', blocked.settingsService.save({ themeColor: '#ef4444' }) === false)
	} catch (error) {
		handled = false
		console.error('   ', error)
	}
	check('store initialization failure does not crash the app', handled)
}

console.log('\n[8] CSV column mapping: defaults, partial merge, sanitize, write-through')
{
	// Restore the real sandbox path (section [7] pointed userData beneath a file).
	app.setPath('userData', userDataPath)
	resetSandbox()

	// Defaults byte-exact vs. the shipped literals.
	const fresh = createServices()
	const loaded = boot(fresh)
	check('csv mapping defaults are byte-exact',
		JSON.stringify(loaded.csvColumns) === JSON.stringify({ orderName: 'Name', sku: 'Lineitem sku', quantity: 'Lineitem quantity', billingName: 'Billing Name', paidDate: 'Paid at', paymentMethod: 'Payment Method' }))

	// Partial stored object merges over the defaults per key (electron-store does not deep-merge).
	fs.writeFileSync(storePath, JSON.stringify({ csvColumns: { sku: 'Variant SKU' } }), 'utf-8')
	const partial = createServices()
	const partialSettings = boot(partial)
	check('partial stored mapping merges over defaults',
		partialSettings.csvColumns.sku === 'Variant SKU' &&
		partialSettings.csvColumns.orderName === 'Name' &&
		partialSettings.csvColumns.quantity === 'Lineitem quantity' &&
		partialSettings.csvColumns.billingName === 'Billing Name' &&
		partialSettings.csvColumns.paidDate === 'Paid at' &&
		partialSettings.csvColumns.paymentMethod === 'Payment Method')

	// Blank / whitespace-only / wrong-typed values fall back to the defaults.
	fs.writeFileSync(storePath, JSON.stringify({ csvColumns: { sku: '   ', orderName: 42, billingName: '  Billing Name  ' } }), 'utf-8')
	const sanitized = createServices()
	const sanitizedSettings = boot(sanitized)
	check('blank/whitespace mapping values fall back to defaults',
		sanitizedSettings.csvColumns.sku === 'Lineitem sku' && sanitizedSettings.csvColumns.orderName === 'Name')
	check('stored mapping values are trimmed', sanitizedSettings.csvColumns.billingName === 'Billing Name')

	// Write-through: a save persists instantly (no quit needed) and survives a relaunch.
	sanitized.settingsService.save({ csvColumns: { orderName: 'Name of Order', sku: ' variant sku ', quantity: 'Qty', billingName: 'Billing Name' } })
	const storedMapping = readJson(storePath).csvColumns
	check('custom mapping persists immediately (trimmed)',
		storedMapping.orderName === 'Name of Order' && storedMapping.sku === 'variant sku' && storedMapping.quantity === 'Qty')

	// Blank on save = default (the dialog can send a cleared field).
	sanitized.settingsService.save({ csvColumns: { orderName: '  ', sku: 'variant sku', quantity: 'Qty', billingName: 'Billing Name' } })
	check('blank value saved as the default', readJson(storePath).csvColumns.orderName === 'Name')

	const relaunch = createServices()
	const relaunchedSettings = boot(relaunch)
	check('custom mapping survives a relaunch',
		relaunchedSettings.csvColumns.orderName === 'Name' && relaunchedSettings.csvColumns.sku === 'variant sku' && relaunchedSettings.csvColumns.quantity === 'Qty')
}

console.log('\n[9] Stored settings type sanitization (valid JSON, wrong types)')
{
	resetSandbox()

	// Wrong-typed values must be coerced back to the contract (clearInvalidConfig only catches bad JSON).
	fs.writeFileSync(storePath, JSON.stringify({
		shouldSave: { imports: 'yes', printFiles: 0, printFolder: null },
		printFiles: 123,
		printFolder: { nested: true },
		recursivePrintFiles: 'yes',
		themeColor: 'not-a-color'
	}), 'utf-8')

	const salvaged = createServices()
	const salvagedSettings = boot(salvaged)
	check('wrong-typed paths fall back to defaults',
		salvagedSettings.printFiles === '' && salvagedSettings.printFolder === '')
	check('invalid theme color falls back to the default', salvagedSettings.themeColor === '#10b981')
	check('non-boolean shouldSave flags fall back to defaults',
		salvagedSettings.shouldSave.imports === false && salvagedSettings.shouldSave.printFiles === true && salvagedSettings.shouldSave.printFolder === true)
	check('non-boolean recursive toggle falls back to false', salvagedSettings.recursivePrintFiles === false)

	// Well-typed non-default values must survive sanitization untouched.
	fs.writeFileSync(storePath, JSON.stringify({
		shouldSave: { imports: true, printFiles: false, printFolder: true },
		printFiles: 'C:\\KeptFiles',
		printFolder: 'C:\\KeptFolder',
		recursivePrintFiles: true,
		themeColor: '#3b82f6'
	}), 'utf-8')

	const kept = createServices()
	const keptSettings = boot(kept)
	check('well-typed values survive sanitization',
		keptSettings.printFiles === 'C:\\KeptFiles' && keptSettings.printFolder === 'C:\\KeptFolder' &&
		keptSettings.recursivePrintFiles === true && keptSettings.themeColor === '#3b82f6' &&
		keptSettings.shouldSave.imports === true && keptSettings.shouldSave.printFiles === false)
}

console.log('')
if (failures.length) {
	console.error(`FAILED (${failures.length}): ${failures.join('; ')}`)
} else {
	console.log('ALL CHECKS PASSED')
}
fs.rmSync(testRoot, { recursive: true, force: true })
app.exit(failures.length ? 1 : 0)
