import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        explorer: resolve(__dirname, 'index.html'),
        builder: resolve(__dirname, 'builder.html'),
      },
    },
  },
});
