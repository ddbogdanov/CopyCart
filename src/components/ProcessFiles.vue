<template>
<div class="process-files">
	<Button label="Process Files" icon="pi pi-arrow-right" icon-pos="right" severity="contrast" variant="outlined" rounded @click="processFiles($event)" :disabled="props.isDisabled"/>
</div>

<ConfirmPopup group="confirmProcessFiles"/>
</template>

<script lang="ts" setup>
import { ConfirmPopup } from "primevue";
import { useConfirm } from "primevue/useconfirm";

const props = defineProps(['isDisabled'])

const confirm = useConfirm()

function processFiles() {
	confirm.require({
		group: 'confirmProcessFiles',
		message: `Are you sure you want to proceed?`,
		acceptClass: 'p-button-primary p-button-outlined',
		rejectClass: 'p-button-secondary p-button-outlined',
		accept: onAccept,
		reject: onReject,
		acceptIcon: 'pi pi-arrow-right'
	})
}

function onAccept() {
	window.electronAPI.processFiles()
}
function onReject() {
	console.log('Process files prompt rejected')
}
</script>

<style lang="scss" scoped>
	.process-files {
		display: flex;
		flex-direction: column;
		justify-content: space-between;

		padding: 10px;
	}
</style>