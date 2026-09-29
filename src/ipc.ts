import type { ElectronApi } from '../shared/ipc'

/**
 * Single entry point for every renderer <-> main process interaction.
 * Components import `ipc` from here instead of touching `window.electronAPI`
 * directly, so all IPC usage is typed and discoverable in one place.
 */
export const ipc: ElectronApi = window.electronAPI
