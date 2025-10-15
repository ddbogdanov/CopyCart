import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { IoService } from './services/IoService.ts'
import path from "path"
import { updateElectronApp } from 'update-electron-app'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ioService = new IoService()
let mainWindow: BrowserWindow
let settings: Record<string, any>

app.setName('Copy Cart')
app.whenReady().then(() => {
	settings = ioService.loadSettings()

	createWindow()

	ioService.setMainWindow(mainWindow)

	mainWindow.webContents.on('did-finish-load', () => {
		mainWindow.webContents.send('print:files:update', {'isSelected': !!settings.printFiles, 'path': settings.printFiles})
		mainWindow.webContents.send('print:folder:update', {'isSelected': !!settings.printFolder, 'path': settings.printFolder})
	});
})

app.on('ready', () => {
	updateElectronApp({
		notifyUser: true
	})
})
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
});
app.on('before-quit', () => {
  if (mainWindow) {
    if (ioService.saveSettings()) console.log('Settings saved on quit')
  }
});

ipcMain.handle("open-file-dialog", async (event, title, properties, filters) => {
  event
  const { canceled, filePaths } = await ioService.openFileDialog(dialog, title, properties, filters)

  if (canceled) {
	return null
  }

  if(title === 'Import Orders') {
	ioService.cacheFile(filePaths[0]).then((isCached) => {
		if(isCached) {
			mainWindow.webContents.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Idle'})
			mainWindow.webContents.send('caching:update', {'isSelected': true, 'path': filePaths[0]})
		}
		else {
			mainWindow.webContents.send('caching:update', {'isSelected': false, 'path': ''})
		}
	}, 
	(error) => {
		console.log(error)
		mainWindow.webContents.send('caching:update', {'isSelected': false, 'path': ''})
		mainWindow.webContents.send('toast', 'Error loading input file. Check that the .CSV has fields for <Name>, <Lineitem sku>, and <quantity>')
	})
  }
  if(title === 'Select Print Files') {
	ioService.setPrintFiles(filePaths[0])
	mainWindow.webContents.send('print:files:update', {'isSelected': true, 'path': filePaths[0]})
  }
  if(title === 'Select Print Folder') {
	ioService.setPrintFolder(filePaths[0])
	mainWindow.webContents.send('print:folder:update', {'isSelected': true, 'path': filePaths[0]})
  }

  return filePaths[0];
})

ipcMain.handle("delete-cache", () => {
	ioService.deleteCache()
	mainWindow.webContents.send('caching:update', false)
})
ipcMain.handle("delete-print-files", () => {
	ioService.deletePrintFiles()
	mainWindow.webContents.send('print:files:update', false)
})
ipcMain.handle("delete-print-folder", () => {
	ioService.deletePrintFolder()
	mainWindow.webContents.send('print:folder:update', false)
})
ipcMain.handle('update-loading-state', (_event: any, isLoading: boolean, progress: number, status: string) => {
	mainWindow.webContents.send('update:loading:state', {'isLoading': isLoading, 'progress': progress, 'status': status})
})
ipcMain.handle('process-files', () => {
	ioService.processFiles()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 450,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
	title: 'Copy Cart',
	icon: path.join(__dirname, "../build/icons/icon.png")
  })

  if(app.isPackaged) {
	mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
	//mainWindow.setMenu(null)
  }
  else {
	mainWindow.loadURL('http://localhost:5173')
  }
}
