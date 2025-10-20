<template>
    <div class="header">
        <span id="app-version">Copy Cart v{{ version }}</span>

        <ButtonGroup class="window-controls">
            <Button severity="secondary" icon="pi pi-cog" variant="text" size="small" @click="emit('openSettings')" id="settings"/>
            <Button severity="secondary" icon="pi pi-chevron-down" variant="text" size="small" @click="minimize"/>
            <Button severity="secondary" :icon="maximizeIcon" variant="text" size="small" @click="toggleMaximize"/>
            <Button severity="danger" icon="pi pi-times" variant="text" size="small" @click="exit"/>
        </ButtonGroup>
    </div>

</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits(['openSettings'])
const version = ref(__APP_VERSION__)
const maximizeIcon = ref('pi pi-chevron-up')

function minimize() {
	window.electronAPI.minimize()
}
function toggleMaximize() {
	window.electronAPI.toggleMaximize()
}
function exit() {
	window.electronAPI.exit()
}

</script>

<style scoped lang="scss">
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;

		width: 100%;
		height: 40px;
		padding: 5px;

		background: var(--p-primary-900);

		-webkit-app-region: drag;

		> .window-controls {
			-webkit-app-region: no-drag;

			:deep(.p-button.p-button-sm .p-button-icon) {
				font-size: 12px !important; 
			}
			> Button {
				padding: 12px;
				height: 15px;
				width: 15px;
			}
		}

		> #app-version {
			position: relative;
			top: 1px;             
			left: 5px;              
			opacity: 0.6;
			pointer-events: none;
			user-select: none;    
			z-index: 9999;

			font-size: 12px;
		}
	}
</style>