<template>
    <div class="header">
        <div class="app-info-container">
            <img id="app-logo" :src="icon"/>

            <div class="app-info">
                <p id="name">Copy Cart</p>
                <p id="version">v{{ version }}</p>
            </div>
        </div>

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
import icon from '../../build/icons/icon.png'

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

		.app-info-container {
            display: flex;
            align-items: center;
            gap: 5px;

			pointer-events: none;
			user-select: none;    

            .app-info {
                display: flex;
                flex-direction: column;

                text-align: left;
                #name {
                    margin: 0;
                }
                #version {
                    margin: 0;

                    font-size: 10px;
                    color: var(--p-surface-400)
                }
            }
            #app-logo {
                width: 25px;
                height: 25px;
            }
		}
	}
</style>