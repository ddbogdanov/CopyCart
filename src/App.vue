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
							<!-- Default slot replaces the built-in "Yes"/"No" label so the symbol stays centered. -->
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
import { ipc } from './ipc'

const toast = useToast();
const isProcessing = ref(false)
const progress = ref(0)
const status = ref('Select files to import')
const version = ref(__APP_VERSION__)
const maximizeIcon = ref('pi pi-chevron-up')
const settingsVisible = ref(false)
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
	themeColor: '#10b981'
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
	themeColor: '#10b981'
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

/**
 * Recursive print-file search toggle: persists through the settings store and
 * reverts on a failed save so the button always reflects what is stored.
 */
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

	// Content sitting on primary surfaces (the colored top bar, filled
	// buttons...) must stay readable for ANY chosen color — pick a dark or
	// light contrast color by luminance instead of a fixed value.
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
		// Alignment only — sizing and icon centering come from the component's
		// own design tokens (overriding width/height/padding clips the icon).
		margin-left: auto;

		// Off: no chrome — blend into the card background (all theme tokens).
		--p-togglebutton-background: transparent;
		--p-togglebutton-border-color: transparent;
		--p-togglebutton-icon-color: var(--p-surface-500);
		--p-togglebutton-hover-background: var(--p-surface-800);
		--p-togglebutton-icon-hover-color: var(--p-surface-200);

		// On: pressed in — darker than the card, icon in the theme color.
		--p-togglebutton-checked-background: var(--p-surface-950);
		--p-togglebutton-checked-border-color: var(--p-surface-950);
		--p-togglebutton-icon-checked-color: var(--p-primary-300);
		// Aura paints the inner content span as a raised pill when checked —
		// flatten it so the pressed state is just the darker fill.
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

			/* On the colored bar every control uses the on-primary contrast
			   color — the theme color itself would blend into the background. */
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

	/* The window close (✕) keeps the header's normal contrast color at rest;
	   hovering turns it white on bright red, pressing darkens the red. Needs
	   its own rules — the header's contrast-color overrides are unlayered. */
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
		/* Real border instead of a box-shadow ring — box-shadows are drawn
		   outside the element and get clipped by the shell's overflow guards. */
		border: 1px solid var(--p-primary-500);
		box-sizing: border-box;
	}

	/* The Import Orders card is the one that grows with its file list; allowing
	   it to shrink past its content minimum lets the internal flex cascade run
	   (dropzone yields to its floor → the file list caps and scrolls) instead
	   of the card overflowing the column when the list gets long. */
	.import-orders-card {
		min-height: 0;
	}

	/* When the column runs out of room, the Print Files card yields down to its
	   floor FIRST — the space it gives up feeds the Import Orders list before
	   that list has to start scrolling. */
	.print-files-card {
		flex-shrink: 999;
	}
	.component-border--secondary {
		border-radius: 10px;
		border: 1px dashed color-mix(in srgb, var(--p-primary-500), transparent 50%);
	}
</style>