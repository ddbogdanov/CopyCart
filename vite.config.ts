import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
	outDir: 'dist',
	emptyOutDir: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
})
