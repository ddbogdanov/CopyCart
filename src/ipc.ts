import type { ElectronApi } from '../shared/ipc'

/**
 * Single entry point for renderer IPC (instead of `window.electronAPI`), so all
 * usage is typed by the shared contract and discoverable in one place.
 */
export const ipc: ElectronApi = window.electronAPI
