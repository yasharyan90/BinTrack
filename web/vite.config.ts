/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Home-screen install for pickers (Implementation Plan 8.3). The scanner and
// charts are the heavy chunks, so they get their own bundles.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BinTrack — Inventory & Location Tracking',
        short_name: 'BinTrack',
        description: 'Find any item, verify every pick, see stock health live.',
        theme_color: '#0a0a0b',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Never cache Supabase: stock data must be live.
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173, host: true },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          scanner: ['@zxing/browser', '@zxing/library'],
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
