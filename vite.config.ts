import { defineConfig } from 'vite';

// base: './' — все URL относительные, сборка работает на GitHub Pages из любой подпапки.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173 },
});
