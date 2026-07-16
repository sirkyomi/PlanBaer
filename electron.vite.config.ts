import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts'), external: ['electron', 'date-holidays', 'electron-updater', 'papaparse'] } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react(), tailwindcss()]
  }
})
