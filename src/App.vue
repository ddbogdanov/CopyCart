<template>
	<div class="main">
		<Header @openSettings="openSettings"/>

		<div class="control-container">
			<div class="input-container">
				<FileDrop title="Import Orders"
						icon="pi pi-file-import" 
						tooltip="Accepts .CSV files containing order info."
						dialog-title="Import Orders" 
						:dialog-properties="Array.of('openFile')"
						:dialog-filters="Array.of({ 'name': 'Orders', 'extensions': ['json', 'csv'] }, { 'name': 'All Files', 'extensions': ['*'] })"
						button-label="Select File"
						:delete-button-action="deleteCache"
						class="component-border--primary"
				/>

				<FileDrop title="Print Files"
						icon="pi pi-folder-open"
						tooltip="Directory containing print files. These will be copied."
						dialog-title="Select Print Files" 
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of([])"
						button-label="Select Folder"
						:delete-button-action="deletePrintFiles"
						class="component-border--primary"
				/>
			</div>

			<div class="info-container">
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
				<FileDrop title="Print Folder"
						icon="pi pi-briefcase"
						tooltip="Destination directory to copy files into."
						dialog-title="Select Print Folder" 
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of([])"
						button-label="Select Folder"
						:delete-button-action="deletePrintFolder"
						class="component-border--primary"
				/>
			</div>
		</div>

		<Drawer header="Settings" class="settings-drawer" position="right" v-model:visible="settingsVisible" @hide="onCloseSettings" style="width: 50vw;">
			<SettingsForm :settings="settings" @onSaveSettings="onSaveSettings"/>
		</Drawer>
	</div>

	<Toast/>
	<ConfirmPopup/>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import FileDrop from './components/FileDrop.vue'
import ProcessFiles from './components/ProcessFiles.vue'
import Progress from './components/Progress.vue'
import CheckList from './components/CheckList.vue'
import Toast from 'primevue/toast'
import SettingsForm from './components/SettingsForm.vue'
import Header from './components/Header.vue'

const toast = useToast();
const isProcessing = ref(false)
const progress = ref(0)
const status = ref('Select a file to import')
const maximizeIcon = ref('pi pi-chevron-up')
const settingsVisible = ref(false)
const settings = ref({
	shouldSave: {
		imports: false,
		printFiles: true,
		printFolder: true,
	},
	imports: '',
	printFiles: '',
	printFolder: '',
})
let backupSettings = {
	shouldSave: {
		imports: false,
		printFiles: true,
		printFolder: true,
	},
	imports: '',
	printFiles: '',
	printFolder: '',
}

onMounted(() => {
	window.electronAPI.onLoadingStateUpdate((isLoading, p, s) => {
		isProcessing.value = isLoading
		progress.value = Math.round(p)
		status.value = s
	})
	window.electronAPI.onToast((message) => {
		console.log(message)
		toast.add({
			severity: 'error',
			summary: 'Error',
			detail: message
		})
	})
	window.electronAPI.onWindowMaximizeUpdate((maximized) => {
		maximizeIcon.value = maximized ? 'pi pi-angle-double-down' : 'pi pi-chevron-up' 
	})
	window.electronAPI.onSettingsSaved((saved) => {
		toast.add({
			severity: saved ? 'success' : 'error',
			summary: saved ? 'Success' : 'Error',
			detail: saved ? 'Settings saved!' : 'Something went wrong while saving settings.',
			life: 2000,
		})
	})
	window.electronAPI.onSettingsUpdate((s) => {
		settings.value = s
	})
})

function deleteCache() {
	window.electronAPI.deleteCache()
}
function deletePrintFiles() {
	window.electronAPI.deletePrintFiles()
}
function deletePrintFolder() {
	window.electronAPI.deletePrintFolder()
}

function openSettings() {
	backupSettings = JSON.parse(JSON.stringify(settings.value))
	settingsVisible.value = true
}
function onCloseSettings() {
	settings.value = backupSettings
}
function onSaveSettings(settings: any) {
	backupSettings = settings
}

function shouldProcessBeDisabled() {
	return !(settings.value.imports && settings.value.printFolder && settings.value.printFiles)
}

</script>

<style scoped lang="scss">
	.main {
		width: 100%;
		height: 100%;
	}

	.control-container {
		width: 100%;
		height: calc(100% - 40px);

		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
		gap: 10px;

		padding: 10px;
	}

	.input-container {
		height: 100%;

		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 10px;
		flex-grow: 0;
		flex-shrink: 0;
	}
	.output-container {
		height: 100%;

		display: flex;
		flex-direction: column;
		justify-items: space-around;
		gap: 10px;
		flex-grow: 2;
		flex-shrink: 0;
	}
	.info-container {
		height: 100%;

		flex-grow: 5;
		flex-shrink: 1;

		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 10px;

		border: 1px dashed var(--p-surface-500);
		border-radius: 5px;

		overflow: hidden;
	}

	.settings-drawer {
		width: 50vw;
	}

	.component-border--primary {
		border-radius: 10px;
		box-shadow: 0 0 0 1px var(--p-primary-500);
	}
</style>