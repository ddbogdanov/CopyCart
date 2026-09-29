import { app, BrowserWindow, dialog } from 'electron'
import type { BrowserWindowConstructorOptions, MessageBoxOptions } from 'electron'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import AutoUpdater from 'electron-updater'
import type { ProgressInfo } from 'electron-updater'
import log from 'electron-log'
import type { IpcEvents, UpdateStatus } from '../../shared/ipc'

// electron-updater is CommonJS and its exports are not statically analysable,
// so named imports (`import { autoUpdater }`) fail at runtime — always go
// through the default export.
const { autoUpdater, CancellationToken } = AutoUpdater

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPDATE_PRELOAD = join(__dirname, '..', 'update-preload.js')        // electron/update-preload.js
const UPDATE_HTML = join(__dirname, '..', '..', 'dist', 'update.html')   // built by vite (see update.html)
const DEV_UPDATE_URL = 'http://localhost:5173/update.html'
const UPDATE_STATUS_CHANNEL = 'update:status' satisfies keyof IpcEvents

// Give the user a moment to read the "installing" state before the app quits.
const INSTALL_DELAY_MS = 1500

type SimulationMode = 'prompt' | 'auto' | 'fail'

/**
 * `UPDATE_SIMULATE=1|auto|fail` fakes the update flow in development so the
 * update window can be previewed without publishing a release:
 *   1     — real prompt, then simulated download
 *   auto  — skips the prompt, goes straight to the update window
 *   fail  — stops at ~40% with the error state
 */
function parseSimulationMode(value: string | undefined): SimulationMode | undefined {
	if (value === '1') return 'prompt'
	if (value === 'auto' || value === 'fail') return value
	return undefined
}

/**
 * Owns the whole application-update flow: startup check, the user prompt, the
 * dedicated update window (progress/error monitoring) and the install+restart.
 *
 * Updates never start on their own: `autoDownload` and `autoInstallOnAppQuit`
 * are both disabled, so nothing is downloaded or installed without the user
 * accepting the prompt, and a declined update is asked about again next launch.
 */
export class UpdateService {
	private mainWindow?: BrowserWindow
	private updateWindow?: BrowserWindow
	private latestStatus: UpdateStatus | null = null
	private downloadCancellationToken?: InstanceType<typeof CancellationToken>
	private cancelRequested = false
	private state: 'idle' | 'downloading' | 'installing' | 'error' = 'idle'
	private hasChecked = false
	private simulation?: SimulationMode
	private simulationTimer?: ReturnType<typeof setInterval>

	constructor() {
		this.simulation = app.isPackaged ? undefined : parseSimulationMode(process.env.UPDATE_SIMULATE)

		// Log to file (<userData>/logs/main.log) as well as the console — console
		// output is invisible in packaged builds, and updater failures in the
		// field need to be diagnosable.
		autoUpdater.logger = log

		// Updates only ever run through the explicit prompt + update window flow.
		autoUpdater.autoDownload = false
		autoUpdater.autoInstallOnAppQuit = false

		// Errors are logged by the updater's own logger (wired above) — see
		// <userData>/logs/main.log when diagnosing update issues in the field.
		autoUpdater.on('update-available', (info) => this.onUpdateAvailable(info.version))
		autoUpdater.on('download-progress', (progress) => this.onDownloadProgress(progress))
		autoUpdater.on('update-downloaded', () => this.onUpdateDownloaded())
	}

	setMainWindow(mainWindow: BrowserWindow) {
		this.mainWindow = mainWindow
	}

	/**
	 * Startup check (packaged builds only). Runs once per launch — when an
	 * update is available the user is prompted and decides whether to download.
	 */
	checkForUpdates() {
		// Once per launch (`did-finish-load` can fire again on a page reload).
		if (this.hasChecked) return
		this.hasChecked = true

		if (this.simulation) {
			log.info(`[UpdateService] Simulation mode "${this.simulation}" — faking an available update.`)
			const nextVersion = this.nextPatchVersion(app.getVersion())
			if (this.simulation === 'prompt') void this.promptForUpdate(nextVersion)
			else this.startDownload(nextVersion)
			return
		}

		if (!app.isPackaged) {
			log.info('[UpdateService] Skipping update check (app is not packaged).')
			return
		}

		log.info('[UpdateService] Checking for updates…')
		// Failures during the check (offline, release metadata missing, ...) are
		// reported through the updater's own logger; the app stays usable.
		autoUpdater.checkForUpdates().catch(() => {})
	}

