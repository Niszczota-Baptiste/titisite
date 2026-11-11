import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

// Banc d'essai « conteneur » : reproduit, au niveau HTTP, ce que fait
// l'application Android Mon Atelier (dépôt AndroidApp, apps/mon-atelier).
//
//   - la coquille (dist-atelier, ou dist pour le site) est servie depuis le
//     disque SOUS LA MÊME ORIGINE que l'API, comme le serveur local de
//     Capacitor : « / » et tout chemin sans extension → index.html ;
//   - les requêtes /api/… partent vers le vrai serveur (ici : relayées telles
//     quelles, cookies et en-têtes compris) ;
//   - `setOffline(true)` coupe UNIQUEMENT le réseau : la coquille reste servie
//     (elle est dans l'APK), les appels /api échouent comme sans connexion ;
//   - `dropNextResponse(test)` laisse la requête atteindre le serveur puis
//     coupe la réponse : le cas « écriture faite, réponse perdue ».
//
// Ce n'est pas un téléphone : ni WebView Android, ni plugins natifs. Cf.
// docs/atelier-mobile.md, « Ce qui a été vérifié ».

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export async function startContainer({ dist, apiBase, port = 0 }) {
  const root = path.resolve(dist);
  let offline = false;
  const drops = [];
  const seen = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://container');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (offline) { req.socket.destroy(); return; }
      const dropIndex = drops.findIndex((t) => t(req.method, url.pathname));
      const drop = dropIndex >= 0;
      if (drop) drops.splice(dropIndex, 1);
      const target = new URL(req.url, apiBase);
      const upstream = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (up) => {
        seen.push({ method: req.method, path: url.pathname, status: up.statusCode, dropped: drop });
        if (drop) { up.resume(); up.on('end', () => req.socket.destroy()); return; }
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream);
      return;
    }
    const spa = url.pathname === '/' || !path.basename(url.pathname).includes('.');
    const file = spa ? path.join(root, 'index.html') : path.join(root, path.normalize(decodeURIComponent(url.pathname)));
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- chemin borné au dossier du build de test
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- idem
    fs.createReadStream(file).pipe(res);
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    seen,
    setOffline(v) { offline = !!v; },
    dropNextResponse(test) { drops.push(test); },
    async stop() { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); },
  };
}

// Playwright n'est pas une dépendance du dépôt : on le prend là où il est
// installé (global), et les tests de bout en bout sont ignorés sans lui.
export function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return null; }
}
