/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The Supabase client throws at module scope when its env vars are missing,
 * which in a production build means a green deploy that white-screens in the
 * browser. Failing here instead turns that into an obvious build error on the
 * CI or Vercel log, where someone will actually see it.
 */
function requireSupabaseEnv(mode: string) {
  if (mode !== 'production') return
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `Cannot build: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.\n` +
        'Set them in the Vercel project (Settings → Environment Variables) or in web/.env.local.',
    )
  }
  const url = env.VITE_SUPABASE_URL
  if (/\/(rest|auth|realtime|storage|functions)\/v\d/.test(url)) {
    throw new Error(
      `VITE_SUPABASE_URL must be the project base URL, not a service path.\n` +
        `  got:      ${url}\n` +
        `  expected: ${url.replace(/\/(rest|auth|realtime|storage|functions)\/v\d.*$/, '')}`,
    )
  }
}

// Home-screen install for pickers (Implementation Plan 8.3). The scanner and
// charts are the heavy chunks, so they get their own bundles.
export default defineConfig(({ mode }) => {
  requireSupabaseEnv(mode)

  return {
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
  }
})
