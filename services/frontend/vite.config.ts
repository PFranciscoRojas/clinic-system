import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: '/',
        scope: '/',
        start_url: '/',
        name: 'SGHCP — Historias Clínicas Psicológicas',
        short_name: 'SGHCP',
        description: 'Sistema de Gestión de Historias Clínicas Psicológicas',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait-primary',
        lang: 'es',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never intercept direct navigation to /api/* paths (e.g. OAuth callbacks
        // like /api/v1/integrations/google/callback that must reach the backend).
        navigateFallbackDenylist: [/^\/api\//],
        // Cache API responses for offline graceful degradation
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 100, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});
