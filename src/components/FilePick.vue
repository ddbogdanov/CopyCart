<template>
	<div
		class="file-pick"
		:class="{ 'is-dragging': isDragging }"
		@dragover="onDragOver"
		@dragenter.prevent="onDragEnter"
		@dragleave="onDragLeave"
		@drop.prevent="onDrop"
	>
		<div class="header">
			<h2 v-tooltip.bottom="props.tooltip">{{ props.title }}</h2>
			<slot name="header-actions" />
		</div>

		<div
			class="dropzone"
			role="button"
			tabindex="0"
			:aria-label="props.buttonLabel ?? props.title ?? 'Choose'"
			@click="pick"
			@keydown.enter="pick"
			@keydown.space.prevent="pick"
		>
			<i :class="props.icon" class="dropzone-icon" />
			<p class="dropzone-label">{{ isDragging ? props.dropLabel : props.buttonLabel }}</p>
			<p v-if="props.hint" class="dropzone-hint">{{ props.hint }}</p>
		</div>

		<div class="file-status">
			<slot name="status">
				<StatusLine v-if="props.busy">
					<template #leading><i class="pi pi-spin pi-spinner" /></template>
					{{ props.busyLabel }}
				</StatusLine>
				<StatusLine v-else-if="fileName">
					<template #leading><i class="pi pi-check-circle" /></template>
					<span v-tooltip.top="props.path">{{ fileName }}</span>
					<template #trailing>
						<Button icon="pi pi-times" severity="danger" variant="text" size="small" rounded
								v-tooltip.top="'Clear selection'" @click="onClear"/>
					</template>
				</StatusLine>
				<StatusLine v-else placeholder>No file selected</StatusLine>
			</slot>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PropType } from 'vue'
import { ipc } from '../ipc'
import StatusLine from './StatusLine.vue'
import type { DialogFilter, DialogKind, DialogProperty } from '../../shared/ipc'

/**
 * Generic pick card: header, clickable (and optionally drop-target) zone, and a
 * status row showing the selection. The `path` prop carries the current value
 * (settings), so the display can survive a relaunch.
 */
const props = defineProps({
	title: String,
	tooltip: String,
	icon: String,
	buttonLabel: String,
	hint: String,
	dialogTitle: String,
	dialogKind: { type: String as PropType<DialogKind>, required: true },
	dialogProperties: { type: Array as PropType<DialogProperty[]>, default: () => [] },
	dialogFilters: { type: Array as PropType<DialogFilter[]>, default: () => [] },
	/** Current value (settings) — display only; picking routes via dialogKind. */
	path: String,
	/** Show a spinner + label instead of the selection (e.g. while parsing). */
	busy: { type: Boolean, default: false },
	busyLabel: { type: String, default: 'Working…' },
	/** Allow dropping files onto the card — invokes `dropAction` with resolved paths. */
	allowDrop: { type: Boolean, default: false },
	/** Label shown in place of `buttonLabel` while files are dragged over the card. */
	dropLabel: { type: String, default: 'Drop to import' },
	dropAction: { type: Function as PropType<(filePaths: string[]) => void>, default: undefined },
	deleteButtonAction: { type: Function as PropType<() => void>, required: true }
})

const fileName = computed(() => {
	const path = props.path ?? ''
	return path ? path.replace(/\\/g, '/').split('/').pop() ?? '' : ''
})

const isDragging = ref(false)
// Depth counter — enter/leave pairs between the card's children would flicker.
let dragDepth = 0

async function pick() {
	if (props.busy) return
	await ipc.openFileDialog({
		kind: props.dialogKind,
		title: props.dialogTitle ?? 'Select',
		properties: props.dialogProperties,
		filters: props.dialogFilters
	})
}

function hasDraggedFiles(event: DragEvent): boolean {
	return !!event.dataTransfer?.types.includes('Files')
}

function onDragOver(event: DragEvent) {
	event.preventDefault()
	if (!event.dataTransfer) return
	event.dataTransfer.dropEffect = (props.allowDrop && !props.busy && hasDraggedFiles(event)) ? 'copy' : 'none'
}

function onDragEnter(event: DragEvent) {
	if (!props.allowDrop || props.busy || !hasDraggedFiles(event)) return
	dragDepth++
	isDragging.value = true
}

function onDragLeave() {
	dragDepth = Math.max(0, dragDepth - 1)
	if (dragDepth === 0) isDragging.value = false
}

function onDrop(event: DragEvent) {
	dragDepth = 0
	isDragging.value = false
	if (!props.allowDrop || props.busy) return

	const files = Array.from(event.dataTransfer?.files ?? [])
	if (files.length === 0) return

	const filePaths = files
		.map((file) => {
			try {
				return ipc.getPathForFile(file)
			}
			catch (error) {
				console.warn('[FilePick] Could not resolve the dropped file path:', error)
				return ''
			}
		})
		.filter(Boolean)

	if (filePaths.length > 0) props.dropAction?.(filePaths)
	else console.warn('[FilePick] The drop event carried no usable file paths')
}

function onClear() {
	props.deleteButtonAction()
}
</script>

<style scoped lang="scss">
.file-pick {
	display: flex;
	flex-direction: column;
	gap: 10px;

	flex-grow: 1;

	padding: 10px;

	// Whole card is the drop target — highlight the dropzone on hover.
	&.is-dragging .dropzone {
		border-color: var(--p-primary-500);
		border-style: solid;
		background-color: var(--p-surface-800);
		transform: scale(1.01);
	}
}

.header {
	display: flex;
	align-items: center;

	width: 100%;
	height: 42px;
	flex-shrink: 0;

	h2 {
		margin: 0;

		font-weight: 300;
		color: var(--p-text-color);
	}
}

.dropzone {
	flex-grow: 1;
	// Yields surplus first so a growing status area compresses the dropzone.
	flex-shrink: 999;
	// Low floor; the hint hides below via the container query.
	min-height: 64px;

	// Size containment — contributes only the floor (not its content height) to
	// the card's minimum, keeping tight windows usable.
	container-type: size;

	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;

	padding: 8px 12px;

	border: 1px dashed var(--p-surface-500);
	border-radius: 10px;

	transition: 
		border-color 0.15s ease,
		background-color 0.15s ease,
		transform 0.1s ease;

	cursor: pointer;

	// Children must not swallow drag events (keeps dragleave reliable).
	> * {
		pointer-events: none;
	}

	// Hide the hint first when compressed.
	@container (max-height: 86px) {
		.dropzone-hint {
			display: none;
		}
	}

	.dropzone-icon {
		font-size: 26px;
		color: var(--p-primary-500);
	}

	.dropzone-label {
		margin: 0;
		font-size: 13px;
		color: var(--p-text-color);
	}

	.dropzone-hint {
		margin: 0;
		font-size: 11px;
		color: var(--p-surface-400);
	}

	&:hover {
		border-color: var(--p-primary-500);
		background-color: var(--p-surface-800);
	}

	&:active {
		transform: scale(0.99);
	}

	&:focus-visible {
		outline: 2px solid var(--p-primary-500);
		outline-offset: 2px;
	}
}

.file-status {
	display: flex;
	align-items: center;

	width: 100%;
	min-height: 34px;
	// Shrinkable so a growing file list can take over; slot content scrolls internally.
	flex-shrink: 1;
	overflow: hidden;
}
</style>
