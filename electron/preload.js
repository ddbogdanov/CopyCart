// @ts-check
//
// Preload bridge — exposes the typed `window.electronAPI` surface to the
// renderer. Channel names and payloads are checked against the shared IPC
// contract (shared/ipc.ts) at compile time; the exposed API shape is enforced
// by the `ElectronApi` type below.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

/** @typedef {import('../shared/ipc').ElectronApi} ElectronApi */
/** @typedef {import('../shared/ipc').IpcRequests} IpcRequests */
/** @typedef {import('../shared/ipc').IpcEvents} IpcEvents */
/** @typedef {import('electron').IpcRendererEvent} IpcRendererEvent */

/**
 * Typed wrapper around `ipcRenderer.invoke` — the channel literal is validated
 * against the shared IPC contract.
 * @template {keyof IpcRequests} K
 * @param {K} channel
 * @param {...any} args
 * @returns {Promise<any>}
 */
function invoke(channel, ...args) {
	return ipcRenderer.invoke(channel, ...args)
}

/**
 * Subscribes to a main-process event, replacing any previous listener for the
 * channel (component remounts during hot reload must not stack listeners).
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
	// `File` is a DOM type — the cast keeps @ts-check happy in the Node-typed
	// electron project; webUtils expects the real File object at runtime.
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