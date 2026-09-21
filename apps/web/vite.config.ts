import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cross-origin isolation is required for SharedArrayBuffer, which the PPSSPP
// core needs for threads. Production gets the same headers from /vercel.json.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders, port: 5173 },
  preview: { headers: isolationHeaders, port: 4173 },
})
