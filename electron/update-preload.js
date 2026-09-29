// @ts-check
//
// Preload bridge for the update window — exposes the typed `window.updateWindow`
// surface to the update renderer. Channel names and payloads are checked
// against the shared IPC contract (shared/ipc.ts) at compile time.
const { contextBridge, ipcRenderer } = require('electron')

/** @typedef {import('../shared/ipc').UpdateWindowApi} UpdateWindowApi */
/** @typedef {import('../shared/ipc').UpdateStatus} UpdateStatus */
/** @typedef {import('../shared/ipc').IpcRequests} IpcRequests */
/** @typedef {import('electron').IpcRendererEvent} IpcRendererEvent */

/**
 * Typed wrapper around `ipcRenderer.invoke` — the channel literal is validated
 * against the shared IPC contract.
 * @template {keyof IpcRequests} K
 * @param {K} channel
 * @returns {Promise<any>}
 */
function invoke(channel) {
	return ipcRenderer.invoke(channel)
}

/** @type {UpdateWindowApi} */
const updateWindow = {
	onStatus: (callback) => {
		// Replace any previous listener (window reloads must not stack listeners).
		ipcRenderer.removeAllListeners('update:status')
		ipcRenderer.on('update:status', (_event, status) => callback(status))
	},
	cancel: () => invoke('update-window:cancel'),
	close: () => invoke('update-window:close')
}

contextBridge.exposeInMainWorld('updateWindow', updateWindow)
