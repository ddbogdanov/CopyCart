/**
 * Sandboxed verification of the settings storage migration
 * (legacy `<userData>/settings.json` -> electron-store `<userData>/config.json`).
 *
 * Run under Electron:  npm run verify:settings-migration
 *
 * Uses a throwaway temp directory as `userData`, so real user settings are
 * never read or written. Exits non-zero when any check fails. Keep this script
 * passing before shipping a release that changes the settings backend.
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

// Mirrors the production wiring in electron/main.ts. No window is attached, so
// RendererEvents.send is a no-op here.
function createServices() {
	const events = new RendererEvents()
	const settingsService = new SettingsService(events)
	const importService = new ImportService(settingsService, events)
	return { settingsService, importService }
}

// Mirrors the `did-finish-load` wiring in electron/main.ts: load the settings,
// then restore the cached import file when one was saved.
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

// Mirrors a realistic legacy file written by app versions <= 1.4.x.
// `printFolder: false` proves explicit `false` flags survive the migration.
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
	check('saving succeeds', fresh.settingsService.save({ ...loaded }) === true)
	check('store file written (config.json)', fs.existsSync(storePath))
	check('legacy file is NOT (re)created', !fs.existsSync(legacyPath))
	check('no legacy backup created', !fs.existsSync(backupPath))
}

console.log('\n[2] Migration from legacy settings.json (the auto-update path)')
{
	resetSandbox()
	const csvPath = path.join(testRoot, 'orders.csv')
	fs.writeFileSync(csvPath, 'Name,Lineitem sku,Lineitem quantity,Billing Name\n#1001,SKU-A,2,Jane Doe\n', 'utf-8')
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

	// Simulate a leftover/stale legacy file (e.g. rename failed, or file restored
	// by hand): once migrated, old data must never overwrite the new store.
	writeLegacy({ ...LEGACY_FIXTURE, themeColor: '#ef4444', printFiles: 'C:\\Stale' })
	const guarded = createServices()
	const guardedSettings = boot(guarded)
	check('stale legacy file does not overwrite migrated settings', guardedSettings.themeColor === '#3b82f6' && guardedSettings.printFiles === 'C:\\PrintFiles')
	fs.rmSync(legacyPath)

	// Store file lost after migration (manual deletion, disk cleanup): the app
	// regenerates a fresh store containing defaults — and the migration must NOT
	// run again, even though the values are gone (the `.bak` marks it as done).
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
	// Point userData beneath a path that cannot be a directory so electron-store
	// cannot initialize. The guard must absorb it: defaults for the session and
	// save failures reported, never a startup crash (crucial during an update,
	// when the installer briefly launches the app).
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

console.log('')
if (failures.length) {
	console.error(`FAILED (${failures.length}): ${failures.join('; ')}`)
} else {
	console.log('ALL CHECKS PASSED')
}
fs.rmSync(testRoot, { recursive: true, force: true })
app.exit(failures.length ? 1 : 0)
