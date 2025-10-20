<template>
    <Form @submit="onSaveSettings" :initialValues="settings" class="settings-form">

        <div class="settings-content">
            <Fieldset legend="Save on exit?" toggleable>
                <div class="should-save">

                    <div class="checkbox-item" v-for="(value, key) in settings.shouldSave" :key="key">
                        <Checkbox :name="key" :inputId="key" v-model="settings.shouldSave[key]" binary/>
                        <label :for="key">{{ formatLabel(key) }}?</label>
                    </div>	

                </div>
            </Fieldset>	

             <Fieldset legend="Shopify Integration" toggleable :collapsed="true">
                <div class="shopify-integration">

                    <div class="description">
                        <i class="pi pi-exclamation-triangle"/>

                        <p class="description-text">
                            <b>Test Connection</b> must be successful to enable this feature.
                        </p>
                    </div>

                    <div class="api-info">
                        <FloatLabel>
                            <InputText id="apiUrl" size="small" fluid/>
                            <label for="apiUrl">Shopify URL</label>
                        </FloatLabel>

                        <FloatLabel>
                            <Password id="apiKey" size="small" :feedback="false" toggleMask fluid/>
                            <label for="apiUrl">API Key</label>
                        </FloatLabel>
                    </div>
                    
                    <div class="api-test">
                        <ButtonGroup>
                            <Button severity="secondary" 
                                    size="small"
                                    icon="pi pi-lock-open"
                                    outlined
                            />
                            <Button severity="secondary"
                                    size="small"
                                    label="Test Connection"
                                    outlined
                            />
                        </ButtonGroup>
                        <!-- <div class="api-test-status">
                            <i :class="apiTestIcon" :style="{ color: apiTestColor }" v-tooltip="apiTestStatus"/>
                        </div> -->
                    </div>
                </div>
             </Fieldset>

            <Fieldset legend="Theme" toggleable :collapsed="true">
                <div class="theme">
                    <ColorPicker v-model="colorSelection" format="hex" inline/>
                    <Button severity="primary" label="Update Color" @click="onUpdateTheme" outlined/>
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
import { ref, toRaw } from 'vue'
import { Form } from '@primevue/forms'
import { useConfirm } from 'primevue/useconfirm'

const confirm = useConfirm();
const props = defineProps(['settings', 'backupSettings'])
const emit = defineEmits(['onSaveSettings', 'onUpdateTheme'])
const colorSelection = ref('34d399')

// pi-times pi-minus and pi-check
const apiTestIcon = 'pi pi-minus'
const apiTestColor = 'var(--p-surface-500)'
const apiTestStatus = 'Test Connection'

function onUpdateTheme() {
    emit('onUpdateTheme', '#' + colorSelection.value)
}
function onSaveSettings() {
	emit('onSaveSettings', JSON.parse(JSON.stringify(props.settings)))
	window.electronAPI.saveSettings(toRaw(props.settings))
}
function formatLabel(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1') // add space before capital letters
    .replace(/^./, str => str.toUpperCase()) // capitalize first letter
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
			window.electronAPI.openDevTools()
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

        padding-bottom: 10px;

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
            display: flex;
            justify-content: space-between;
        }
        .shopify-integration {
            width: 100%;

            .description {
                width: 100%;

                display: inline-flex;
                align-items: center;
                gap: 10px;

                > i {
                    color: var(--p-surface-400);
                    font-size: 2rem;
                }
                > p { 
                    margin: 0;

                    color: var(--p-surface-400);
                    font-size: 14px;
                }
            }
            .api-info {
                display: flex;
                flex-direction: column;
                gap: 30px;

                margin-top: 50px;
                margin-bottom: 50px;
            }
            .api-test {
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 5px;

                margin-top: 30px;
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