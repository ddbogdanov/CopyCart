<template>
	<div class="file-drop">
		<div class="header">
			<h2 v-tooltip="props.tooltip">{{ props.title }}</h2>
		</div>

		<div class="select">
			<Button :label="props.buttonLabel" severity="primary" variant="outlined" @click="openFile(props.dialogProperties ?? new Array())" rounded/>
		</div>

		<div class="file-name">
			<i :class="props.icon" v-if="fileName"/>
			<p v-tooltip="fileName">{{ fileName }}</p>
			<Button id="cancel-file" icon="pi pi-times" severity="danger" variant="text" size="small" @click="onDelete()" rounded v-if="fileName"/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// dialogProperies: Electron.Dialog.properties
const props = defineProps({
	title: String,
	icon: String, 
	tooltip: String, 
	buttonLabel: String, 
	dialogTitle: String, 
	dialogProperties: Array<string>, 
	dialogFilters: Array<object>, 
	deleteButtonAction: { type: Function, required: true }
})
const fileName = ref()

const dialogTitle = props.dialogTitle
const dialogFilters = props.dialogFilters

async function openFile(properties: Array<string>) {
  const directoryPath = await window.electronAPI.openFileDialog(dialogTitle ?? 'Select', properties, dialogFilters)
  if (directoryPath) {
    fileName.value = directoryPath.replace(/\\/g, '/').split('/').pop()
  }
}

function onDelete() {
	fileName.value = ''
	props.deleteButtonAction()
}

</script>

<style lang="scss" scoped>
	.header {
		display: flex;
		justify-content: center;
		position: relative;

		height: 42px;

		h2 {
			margin: 0;

			font-weight: 300;

			color: var(--p-text-color)
		}
	}

	.select {
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex-grow: 10;
	}

	.file-drop {
		display: flex;
		flex-direction: column;
		justify-content: space-between;

		flex-grow: 1;

		> * {
			padding: 10px;
		}
	}

	.file-name {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-around;
		
		height: 42px;

		> p {
			margin: 0;
			font-size: 12px;
			padding: 0 5px 0 5px;

			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			direction: rtl;
			text-align: left;

			max-width: 120px;
		}

		#cancel-file {
			padding: 0;
		}
	}
</style>
