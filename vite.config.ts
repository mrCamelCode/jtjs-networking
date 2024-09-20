/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, './lib/index.ts'),
      fileName: 'jtjs_networking',
      formats: ['es'],
      
    },
    rollupOptions: {
      external: ['@jtjs/event', 'cross-fetch'],
    }
  },
  test: {
    environment: 'happy-dom',
  },
})