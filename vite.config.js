import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/routine-book/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
		id: '/routine-book/',
        name: 'RoutineBook - 영어 & 독서 루틴 타이머',
        short_name: 'RoutineBook',
        description: '순차 루틴 타이머와 독서 기록을 결합한 습관 형성 앱',
		start_url: '/routine-book/',
        scope: '/routine-book/',
        theme_color: '#020617',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/routine-book/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
			purpose: 'any',
          },
          {
            src: '/routine-book/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/routine-book/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});