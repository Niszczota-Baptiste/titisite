# Audit complet du dépôt — titisite

> Audit technique « avant mise en production » réalisé le 2026-07-06 sur le
> commit `0e8e5c6`. Périmètre : sécurité, qualité de code, performance,
> architecture, UX, SEO, dépendances, tests, DevOps, documentation.
>
> **Verdict global : dépôt d'une maturité sécurité exceptionnelle pour un
> projet personnel.** La quasi-totalité des classiques OWASP est déjà traitée
> (et testée par une suite de non-régression dédiée). Les problèmes restants
> sont surtout d'ordre DevOps, RGPD périphérique et robustesse — un seul est
> bloquant : le script d'installation initiale ne peut pas fonctionner.

---

## Scores

| Domaine | Note | Commentaire |
|---|---|---|
| Sécurité | **9/10** | Défense en profondeur rare à ce niveau ; reste 2FA, logs de tokens, durcissements mineurs |
| Performance | **7.5/10** | Bon découpage bundle ; I/O synchrones et bcrypt sync côté serveur |
| Architecture | **8.5/10** | Monolithe modulaire propre et cohérent ; SQLite = plafond de scalabilité assumé |
| Maintenabilité | **8.5/10** | Conventions documentées (CLAUDE.md), patterns homogènes ; `db.js#migrate` très long |
| Lisibilité | **9/10** | Commentaires explicatifs de grande qualité ; mélange FR/EN |
| UX | **7/10** | États chargement/erreur/toasts/confirm présents ; accessibilité (ARIA) clairsemée |
| SEO | **7.5/10** | Sitemap dynamique, robots, JSON-LD ; meta par page côté client uniquement (SPA sans SSR) |
| **Qualité globale** | **8.5/10** | |

---

## 1. Sécurité

### Ce qui est déjà en place (et vérifié pendant l'audit)

Pour situer le niveau — tout ceci existe **et** est couvert par
`test/security.test.js` en CI :

- **Auth** : JWT en cookie `HttpOnly` `SameSite=Strict` `Secure` (prod),
  jamais en localStorage ; blocklist de `jti` révoqués + `token_version`
  (invalidation immédiate à la révocation/reset) ; hash bcrypt (10 rounds) ;
  dummy-hash anti-énumération à coût constant sur le login ; politique de mot
  de passe (12 car. min + denylist) refusant même de booter avec les
  placeholders du `.env.example`.
- **Anti-pivot admin** (CWE-620) : un admin ne peut pas réinitialiser le mot
  de passe d'un autre admin ni le sien via `/api/users/:id` — self-service
  avec mot de passe courant obligatoire (`/api/me/password`), token version
  bumpée, audit log.
- **Injections** : 100 % des requêtes SQL en prepared statements
  (better-sqlite3) ; noms de tables dynamiques limités à des constantes de
  module ; markdown maison 100 % React (aucun `innerHTML`, seul
  `dangerouslySetInnerHTML` du dépôt = keyframes CSS constantes dans
  `src/components/project/detail/Ambient.jsx:16`) ; en-têtes mail nettoyés
  des contrôles CR/LF (`server/routes/contact.js:49`).
- **Fichiers** : uploads en UUID + extension sanitizée, double allowlist
  extension+MIME, caps par type (50 Mo/100 Mo/1 Go/512 Mo…), limites nginx
  par `location` ; téléchargement audio/images **cross-checké contre la DB**
  (impossible de faire fuiter un document via `/api/audio/:f`) ; regex
  anti-traversal sur les noms ; images recompressées par sharp (EXIF/métadata
  supprimées).
- **Rate-limiting** : global 600/min + login 10/min (compteur persistant
  SQLite, insensible aux redémarrages) + audio/calendar/contact/analytics/
  worldedit dédiés ; `trust proxy 1`.
- **Headers** : helmet avec CSP explicite, HSTS prod, Permissions-Policy
  manuelle ; CORS fermé en prod, allowlist Vite en dev.
- **SSRF/Host-header** : `CANONICAL_ORIGIN` obligatoire en prod (boot-fail) ;
  seul fetch sortant = Nominatim en URL constante, throttlé et timeouté.
- **DoS** : `headersTimeout` 30 s (Slowloris), `requestTimeout` fini,
  anti-zip-bomb sur le parsing Anvil (maxOutputLength + worker
  `resourceLimits`), volumes de sélection WorldEdit bornés.
- **Vie privée** : analytics sans cookie ni IP brute (hash salé rotatif
  quotidien), rétention 7 jours, referrer réduit au hostname, chemins purgés
  des query strings.
