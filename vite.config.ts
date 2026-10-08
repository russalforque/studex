import { fileURLToPath, URL } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  optimizeDeps: {
    // jeep-sqlite ships Stencil web components that break when pre-bundled.
    exclude: ['jeep-sqlite'],
  },
  build: {
    // Served from the device, not the network: one larger bundle is fine.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // The PDF.js worker ships as .mjs. iOS's local server types files by extension and older
        // iOS versions don't know .mjs, so a module worker would be refused; .js always works.
        assetFileNames: (asset) =>
          asset.names.some((n) => n.endsWith('.mjs')) ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
