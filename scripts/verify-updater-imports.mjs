// Verifies the ESM/CJS interop and default configuration of the updater
// dependencies under Electron's main process (electron-updater is CJS; this
// app runs ESM with Node type stripping). Run: npm run verify:updater
import { app } from 'electron'

const failures = []
const check = (name, ok) => {
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
	if (!ok) failures.push(name)
}

// electron-updater is CommonJS with non-analysable exports: UpdateService must
// use `import pkg from 'electron-updater'` + destructuring (named ESM imports
// such as `import { autoUpdater }` fail at runtime with a SyntaxError).
// `m.default` below is exactly what a default import resolves to.
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

console.log('')
if (failures.length) {
	console.error(`FAILED (${failures.length}): ${failures.join('; ')}`)
}
else {
	console.log('ALL CHECKS PASSED')
}
app.exit(failures.length ? 1 : 0)