- **Chaîne CI** : npm audit (bloquant high+), eslint-plugin-security,
  secretlint (pre-commit + CI), gitleaks full-history, Semgrep SARIF,
  suite de tests sécurité. `npm audit` du jour : **0 vulnérabilité**.

### Problèmes identifiés

#### S1 · ÉLEVÉ (DevOps, casse l'installation) — `setup.sh` ne peut pas builder le front

- **Fichier** : `deploy/setup.sh:61-62`
- **Explication** : le script exécute `npm ci --omit=dev` **puis**
  `npm run build`. Or `vite` est en `devDependencies` → le build échoue avec
  « vite: not found ». `deploy.sh` (mises à jour) fait déjà correctement
  `--include=dev` puis `npm prune --omit=dev` ; `setup.sh` (installation
  initiale) est resté sur l'ancien schéma.
- **Risque réel** : impossible d'installer un nouveau serveur avec la
  procédure documentée ; en cas de sinistre du VPS, la reconstruction échoue
  au pire moment.
- **Correction** :

```bash
# deploy/setup.sh — étape 7
sudo -u "$APP_USER" npm ci --include=dev
sudo -u "$APP_USER" npm run build
sudo -u "$APP_USER" npm prune --omit=dev
```

#### S2 · MOYEN — Le secret JWT de prod peut fuiter dans les tests CI

- **Fichier** : `.github/workflows/security.yml:142`
- **Explication** : `JWT_SECRET: ${{ secrets.JWT_SECRET || 'ci-test-…' }}`.
  Si un jour le vrai `JWT_SECRET` de production est stocké dans les secrets
  GitHub (pour un déploiement futur), il sera injecté dans l'environnement
  d'un job qui exécute des tests, des dépendances npm et
  `gitleaks-action`/`semgrep` — surface d'exfiltration inutile. Les tests
  n'ont jamais besoin du secret réel.
- **Correction** : valeur de test en dur, comme dans `build.yml` :
  `JWT_SECRET: ci-test-secret-not-for-prod`.

#### S3 · MOYEN — Pas de second facteur (2FA) sur des comptes admin exposés à Internet

- **Fichiers** : `server/routes/auth.js`, `src/components/admin/Login.jsx`
- **Explication** : l'authentification est mono-facteur. Le compte admin
  contrôle tout (contenu public, utilisateurs, uploads exécutables `.exe`
  dans les builds…). Le rate-limit persistant protège du brute-force, pas du
  phishing ni de la réutilisation de mot de passe.
- **Correction** : TOTP (RFC 6238) avec `otplib` — une colonne
  `totp_secret`, un champ code au login quand il est défini, activation
  self-service dans le dashboard. ~150 lignes. À minima pour le rôle
  `admin`.

#### S4 · MOYEN — Tokens secrets dans des URLs non exclues des access-logs nginx

- **Fichiers** : `deploy/nginx.conf:53-65` (le modèle existe déjà pour
  `/api/calendar/`), `server/routes/quests.js:98`, `/api/worldedit/shared/:token`,
  `/api/blueprints/shared/:token`, pages `/we/:token` et `/build/:token`
- **Explication** : le flux iCal a un bloc nginx `access_log off` justement
  parce que « le token d'auth est dans l'URL ». Les mêmes précautions ne sont
  **pas** appliquées aux autres URLs à token : feed cockpit
  (`/api/quests/cockpit/:token.json`, pollé en boucle → apparaît des
  centaines de fois dans `access.log`), liens de partage WorldEdit/blueprint.
  Un accès en lecture aux logs (backup, admin sys, incident) suffit alors à
  récupérer des capacités actives.
- **Correction** : répliquer le bloc iCal :

```nginx
location ~ ^/api/(quests/cockpit|worldedit/shared|blueprints/shared)/ {
    access_log off;
    error_log  /dev/null crit;
    proxy_pass http://127.0.0.1:3001;
    # … mêmes proxy_set_header que les autres blocs
}
```

#### S5 · MOYEN (RGPD + perf) — Google Fonts servies par Google

- **Fichiers** : `index.html:46-51`, CSP dans `server/index.js:76-77`
- **Explication** : chaque visiteur envoie son IP à Google (fonts.googleapis
  /gstatic). Pour un site français dont l'analytics a été soigneusement
  conçue « sans PII », c'est incohérent — et c'est précisément le cas jugé
  non conforme RGPD (LG München 2022, position CNIL similaire). C'est aussi
  une ressource bloquante tierce au premier rendu.
- **Correction** : auto-héberger via `@fontsource/space-grotesk`,
  `@fontsource/inter`, `@fontsource/noto-sans-kr` (import dans `main.jsx`),
  supprimer les `<link>` et retirer les deux domaines Google de la CSP —
  bonus : CSP plus stricte.

#### S6 · FAIBLE — Réutilisation de `JWT_SECRET` comme sel analytics

