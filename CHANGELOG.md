# Changelog

All notable changes to titisite are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — hierarchie-monde-cite

### Fixed
- La molette sur la carte-monde publique ne fait plus défiler la page (React
  enregistre `wheel` en passif ; listener natif non-passif + preventDefault).

### Changed
- **Zoom + déplacement dans les surfaces d'édition admin** : le board des
  lieux/tracés/territoires et le pinceau de terrain zooment à la molette
  (vers le curseur, jusqu'à ~28× — précision cellule par cellule sur un monde
  1024) avec indicateur de zoom et bouton ⌂ ; déplacement en glissant le fond
  (board) ou via le nouvel outil ✋ Naviguer (pinceau). Les coups de pinceau
  ne repeignent plus que la région touchée (fluide sur les mondes colossaux).

### Added
- **Tracé libre des routes** (deux niveaux de carte) : chaque connexion porte
  des points de passage `via` dessinés à la main — bouton ✏️ dans l'admin,
  clic sur la carte 2D pour ajouter un point, glisser pour déplacer,
  double-clic pour supprimer ; la route creusée (et l'arc lumineux) suivent
  exactement le tracé, en 2D comme en 3D (Catmull-Rom épousant le relief).
- **Territoires** sur la carte-monde : polygone dessiné point par point autour
  d'une capitale/cité (couleur au choix) — zone d'influence teintée +
  frontière pointillée sur l'atlas public et le board admin.
- **Noms géographiques** : marqueur `etiquette` (texte cartographique seul,
  italique) pour nommer monts, fleuves, mers… taille et inclinaison réglables
  (sliders), grossit avec le zoom.
- **Cartes-mondes géantes 2D** (« atlas ») : plusieurs par univers (Surface,
  Profondeurs…), échelle configurable (1 cellule = 8/16/32 blocs, mondes
  jusqu'à ~32 000 blocs de côté), pan + zoom libres (molette/pinch, zoom vers
  le curseur), recherche qui recentre, **POI à marqueurs hiérarchisés**
  (👑 royaume, 🏰 capitale, cité, village, forteresse, temple, port, ruine…)
  avec étiquettes selon importance et niveau de zoom. Clic sur un lieu =
  **plongée cinématique** puis ouverture de sa page de lore.
- **Cartes locales par élément** : chaque cité/région (`writing_works`) porte
  sa propre carte voxel 3D/2D sur sa page de lecture (`map_biome` +
  `map_terrain` par work, zones scopées `work_id`) — l'ancien moteur de carte
  d'univers descend d'un niveau ; admin via l'onglet « Cartes » (cartes-mondes
  + sélecteur d'élément).
- **Biomes Minecraft complets** : ~23 biomes Overworld (tournesols, bouleaux,
  forêt sombre, cerisiers, jungle, taïgas, pics gelés, collines, savane,
  badlands, mangrove, champignons…) + Nether/End (néant, forêts
  pourpre/biscornue, vallée des âmes, basalte, End), avec 7 nouveaux décors
  voxel (bouleau, cerisier, jungle, acacia, champignon, pic de glace, chorus).
- Couche peinte compressée **RLE** (un monde 640×640 ≈ 100 Ko), table
  `writing_worldmaps`, endpoints publics `worldmaps`/`map` et CRUD admin.

## [Unreleased] — carte-voxel-minecraft

### Fixed
- **Rendu 3D cassé sur certaines cartes** : toute la géométrie voxel était
  enroulée en sens horaire — le monde se rendait « retourné » (faces
  extérieures supprimées par le backface culling, parois intérieures
  visibles). Triangles désormais émis en anti-horaire : terrain plein et
  stable sous tous les angles.

### Added
- Biome **forêt de bambous** (`bambou`) : sol vert vif, cannes de bambou
  de hauteurs variées avec touffes de feuilles.
- Décor `fleurs` (têtes rouges/blanches/jaunes) + modèle d'exemple « monde
  forestier » reproduisant une carte Minecraft fournie : carré 64, rivières
  violettes sinueuses, forêt sombre, clairières fleuries, montagne
  seigneuriale (bouton « Insérer le modèle d'exemple » de l'admin).
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
