import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    global: 'globalThis',
  },
  resolve: {
    alias: {
      events: resolve(__dirname, 'node_modules/events/events.js'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        explorer: resolve(__dirname, 'explore.html'),
        builder: resolve(__dirname, 'builder.html'),
        reactionLab: resolve(__dirname, 'reaction-lab.html'),
      },
    },
  },
}));
