import { createApp } from 'vue'
import './style.scss'
import App from './App.vue'

// PrimeVue Imports
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'

// PrimeVue Components
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tooltip from 'primevue/tooltip'
import ConfirmPopup from 'primevue/confirmpopup'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import ButtonGroup from 'primevue/buttongroup'
import Drawer from 'primevue/drawer'
import Checkbox from 'primevue/checkbox'
import Fieldset from 'primevue/fieldset'
import { definePreset } from '@primeuix/themes'

// TODO: user selectable themes
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
app.component('ProgressBar', ProgressBar)
app.component('ConfirmPopup', ConfirmPopup)
app.component('ButtonGroup', ButtonGroup)
app.component('Drawer', Drawer)
app.component('Checkbox', Checkbox)
app.component('Fieldset', Fieldset)

app.directive('tooltip', Tooltip)

app.mount('#app')

// FIRST: npm run build
// THEN: Build/Make Command: npx electron-forge make --platform win32 --arch x64
// ^ to publish add --publish always
// npx electron-forge make --platform win32 --publish always --arch x64
//
// SHA Hash for latest.yml:    node -e "console.log(require('crypto').createHash('sha512').update(require('fs').readFileSync('CopyCartInstaller.exe')).digest('base64'))"

// TODO:
//
// 1. Filter Print Folder (destPath) based on conditions given by import file
// 2. Deep search/multiple directory selection for print files
// 		a. Additionally, directory hierarchy preservation on copy