// @ts-check
// Preload bridge for the main window — the API below is type-checked against
// the shared IPC contract (shared/ipc.ts).
const { contextBridge, ipcRenderer, webUtils } = require('electron')

/** @typedef {import('../shared/ipc').ElectronApi} ElectronApi */
/** @typedef {import('../shared/ipc').IpcRequests} IpcRequests */
/** @typedef {import('../shared/ipc').IpcEvents} IpcEvents */
/** @typedef {import('electron').IpcRendererEvent} IpcRendererEvent */

/**
 * Typed `ipcRenderer.invoke` — the channel must exist in the IPC contract.
 * @template {keyof IpcRequests} K
 * @param {K} channel
 * @param {...any} args
 * @returns {Promise<any>}
 */
function invoke(channel, ...args) {
	return ipcRenderer.invoke(channel, ...args)
}

/**
 * Subscribe to a main-process event, replacing any previous listener for the
 * channel (remounts must not stack listeners).
 * @template {keyof IpcEvents} K
 * @param {K} channel
 * @param {(event: IpcRendererEvent, payload: IpcEvents[K]) => void} callback
 */
function subscribe(channel, callback) {
	ipcRenderer.removeAllListeners(channel)
	ipcRenderer.on(channel, callback)
}

/** @type {ElectronApi} */
const electronAPI = {
	openFileDialog: (request) => invoke('open-file-dialog', request),
	// `File` is a DOM type — the cast keeps @ts-check happy; webUtils wants the real object.
	getPathForFile: (file) => webUtils.getPathForFile(/** @type {any} */ (file)),
	deleteCache: () => invoke('delete-cache'),
	cacheImportFiles: (filePaths) => invoke('cache-import-files', filePaths),
	removeImportFile: (filePath) => invoke('remove-import-file', filePath),
	deletePrintFiles: () => invoke('delete-print-files'),
	deletePrintFolder: () => invoke('delete-print-folder'),
	processFiles: () => invoke('process-files'),
	minimize: () => invoke('minimize'),
	toggleMaximize: () => invoke('toggle-maximize'),
	exit: () => invoke('exit'),
	saveSettings: (settings) => invoke('save-settings', settings),
	openDevTools: () => invoke('open-dev-tools'),
	showReport: (filePath) => invoke('show-report', filePath),

	onLoadingStateUpdate: (callback) => {
		subscribe('update:loading:state', (_event, update) => {
			callback(update.isLoading, update.progress, update.status)
		})
	},
	onSettingsUpdate: (callback) => {
		subscribe('settings:update', (_event, settings) => {
			callback(settings)
		})
	},
	onToast: (callback) => {
		subscribe('toast', (_event, message) => {
			callback(message)
		})
	},
	onImportStatus: (callback) => {
		subscribe('import:status', (_event, status) => {
			callback(status)
		})
	}
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)