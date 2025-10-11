<template>
	<div class="file-drop">
		<div class="header">
			<h2>{{ props.title }}</h2>
			<i id="help" class="pi pi-info-circle" v-tooltip="props.tooltip"/>
		</div>

		<div class="select">
			<Button :label="props.buttonLabel" severity="primary" variant="outlined" @click="openFile(props.dialogProperties)" rounded/>
		</div>

		<div class="file-name">
			<i :class="props.icon" v-if="fileName"/>
			<p>{{ fileName }}</p>
			<Button icon="pi pi-times" severity="danger" variant="text" size="small" @click="cancelFile()" rounded v-if="fileName"/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// dialogProperies: Electron.Dialog.properties
const props = defineProps(['title','icon', 'tooltip', 'buttonLabel', 'dialogTitle', 'dialogProperties', 'dialogFilters'])
const fileName = ref()

const dialogTitle = props.dialogTitle
const dialogFilters = props.dialogFilters

async function openFile(properties: Array<string>) {
  const directoryPath = await window.electronAPI.openFileDialog(dialogTitle, properties, dialogFilters);
  if (directoryPath) {
    fileName.value = directoryPath.replace(/\\/g, '/').split('/').pop()
  }
}

function cancelFile() {
	if(props.title === 'Import Orders') {
		window.electronAPI.deleteCache()
	}
	else if(props.title === 'Print Files') {
		window.electronAPI.deletePrintFiles()
	}
	else if(props.title === 'Print Folder') {
		window.electronAPI.deletePrintFolder()
	}

	fileName.value = ''
}

</script>

<style lang="scss" scoped>
	.header {
		flex-grow: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;

		#help {
			color: var(--p-surface-500)
		}

		h2 {
			margin: 0;
			color: var(--p-text-color)
		}
	}

	.select {
		display: flex;
		flex-direction: column;
		justify-content: center;;
		flex-grow: 10;
	}

	.file-drop {
		display: flex;
		flex-direction: column;
		justify-content: space-between;

		border: 1px solid var(--p-primary-color);
		border-radius: 15px;

		padding: 10px;

		flex-grow: 1;
	}

	.file-name {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-around;
		
		height: 42px;

		p {
			font-size: 12px;
		}
	}
</style>
