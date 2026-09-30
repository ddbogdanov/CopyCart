import { app } from 'electron'
import Store from 'electron-store'
import fs from "fs"
import path from "path"
import type { CsvColumns, Settings } from '../../shared/ipc'
import type { RendererEvents } from './RendererEvents.ts'

type PersistedSettings = Settings

const SETTINGS_STORE_NAME = 'config'              // electron-store file: <userData>/config.json
const LEGACY_SETTINGS_FILENAME = 'settings.json'  // hand-written file used by app versions <= 1.4.x

/** Shipped CSV header names */
const DEFAULT_CSV_COLUMNS: CsvColumns = {
	orderName: 'Name',
	sku: 'Lineitem sku',
	quantity: 'Lineitem quantity',
	billingName: 'Billing Name',
	paidDate: 'Paid at',
	paymentMethod: 'Payment Method'
}

const DEFAULT_SETTINGS: PersistedSettings = {
	shouldSave: {
		imports: false,
		printFiles: true,
		printFolder: true,
	},
	imports: [],
	printFiles: '',
	printFolder: '',
	recursivePrintFiles: false,
	themeColor: '#10b981',
	csvColumns: DEFAULT_CSV_COLUMNS,
	reportFolder: '',
	reportToPrintFolder: true
}

/** Legacy stores hold a single string path — normalize to the list form. */
function normalizeImports(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
	if (typeof value === 'string' && value) return [value]
	return []
}

/** One header name: trimmed; a blank or non-string value falls back to the default. */
function sanitizeCsvColumn(value: unknown, fallback: string): string {
	if (typeof value === 'string' && value.trim()) return value.trim()
	return fallback
}

/**
 * Merged per key — electron-store doesn't deep-merge nested defaults; blank or
 * wrong-typed values fall back to their default.
 */
function normalizeCsvColumns(value: unknown): CsvColumns {
	const stored = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
	return {
		orderName: sanitizeCsvColumn(stored.orderName, DEFAULT_CSV_COLUMNS.orderName),
		sku: sanitizeCsvColumn(stored.sku, DEFAULT_CSV_COLUMNS.sku),
		quantity: sanitizeCsvColumn(stored.quantity, DEFAULT_CSV_COLUMNS.quantity),
		billingName: sanitizeCsvColumn(stored.billingName, DEFAULT_CSV_COLUMNS.billingName),
		paidDate: sanitizeCsvColumn(stored.paidDate, DEFAULT_CSV_COLUMNS.paidDate),
		paymentMethod: sanitizeCsvColumn(stored.paymentMethod, DEFAULT_CSV_COLUMNS.paymentMethod)
	}
}

/** A well-formed `#rrggbb` color literal. */
function isHexColor(value: string): boolean {
	return /^#[0-9a-f]{6}$/i.test(value)
}

/** A stored string; any other type (number, object, null, ...) falls back. */
function sanitizeString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback
}

/** A stored boolean; any other type falls back. */
function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback
}

/** A stored theme color; a malformed or non-string value falls back to the default. */
function sanitizeThemeColor(value: unknown): string {
	return typeof value === 'string' && isHexColor(value) ? value : DEFAULT_SETTINGS.themeColor
}

/**
 * Owns persisted settings: electron-store lifecycle, one-time migration from the
 * legacy `settings.json`, load/save, and the write-through mutators.
 */
export class SettingsService {
	private store?: Store<PersistedSettings>
	private currentSettings: PersistedSettings = structuredClone(DEFAULT_SETTINGS)
	private events: RendererEvents

	constructor(events: RendererEvents) {
		this.events = events

		try {
			this.store = new Store<PersistedSettings>({
				name: SETTINGS_STORE_NAME,
				defaults: DEFAULT_SETTINGS,
				clearInvalidConfig: true
			})

			this.migrateLegacySettings()
		}
		catch (error) {
			console.error('[SettingsService] Settings store unavailable — running with in-memory settings.', error)
		}
	}

	get settings(): PersistedSettings {
		return this.currentSettings
	}

	load(): PersistedSettings {
		try {
			this.currentSettings = this.readStoredSettings()

			this.events.send('settings:update', this.currentSettings)

			console.log("Settings loaded from: " + (this.store?.path ?? '(store unavailable — using defaults)'))
		}
		catch (error) {
			console.error('Error reading settings:', error)
			this.currentSettings = structuredClone(DEFAULT_SETTINGS)
		}

		return this.currentSettings
	}

	save(s?: object, isClosing?: boolean): boolean {
		if(isClosing) {
			if(!this.currentSettings?.shouldSave?.imports) this.currentSettings.imports = []
			if(!this.currentSettings?.shouldSave?.printFiles) this.currentSettings.printFiles = ''
			if(!this.currentSettings?.shouldSave?.printFolder) this.currentSettings.printFolder = ''
		}

		const settingsToSave = { ...(this.currentSettings ?? {}), ...(s ?? {}) }
		settingsToSave.csvColumns = normalizeCsvColumns(settingsToSave.csvColumns)
		settingsToSave.reportFolder = sanitizeString(settingsToSave.reportFolder, DEFAULT_SETTINGS.reportFolder)
		settingsToSave.reportToPrintFolder = sanitizeBoolean(settingsToSave.reportToPrintFolder, DEFAULT_SETTINGS.reportToPrintFolder)

		try {
			const store = this.store
			if (!store) throw new Error('Settings store is unavailable')

			console.log(`Saving settings to: ${store.path}`)

			store.set(settingsToSave)

			this.currentSettings = settingsToSave

			return true
		} 
		catch (error) {
			console.error('Error saving settings:', error)
			return false
		}
	}

