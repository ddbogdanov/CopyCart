import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { IoService } from './services/IoService.ts'
import path from "path"
import { updateElectronApp } from 'update-electron-app'

// TODO: TEST THIS?? BUT HOW?!
if(handleSquirrelEvent()) {
  process.exit(0)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ioService = new IoService()
let mainWindow: BrowserWindow

app.setName('Copy Cart')
app.whenReady().then(() => {
	createWindow()

	updateElectronApp({ notifyUser: true })

	mainWindow.webContents.on('did-finish-load', () => {
		ioService.loadSettings()
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  if (mainWindow) {
    if (ioService.saveSettings(undefined, true)) console.log('Settings saved on quit')
  }
})

// *** IPC Handlers ***
ipcMain.handle("open-file-dialog", async (event, title, properties, filters) => {
  event
  const { filePaths } = await ioService.openFileDialog(dialog, title, properties, filters)

  if(title === 'Import Orders') ioService.cacheFile(filePaths[0])
  if(title === 'Select Print Files') ioService.setPrintFiles(filePaths[0])
  if(title === 'Select Print Folder') ioService.setPrintFolder(filePaths[0])

  return filePaths[0];
})
ipcMain.handle("delete-cache", () => { ioService.deleteCache() })
ipcMain.handle("delete-print-files", () => { ioService.deletePrintFiles() })
ipcMain.handle("delete-print-folder", () => { ioService.deletePrintFolder() })
ipcMain.handle('update-loading-state', (_event: any, isLoading: boolean, progress: number, status: string) => {
	mainWindow.webContents.send('update:loading:state', { 'isLoading': isLoading, 'progress': progress, 'status': status })
})
ipcMain.handle('process-files', () => { ioService.processFiles() })
ipcMain.handle('minimize', () => { mainWindow.minimize() })
ipcMain.handle('toggle-maximize', () => {
	if(mainWindow.isMaximized()) {
		mainWindow.unmaximize()
		mainWindow.webContents.send('window:maximize:update', { 'maximized': false })
	}
	else {
		mainWindow.maximize()
		mainWindow.webContents.send('window:maximize:update', { 'maximized': true })
	}
})
ipcMain.handle('exit', () => { mainWindow.close() })
ipcMain.handle('save-settings', (_event: any, settings: Record<string, any>) => { ioService.saveSettings(settings, false) })
ipcMain.handle('open-dev-tools', () => { mainWindow.webContents.openDevTools() })

// *** Util Methods ***
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 450,
	frame: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
	title: 'Copy Cart',
	icon: path.join(__dirname, "../build/icons/icon.png")
  })

  ioService.setMainWindow(mainWindow)

  if(app.isPackaged) {
	mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
	mainWindow.setMenu(null)
  }
  else {
	mainWindow.loadURL('http://localhost:5173')
  }
}

function handleSquirrelEvent() {
	if (process.platform !== 'win32') {
    	return false;
	}

	var squirrelCommand = process.argv[1];
	switch (squirrelCommand) {
		case '--squirrel-install':
			console.log('Squirrel Event: Install')
			app.quit()
			return true

		case '--squirrel-updated':
			console.log('Squirrel Event: Updated')
			app.quit()
			return true

		case '--squirrel-uninstall':
			console.log('Squirrel Event: Uninstall')
			app.quit()
			return true

		case '--squirrel-obsolete':
			console.log('Squirrel Event: Obsolete')
			app.quit()
			return true

		default:
			return false
  	}
}
