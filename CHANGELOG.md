# Changelog

All notable changes to titisite are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — carte-voxel-minecraft

### Fixed
- **Rendu 3D cassé sur certaines cartes** : toute la géométrie voxel était
  enroulée en sens horaire — le monde se rendait « retourné » (faces
  extérieures supprimées par le backface culling, parois intérieures
  visibles). Triangles désormais émis en anti-horaire : terrain plein et
  stable sous tous les angles.

### Added
- **Éditeur de terrain au pinceau** (admin, sans JSON) : on peint
  élévation/abaissement, eau et biomes directement sur la carte 2D ; le
  dessin est sauvé en grilles compactes (`mapTerrain.grid`) et remplace le
  relief généré. Boutons régénérer / supprimer le dessin.
- **Formes et tailles de carte** : île ronde, continent aux côtes
  irrégulières, carré ; tailles 40 à 80 blocs (sélecteurs dans l'admin,
  32–88 en JSON). Caméra, brouillard, lucioles et densité de décor
  s'adaptent à la taille.

### Changed
- **Refonte direction artistique de la carte** : moteur **voxel multi-biomes**
  façon Minecraft/diorama. Terrain entièrement piloté par données
  (`writing_projects.map_terrain`, JSON : régions/hauteurs, rivières, lacs,
  forêts, chemins, biomes personnalisés) — éditable dans l'admin avec aperçu
  live, ponts automatiques au-dessus de l'eau, plages générées, 9 biomes de
  base (plaines, forêt, montagne, désert, marais, toundra, neige, océan,
  volcan).
- **Mode 2D** type carte Minecraft, généré automatiquement depuis les mêmes
  grilles que la 3D (canvas pixelisé + marqueurs DOM, zéro three.js, choix
  persisté) + bascule **jour/nuit** en 3D (transition douce).
- **Bâtiments voxel en blueprints** (listes de boîtes, géométrie fusionnée) :
  set coréen d'après les builds Minecraft fournis — pagode, hanok, pavillon
  rouge, porte de pierre aux bambous — + les 10 types historiques revoxelisés.
- **Connexions typées** `{ to, style }` : `route` (chemin creusé + pont +
  pulse lumineux au survol) ou `arc` (ligne lumineuse) ; anciens ids nus
  migrés automatiquement. Effets : brume au sol, eau scintillante animée,
  drag & drop admin ancré au relief.

## [Unreleased] — carte-3d-ecriture

### Added
- **Carte du monde 3D par univers** (espace Écriture) : île isométrique low-poly
  (three.js / react-three-fiber, lazy-loaded), 6 biomes, 10 bâtiments, zones
  cliquables liées aux livres/personnages/lexique (contenu résolu côté serveur,
  zéro double saisie) ou libres. Survol = halo + aperçu ; clic = zoom caméra +
  panneau latéral (Markdown maison, stats chapitres/mots/minutes, CTA).
  Recherche, filtres par catégorie, arcs de connexion entre zones, lucioles,
  animation d'intro (respecte `prefers-reduced-motion`), qualité auto sur
  mobile, fallback clavier/lecteur d'écran. Onglet admin « Carte 3D » avec
  placement **drag & drop directement sur l'île**. Voir `docs/carte-3d.md`.
- Table `writing_map_zones` + colonne `writing_projects.map_biome` ;
  `GET /api/ecriture/:project` expose `map: { biome, zones }` ; CRUD admin
  sous `/api/writing/projects/:id/map-zones`.

---

## [Unreleased] — production-deployment-prep

### Security
- Add `Permissions-Policy` header (camera, microphone, geolocation, payment, usb, interest-cohort all disabled)
- Compression middleware (gzip) added at Express level for all responses

### Performance
- Hashed Vite assets served with `Cache-Control: public, max-age=31536000, immutable`
- `index.html` served with `no-cache, no-store, must-revalidate` so updates are always picked up
- `loading="lazy"` + `decoding="async"` added to all `<img>` tags (About photo, project screenshots)

### SEO / Meta
- `index.html` enriched: Open Graph tags, Twitter Card tags, `theme-color`, `robots`, `author`, favicon `<link>` stubs
- `public/robots.txt` created (disallows `/admin`, `/project`, `/api`)
- `public/sitemap.xml` created (update domain before go-live)

### Documentation
- `README.md`: corrected security section (JWT stored in HttpOnly cookie, not localStorage)
- `README.md`: added missing env vars (`CANONICAL_ORIGIN`, SMTP block)
- `CHANGELOG.md` created (this file)
- `.gitignore`: added `Thumbs.db`, `*.tmp`, `*.bak`, `*.swp`

---

## [1.0.0] — initial release

### Added
- Public portfolio (SPA, FR/EN/KO, dark/light themes)
- Admin dashboard: sections, projects, music, education, experience, currently, workspaces, users
- Project workspace: Kanban, Calendar, Documents, Builds, Meetings, Discussion
- iCal feed export (per-user token, rotatable)
- Email digest (daily/weekly, opt-in)
- JWT auth via HttpOnly cookie, bcrypt passwords, token revocation table
- Rate limiting: global API cap + login brute-force (SQLite-backed) + audio + calendar
- Helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, …)
- Multer uploads with double MIME + extension allowlist validation
- Minecraft resource tracker workspace tab
