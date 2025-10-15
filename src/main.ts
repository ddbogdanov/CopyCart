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

app.directive('tooltip', Tooltip);

app.mount('#app')

// FIRST: npm run build
// THEN: Build/Make Command: npx electron-forge make --platform win32 --arch x64
// ^ to publish add --publish always
//
// SHA Hash for latest.yml:    node -e "console.log(require('crypto').createHash('sha512').update(require('fs').readFileSync('CopyCartInstaller.exe')).digest('base64'))"

// TODO:
//
// 1. Filter Print Folder (destPath) based on conditions given by import file
// 2. Deep search/multiple directory selection for print files
// 		a. Additionally, directory hierarchy preservation on copy