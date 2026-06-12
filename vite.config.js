import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/sitemap.xml': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        // three.js + R3F + drei in their own chunk: it's by far the heaviest
        // dependency and changes rarely — isolating it keeps the hash (and
        // therefore the browser cache) stable when app code changes.
        manualChunks(id) {
          if (/node_modules\/(three|@react-three)\//.test(id)) return 'three';
          // Pin the React runtime to its own chunk; without this, rolldown
          // hoists react-dom into the (lazy, huge) three chunk because fiber
          // also depends on it — and every page would download three.js.
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react';
        },
      },
    },
  },
});
