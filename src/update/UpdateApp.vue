<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { UpdateStatus } from '../../shared/ipc'

// Static info arrives via query string from the main process (see UpdateService).
const query = new URLSearchParams(window.location.search)
const fromVersion = query.get('from') ?? ''
const toVersion = query.get('to') ?? ''

const status = ref<UpdateStatus>({
	phase: 'downloading',
	percent: 0,
	transferred: 0,
	total: 0,
	bytesPerSecond: 0
})

onMounted(() => {
	window.updateWindow.onStatus((next) => {
		status.value = next
	})
})

const phase = computed(() => status.value.phase)

const percent = computed(() => {
	const current = status.value
	if (current.phase !== 'downloading') return 100
	const floored = Math.floor(current.percent)
	if (!Number.isFinite(floored)) return 0
	return Math.min(100, Math.max(0, floored))
})

const transferLabel = computed(() => {
	const current = status.value
	if (current.phase !== 'downloading' || !current.total) return ''
	return `${formatBytes(current.transferred)} of ${formatBytes(current.total)}`
})

const errorMessage = computed(() => {
	const current = status.value
	return current.phase === 'error' ? current.message : ''
})

function formatBytes(bytes: number): string {
	const megabytes = bytes / (1024 * 1024)
	return megabytes >= 100 ? `${megabytes.toFixed(0)} MB` : `${megabytes.toFixed(1)} MB`
}

function cancel() {
	void window.updateWindow.cancel()
}

function close() {
	void window.updateWindow.close()
}
</script>

<template>
	<main class="update-window">
		<header class="drag-region">
			<h1>Updating Copy Cart</h1>
			<p class="versions">v{{ fromVersion }} → v{{ toVersion }}</p>
		</header>

		<section v-if="phase === 'downloading'" class="body">
			<div class="progress-track">
				<div class="progress-fill" :style="{ width: `${percent}%` }" />
			</div>
			<p class="status-line">Downloading update… {{ percent }}%</p>
			<p class="detail">{{ transferLabel }}</p>
			<button class="ghost-button" @click="cancel">Cancel</button>
		</section>

		<section v-else-if="phase === 'installing'" class="body">
			<div class="progress-track">
				<div class="progress-fill" style="width: 100%" />
			</div>
			<p class="status-line">Installing update…</p>
			<p class="detail">Copy Cart will restart automatically.</p>
		</section>

		<section v-else class="body">
			<p class="status-line error">Update failed</p>
			<p class="detail">{{ errorMessage }}</p>
			<button class="ghost-button" @click="close">Close</button>
		</section>
	</main>
</template>

<style scoped>
.update-window {
	box-sizing: border-box;
	height: 100vh;
	padding: 20px 24px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	text-align: center;
	user-select: none;
}

.drag-region {
	width: 100%;
	-webkit-app-region: drag;
}

h1 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
}

.versions {
	margin: 4px 0 0;
	font-size: 13px;
	opacity: 0.7;
}

.body {
	width: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	-webkit-app-region: no-drag;
}

.progress-track {
	width: 100%;
	height: 8px;
	border-radius: 4px;
	background: rgba(255, 255, 255, 0.12);
	overflow: hidden;
}

.progress-fill {
	height: 100%;
	border-radius: 4px;
	background: #10b981;
	transition: width 0.15s ease;
}

.status-line {
	margin: 0;
	font-size: 13px;
}

.status-line.error {
	color: #f87171;
	font-weight: 600;
}

.detail {
	margin: 0;
	font-size: 12px;
	opacity: 0.6;
	min-height: 1em;
	overflow-wrap: anywhere;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
}

.ghost-button {
	margin-top: 4px;
	padding: 6px 16px;
	border-radius: 6px;
	border: 1px solid rgba(255, 255, 255, 0.25);
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 13px;
	cursor: pointer;
}

.ghost-button:hover {
	background: rgba(255, 255, 255, 0.08);
}
</style>