- **Fichier** : `server/routes/analytics.js:10`
- **Explication** : le même secret sert à signer les sessions **et** à saler
  le `visitor_hash`. Si le sel devait être exposé/déductible (dump de la
  table + brute-force IP×UA hors-ligne), on préférerait ne pas avoir mis en
  jeu la clé de signature des sessions, et inversement.
- **Correction** : `ANALYTICS_SALT` dédié (fallback dérivé :
  `crypto.createHmac('sha256', JWT_SECRET).update('analytics').digest()` pour
  ne pas casser l'existant).

#### S7 · FAIBLE — Brute-force distribué : pas de limite par compte

- **Fichier** : `server/index.js:136-144`
- **Explication** : le limiteur de login est par IP (10/min). Un attaquant
  disposant de nombreuses IP (botnet, proxies résidentiels) peut tester
  ~10×N mots de passe/min sur un même email sans jamais déclencher le seuil.
- **Correction** : second compteur par email normalisé (le store SQLite
  existant accepte n'importe quelle clé) — p. ex. 20 échecs/h/compte, avec
  la même sémantique `skipSuccessfulRequests`.

#### S8 · FAIBLE — Contenu des uploads non vérifié (magic bytes)

- **Fichier** : `server/uploads.js:94-111`
- **Explication** : extension + MIME déclaré sont vérifiés, jamais le contenu
  réel. Le MIME est fourni par le client, donc trivialement falsifiable ; un
  fichier `.pdf` peut contenir n'importe quoi. Le risque est contenu (les
  fichiers sont servis en download authentifié avec `Content-Disposition:
  attachment`, jamais interprétés côté serveur), mais des membres se
  téléchargent mutuellement ces fichiers.
- **Correction** : contrôle des magic bytes après upload (`file-type` npm)
  pour les familles document/image/audio ; en bonus `X-Content-Type-Options`
  est déjà là.

#### S9 · FAIBLE — Recherche de tokens en clair par index (timing + valeur au repos)

- **Fichiers** : `server/users.js:71-76,112-117`,
  `server/routes/worldedit.js:520`, `server/routes/blueprints.js:377`
- **Explication** : les tokens iCal/cockpit/partage sont stockés **en clair**
  et retrouvés par `WHERE token = ?`. (a) La comparaison B-tree n'est pas à
  temps constant — exploitation réseau irréaliste sur des tokens de 96-144
  bits, donc théorique ; (b) plus concret : un dump/backup de la DB expose
  des capacités encore actives.
- **Correction** : stocker `sha256(token)` et chercher sur le hash — le
  token n'est montré qu'à la création/rotation ; comparaison à temps
  constant offerte gratuitement par le hash.

#### S10 · FAIBLE — `GET /api/users` accessible à tout membre

- **Fichier** : `server/routes/users.js:19-21`
- **Explication** : n'importe quel membre voit l'email, le rôle et les flags
  de **tous** les comptes. Nécessaire pour les assignations kanban, mais
  l'email des autres n'est pas requis pour ça.
- **Correction** : pour le rôle `member`, ne renvoyer que `{id, name, role}`.

#### S11 · FAIBLE — Presse-papier WorldEdit en mémoire non borné en octets

- **Fichier** : `server/routes/worldedit.js:39-45`
- **Explication** : `clipboards` est borné à 50 entrées mais pas en volume.
  Un détenteur de lien `edit` peut importer des `.litematic` de 50 Mo
  (décompressés bien plus) et remplir jusqu'à 50 clips → pression mémoire sur
  un process PM2 plafonné à 512 Mo (voir D3).
- **Correction** : borner aussi la somme des volumes (`sx*sy*sz`) du Map,
  p. ex. 256 M blocs cumulés, en évinçant les plus anciens.

#### S12 · FAIBLE — Incohérence `X-Frame-Options: SAMEORIGIN` vs CSP `frame-ancestors 'none'`

- **Fichiers** : `server/index.js:71-94` (helmet), visible dans
  `test/security.test.js:26`
- **Explication** : la CSP interdit tout embedding, le header legacy autorise
  le same-origin. Les navigateurs modernes suivent la CSP (donc pas de
  vulnérabilité), mais l'intention devrait être exprimée une seule fois.
- **Correction** : `helmet({ xFrameOptions: { action: 'deny' } })` ou retirer
  le header legacy.

#### S13 · INFO — Divers

- `deviceFromUA`/`browserFromUA` : OK. `visitorHash` inclut l'IP via
  `req.ip` qui dépend de `trust proxy` — correct derrière nginx.
- `fail2ban` est installé par `setup.sh` mais aucune jail applicative n'est
  configurée (seul sshd par défaut). Une jail sur les 401 répétés de
  `/api/auth/login` doublerait le rate-limit applicatif au niveau IP/kernel.
- Le champ honeypot `website` + réponse 200 factice : bien.
- `PATCH /api/contact/:id/read` passe `req.params.id` (string) au prepared
  statement — sûr (paramétré), mais `Number()` serait cohérent avec le reste.

---

## 2. Qualité du code

### Points forts

- Patterns homogènes et **documentés** (CLAUDE.md) : lazy-prepared
  statements, mappers `rowToX`, routers scopés `mergeParams`, codes d'erreur
  machine-readable stables (`invalid_credentials`, `mime_not_allowed`…).
- Aucun `console.log` de debug côté front, aucun `TODO/FIXME` oublié dans le
  code, aucun code commenté mort. Les commentaires expliquent le *pourquoi*
  (souvent avec la référence CWE ou l'historique de l'incident) — rare.
- ESLint sécurité + secretlint en pre-commit (husky + lint-staged) et en CI.

### Points à améliorer

| Réf | Gravité | Fichier | Problème | Proposition |
|---|---|---|---|---|
| Q1 | Faible | `server/db.js:18-1050` | `migrate()` ≈ 1030 lignes, tous domaines mélangés (public, workspaces, writing, quêtes) | Découper en `migrations/{core,writing,quests,worldedit}.js` appelés séquentiellement — même sémantique idempotente |
| Q2 | Faible | `server/seed-bass-program.js` | Script one-shot (« Test data for the site launch ») jamais importé par `seed.js`, exécutable seulement à la main | Déplacer dans `scripts/` ou supprimer ; il embarque du contenu personnel daté |
| Q3 | Faible | `server/routes/tracks.js:36-39` | `reorder('tracks', req.body.order)` sans valider `Array.isArray` → 500 sur body malformé (le `collectionRouter` générique, lui, valide) | Reprendre la validation du routeur générique |
| Q4 | Faible | `server/routes/documents.js:54-60` | `title`/`notes` non typés : un objet JSON dans le body → exception better-sqlite3 → 500 `internal_error` | `typeof x === 'string'` avant `COALESCE` |
| Q5 | Info | tout le dépôt | Commentaires mi-français mi-anglais (souvent dans le même fichier) | Choisir une langue par couche, ou assumer — cosmétique |
| Q6 | Info | `deploy/nginx.conf` | 5 blocs `location` répètent 6 lignes `proxy_set_header` | `include snippets/titisite-proxy.conf;` |

Aucune dépendance non utilisée détectée : chaque entrée de `package.json`
correspond à des imports réels (leaflet → Stairs, opentype.js → textRender,
prismarine-nbt → anvil, etc.).

---

## 3. Performance

| Réf | Impact | Priorité | Constat | Amélioration |
|---|---|---|---|---|
| P1 | Moyen | Haute | `bcrypt.hashSync/compareSync` (login, création, reset — `server/routes/auth.js:23`, `users.js`, `me.js`) bloquent l'event loop ~80-100 ms par appel : pendant ce temps **aucune** requête (y compris le streaming audio public) n'est servie | Passer aux variantes promesse (`bcrypt.compare/hash` de bcryptjs) — changement mécanique |
| P2 | Moyen | Haute | I/O synchrones sur gros buffers dans les handlers : `fs.readFileSync`+`gunzipSync` d'artefacts complets (`blueprints.js:143`), `fs.writeFileSync` de régions/zip potentiellement volumineux (`blueprints.js:213-221,262-271`) | `fs.promises` + `zlib` async ; les handlers sont déjà `async` pour la plupart |
| P3 | Faible | Moyenne | Express sert `dist/` et compresse (`compression()`) alors que nginx est devant : chaque asset traverse Node | Servir `dist/` directement par nginx (`root` + `try_files $uri /index.html`) avec `location /api` proxifié ; retirer `compression()` (nginx gzip déjà configuré) |
| P4 | Faible | Moyenne | `max_memory_restart: '512M'` (PM2) alors que l'import de monde accepte 512 Mo et que WorldEdit manipule des régions en mémoire : PM2 peut tuer le process **en plein import** (l'upload est perdu, l'utilisateur voit un network error) | Monter à `1G` (le VPS le permet ?) ou streamer davantage ; au minimum documenter la limite |
| P5 | Faible | Basse | `GET /api/analytics/summary` charge toutes les pageviews de la période en JS (`buildSessions`) | Acceptable grâce à la rétention 7 jours qui borne la table ; à revoir seulement si la rétention augmente |
| P6 | Faible | Basse | Pas de `srcset`/tailles multiples pour les images publiques (une seule variante WebP 3840 px max) | Générer 2-3 largeurs à l'upload (sharp est déjà là) + `srcset` dans les sections |
| P7 | ✓ | — | Déjà bien : chunks manuels three/react (`vite.config.js`), routes lazy, catalogue codex hors bundle, cache immutable sur assets hashés et fichiers UUID, index SQLite systématiques, WAL activé | — |

---

## 4. Architecture

**Structure** : monolithe modulaire propre — `server/routes/*` (HTTP),
`server/{anvil,worldedit,minecraftWorld,quests}/` (domaines), front par
feature (`components/{admin,project,writing,quests}`), client API centralisé
(`src/api/client.js`). Couplage faible, cohésion forte, conventions écrites.
Le pattern « routeur scopé + `resolveWorkspace` » garantit structurellement
l'isolation multi-workspace (impossible d'oublier le filtre dans un handler).

