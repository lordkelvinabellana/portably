import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cross-origin isolation is required for SharedArrayBuffer, which the PPSSPP
// core needs for threads. Production gets the same headers from /vercel.json.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Portably',
        short_name: 'Portably',
        description: 'Your PSP games and saves, in any desktop browser.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell only. Game images live in OPFS; the emulator runtime is cached on first use.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['emulatorjs/**', 'dev/**'],
        navigateFallbackDenylist: [/^\/emulatorjs\//, /^\/dev\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/emulatorjs/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'emulatorjs-runtime',
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { headers: isolationHeaders, port: 5173 },
  preview: { headers: isolationHeaders, port: 4173 },
})