	setPrintFiles(printFiles: string) {
		this.currentSettings.printFiles = printFiles
		this.events.send('settings:update', this.currentSettings)
		this.save()
	}
	setPrintFolder(printFolder: string) {
		this.currentSettings.printFolder = printFolder
		this.events.send('settings:update', this.currentSettings)
		this.save()
	}

	/**
	 * Persists the import list without broadcasting (ImportService owns the
	 * `settings:update` events) so a crash never loses the selection.
	 */
	setImports(imports: string[]) {
		this.currentSettings.imports = imports
		this.save()
	}

	/** Clears the imported file list without broadcasting — see `setImports`. */
	clearImports() {
		this.currentSettings.imports = []
		this.save()
	}

	deletePrintFiles(): boolean {
		this.currentSettings.printFiles = ''
		this.events.send('settings:update', this.currentSettings)
		this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select print files'})
		this.save()
		return true;
	}
	deletePrintFolder(): boolean {
		this.currentSettings.printFolder = ''
		this.events.send('settings:update', this.currentSettings)
		this.events.send('update:loading:state', {'isLoading': false, 'progress': 0, 'status': 'Select a print folder'})
		this.save()
		return true;
	}

	/** One-time migration of the legacy `<userData>/settings.json` into the store. */
	private migrateLegacySettings(): void {
		const store = this.store
		if (!store) return

		const legacyPath = path.join(app.getPath('userData'), LEGACY_SETTINGS_FILENAME)
		const backupPath = `${legacyPath}.bak`
		if (fs.existsSync(backupPath)) return
		if (!fs.existsSync(legacyPath)) return

		try {
			const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'))

			store.set(this.sanitizeLegacySettings(legacy))
			fs.renameSync(legacyPath, backupPath)

			console.log(`[SettingsService] Migrated legacy settings from ${legacyPath} to ${store.path}`)
		}
		catch (error) {
			console.error(`[SettingsService] Failed to migrate legacy settings; ${legacyPath} was left untouched.`, error)
		}
	}

	/** Copies only known, correctly-typed values out of the legacy settings object. */
	private sanitizeLegacySettings(legacy: unknown): Partial<PersistedSettings> {
		const legacySettings = (legacy && typeof legacy === 'object') ? legacy as Record<string, any> : {}

		const shouldSave = { ...DEFAULT_SETTINGS.shouldSave }
		if (legacySettings.shouldSave && typeof legacySettings.shouldSave === 'object') {
			for (const key of ['imports', 'printFiles', 'printFolder'] as const) {
				const value = legacySettings.shouldSave[key]
				if (typeof value === 'boolean') shouldSave[key] = value
			}
		}

		const migrated: Partial<PersistedSettings> = { shouldSave }

		if (typeof legacySettings.imports === 'string' && legacySettings.imports) {
			migrated.imports = [legacySettings.imports]
		}
		else {
			migrated.imports = []
		}

		for (const key of ['printFiles', 'printFolder'] as const) {
			if (typeof legacySettings[key] === 'string') migrated[key] = legacySettings[key]
		}

		if (typeof legacySettings.themeColor === 'string' && isHexColor(legacySettings.themeColor)) {
			migrated.themeColor = legacySettings.themeColor
		}

		return migrated
	}

	private readStoredSettings(): PersistedSettings {
		const store = this.store
		if (!store) return structuredClone(DEFAULT_SETTINGS)

		// Values are re-typed on read — clearInvalidConfig only catches invalid
		// JSON, so a hand-edited store could otherwise leak wrong-typed values.
		const storedShouldSave = { ...DEFAULT_SETTINGS.shouldSave, ...(store.get('shouldSave') ?? {}) }
		return {
			shouldSave: {
				imports: sanitizeBoolean(storedShouldSave.imports, DEFAULT_SETTINGS.shouldSave.imports),
				printFiles: sanitizeBoolean(storedShouldSave.printFiles, DEFAULT_SETTINGS.shouldSave.printFiles),
				printFolder: sanitizeBoolean(storedShouldSave.printFolder, DEFAULT_SETTINGS.shouldSave.printFolder)
			},
			imports: normalizeImports(store.get('imports') as unknown),
			printFiles: sanitizeString(store.get('printFiles'), DEFAULT_SETTINGS.printFiles),
			printFolder: sanitizeString(store.get('printFolder'), DEFAULT_SETTINGS.printFolder),
			recursivePrintFiles: sanitizeBoolean(store.get('recursivePrintFiles'), DEFAULT_SETTINGS.recursivePrintFiles),
			themeColor: sanitizeThemeColor(store.get('themeColor')),
			csvColumns: normalizeCsvColumns(store.get('csvColumns')),
			reportFolder: sanitizeString(store.get('reportFolder'), DEFAULT_SETTINGS.reportFolder),
			reportToPrintFolder: sanitizeBoolean(store.get('reportToPrintFolder'), DEFAULT_SETTINGS.reportToPrintFolder)
		}
	}
}