**Montée en charge — réponse franche** : l'architecture tiendra sans problème
le trafic d'un portfolio + équipe (des milliers de visiteurs/jour : SQLite en
WAL lit très vite, tout est indexé). Elle ne supportera **pas** une forte
montée en charge horizontale, par construction :

- SQLite = un seul process (`instances: 1` dans PM2, commenté comme tel) ;
- uploads sur disque local ; presse-papiers WorldEdit et jobs en mémoire de
  process ; rate-limit global en mémoire (seul le login est persistant).

Si ce besoin arrivait : Postgres + stockage objet (S3) + store de jobs/clips
externalisé (Redis) — mais ce serait un autre projet. Pour l'usage cible,
le choix actuel est le bon (simplicité, sauvegarde triviale, zéro service
externe).

---

## 5. UX / UI

- ✓ États de chargement (fallback Suspense, squelettes), `ErrorBoundary`,
  toasts (`ToastProvider`), confirmations destructives (`ConfirmProvider`),
  brouillons autosauvegardés avec bannière de restauration (`useDraft`),
  breakpoints mobiles homogènes (`useIsMobile`).
- **U1 · Moyen — Accessibilité** : ~42 attributs `aria-*`/`alt`/`role` pour
  ~180 composants JSX. Les surfaces très interactives (kanban drag&drop,
  cartes 3D, lecteur audio, éditeurs) sont largement dépourvues de labels
  ARIA, de gestion focus et de navigation clavier. Le site public (cible
  recruteurs) mérite au minimum : `alt` systématiques, labels sur les
  contrôles du player et du formulaire de contact, focus visible, ordre de
  tabulation dans les modales (`Modal` de `project/shared.jsx` : piège à
  focus + `Esc`).
