import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'

window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => event.preventDefault())

// PrimeVue Imports
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'

// PrimeVue Components
import Button from 'primevue/button'
import ToggleButton from 'primevue/togglebutton'
import ProgressBar from 'primevue/progressbar'
import Tooltip from 'primevue/tooltip'
import ConfirmPopup from 'primevue/confirmpopup'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import ButtonGroup from 'primevue/buttongroup'
import Drawer from 'primevue/drawer'
import Checkbox from 'primevue/checkbox'
import Fieldset from 'primevue/fieldset'
import ColorPicker from 'primevue/colorpicker'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { definePreset } from '@primeuix/themes'

// Default preset — the primary palette is replaced at runtime from saved settings (updatePrimaryPalette)
const stylePreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{emerald.50}',
            100: '{emerald.100}',
            200: '{emerald.200}',
            300: '{emerald.300}',
            400: '{emerald.400}',
            500: '{emerald.500}',
            600: '{emerald.600}',
            700: '{emerald.700}',
            800: '{emerald.800}',
            900: '{emerald.900}',
            950: '{emerald.950}'
        },
        colorScheme: {
            dark: {
                surface: {
                    0: '#ffffff',
                    50: '{neutral.50}',
                    100: '{neutral.100}',
                    200: '{neutral.200}',
                    300: '{neutral.300}',
                    400: '{neutral.400}',
                    500: '{neutral.500}',
                    600: '{neutral.600}',
                    700: '{neutral.700}',
                    800: '{neutral.800}',
                    900: '{neutral.900}',
                    950: '{neutral.950}'
                }
            }
        }
    }
});

const app = createApp(App)

app.use(PrimeVue, {
    theme: {
        preset: stylePreset,
		options: {
            darkModeSelector: '.copy-cart-dark',
        }
    }
});
app.use(ConfirmationService)
app.use(ToastService)

app.component('Button', Button)
app.component('ToggleButton', ToggleButton)
app.component('ProgressBar', ProgressBar)
app.component('ConfirmPopup', ConfirmPopup)
app.component('ButtonGroup', ButtonGroup)
app.component('Drawer', Drawer)
app.component('Checkbox', Checkbox)
app.component('Fieldset', Fieldset)
app.component('ColorPicker', ColorPicker)
app.component('DataTable', DataTable)
app.component('Column', Column)
app.component('Dialog', Dialog)
app.component('InputText', InputText)

app.directive('tooltip', Tooltip)

app.mount('#app')

// Release: npm run make:nsis     — builds installer + latest.yml into release/
//          npm run publish:nsis  — same, plus a draft GitHub release (needs GH_TOKEN)

// TODO:
//
// 1. Filter Print Folder (destPath) based on conditions given by import file
// 2. <--Deep-search/multiple-directory-selection-for-print-files-->
// 		a. Additionally, directory hierarchy preservation on copy