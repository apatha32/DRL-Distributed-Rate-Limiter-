import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const api = { target: 'http://localhost:8000', changeOrigin: true }

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: same-origin calls are proxied to the local API (VITE_API_URL unset)
    proxy: { '/v1': api, '/health': api },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          data: ['@tanstack/react-query', 'axios'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