- **U2 · Faible** : contraste à vérifier sur les textes
  `rgba(200,192,216,0.85)` sur `#050511` (probablement OK) et surtout les
  variantes à 0.5-0.6 d'alpha (métadonnées, tags) — viser WCAG AA 4.5:1.
- **U3 · Info** : `prefers-reduced-motion` à respecter pour les canvases
  d'ambiance (CursorEffect, AmbientCanvas) — un `matchMedia` suffit.

---

## 6. SEO

- ✓ Sitemap **dynamique** depuis la DB (`server/routes/sitemap.js`),
  `robots.txt` correct (admin/project/api exclus), canonical, Open Graph +
  Twitter Card, JSON-LD Person, `usePageMeta` par route, URLs propres.
- **SEO1 · Moyen** : SPA sans SSR/prérendu → les meta par page
  (`usePageMeta`) sont posées **en JS**. Googlebot rend le JS, mais les
  crawlers sociaux (partage d'un chapitre d'écriture sur Discord/Twitter)
  verront le titre/OG **de la home** pour toutes les URLs. Si le partage des
  univers d'écriture compte : injecter les balises côté Express pour ces
  routes (le serveur a déjà les données), ou prérendre.
- **SEO2 · Faible** : `index.html:44` référence `/favicon.ico` qui n'existe
  pas dans `public/` (404 systématique des navigateurs qui le sondent).
  Ajouter un `.ico` ou retirer la ligne.
- **SEO3 · Info** : `og:image` unique (placeholder) pour tout le site —
  prévoir une image par univers d'écriture si SEO1 est traité.
- **SEO4 · Info** : le renderer markdown produit des `<p>` stylés pour les
  titres (`markdown.jsx:151`) au lieu de `<h2>/<h3>` — sémantique Hn perdue
  pour l'indexation des chapitres (et pour les lecteurs d'écran, cf. U1).

---

## 7. Bonnes pratiques

