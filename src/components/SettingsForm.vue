<template>
    <Form @submit="onSaveSettings" :initialValues="settings" class="settings-form">

        <div class="settings-content">
            <Fieldset legend="Error report" toggleable :collapsed="true">
                <div class="error-report">

                    <p class="report-hint">When copies fail, a .csv listing the affected rows is saved here and opened automatically.</p>

                    <div class="report-row">
                        <RadioButton inputId="reportToPrintFolder" name="reportLocation" :value="true" v-model="settings.reportToPrintFolder"/>
                        <label for="reportToPrintFolder">Save to Print Folder</label>
                    </div>

                    <div class="report-row report-folder" :class="{ 'is-disabled': settings.reportToPrintFolder }">
                        <RadioButton inputId="reportCustomFolder" name="reportLocation" :value="false" v-model="settings.reportToPrintFolder"/>
                        <label for="reportCustomFolder">Save to a custom folder</label>
                        <Button label="Choose folder"
                                size="small"
                                outlined
                                :disabled="settings.reportToPrintFolder"
                                @click="onPickReportFolder"
                        />
                    </div>

                    <div class="report-location">
                        <span>Error reports will copy to:</span>
                        <span class="path" :class="{ 'is-unset': !reportLocation }" v-tooltip.top="reportLocationTooltip">{{ reportLocationLabel }}</span>
                    </div>

                </div>
            </Fieldset>

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
import { computed, ref, watch } from 'vue'
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

const printFolder = computed(() => props.settings?.printFolder || '')
/** Target folder for reports; null while none resolves (placeholder shown). */
const reportLocation = computed(() => {
    if (props.settings?.reportToPrintFolder) return printFolder.value || null
    return props.settings?.reportFolder || printFolder.value || null
})
const reportLocationLabel = computed(() => reportLocation.value ?? 'Print Folder (not selected)')
const reportLocationTooltip = computed(() => reportLocation.value ?? undefined)

/** Draft-only pick — persisted when the form is saved. */
async function onPickReportFolder() {
    const picked = await ipc.openFileDialog({
        kind: 'choose-folder',
        title: 'Select Error Report Folder',
        properties: ['openDirectory'],
        filters: []
    })
    if (picked.length > 0) props.settings.reportFolder = picked[0]
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

        .error-report {
            width: 100%;

            display: flex;
            flex-direction: column;
            gap: 10px;

            color: var(--p-surface-400);

            .report-row {
                display: flex;
                align-items: center;
                gap: 5px;

                > label {
                    font-size: 12px;
                }
            }

            .report-folder {
                > Button {
                    margin-left: auto;
                }

                &.is-disabled > label {
                    opacity: 0.55;
                }
            }

            .report-location {
                display: flex;
                gap: 5px;

                padding-top: 10px;

                border-top: 1px solid var(--p-surface-800);

                font-size: 11px;
                opacity: 0.8;

                > .path {
                    flex: 1;
                    min-width: 0;

                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                /* Warning tint while no folder resolves yet. */
                > .path.is-unset {
                    color: var(--p-red-400);
                }
            }

            .report-hint {
                margin: 0;
                padding-bottom: 10px;

                border-bottom: 1px solid var(--p-surface-800);

                font-size: 11px;
                opacity: 0.8;
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