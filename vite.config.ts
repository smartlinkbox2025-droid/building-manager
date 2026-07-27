import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/building-manager/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png'
      ],

      manifest: {
        name: 'إدارة العمارة السكنية',
        short_name: 'إدارة العمارة',
        description: 'تطبيق محلي لإدارة مالية وصيانة العمارة السكنية',

        lang: 'ar',
        dir: 'rtl',

        start_url: '/building-manager/',
        scope: '/building-manager/',

        theme_color: '#0f766e',
        background_color: '#f8fafc',

        display: 'standalone',

        icons: [
          {
            src: '/building-manager/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/building-manager/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },

      workbox: {
        globPatterns: [
          '**/*.{js,css,html,png,svg,ico,json,woff,woff2,ttf}'
        ],

        navigateFallback: '/building-manager/index.html',

        cleanupOutdatedCaches: true
      }
    })
  ]
})
