const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: (title, properties, filters) => ipcRenderer.invoke('open-file-dialog', title, properties, filters),
  deleteCache: () => ipcRenderer.invoke('delete-cache'),
  deletePrintFiles: () => ipcRenderer.invoke('delete-print-files'),
  deletePrintFolder: () => ipcRenderer.invoke('delete-print-folder'),
  processFiles: () => ipcRenderer.invoke('process-files'),
  minimize: () => ipcRenderer.invoke('minimize'),
  toggleMaximize: () => ipcRenderer.invoke('toggle-maximize'),
  exit: () => ipcRenderer.invoke('exit'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
  connectShopify: (shopDomain) => { ipcRenderer.invoke('connect-shopify', (shopDomain)) },
  fetchOrders: () => { ipcRenderer.invoke('fetch-orders') },

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
  },
  onWindowMaximizeUpdate: (callback) => {
    ipcRenderer.on('window:maximize:update', (_event, maximized) => {
      callback(maximized.maximized)
    })
  },
  onSettingsSaved: (callback) => {
    ipcRenderer.on('settings:saved', (saved) => {
      callback(saved)
    })
  },
  onSettingsUpdate: (callback) => {
    ipcRenderer.on('settings:update', (_event, settings) => {
      callback(settings)
    })
  },
});