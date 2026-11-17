import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist/webview', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    // Fixed names so the extension can reference them in its webview HTML.
    rollupOptions: { output: { entryFileNames: 'main.js', chunkFileNames: '[name].js', assetFileNames: '[name][extname]' } },
  },
  server: { port: 5199 },
});
