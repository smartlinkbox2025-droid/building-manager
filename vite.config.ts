import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const repositoryName = process.env.VITE_REPOSITORY_NAME || 'building-manager'
const base = process.env.VITE_BASE_PATH || `/${repositoryName}/`

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png','icons/icon-512.png'],
      manifest: {
        name: 'إدارة العمارة السكنية', short_name: 'إدارة العمارة',
        description: 'تطبيق محلي لإدارة مالية وصيانة العمارة السكنية',
        lang: 'ar', dir: 'rtl', start_url: base, scope: base,
        theme_color: '#0f766e', background_color: '#f8fafc', display: 'standalone',
        icons: [
          {src:`${base}icons/icon-192.png`,sizes:'192x192',type:'image/png',purpose:'any maskable'},
          {src:`${base}icons/icon-512.png`,sizes:'512x512',type:'image/png',purpose:'any maskable'}
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,woff,woff2,ttf}'],
        navigateFallback: `${base}index.html`, cleanupOutdatedCaches: true,
        clientsClaim: true, skipWaiting: false,
        runtimeCaching: [{
          urlPattern: ({request}) => request.destination === 'image',
          handler: 'CacheFirst',
          options: {cacheName:'building-images',expiration:{maxEntries:80,maxAgeSeconds:60*60*24*30}}
        }]
      }
    })
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 }
})
