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
import Password from 'primevue/password'
import InputText from 'primevue/inputtext'
import FloatLabel from 'primevue/floatlabel'
import Divider from 'primevue/divider'

const app = createApp(App)

app.use(PrimeVue, {
    theme: {
        preset: Aura,
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
app.component('Password', Password)
app.component('InputText', InputText)
app.component('FloatLabel', FloatLabel)
app.component('Divider', Divider)

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