import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import pkg from './package.json'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
	// The dev app loads 5173 — fail loudly on a port clash instead of drifting.
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
