import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { auteurServiceWorker } from './vite.auteur-sw.js';

// Bundle « atelier mobile » : la même interface que /auteur (composants de
// src/components/author/), précédée d'un accueil pensé pour le téléphone
// (src/mobile/). Sortie : dist-atelier/, embarquée telle quelle dans l'APK de
// Mon Atelier (dépôt AndroidApp, apps/mon-atelier/scripts/build-web.sh) et
// servie SOUS L'ORIGINE DU SITE par le conteneur — les appels /api restent donc
// relatifs et de première partie. Aucune ressource distante (polices
// comprises) : l'application démarre sans réseau. Cf. docs/atelier-mobile.md.
//
// Rien du portfolio n'est embarqué : ni public/ (codex, images), ni three.js.

const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3001';

// Politique de sécurité de la page embarquée (le site pose la sienne par
// en-tête HTTP ; ici la page vient de l'APK, donc d'une balise). Tout vient de
// la même origine : scripts et styles de l'APK, API du site relié, fichiers de
// l'appareil servis par le conteneur. Au build seulement — le serveur de
// développement de Vite a besoin de scripts en ligne.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicy() {
  return {
    name: 'atelier-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  root: 'src/mobile',
  publicDir: false,
  // Lu par src/components/author/runtime.js (IS_APP).
  define: { 'import.meta.env.VITE_ATELIER_APP': JSON.stringify('1') },
  plugins: [react(), contentSecurityPolicy(), auteurServiceWorker({ app: true })],
  server: {
    host: true,
    port: 5174,
    fs: { allow: ['../..'] },
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } },
  },
  build: {
    outDir: '../../dist-atelier',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
  },
});
