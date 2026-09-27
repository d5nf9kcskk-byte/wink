import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// base './' + hash routing lets the build run from any GitHub Pages repo path.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    // injectManifest: generateSW writes absolute module paths into quoted strings, which breaks on paths with an apostrophe.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Wink',
        short_name: 'Wink',
        description: 'Track your reading, one session at a time.',
        theme_color: '#1a1a1a',
        background_color: '#e7e8ea',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    env: { TZ: 'America/Chicago' },
  },
})
