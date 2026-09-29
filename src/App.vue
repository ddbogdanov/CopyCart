<template>
	<div class="main">
		<div class="header">
			<span id="app-version">Copy Cart v{{ version }}</span>

			<ButtonGroup class="window-controls">
				<Button icon="pi pi-cog" variant="text" size="small" @click="openSettings" id="settings" v-tooltip.bottom="'Settings'"/>
				<Button severity="secondary" icon="pi pi-chevron-down" variant="text" size="small" @click="minimize" v-tooltip.bottom="'Minimize'"/>
				<Button severity="secondary" :icon="maximizeIcon" variant="text" size="small" @click="toggleMaximize" v-tooltip.bottom="maximizeIcon === 'pi pi-chevron-up' ? 'Maximize' : 'Restore'"/>
				<Button severity="danger" icon="pi pi-times" variant="text" size="small" class="close-button" @click="exit" v-tooltip.bottom="'Close'"/>
			</ButtonGroup>
		</div>

		<div class="control-container">
			<div class="input-container">
				<ImportOrders title="Import Orders" :file-paths="settings.imports"
							  titleToolTip="Accepts .CSV files containing order info."
							  class="component-border--primary import-orders-card"
							  @configure-import="openCsvColumns"
				/>

				<FilePick title="Print Files"
						icon="pi pi-folder-open"
						tooltip="Directory containing print files. These will be copied."
						dialog-title="Select Print Files" 
						dialog-kind="print-files"
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of()"
						button-label="Choose files folder"
						hint="Files to copy"
						:path="settings.printFiles"
						:delete-button-action="deletePrintFiles"
						class="component-border--primary print-files-card"
				>
					<template #header-actions>
						<ToggleButton :model-value="settings.recursivePrintFiles"
								size="small"
								class="recursive-toggle"
								aria-label="Search inside subfolders for print files"
								v-tooltip.top="recursiveTooltip"
								@update:model-value="onToggleRecursive">
							<!-- Default slot replaces the built-in Yes/No label (keeps the icon centered). -->
							<i class="p-togglebutton-icon pi pi-sitemap" />
						</ToggleButton>
					</template>
				</FilePick>
			</div>

			<div class="info-container component-border--secondary">
				<Progress current-file="CurrentFile/OrderNumber.txt"
						:progress="progress"	
						:is-loading="isProcessing"
						:status="status"
				/>

				<CheckList :imports="settings.imports" 
						:print-files="settings.printFiles"
						:print-folder="settings.printFolder"
				/>

				<ProcessFiles :is-disabled="shouldProcessBeDisabled()" />
			</div>

			<div class="output-container">
				<FilePick title="Print Folder"
						icon="pi pi-folder-plus"
						tooltip="Destination directory to copy files into."
						dialog-title="Select Print Folder" 
						dialog-kind="print-folder"
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of()"
						button-label="Choose print folder"
						hint="Where copies go"
						:path="settings.printFolder"
						:delete-button-action="deletePrintFolder"
						class="component-border--primary"
				/>
			</div>
		</div>

		<Toast/>
		<ConfirmPopup/>

		<Drawer header="Settings" class="settings-drawer" position="right" v-model:visible="settingsVisible" @hide="onCloseSettings" style="width: 60vw;">
			<SettingsForm :settings="settings" @onUpdateTheme="onUpdateTheme" @onSaveSettings="onSaveSettings"/>
		</Drawer>

		<CsvColumnsDialog v-model:visible="csvDialogVisible" :columns="settings.csvColumns" @save="onSaveCsvColumns" />
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { palette, updatePrimaryPalette } from '@primeuix/themes'
import FilePick from './components/FilePick.vue'
import ImportOrders from './components/ImportOrders.vue'
import ProcessFiles from './components/ProcessFiles.vue'
import Progress from './components/Progress.vue'
import CheckList from './components/CheckList.vue'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast';
import SettingsForm from './components/SettingsForm.vue'
import CsvColumnsDialog from './components/CsvColumnsDialog.vue'
import type { CsvColumns } from '../shared/ipc'
import { ipc } from './ipc'

