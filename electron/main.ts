import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { RendererEvents } from './services/RendererEvents.ts'
import { SettingsService } from './services/SettingsService.ts'
import { ImportService } from './services/ImportService.ts'
import { FileCopyService } from './services/FileCopyService.ts'
import { UpdateService } from './services/UpdateService.ts'
import path from "path"
import type { IpcHandlers, OpenDialogRequest } from '../shared/ipc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const events = new RendererEvents()
const settingsService = new SettingsService(events)
const importService = new ImportService(settingsService, events)
const fileCopyService = new FileCopyService(settingsService, importService, events)
const updateService = new UpdateService()
let mainWindow: BrowserWindow

app.setName('Copy Cart')

// Dev-only heads-up: `net session` only succeeds when elevated, and an
// elevated window never receives Explorer drag & drop (Windows UIPI).
if (!app.isPackaged && process.platform === 'win32') {
	try {
		execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true })
		console.warn('\u26a0 DEV WARNING: running ELEVATED (Administrator). Windows will block file drag & drop into this window — relaunch from a non-admin terminal (plain PowerShell / VS Code without "Run as administrator").')
	}
	catch {
		// Expected path when non-elevated.
	}
}

app.whenReady().then(() => {
	createWindow()

	mainWindow.webContents.on('did-finish-load', () => {
		const settings = settingsService.load()
		if (settings.imports.length > 0) importService.cacheFiles(settings.imports).catch((error) => console.error('Failed to restore import files:', error))

		updateService.checkForUpdates()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  if (mainWindow) {
    if (settingsService.save(undefined, true)) console.log('Settings saved on quit')
  }
})

// *** IPC Handlers ***
const handlers: IpcHandlers = {
	'open-file-dialog': async (request) => {
		const filePaths = await openFileDialog(request)
		if (filePaths.length === 0) return []

		if (request.kind === 'import-orders') importService.cacheFiles(settingsService.settings.imports.concat(filePaths))
		if (request.kind === 'print-files') settingsService.setPrintFiles(filePaths[0])
		if (request.kind === 'print-folder') settingsService.setPrintFolder(filePaths[0])

		return filePaths
	},
	'cache-import-files': (filePaths) => importService.cacheFiles(settingsService.settings.imports.concat(filePaths)),
	'remove-import-file': (filePath) => importService.removeFile(filePath),
	'delete-cache': () => { importService.deleteCache() },
	'delete-print-files': () => { settingsService.deletePrintFiles() },
	'delete-print-folder': () => { settingsService.deletePrintFolder() },
	'process-files': () => fileCopyService.processFiles(),
	'minimize': () => { mainWindow.minimize() },
	'toggle-maximize': () => {
		if(mainWindow.isMaximized()) {
			mainWindow.unmaximize()
			return false
		}
		mainWindow.maximize()
		return true
	},
	'exit': () => { mainWindow.close() },
	'save-settings': (settings) => {
		const previousColumns = JSON.stringify(settingsService.settings.csvColumns)
		const saved = settingsService.save(settings, false)

		if (saved && settingsService.settings.imports.length > 0 && JSON.stringify(settingsService.settings.csvColumns) !== previousColumns) {
			importService.cacheFiles(settingsService.settings.imports).catch((error) => console.error('Failed to reload imports after a mapping change:', error))
		}

		return saved
	},
	'open-dev-tools': () => { mainWindow.webContents.openDevTools() },
	'update-window:cancel': () => { updateService.cancelDownload() },
	'update-window:close': () => { updateService.closeUpdateWindow() },
}

for (const [channel, handler] of Object.entries(handlers)) {
	ipcMain.handle(channel, (_event, ...args: unknown[]) => (handler as (...handlerArgs: any[]) => any)(...args))
}

// *** Util Methods ***
async function openFileDialog(request: OpenDialogRequest): Promise<string[]> {
	if (!mainWindow) return []

	const { filePaths } = await dialog.showOpenDialog(mainWindow, {
		title: request.title,
		buttonLabel: 'Upload',
		properties: request.properties,
		filters: request.filters
	})

	return filePaths
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 900,
		height: 500,
		minWidth: 900,
		minHeight: 500,
		frame: false,
		webPreferences: {
			preload: join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
		title: 'Copy Cart',
		icon: path.join(__dirname, "../build/icons/icon.png")
	})

	events.setMainWindow(mainWindow)
	updateService.setMainWindow(mainWindow)

  	if(app.isPackaged) {
		mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
		mainWindow.setMenu(null)
  	}
  	else {
		mainWindow.loadURL('http://localhost:5173')
  	}
}