- Aucun `TODO`/`FIXME`/`HACK` dans le code ; aucun `console.log` front ;
  `console.*` serveur = logs opérationnels légitimes (dont logs d'audit).
- Promesses : les fire-and-forget sont systématiquement `.catch(() => {})`
  avec commentaire — assumé. `startDigestScheduler` et le job async WorldEdit
  encapsulent leurs erreurs.
- `TODO_AVANT_MISE_EN_LIGNE.md` : checklist utile mais qui deviendra
  obsolète une fois en ligne — à déplacer dans `docs/` (runbook) après le
  lancement.

---

## 8. Dépendances

- `npm audit` (lockfile) : **0 vulnérabilité**, gate CI bloquante sur high+,
  Dependabot configuré.
- Majors en retard (aucun urgent, tous fonctionnels) :

| Paquet | Actuel | Dernier | Note |
|---|---|---|---|
| react / react-dom | 18.3.1 | 19.x | Migration facile ici (pas de legacy context) ; à faire avec R3F 9 |
| @react-three/fiber / drei | 8.18 / 9.122 | 9.x / 10.x | Couplé à React 19 |
| three | 0.170 | 0.185 | ~15 releases de correctifs/perf WebGL |
| express | 4.22 | 5.x | v4 toujours maintenue — pas d'urgence, migration v5 = travail des handlers async |
| @anthropic-ai/sdk | 0.104 | 0.110 | Mineur ; le modèle vision par défaut (`claude-sonnet-4-6`) est surchargeable via env — bien |

- Recommandation : traiter React 19 + R3F 9 + drei 10 + three ensemble dans
  une branche dédiée (c'est le même graphe de compatibilité).

---

## 9. Tests

- ✓ 13 fichiers `node:test` avec un vrai harnais HTTP (serveur booté, DB
  fraîche, jar de cookies) : sécurité (headers, CORS, RBAC, revocation JWT,
  IDOR commentaires, allowlists upload, validation externalUrl), writing,
  quêtes, contact, analytics, activity, et une couverture **sérieuse** du
  moteur Anvil/WorldEdit (round-trip lossless, biomes, schematics, API).
- **T1 · Moyen** : zéro test front (le seul garde-fou UI est `npm run
  build`). Les plus rentables : le renderer `markdown.jsx` (surface XSS +
  régressions de parsing — pur, trivial à tester avec vitest) et
  `craftPlan.js`/`mapGrid.js` (logique pure).
- **T2 · Faible** : pas de test sur les limiteurs de débit (le SqliteStore a
  une sémantique de fenêtre maison — `_windowEnd` arrondit au plafond — qui
  mériterait un test gelé dans le temps).
- **T3 · Info** : pas de couverture mesurée — `node --test
  --experimental-test-coverage` suffirait pour un chiffre en CI.

---

## 10. DevOps

| Réf | Gravité | Constat | Proposition |
|---|---|---|---|
| D1 | **Élevé** | = S1 : `setup.sh` casse au build | cf. S1 |
| D2 | Moyen | **Sauvegardes uniquement locales** (`/var/backups/titisite` sur le même disque que les données) : une panne disque/compromission du VPS emporte données **et** backups | `rclone` vers un stockage objet (Scaleway/OVH/S3) à la fin de `backup.sh` + test de restauration documenté |
| D3 | Moyen | = P4 : `max_memory_restart 512M` vs opérations à 512 Mo | Monter la limite, ou instrumenter la mémoire |
| D4 | Faible | Logs PM2 sans rotation (`/var/log/titisite/*.log` grossissent indéfiniment) | `pm2 install pm2-logrotate` (ou logrotate système) dans `setup.sh` |
| D5 | Faible | Aucun monitoring/alerte : un crash-loop PM2 (10 restarts max puis arrêt !) passe inaperçu jusqu'à la visite suivante | Sonde externe sur `/api/health` (UptimeRobot gratuit) + alerte mail |
| D6 | Faible | Semgrep en `continue-on-error: true` « le temps de poser la baseline » — état permanent par défaut | Passer bloquant après triage de la première exécution |
| D7 | Info | nginx : `listen 443 ssl http2` (syntaxe dépréciée → `http2 on;`) ; `proxy_set_header Connection 'upgrade'` inconditionnel sur `location /` désactive le keep-alive amont (utiliser le `map $http_upgrade` classique) | Moderniser à la prochaine édition |
| D8 | Info | Déploiement = SSH manuel (`deploy.sh`) — assumé et bien fait (rollback sur health-check ✓) | Optionnel : workflow GitHub Actions qui SSH + lance `deploy.sh` sur tag |

---

## 11. Documentation

- ✓ README complet, CLAUDE.md remarquable (conventions, pièges connus,
  « where to add things »), CHANGELOG tenu, `docs/` techniques
  (worldedit, carte-3d, quêtes) avec invariants et schémas de données,
  `.env.example` exhaustif et commenté, checklist de mise en ligne.
- Manque mineur : pas de doc API consolidée (les routes sont documentées
  dans le code) — acceptable pour une API privée ; un tableau des endpoints
  publics (audio, images, ecriture, sitemap, contact, partages) dans le
  README aiderait les audits futurs.

---

## 12. Tableau récapitulatif des problèmes (du plus critique au moins)

| # | Gravité | Catégorie | Fichier | Ligne | Description | Solution |
|---|---|---|---|---|---|---|
| S1/D1 | Élevé | DevOps | `deploy/setup.sh` | 61 | `npm ci --omit=dev` avant `npm run build` → installation initiale impossible | `--include=dev` + build + `npm prune --omit=dev` |
| S2 | Moyen | Sécurité/CI | `.github/workflows/security.yml` | 142 | Secret prod potentiellement injecté dans les tests CI | Valeur de test en dur |
| S3 | Moyen | Sécurité | `server/routes/auth.js` | 18 | Pas de 2FA sur les comptes admin | TOTP (otplib) |
| S4 | Moyen | Sécurité | `deploy/nginx.conf` | 53 | Tokens cockpit/partage loggés dans access.log | Blocs `access_log off` dédiés |
| S5 | Moyen | RGPD/Perf | `index.html` | 46-51 | Google Fonts tierces (IP → Google) | Auto-héberger (@fontsource) + resserrer la CSP |
| D2 | Moyen | DevOps | `deploy/backup.sh` | — | Backups sur le même disque que les données | Copie off-site (rclone) |
| P4/D3 | Moyen | Perf/Robustesse | `deploy/ecosystem.config.cjs` | 36 | `max_memory_restart 512M` < pics légitimes (imports 512 Mo) | Monter à 1G |
| U1 | Moyen | UX/A11y | `src/components/**` | — | ARIA/labels/focus très clairsemés | Passe a11y sur site public + modales |
| SEO1 | Moyen | SEO | `src/hooks/usePageMeta.js` | — | Meta OG par page invisibles des crawlers sociaux (SPA) | Injection serveur pour /projets/ecriture/* |
| T1 | Moyen | Tests | — | — | Zéro test front (markdown.jsx notamment) | vitest sur les modules purs |
| P1 | Faible | Perf | `server/routes/auth.js` | 23 | bcrypt synchrone bloque l'event loop | API promesse |
| P2 | Faible | Perf | `server/routes/blueprints.js` | 143, 213-271 | fs/zlib synchrones sur gros buffers | fs.promises + zlib async |
| S6 | Faible | Sécurité | `server/routes/analytics.js` | 10 | JWT_SECRET réutilisé comme sel | ANALYTICS_SALT dédié |
| S7 | Faible | Sécurité | `server/index.js` | 136 | Pas de limite de login par compte (brute-force distribué) | Compteur par email |
| S8 | Faible | Sécurité | `server/uploads.js` | 94 | Pas de vérification magic-bytes | `file-type` post-upload |
| S9 | Faible | Sécurité | `server/users.js` | 71-117 | Tokens stockés en clair, lookup non constant-time | Stocker sha256(token) |
| S10 | Faible | Sécurité | `server/routes/users.js` | 19 | Emails de tous les comptes visibles des membres | Projection réduite pour `member` |
| S11 | Faible | Sécurité | `server/routes/worldedit.js` | 39 | Presse-papiers mémoire non bornés en octets | Cap volumétrique |
| Q3 | Faible | Robustesse | `server/routes/tracks.js` | 36 | `reorder` sans validation du body | `Array.isArray` |
| Q4 | Faible | Robustesse | `server/routes/documents.js` | 54 | title/notes non typés → 500 | Vérifier `typeof` |
| S12 | Faible | Sécurité | `server/index.js` | 71 | XFO SAMEORIGIN vs CSP frame-ancestors 'none' | `xFrameOptions: deny` |
| SEO2 | Faible | SEO | `index.html` | 44 | `/favicon.ico` référencé mais absent | Ajouter le fichier |
| D4 | Faible | DevOps | `deploy/setup.sh` | — | Pas de rotation des logs PM2 | pm2-logrotate |
| D5 | Faible | DevOps | — | — | Pas de monitoring `/api/health` | Sonde externe |
| D6 | Faible | CI | `security.yml` | 100 | Semgrep jamais bloquant | Passer à bloquant |
| Q1 | Faible | Qualité | `server/db.js` | 18 | `migrate()` ~1030 lignes | Découper par domaine |
| Q2 | Faible | Qualité | `server/seed-bass-program.js` | — | Script one-shot orphelin | Déplacer/supprimer |
| SEO4 | Info | SEO/A11y | `src/components/writing/markdown.jsx` | 151 | Titres rendus en `<p>` stylés | Vraies balises h2/h3 |
| D7 | Info | DevOps | `deploy/nginx.conf` | 15, 130 | Syntaxe http2 dépréciée ; Connection upgrade inconditionnel | Moderniser |
| Q5 | Info | Style | — | — | Commentaires FR/EN mélangés | Uniformiser |
| U3 | Info | UX | `src/components/ambient/*` | — | `prefers-reduced-motion` ignoré | matchMedia |

---

## 13. Quick wins (< 30 min chacun)

1. **Corriger `setup.sh`** (S1) — 3 lignes.
2. **Durcir `security.yml`** (S2) — 1 ligne.
3. Blocs nginx `access_log off` pour cockpit/partages (S4) — copier-coller du bloc iCal.
4. `xFrameOptions: { action: 'deny' }` dans helmet (S12).
5. Valider `Array.isArray(req.body.order)` dans `tracks.js` (Q3) et typer title/notes dans `documents.js` (Q4).
6. Ajouter `favicon.ico` (SEO2).
7. `ANALYTICS_SALT` dérivé du JWT_SECRET (S6) — rétrocompatible.
8. `pm2 install pm2-logrotate` + sonde UptimeRobot (D4, D5).
9. `max_memory_restart: '1G'` (P4).
10. Projection réduite de `GET /api/users` pour les membres (S10).
11. bcrypt async sur le login (P1) — changement mécanique.
12. Déplacer `seed-bass-program.js` dans `scripts/` (Q2).

## 14. Refactorings recommandés

1. **Auto-hébergement des polices** (@fontsource) + suppression des domaines Google de la CSP (S5) — gain RGPD + perf + CSP.
2. **Découpage de `db.js#migrate`** par domaine (Q1) — réduit le risque de conflit à chaque nouvelle feature (c'est le fichier le plus modifié du dépôt).
3. **I/O async dans blueprints/worldedit** (P2) — au fil de l'eau, handler par handler.
4. **nginx sert `dist/`** + suppression de `compression()` (P3).
5. **Hash des tokens au repos** (S9) — migration douce : colonne `*_token_hash`, double lookup pendant la transition, rotation forcée ensuite.
6. **Titres sémantiques dans le renderer markdown** (SEO4/U1).

## 15. Dette technique identifiée

- Migration React 19 / R3F 9 / drei 10 / three 0.185 à planifier (bloc cohérent).
- Express 4 → 5 : non urgent, à décider (v4 maintenue).
- `TODO_AVANT_MISE_EN_LIGNE.md` à convertir en runbook post-lancement.
- Absence de tests front — la dette grossit à chaque composant.
- Baseline Semgrep jamais triée (D6).
- Legacy `share_token` sur `minecraft_blueprints` coexiste avec `blueprint_shares` (commenté comme legacy) — planifier la fusion.

## 16. Priorités

**1. À corriger immédiatement**
- S1/D1 (setup.sh cassé), S2 (secret CI), S4 (tokens dans les logs), D2 (backups off-site).

**2. Cette semaine**
- S3 (2FA admin), S5 (fonts), P4/D3 (limite mémoire PM2), D4/D5 (logrotate + monitoring), quick wins §13 restants.

**3. Ce mois-ci**
- P1/P2 (async), S7/S8/S9/S10/S11, T1 (tests front), U1 (passe a11y), SEO1 (meta serveur pour l'écriture), Q1 (découpage migrate), D6 (Semgrep bloquant).

**4. Plus tard**
- Migration React 19 + écosystème three ; Express 5 ; SEO3/SEO4 ; srcset images (P6) ; fusion share_token legacy.

## 17. Suggestions complémentaires

- **Observabilité** : un middleware de log structuré (pino + pino-http) avec
  redaction des URLs à token remplacerait avantageusement les `console.log`
  épars et préparerait D5.
- **Expérience développeur** : ajouter `npm run lint` (règles non-sécurité :
  imports inutilisés, vars mortes) — le config actuel est volontairement
  sécurité-only, un second bloc `@eslint/js` recommended comblerait.
- **DB** : un `PRAGMA optimize` au shutdown et `busy_timeout` explicite
  éviteraient les rares `SQLITE_BUSY` pendant le backup à chaud.
- **CSP** : après S5, la CSP peut devenir `styleSrc 'self' 'unsafe-inline'`
  sans domaine externe ; l'étape suivante (retirer `unsafe-inline`) demande
  de sortir les `style={}` critiques — non prioritaire.
- **Uploads** : envisager un scan ClamAV (clamd local) sur les documents
  partagés entre membres si le cercle s'élargit.
- **iCal/cockpit** : documenter dans le dashboard que le lien contient un
  secret (l'UI de rotation existe déjà — bien).
