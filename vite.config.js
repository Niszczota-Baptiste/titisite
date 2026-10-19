import crypto from 'node:crypto';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Service worker de l'atelier d'auteur (/auteur, mode hors connexion) : on
// part du gabarit src/sw/auteur-sw.js et on y inscrit la liste EXACTE des
// fichiers dont l'atelier a besoin — le point d'entrée et ses imports, puis la
// page Auteur et tout ce qu'elle charge à la demande (atelier, lecture
// partagée, liseuse), CSS compris. Le reste du site (three.js, quêtes…) n'est
// pas embarqué. La version dépend de cette liste et du gabarit : chaque build
// qui change quelque chose produit un nouveau service worker.
function auteurServiceWorker() {
  return {
    name: 'auteur-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((f) => f.type === 'chunk');
      const byFile = new Map(chunks.map((c) => [c.fileName, c]));
      const files = new Set();
      const seen = new Set();
      const visit = (chunk, followDynamic) => {
        const key = `${chunk.fileName}|${followDynamic}`;
        if (seen.has(key)) return;
        seen.add(key);
        files.add(chunk.fileName);
        for (const css of chunk.viteMetadata?.importedCss || []) files.add(css);
        for (const asset of chunk.viteMetadata?.importedAssets || []) files.add(asset);
        for (const f of chunk.imports) if (byFile.has(f)) visit(byFile.get(f), followDynamic);
        // Les imports dynamiques du point d'entrée = toutes les pages du site :
        // on ne les suit jamais, seulement ceux de l'arbre de l'atelier.
        if (followDynamic && !chunk.isEntry) {
          for (const f of chunk.dynamicImports) if (byFile.has(f)) visit(byFile.get(f), true);
        }
      };
      const auteur = chunks.filter((c) => /src\/pages\/Auteur\.jsx$/.test(c.facadeModuleId || ''));
      if (auteur.length === 0) this.error('auteur-service-worker : page src/pages/Auteur.jsx introuvable dans le build');
      for (const c of auteur) visit(c, true);
      for (const c of chunks.filter((x) => x.isEntry)) visit(c, false);
      const precache = [...files].filter((f) => !/^assets\/three-/.test(f)).sort().map((f) => `/${f}`);
      const template = fs.readFileSync(new URL('./src/sw/auteur-sw.js', import.meta.url), 'utf8');
      const version = crypto.createHash('sha256').update(precache.join('\n')).update(template).digest('hex').slice(0, 12);
      const source = template
        .replace("'__AU_VERSION__'", JSON.stringify(version))
        .replace('__AU_PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'auteur-sw.js', source });
    },
  };
}

const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), auteurServiceWorker()],
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
