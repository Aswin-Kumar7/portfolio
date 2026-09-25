import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    cssMinify: true,
    // three.js is code-split into its own lazily-loaded chunk (~135 kB gzip) after first paint.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/gsap') || id.includes('node_modules/@gsap') || id.includes('node_modules/lenis')) return 'gsap'
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
})
