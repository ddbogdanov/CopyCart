<template>
	<main>
		<div class="main-container">
			<div class="input-container">
				<FileDrop title="Import Orders"
						icon="pi pi-file-import" 
						tooltip="Accepts .CSV files containing order info."
						dialog-title="Import Orders" 
						:dialog-properties="Array.of('openFile')"
						:dialog-filters="Array.of({ 'name': 'Orders', 'extensions': ['json', 'csv'] }, { 'name': 'All Files', 'extensions': ['*'] })"
						button-label="Select File"
				/>

				<FileDrop title="Print Files"
						icon="pi pi-folder-open"
						tooltip="Directory containing print files. These will be copied."
						dialog-title="Select Print Files" 
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of([])"
						button-label="Select Folder"
				/>
			</div>

			<div class="info-container">
				<Progress current-file="CurrentFile/OrderNumber.txt"
						:progress="progress"
						:is-loading="isProcessing"
						:status="status"
				/>

				<CheckList :are-imports-cached="areImportsCached" 
						:are-print-files-selected="arePrintFilesSelected" 
						:is-print-folder-selected="isPrintFolderSelected"
						:print-files-path="printFilesPath"
						:print-folder-path="printFolderPath"
				/>

				<ProcessFiles :is-disabled="!(areImportsCached && isPrintFolderSelected && arePrintFilesSelected)" />
			</div>

			<div class="output-container">
				<FileDrop title="Print Folder"
						icon="pi pi-briefcase"
						tooltip="Destination directory to copy files into."
						dialog-title="Select Print Folder" 
						:dialog-properties="Array.of('openDirectory')"
						:dialog-filters="Array.of([])"
						button-label="Select Folder"
				/>
			</div>
		</div>
	</main>

	<footer>v{{ version }}</footer>

	<Toast group="error"/>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import FileDrop from './components/FileDrop.vue'
import ProcessFiles from './components/ProcessFiles.vue'
import Progress from './components/Progress.vue'
import CheckList from './components/CheckList.vue'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast';
import pkg from '../package.json'

const areImportsCached = ref(false)
const ordersPath = ref('')
const arePrintFilesSelected = ref(false)
const printFolderPath = ref('')
const isPrintFolderSelected = ref(false)
const printFilesPath = ref('')
const isProcessing = ref(false)
const progress = ref(0)
const status = ref('Select a file to import')
const toast = useToast();
const version = pkg.version

onMounted(() => {
	window.electronAPI.onCachingUpdate((isSelected, path) => {
		areImportsCached.value = isSelected
		ordersPath.value = path

		if(!isSelected) {
			isProcessing.value = false
			progress.value = 0
			status.value = 'Select a file to import'
		}
	})
	window.electronAPI.onPrintFilesUpdate((isSelected, path) => {
		arePrintFilesSelected.value = isSelected
		printFilesPath.value = path
	})
	window.electronAPI.onPrintFolderUpdate((isSelected, path) => {
		isPrintFolderSelected.value = isSelected
		printFolderPath.value = path
	})
	window.electronAPI.onLoadingStateUpdate((isLoading, p, s) => {
		isProcessing.value = isLoading
		progress.value = p
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
})

</script>

<style scoped lang="scss">
	main {
		width: 100%;
		height: 100%;

		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;
	}
	footer {
		position: fixed;
		top: 4px;             
		right: 28px;              
		opacity: 0.6;
		pointer-events: none;
		user-select: none;    
		z-index: 9999;

		font-size: 8px;
	}

	.main-container {
		width: 100%;
		height: 100%;

		display: flex;
		flex-direction: row;
		justify-content: space-between;
		align-items: center;

		gap: 10px;
	}

	.input-container {
		height: 100%;

		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 10px;
		flex-grow: 1;
	}

	.output-container {
		height: 100%;

		display: flex;
		flex-direction: column;
		justify-items: space-around;
		gap: 10px;
		flex-grow: 1;
	}

	.info-container {
		height: 100%;

		flex-grow: 16;

		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 10px;

		border: 1px dashed var(--p-surface-500);
		border-radius: 5px;
	}
</style>