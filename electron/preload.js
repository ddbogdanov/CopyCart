const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (title, properties, filters) => ipcRenderer.invoke('open-file-dialog', title, properties, filters),
  deleteCache: () => ipcRenderer.invoke('delete-cache'),
  deletePrintFiles: () => ipcRenderer.invoke('delete-print-files'),
  deletePrintFolder: () => ipcRenderer.invoke('delete-print-folder'),
  processFiles: () => ipcRenderer.invoke('process-files'),

  onCachingUpdate: (callback) => {
	ipcRenderer.on('caching:update', (_event, update) => {
		callback(update.isSelected, update.path)
	})
  },
  onPrintFilesUpdate: (callback) => {
	ipcRenderer.on('print:files:update', (_event, update) => {
		callback(update.isSelected, update.path)
	})
  },
  onPrintFolderUpdate: (callback) => {
	ipcRenderer.on('print:folder:update', (_event, update) => {
		callback(update.isSelected, update.path)
	})
  },
  onLoadingStateUpdate: (callback) => {
	ipcRenderer.on('update:loading:state', (_event, update) => {
		callback(update.isLoading, update.progress, update.status)
	})
  },
  onToast: (callback) => {
	ipcRenderer.on('toast', (_event, message) => {
		callback(message)
	})
  }
});