const toast = useToast();
const isProcessing = ref(false)
const progress = ref(0)
const status = ref('Select files to import')
const version = ref(__APP_VERSION__)
const maximizeIcon = ref('pi pi-chevron-up')
const settingsVisible = ref(false)
const csvDialogVisible = ref(false)
const settings = ref({
	shouldSave: {
		imports: false,
		printFiles: true,
		printFolder: true,
	},
	imports: [] as string[],
	printFiles: '',
	printFolder: '',
	recursivePrintFiles: false,
	themeColor: '#10b981',
	csvColumns: {
		orderName: 'Name',
		sku: 'Lineitem sku',
		quantity: 'Lineitem quantity',
		billingName: 'Billing Name',
		paidDate: 'Paid at',
		paymentMethod: 'Payment Method'
	}
})
let backupSettings = {
	shouldSave: {
		imports: false,
		printFiles: true,
		printFolder: true,
	},
	imports: [] as string[],
	printFiles: '',
	printFolder: '',
	recursivePrintFiles: false,
	themeColor: '#10b981',
	csvColumns: {
		orderName: 'Name',
		sku: 'Lineitem sku',
		quantity: 'Lineitem quantity',
		billingName: 'Billing Name',
		paidDate: 'Paid at',
		paymentMethod: 'Payment Method'
	}
}

onMounted(() => {
	ipc.onLoadingStateUpdate((isLoading, p, s) => {
		isProcessing.value = isLoading
		progress.value = Math.round(p)
		status.value = s
	})
	ipc.onToast((message) => {
		console.log(message)
		toast.add({
			severity: 'error',
			summary: 'Error',
			detail: message
		})
	})
	ipc.onSettingsUpdate((s) => {
		settings.value = s
		onUpdateTheme(s.themeColor ? s.themeColor : '#10b981')
	})
})

function deletePrintFiles() {
	ipc.deletePrintFiles()
}
function deletePrintFolder() {
	ipc.deletePrintFolder()
}

/** Tooltip doubles as a state readout: "Search inside subfolders: Yes/No". */
const recursiveTooltip = computed(() => `Search inside subfolders: ${settings.value.recursivePrintFiles ? 'Yes' : 'No'}`)

/** Persists via the settings store; reverts on a failed save. */
function onToggleRecursive(value: boolean | undefined) {
	const next = value === true
	const previous = settings.value.recursivePrintFiles
	if (next === previous) return

	settings.value.recursivePrintFiles = next
	// Deep clone — reactive proxies cannot cross the IPC boundary.
	ipc.saveSettings(JSON.parse(JSON.stringify(settings.value))).then((saved) => {
		if (saved === true) return
		settings.value.recursivePrintFiles = previous
		console.error('Failed to save the recursive print-files setting.')
	})
}

function openSettings() {
	backupSettings = JSON.parse(JSON.stringify(settings.value))
	settingsVisible.value = true
}

/** Import Orders cog → the CSV column mapping dialog (single entry point). */
function openCsvColumns() {
	csvDialogVisible.value = true
}

/** Persists the edited mapping (write-through); reverts on a failed save. */
function onSaveCsvColumns(columns: CsvColumns) {
	const previous = settings.value.csvColumns
	settings.value.csvColumns = columns
	// Deep clone — reactive proxies cannot cross the IPC boundary.
	ipc.saveSettings(JSON.parse(JSON.stringify(settings.value))).then((saved) => {
		if (saved === true) {
			csvDialogVisible.value = false
			return
		}
		settings.value.csvColumns = previous
		console.error('Failed to save the CSV column names.')
	})
}
function onSaveSettings(settings: any) {
	backupSettings = settings
	ipc.saveSettings(settings).then((saved) => {
		toast.add({
			severity: saved ? 'success' : 'error',
			summary: saved ? 'Success' : 'Error',
			detail: saved ? 'Settings saved!' : 'Something went wrong while saving settings.',
			life: 2000,
		})
	})
}
function onCloseSettings() {
	settings.value = backupSettings
	onUpdateTheme(settings.value.themeColor ?? '#10b981')
}
function onUpdateTheme(color: any) {
	settings.value.themeColor = color
	const primaries = palette(color)

	updatePrimaryPalette({
		50: primaries['50'],
		100: primaries['100'],
		200: primaries['200'],
		300: primaries['300'],
		400: primaries['400'],
		500: primaries['500'],
		600: primaries['600'],
		700: primaries['700'],
		800: primaries['800'],
		900: primaries['900'],
		950: primaries['950']
	})

	// Content on primary surfaces (top bar, filled buttons) must stay readable for
	// ANY color — pick a dark/light contrast color by luminance.
	document.documentElement.style.setProperty('--p-primary-contrast-color', contrastColorFor(color))
}

function contrastColorFor(hex: string): string {
	const clean = (hex || '').replace('#', '')
	if (clean.length !== 6) return '#ffffff'

	const channel = (offset: number) => {
		const value = parseInt(clean.substring(offset, offset + 2), 16) / 255
		return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
	}
	const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
	return luminance > 0.2 ? '#1c1917' : '#ffffff'
}
function minimize() {
	ipc.minimize()
}
async function toggleMaximize() {
	const maximized = await ipc.toggleMaximize()
	maximizeIcon.value = maximized ? 'pi pi-angle-double-down' : 'pi pi-chevron-up'
}
function exit() {
	ipc.exit()
}
function shouldProcessBeDisabled() {
	return !(settings.value.imports.length > 0 && settings.value.printFolder && settings.value.printFiles)
}

