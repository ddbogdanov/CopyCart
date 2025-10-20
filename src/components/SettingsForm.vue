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

             <Fieldset legend="Shopify Integration" toggleable>
                <div class="shopify-integration">

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
import { toRaw } from 'vue'
import { Form } from '@primevue/forms'
import { useConfirm } from 'primevue/useconfirm'

const confirm = useConfirm();
const props = defineProps(['settings', 'backupSettings'])
const emit = defineEmits(['onSaveSettings'])

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

		.settings-content {
			flex: 1; 
			overflow-y: auto; 
			display: flex;
			flex-direction: column;

			gap: 10px;
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

			padding: 5px;
		}
		.checkbox-item {
			display: flex;
			gap: 5px;

			> label {
				text-wrap: nowrap;
				font-size: 12px;
			}
		}
		.other-settings {
			width: 100%;

			display: flex;
			justify-content: center;

			padding: 10px;

			> Button {
				width: 100%;
			}
		}
	}
</style>