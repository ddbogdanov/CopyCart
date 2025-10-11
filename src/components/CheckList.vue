<template>
	<div class="check-list">
		<span class="check-list-item">
			<p>Imports Cached</p>

			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.areImportsCached"/>
				<i class="pi pi-times" v-else/>
			</div>
		</span>

		<span class="check-list-item">
			<span class="text-container">
				<p>Print Files</p>
				<p class="file-path" v-if="!!props.arePrintFilesSelected">{{ printFilesPathTrimmed }}</p>
			</span>

			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.arePrintFilesSelected"/>
				<i class="pi pi-times" v-else/>
			</div>
		</span>

		<span class="check-list-item">
			<span class="text-container">
				<p>Print Folder</p>
				<p class="file-path" v-if="!!props.isPrintFolderSelected">{{ printFolderPathTrimmed }}</p>
			</span>
			
			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.isPrintFolderSelected"/>
				<i class="pi pi-times" v-else/>
			</div>
		</span>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps(['areImportsCached', 'arePrintFilesSelected', 'isPrintFolderSelected', 'printFilesPath', 'printFolderPath'])

const printFilesPathTrimmed = computed(() => {
  const pathSegments = props.printFilesPath.split(/[/\\]/).filter(Boolean)
  const lastSegments = pathSegments.slice(-3)
  return '.../' + lastSegments.join('/')
})
const printFolderPathTrimmed = computed(() => {
  const pathSegments = props.printFolderPath.split(/[/\\]/).filter(Boolean)
  const lastSegments = pathSegments.slice(-3)
  return '.../' + lastSegments.join('/')
})
</script>

<style scoped lang="scss">
.check-list {
	width: 100%;

	padding: 20px;

	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.check-list-item {
	height: 32px;

	display: flex;
	flex-direction: row;
	justify-content: center;
	align-items: center;

	p {
		flex-grow: 1;
		margin: 0;
		text-align: left;
	}
}
.text-container {
	display: flex;
	flex-direction: column;
	flex-grow: 1;

	.file-path {
		color: var(--p-surface-500);
		font-size: 12px;

		white-space: nowrap;
  		overflow: clip;
		text-overflow: ellipsis;

		max-width: calc(100% - 25px);
	}
}

.icon-container {
	width: 32px;
	height: 32px;

	border: 1px solid var(--p-surface-500);
	border-radius: 20px;

	display: grid;
	place-content: center;

	i {
		color: var(--p-red-500)
	}

	.success-icon {
		color: var(--p-primary-color)
	}
}
</style>