</script>

<style scoped lang="scss">
	.recursive-toggle {
		// Alignment only — width/height overrides clip the icon.
		margin-left: auto;

		// Off: blend into the card background.
		--p-togglebutton-background: transparent;
		--p-togglebutton-border-color: transparent;
		--p-togglebutton-icon-color: var(--p-surface-500);
		--p-togglebutton-hover-background: var(--p-surface-800);
		--p-togglebutton-icon-hover-color: var(--p-surface-200);

		// On: pressed in — darker than the card, icon in the theme color.
		--p-togglebutton-checked-background: var(--p-surface-950);
		--p-togglebutton-checked-border-color: var(--p-surface-950);
		--p-togglebutton-icon-checked-color: var(--p-primary-300);
		// Flatten Aura's raised checked pill — the pressed state is just the fill.
		--p-togglebutton-content-checked-background: transparent;
		--p-togglebutton-content-checked-shadow: none;
	}

	.main {
		width: 100%;
		height: 100%;

		display: flex;
		flex-direction: column;

		overflow: hidden;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;

		width: 100%;
		height: 40px;
		padding: 5px;

		flex-shrink: 0;

		background: var(--p-primary-500);

		-webkit-app-region: drag;

		> .window-controls {
			-webkit-app-region: no-drag;

			/* On the colored bar, controls use the on-primary contrast color. */
			--p-button-text-primary-color: var(--p-primary-contrast-color);
			--p-button-text-secondary-color: var(--p-primary-contrast-color);
			--p-button-text-danger-color: var(--p-primary-contrast-color);
			--p-button-text-primary-hover-background: color-mix(in srgb, var(--p-primary-contrast-color), transparent 85%);
			--p-button-text-secondary-hover-background: color-mix(in srgb, var(--p-primary-contrast-color), transparent 85%);

			:deep(.p-button.p-button-text),
			:deep(.p-button.p-button-text:hover) {
				color: var(--p-primary-contrast-color);
			}

			:deep(.p-button.p-button-sm .p-button-icon) {
				font-size: 12px !important; 
			}
			> Button {
				padding: 12px;
				height: 15px;
				width: 15px;
			}
		}

		> #app-version {
			position: relative;
			top: 1px;             
			left: 5px;              
			color: var(--p-primary-contrast-color);
			opacity: 0.8;
			pointer-events: none;
			user-select: none;    
			z-index: 9999;

			font-size: 12px;
		}
	}

	/* Close button: white on red on hover; needs its own rules because the
	   header's contrast-color overrides are unlayered. */
	.header > .window-controls {
		:deep(.p-button.close-button.p-button-text:hover) {
			color: var(--p-surface-0);
			background: var(--p-red-500);
		}
		:deep(.p-button.close-button.p-button-text:active) {
			color: var(--p-surface-0);
			background: var(--p-red-600);
		}
	}

	.control-container {
		width: 100%;
		flex: 1 1 auto;

		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: stretch;
		gap: 10px;

		padding: 10px;

		min-height: 0;
		box-sizing: border-box;
		overflow: hidden;
	}

	.input-container {
		min-height: 0;

		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 10px;
		flex-grow: 2;
		flex-shrink: 0;

		overflow: hidden;
	}
	.output-container {
		min-height: 0;

		display: flex;
		flex-direction: column;
		justify-items: space-around;
		gap: 10px;
		flex-grow: 2;
		flex-shrink: 0;

		overflow: hidden;
	}
	.info-container {
		min-height: 0;

		flex-grow: 5;
		flex-shrink: 1;

		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 10px;

		overflow: hidden;
	}

	.component-border--primary {
		border-radius: 10px;
		/* Real border — box-shadow rings get clipped by the shell's overflow guards. */
		border: 1px solid var(--p-primary-500);
		box-sizing: border-box;
	}

	/* Shrinkable so the internal flex cascade runs (dropzone → list scroll)
	   instead of the card overflowing when its list gets long. */
	.import-orders-card {
		min-height: 0;
	}

	/* Yields space FIRST so the Import Orders list can grow before it scrolls. */
	.print-files-card {
		flex-shrink: 999;
	}
	.component-border--secondary {
		border-radius: 10px;
		border: 1px dashed color-mix(in srgb, var(--p-primary-500), transparent 50%);
	}
</style>