	private onUpdateAvailable(version: string) {
		if (this.state !== 'idle') return

		log.info(`[UpdateService] Update available: v${app.getVersion()} → v${version}`)
		void this.promptForUpdate(version)
	}

	private async promptForUpdate(version: string) {
		const parent = this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : undefined

		const options: MessageBoxOptions = {
			type: 'info',
			title: 'Update Available',
			message: `A new update is available: v${app.getVersion()} → v${version}`,
			detail: 'The update will download now. Copy Cart will restart automatically once it is ready to install.',
			buttons: ['Install Update', 'Not Now'],
			defaultId: 0,
			cancelId: 1,
			noLink: true
		}

		const { response } = parent
			? await dialog.showMessageBox(parent, options)
			: await dialog.showMessageBox(options)

		if (response === 0) this.startDownload(version)
		else log.info('[UpdateService] Update postponed by the user.')
	}

	private startDownload(version: string) {
		if (this.state !== 'idle') return

		this.state = 'downloading'
		this.createUpdateWindow(version)

		if (this.simulation) {
			this.runSimulatedDownload()
			return
		}

		this.downloadCancellationToken = new CancellationToken()
		autoUpdater.downloadUpdate(this.downloadCancellationToken).catch((error) => this.onDownloadRejected(error))
	}

