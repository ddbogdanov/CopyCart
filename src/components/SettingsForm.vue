<template>
    <Form @submit="onSaveSettings" :initialValues="settings" class="settings-form">

        <div class="settings-content">
            <Fieldset legend="Save on exit?" toggleable>
                <div class="should-save">

                    <div class="checkbox-item" v-for="key in Object.keys(settings.shouldSave)" :key="key">
                        <Checkbox :name="key" :inputId="key" v-model="settings.shouldSave[key]" binary/>
                        <label :for="key">{{ formatLabel(key) }}?</label>
                    </div>	

                </div>
            </Fieldset>	

            <Fieldset legend="Theme" toggleable :collapsed="true">
                <div class="theme">

                    <div class="presets">
                        <DataTable :value="primaryColorPresets"
                                    v-model:selection="presetColorSelection"
                                    selectionMode="single"
                                    size="small"
                                    scrollable
                                    scrollHeight="flex"
                                    @rowSelect="onColorPresetsRowSelect"
                        >
                            <Column field="color"></Column>
                            <Column field="hex" bodyStyle="text-align: -webkit-right;">
                                <template #body="slotProps">
                                    <div :style="{
                                        width: '1rem',
                                        height: '1rem',

                                        border: '1px solid var(--p-surface-800)',
                                        'border-radius': '5px',

                                        'background-color': `#${slotProps.data.hex}`
                                    }"></div>
                                </template>
                            </Column>
                        </DataTable>
                    </div>

                    <div class="picker">
                        <ColorPicker v-model="colorSelection" format="hex" inline/>
                        <p>#{{ colorSelection.toUpperCase() }}</p>

                        <div class="controls">
                            <ButtonGroup>
                                <Button severity="secondary" label="Reset" @click="onResetTheme" outlined/>
                                <Button severity="info" label="Preview" @click="onPreviewTheme" outlined
                                        v-tooltip.top="'Applies the color for preview — press Save to keep it'"/>
                            </ButtonGroup>
                        </div>
                    </div>

                </div>
            </Fieldset>

            <Fieldset legend="Other" toggleable :collapsed="true">
                <div class="other-settings">

                    <Button severity="danger" 
                            size="small"
                            label="Open Dev Tools"
                            @click="onOpenDevTools($event)" 
                            outlined
                    />

                </div>
            </Fieldset>
        </div>

        <div class="settings-form-buttons">
            <Button type="submit" label="Save" outlined/>
        </div>

    </Form>

    <ConfirmPopup/>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Form } from '@primevue/forms'
import { useConfirm } from 'primevue/useconfirm'
import { primaryColorPresets } from '../models/ThemePresets'
import { ipc } from '../ipc'

const confirm = useConfirm();
const props = defineProps(['settings'])
const emit = defineEmits(['onSaveSettings', 'onUpdateTheme'])
const colorSelection = ref((props.settings?.themeColor ?? '#10b981').replace('#', ''))
const presetColorSelection = ref()

watch(() => props.settings?.themeColor, (color) => {
    if (color) colorSelection.value = String(color).replace('#', '')
})

function onColorPresetsRowSelect() {
    colorSelection.value = presetColorSelection.value.hex
    emit('onUpdateTheme', '#' + presetColorSelection.value.hex)
}
function onResetTheme() {
    colorSelection.value = '10b981'
    emit('onUpdateTheme', '#10b981')
}
function onPreviewTheme() {
    emit('onUpdateTheme', '#' + colorSelection.value)
}
function onSaveSettings() {
	// Persist the picker's current color (Preview may never have been clicked).
	const color = '#' + colorSelection.value
	props.settings.themeColor = color
	emit('onUpdateTheme', color)
	emit('onSaveSettings', JSON.parse(JSON.stringify(props.settings)))
}
function formatLabel(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
}

function onOpenDevTools(event: any) {
	confirm.require({
		target: event.currentTarget,
		message: "** WARNING! ** Use dev tools ONLY for DEBUGGING. Do NOT change any DOM elements, settings, configurations, network calls, etc. Any modifications made may break functionality or cause unwanted behavior. You have been warned.",
		icon: 'pi pi-exclamation-triangle',
		rejectProps: {
			label: 'I\'m scared',
			severity: 'primary',
		},
		acceptProps: {
			label: 'Ok',
			severity: 'danger',
			outlined: true
		},
		accept: () => {
			ipc.openDevTools()
		}
	})
}
</script>

<style scoped lang="scss">
	.settings-form {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;

		width: 100%;
		height: 100%;

        padding-bottom: 24px;

		.settings-content {
			flex: 1; 
			overflow-y: auto; 
			display: flex;
			flex-direction: column;

			gap: 10px;

            Fieldset {
                padding-top: 10px;
            }
		}
		.settings-form-buttons {
			width: 100%;

			margin-top: 10px;

			flex-shrink: 0;
			position: sticky;
			bottom: 0;

			> Button {
				width: 100%;
			}
		}
		.should-save {
			width: 100%;

			display: grid;
  			grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
			gap: 10px;

            color: var(--p-surface-400);
		}
		.checkbox-item {
			display: flex;
			gap: 5px;

			> label {
				text-wrap: nowrap;
				font-size: 12px;
			}
		}
        .theme {
            width: 100%;
            height: 250px;

            display: flex;
            justify-content: space-between;
            gap: 10px;

            .presets {
                flex-grow: 1;
                max-height: 100%;
            }

            .picker {
                display: flex;
                flex-direction: column;
                justify-content: space-between;

                .controls {
                    width: 100%;

                    display: flex;
                    justify-content: flex-end;
                    
                    padding-top: 10px;

                    :deep(.p-buttongroup) {
                        width: 100%;
                    }

                    Button {
                        flex-grow: 1;
                    }
                }

                > p {
                    margin: 0;

                    color: var(--p-surface-400);
                    font-size: 14px;
                    text-align: right;
                }
            }

        }
		.other-settings {
			width: 100%;

			display: flex;
			justify-content: center;

			> Button {
				width: 100%;
			}
		}
	}
</style>