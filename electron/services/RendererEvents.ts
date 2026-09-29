import type { BrowserWindow } from 'electron'
import type { IpcEvents } from '../../shared/ipc'

/**
 * Typed sender for main -> renderer events (progress, settings updates, toasts).
 * Holds the reference to the main window, assigned once the window is created.
 */
export class RendererEvents {
	private mainWindow?: BrowserWindow

	setMainWindow(mainWindow: BrowserWindow) {
		this.mainWindow = mainWindow
	}

	send<K extends keyof IpcEvents>(channel: K, payload: IpcEvents[K]) {
		this.mainWindow?.webContents.send(channel, payload)
	}
}
