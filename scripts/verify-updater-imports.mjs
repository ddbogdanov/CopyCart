// Verifies electron-updater interop and defaults under Electron's main process.
// Run: npm run verify:updater
import { app } from 'electron'

const failures = []
const check = (name, ok) => {
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
	if (!ok) failures.push(name)
}

// UpdateService must keep the default-import + destructure style: named ESM
// imports (`import { autoUpdater }`) fail at runtime (non-analysable CJS exports).
const m = await import('electron-updater')
const pkg = m.default ?? m

check('default export exists (required import style)', m.default !== undefined)
check('autoUpdater on default export', Boolean(pkg.autoUpdater))
check('checkForUpdates is a function', typeof pkg.autoUpdater?.checkForUpdates === 'function')
check('downloadUpdate is a function', typeof pkg.autoUpdater?.downloadUpdate === 'function')
check('quitAndInstall is a function', typeof pkg.autoUpdater?.quitAndInstall === 'function')
check('autoDownload defaults to true (we disable it explicitly)', pkg.autoUpdater?.autoDownload === true)
check('autoInstallOnAppQuit defaults to true (we disable it explicitly)', pkg.autoUpdater?.autoInstallOnAppQuit === true)

// CancellationToken is used to support cancelling an in-flight download.
check('CancellationToken on default export', typeof pkg.CancellationToken === 'function')
try {
	const token = new pkg.CancellationToken()
	check('CancellationToken instantiable', typeof token.cancel === 'function')
}
catch (error) {
	check(`CancellationToken instantiable (${error.message})`, false)
}

const logModule = await import('electron-log')
check('electron-log bare import works', typeof (logModule.default ?? logModule).info === 'function')

// UpdateService must keep an 'error' listener: failure paths only emit 'error'
// (never log), and an unobserved 'error' event throws.
const { UpdateService } = await import('../electron/services/UpdateService.ts')
new UpdateService()
check('UpdateService attaches an updater error listener', pkg.autoUpdater.listenerCount('error') > 0)

console.log('')
if (failures.length) {
	console.error(`FAILED (${failures.length}): ${failures.join('; ')}`)
}
else {
	console.log('ALL CHECKS PASSED')
}
app.exit(failures.length ? 1 : 0)
