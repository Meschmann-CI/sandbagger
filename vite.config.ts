import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // React, the router and Supabase in a file of their own: a deploy
        // that only changes the app's code leaves it cached on every phone.
        advancedChunks: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
