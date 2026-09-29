import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
	// electron/main.ts loads http://localhost:5173 in dev — fail loudly on a
	// port clash instead of silently moving to another port the app won't load.
	port: 5173,
	strictPort: true
  },
  build: {
	outDir: 'dist',
	emptyOutDir: true,
	rollupOptions: {
		input: {
			// Main application window
			main: fileURLToPath(new URL('./index.html', import.meta.url)),
			// Update progress window (loaded by UpdateService)
			update: fileURLToPath(new URL('./update.html', import.meta.url))
		}
	}
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
})
