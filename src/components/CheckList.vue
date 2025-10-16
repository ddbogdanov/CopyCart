<template>
	<div class="check-list">

		<div class="check-list-item">
			<div class="text-container">
				<p>Imports</p>
				<p class="file-path" v-if="!!props.imports">{{ importsPathTrimmed }}</p>
			</div>

			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.imports"/>
				<i class="pi pi-times" v-else/>
			</div>
		</div>

		<div class="check-list-item">
			<div class="text-container">
				<p>Print Files</p>
				<p class="file-path" v-if="!!props.printFiles">{{ printFilesPathTrimmed }}</p>
			</div>

			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.printFiles"/>
				<i class="pi pi-times" v-else/>
			</div>
		</div>

		<div class="check-list-item">
			<div class="text-container">
				<p>Print Folder</p>
				<p class="file-path" v-if="!!props.printFolder">{{ printFolderPathTrimmed }}</p>
			</div>
			
			<div class="icon-container">
				<i class="pi pi-file-check success-icon" v-if="props.printFolder"/>
				<i class="pi pi-times" v-else/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps(['imports', 'printFiles', 'printFolder'])

const printFilesPathTrimmed = computed(() => {
  const pathSegments = props.printFiles.split(/[/\\]/).filter(Boolean)
  const lastSegments = pathSegments.slice(-3)
  return '.../' + lastSegments.join('/')
})
const printFolderPathTrimmed = computed(() => {
  const pathSegments = props.printFolder.split(/[/\\]/).filter(Boolean)
  const lastSegments = pathSegments.slice(-3)
  return '.../' + lastSegments.join('/')
})
const importsPathTrimmed = computed(() => {
  const pathSegments = props.imports.split(/[/\\]/).filter(Boolean)
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
	justify-content: space-between;
	align-items: center;

	min-width: 0;
	width: 100%;
}
.text-container {
	display: flex;
	flex-direction: column;
	flex-grow: 1;

	min-width: 0;

	.file-path { 
		color: var(--p-surface-500);
		font-size: 12px;

		white-space: nowrap;
  		overflow: hidden;
		text-overflow: ellipsis;

		min-width: 0;
	}

	> p {
		margin: 0;
		text-align: left;
	}
}

.icon-container {
	width: 32px;
	height: 32px;

	border: 1px solid var(--p-surface-500);
	border-radius: 20px;

	display: grid;
	place-content: center;

	flex-shrink: 0;

	> i {
		color: var(--p-red-500)
	}

	.success-icon {
		color: var(--p-primary-color)
	}
}
</style>