	private createUpdateWindow(version: string) {
		const parent = this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : undefined

		const options: BrowserWindowConstructorOptions = {
			width: 420,
			height: 240,
			show: false,
			frame: false,
			resizable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			title: 'Updating Copy Cart',
			backgroundColor: '#242424',
			webPreferences: {
				preload: UPDATE_PRELOAD,
				contextIsolation: true,
				nodeIntegration: false
			}
		}
		if (parent) {
			options.parent = parent
			options.modal = true
		}

		const win = new BrowserWindow(options)
		this.updateWindow = win

		// Frameless child windows otherwise land wherever Windows decides —
		// center it over the main window.
		if (parent) {
			const parentBounds = parent.getBounds()
			const { width, height } = win.getBounds()
			win.setPosition(
				Math.round(parentBounds.x + (parentBounds.width - width) / 2),
				Math.round(parentBounds.y + (parentBounds.height - height) / 2)
			)
		}

		// The application must not be usable while the update is running: the
		// modal (and this explicit disable) block the main window until the
		// window closes.
		if (parent) parent.setEnabled(false)

		win.on('close', (event) => {
			// The download must go through the Cancel button (or the error
			// state) — closing the window is not a way out mid-download.
			if (this.state === 'downloading') event.preventDefault()
		})
		win.on('closed', () => this.onUpdateWindowClosed())
		win.once('ready-to-show', () => win.show())
		win.webContents.on('did-finish-load', () => {
			if (this.latestStatus) win.webContents.send(UPDATE_STATUS_CHANNEL, this.latestStatus)
		})
		win.webContents.on('preload-error', (_event, preloadPath, error) => {
			log.error('[UpdateService] Update window preload error:', preloadPath, error)
		})
		win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
			log.error('[UpdateService] Update window failed to load:', errorCode, errorDescription, validatedURL)
		})

		if (this.simulation) win.webContents.openDevTools({ mode: 'detach' })
		win.setMenu(null)

		if (app.isPackaged) {
			win.loadFile(UPDATE_HTML, { query: { from: app.getVersion(), to: version } })
		}
		else {
			win.loadURL(`${DEV_UPDATE_URL}?from=${encodeURIComponent(app.getVersion())}&to=${encodeURIComponent(version)}`)
		}
	}

	private onDownloadProgress(progress: ProgressInfo) {
		this.sendStatus({
			phase: 'downloading',
			percent: progress.percent,
			transferred: progress.transferred,
			total: progress.total,
			bytesPerSecond: progress.bytesPerSecond
		})
	}

	private onUpdateDownloaded() {
		if (this.state === 'installing') return

		this.state = 'installing'
		log.info('[UpdateService] Update downloaded — installing and restarting.')
		this.sendStatus({ phase: 'installing' })

		// `quitAndInstall(true, true)`: silent install, then relaunch the new
		// version automatically (the installer reopens the app after finishing).
		setTimeout(() => {
			try {
				autoUpdater.quitAndInstall(true, true)
			}
			catch (error) {
				log.error('[UpdateService] Failed to start the installer:', error)
			}
		}, INSTALL_DELAY_MS)
	}

	private onDownloadRejected(error: unknown) {
		if (this.cancelRequested) {
			this.cancelRequested = false
			log.info('[UpdateService] Update download cancelled by the user.')
			this.teardownUpdateWindow()
			return
		}

		log.error('[UpdateService] Update download failed:', error)

		// The window is gone (force-closed) — nothing to show.
		if (this.state !== 'downloading') return

		this.state = 'error'
		this.sendStatus({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
	}

	/** Cancel button in the update window (download phase only). */
	cancelDownload() {
		if (this.state !== 'downloading') return
		this.cancelRequested = true
		this.downloadCancellationToken?.cancel()
	}

	/** Close button in the update window's error state. */
	closeUpdateWindow() {
		if (this.state !== 'error') return
		this.teardownUpdateWindow()
	}

	private sendStatus(status: UpdateStatus) {
		this.latestStatus = status

		const win = this.updateWindow
		if (!win || win.isDestroyed()) return
		win.webContents.send(UPDATE_STATUS_CHANNEL, status)
	}

	private teardownUpdateWindow() {
		this.state = 'idle'
		this.latestStatus = null

		const win = this.updateWindow
		if (win && !win.isDestroyed()) win.close()
	}

	private onUpdateWindowClosed() {
		if (this.simulationTimer) {
			clearInterval(this.simulationTimer)
			this.simulationTimer = undefined
		}
		this.updateWindow = undefined
		this.latestStatus = null
		this.downloadCancellationToken = undefined

		// Unless the app is quitting to install, hand control back to the user.
		// (In simulation nothing ever quits, so always restore there.)
		if (this.state !== 'installing' || this.simulation) {
			this.state = 'idle'
			const parent = this.mainWindow
			if (parent && !parent.isDestroyed()) parent.setEnabled(true)
		}
	}

	private runSimulatedDownload() {
		const total = 96 * 1024 * 1024
		let percent = 0

		this.simulationTimer = setInterval(() => {
			percent = Math.min(100, percent + 4)

			if (this.simulation === 'fail' && percent >= 40) {
				if (this.simulationTimer) clearInterval(this.simulationTimer)
				this.simulationTimer = undefined
				this.state = 'error'
				log.error('[UpdateService] Simulated download failure (UPDATE_SIMULATE=fail).')
				this.sendStatus({ phase: 'error', message: 'Simulated download failure (UPDATE_SIMULATE=fail).' })
				return
			}

			if (percent >= 100) {
				if (this.simulationTimer) clearInterval(this.simulationTimer)
				this.simulationTimer = undefined
				this.state = 'installing'
				this.sendStatus({ phase: 'installing' })
				setTimeout(() => {
					log.info('[UpdateService] Simulation complete — a real build would install and restart here.')
					this.teardownUpdateWindow()
				}, INSTALL_DELAY_MS)
				return
			}

			this.sendStatus({
				phase: 'downloading',
				percent,
				transferred: Math.round(total * percent / 100),
				total,
				bytesPerSecond: 3.4 * 1024 * 1024
			})
		}, 120)
	}

	private nextPatchVersion(version: string): string {
		const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
		if (!match) return `${version}-next`
		return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
	}
}
