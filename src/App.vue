<template>


	<span id="footer">v{{ version }}</span>

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
const version = ref(__APP_VERSION__)

onMounted(() => {
	console.log("Version: " + version)

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
	#footer {
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