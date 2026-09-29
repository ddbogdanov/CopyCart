import { app } from 'electron'
import Store from 'electron-store'
import fs from "fs"
import path from "path"
import type { CsvColumns, Settings } from '../../shared/ipc'
import type { RendererEvents } from './RendererEvents.ts'

/** Shape of the persisted settings (single source of truth: shared/ipc.ts). */
type PersistedSettings = Settings

const SETTINGS_STORE_NAME = 'config'              // electron-store file: <userData>/config.json
const LEGACY_SETTINGS_FILENAME = 'settings.json'  // hand-written file used by app versions <= 1.4.x

/** Shipped CSV header names — the importer's original hardcoded columns. */
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
	csvColumns: DEFAULT_CSV_COLUMNS
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
 * electron-store does not deep-merge nested defaults, so `csvColumns` is merged
 * per key — a partial (or hand-edited) stored object can never produce a
 * half-defined mapping, and blank values mean "use the shipped default".
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

/**
 * Owns the persisted application settings: electron-store lifecycle, the one-time
 * migration from the legacy `settings.json`, load/save, and the print-path
 * setters/clear flows used by the renderer.
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
				// If the settings file ever gets corrupted (manual edit, disk issue),
				// fall back to defaults instead of crashing on startup.
				clearInvalidConfig: true
			})

			this.migrateLegacySettings()
		}
		catch (error) {
			// Settings must never prevent the app from starting (locked or read-only
			// userData, broken install, ...) — run with in-memory defaults instead.
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
		// Sanitize the column mapping on save too — a blank/whitespace value can
		// never outlive a save (blank = "use the shipped default" everywhere).
		settingsToSave.csvColumns = normalizeCsvColumns(settingsToSave.csvColumns)

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

	// The setters/clears below write through to disk immediately (crash-safe);
	// the "Save on exit?" checkboxes still decide what survives a clean quit.
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
	 * Mutates the imported file list without broadcasting — the import flow
	 * (ImportService) owns its own `settings:update` events — but persists
	 * immediately so a crash or force-kill never loses the selection.
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

	/**
	 * One-time migration of the legacy hand-written `<userData>/settings.json`
	 * (used by app versions <= 1.4.x) into the electron-store file.
	 */
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
			// Keep the app usable with defaults and retry the migration next launch.
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

		// Legacy `imports` was a single path string — normalize to the list form.
		if (typeof legacySettings.imports === 'string' && legacySettings.imports) {
			migrated.imports = [legacySettings.imports]
		}
		else {
			migrated.imports = []
		}

		for (const key of ['printFiles', 'printFolder'] as const) {
			if (typeof legacySettings[key] === 'string') migrated[key] = legacySettings[key]
		}

		if (typeof legacySettings.themeColor === 'string' && /^#[0-9a-f]{6}$/i.test(legacySettings.themeColor)) {
			migrated.themeColor = legacySettings.themeColor
		}

		return migrated
	}

	private readStoredSettings(): PersistedSettings {
		const store = this.store
		if (!store) return structuredClone(DEFAULT_SETTINGS)

		// electron-store does not deep-merge nested defaults — merge `shouldSave`
		// and `csvColumns` manually.
		return {
			shouldSave: { ...DEFAULT_SETTINGS.shouldSave, ...(store.get('shouldSave') ?? {}) },
			imports: normalizeImports(store.get('imports') as unknown),
			printFiles: store.get('printFiles'),
			printFolder: store.get('printFolder'),
			recursivePrintFiles: store.get('recursivePrintFiles') === true,
			themeColor: store.get('themeColor'),
			csvColumns: normalizeCsvColumns(store.get('csvColumns'))
		}
	}
}
