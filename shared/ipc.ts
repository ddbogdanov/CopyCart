/**
 * Single source of truth for the renderer <-> main process IPC contract.
 * Types only (no runtime code) — safe to import from anywhere.
 */

/**
 * CSV header names the importer matches for each fixed field — users only edit
 * which header text each field is read from. Blank values fall back to the
 * shipped defaults (sanitized on read and save).
 */
export type CsvColumns = {
	/** Column holding the order name (drives the copy file names). */
	orderName: string
	/** Column holding the SKU (matches print files to order lines). */
	sku: string
	/** Column holding the ordered quantity (how many copies are made). */
	quantity: string
	/** Column holding the billing name (shown in the copy file names). */
	billingName: string
	/** Column holding the paid date (shown in the copy file names). */
	paidDate: string
	/** Column holding the payment method (shown in the copy file names). */
	paymentMethod: string
}

/** Application settings, persisted by the main process (SettingsService / electron-store). */
export type Settings = {
	shouldSave: {
		imports: boolean
		printFiles: boolean
		printFolder: boolean
	}
	/** Paths of the loaded order-import files (empty when none are loaded). */
	imports: string[]
	printFiles: string
	printFolder: string
	/** When true, the copy pipeline also searches subfolders of `printFiles` for designs. */
	recursivePrintFiles: boolean
	themeColor: string
	/** CSV header names the importer reads each known field from. */
	csvColumns: CsvColumns
}

/** What the picked file is used for — decides how the main process routes it. */
export type DialogKind = 'import-orders' | 'print-files' | 'print-folder'

/** Mirrors Electron's `dialog.showOpenDialog` property flags. */
export type DialogProperty =
	| 'openFile'
	| 'openDirectory'
	| 'multiSelections'
	| 'showHiddenFiles'
	| 'createDirectory'
	| 'promptToCreate'
	| 'noResolveAliases'
	| 'treatPackageAsDirectory'
	| 'dontAddToRecent'

/** Mirrors Electron's `FileFilter`. */
export type DialogFilter = {
	name: string
	extensions: string[]
}

export type OpenDialogRequest = {
	kind: DialogKind
	title: string
	properties: DialogProperty[]
	filters: DialogFilter[]
}

/** Request/response channels (`ipcRenderer.invoke` <-> `ipcMain.handle`). */
export type IpcRequests = {
	'open-file-dialog': { args: [request: OpenDialogRequest]; result: string[] }
	'cache-import-files': { args: [filePaths: string[]]; result: boolean }
	'remove-import-file': { args: [filePath: string]; result: boolean }
	'delete-cache': { args: []; result: void }
	'delete-print-files': { args: []; result: void }
	'delete-print-folder': { args: []; result: void }
	'process-files': { args: []; result: boolean }
	'minimize': { args: []; result: void }
	'toggle-maximize': { args: []; result: boolean }
	'exit': { args: []; result: void }
	'save-settings': { args: [settings: Settings]; result: boolean }
	'open-dev-tools': { args: []; result: void }
	'update-window:cancel': { args: []; result: void }
	'update-window:close': { args: []; result: void }
}

/**
 * State of the update flow, pushed to the update window while an update is
 * downloading, installing, or has failed.
 */
export type UpdateStatus =
	| { phase: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
	| { phase: 'installing' }
	| { phase: 'error'; message: string }

/**
 * State of order-import parsing (Import Orders spinner + summary counts).
 * The counts are only present once a load has finished.
 */
export type ImportStatus = {
	isParsing: boolean
	fileCount?: number
	orderCount?: number
}

/** Push channels (`webContents.send` -> preload subscription). */
export type IpcEvents = {
	'update:loading:state': { isLoading: boolean; progress: number; status: string }
	'settings:update': Settings
	'toast': string
	'import:status': ImportStatus
	'update:status': UpdateStatus
}

/** Signatures the main-process handler registry must implement. */
export type IpcHandlers = {
	[K in keyof IpcRequests]: (...args: IpcRequests[K]['args']) => IpcRequests[K]['result'] | Promise<IpcRequests[K]['result']>
}

/** The API surface exposed to the renderer via `contextBridge`. */
export type ElectronApi = {
	openFileDialog: (request: OpenDialogRequest) => Promise<string[]>
	/** Absolute path of a dropped file (passed to `webUtils.getPathForFile`). */
	getPathForFile: (file: { name: string; size: number; type: string }) => string
	deleteCache: () => Promise<void>
	cacheImportFiles: (filePaths: string[]) => Promise<boolean>
	removeImportFile: (filePath: string) => Promise<boolean>
	deletePrintFiles: () => Promise<void>
	deletePrintFolder: () => Promise<void>
	processFiles: () => Promise<boolean>
	minimize: () => Promise<void>
	toggleMaximize: () => Promise<boolean>
	exit: () => Promise<void>
	saveSettings: (settings: Settings) => Promise<boolean>
	openDevTools: () => Promise<void>

	onLoadingStateUpdate: (callback: (isLoading: boolean, progress: number, status: string) => void) => void
	onSettingsUpdate: (callback: (settings: Settings) => void) => void
	onToast: (callback: (message: string) => void) => void
	onImportStatus: (callback: (status: ImportStatus) => void) => void
}

/** The API surface exposed to the update window via `contextBridge`. */
export type UpdateWindowApi = {
	onStatus: (callback: (status: UpdateStatus) => void) => void
	cancel: () => Promise<void>
	close: () => Promise<void>
}
