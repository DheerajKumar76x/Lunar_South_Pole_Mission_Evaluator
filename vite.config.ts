import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three-vendor'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor'
          if (id.includes('node_modules/lucide-react')) return 'icons-vendor'
        },
      },
    },
  },
})
