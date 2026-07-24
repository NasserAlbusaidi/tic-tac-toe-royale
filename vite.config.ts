import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_HOST ?? '127.0.0.1',
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:4242',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:4242',
      },
    },
  },
})
