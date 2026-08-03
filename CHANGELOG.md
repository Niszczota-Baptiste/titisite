# Changelog

All notable changes to titisite are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — lore-nostra-module

### Lore « Nostra » — salle d'enquête collaborative (`/lore`)
- **Module global** gated par le tag `users.can_view_lore` (lecture ET
  écriture, admins outre) : documenter le lore de la map Minefield, le
  géolocaliser, le relier, et faire vivre des hypothèses **confirmables ou
  réfutables** — les pistes mortes restent consultables avec la raison de
  l'abandon, jamais supprimées ni masquées définitivement.
- **Entrées** : slug stable, coords nullables, dimension, canon/interprétation,
  tags libres colorés, relations orientées, images (WebP + miniature, servies
  UNIQUEMENT derrière le gate — un faux PNG est rejeté au décodage), snapshots
  du corps à chaque save, recherche **FTS5** (première du repo), commentaires
  via la table globale. Markdown maison XSS-safe avec liens internes
  `[[Titre d'entrée]]` autocomplétés ; le champ coordonnées avale le collage F3.
- **Carte** : render calibré par deux points de référence, formes par type,
  mode **origine** (rose des vents 8 axes, relèvements servis par
  `/api/lore/geo/ring` — nord = Z décroissant, verrouillé par tests, aucune
  trigo côté client), alignements ±2° surlignés + table triée par angle,
  mesure de distance, création d'entrée pré-remplie au clic, **tracés**
  persistants entre points (`lore_shapes`), miniature au survol.
- **Hypothèses** : kanban par statut (pistes mortes repliées par défaut,
  dépliées en un clic), confiance 0-100, deux colonnes de preuves — une
  observation a UNE position par hypothèse (soutient/contredit/neutre) mais
  peut différer d'une hypothèse à l'autre ; clore en confirmed/refuted/
  abandoned **exige la note de résolution** (API + UI).
- **Vue graphe** (simulation de forces maison, zéro dépendance), **timeline**
  (découvertes + résolutions intercalées), **export JSON** complet et
  **dossier imprimable** (palette papier, `@media print`).
- Seed = les vraies données relevées (KotaNostra, 21 bâtiments, 9 tours,
  5 Poèmes de Jade, 7 hypothèses dont 4 réfutées — le comportement voulu).
  Docs : `docs/lore.md` + `README-lore.md`. ~70 tests dédiés.

---

## [Unreleased] — quetes-items-uniques-geodes

### Quêtes — catalogue d'items uniques, contenants aléatoires, crafts & achats
- **Catalogue d'items uniques** : `quest_custom_items` est promue en entité de
  premier plan (slug, lore, rareté, catégorie, faction d'origine, prix + monnaie,
  ouvrable, tags). **Extension en place** et non table parallèle : aucun id ne
  bouge, les `ref_code = 'custom:<id>'` déjà écrits dans les quêtes continuent de
  résoudre, et les items existants héritent d'un slug au premier boot. Un item se
  crée **sans aucune quête**.
- **Échelle de rareté** (`unique_item_rarities`) ordonnée et éditable en ligne —
  une table, pas un enum : de nouveaux paliers apparaissent en jeu.
- **Contenants ouvrables** (`loot_entries`) : table de butin par géode, résultat
  = item unique (FK) / item du codex / PA / réputation / texte libre, fourchette
  de quantité, probabilité et **provenance** de cette probabilité (officielle /
  estimée / observée). La somme n'est jamais contrainte : elle est signalée, et
  un reliquat « rien / commun » est proposé en un clic.
- **« Vendre ou ouvrir ? »** : espérance d'une ouverture comparée au prix de
  revente, verdict lisible et détail du calcul dépliable. Deux règles
  d'honnêteté — un résultat sans prix est exclu (sa part est affichée) au lieu
  d'être compté zéro, et aucun taux de change n'est inventé entre monnaies.
- **Journal d'ouvertures** (`loot_observations`) : taux empiriques avec
  intervalle de Wilson à 95 %, affichés à côté des probabilités déclarées, plus
  l'alerte « obtenu en jeu mais absent de la table ». Seule écriture ouverte aux
  simples lecteurs de quêtes.
- **Récompenses aléatoires de quête** : une récolte peut ne rien donner, ou n
  objets. Mêmes % de chance, mêmes fourchettes et même provenance de probabilité
  que les tables de butin, mais portés par la ligne de récompense —
  `probabilite` NULL = récompense garantie, le comportement historique. La fiche
  sépare « garanties » et « 🎲 tirage aléatoire », vérifie la somme et donne le
  gain moyen du tirage. Les **gains potentiels sont désormais pondérés** par la
  probabilité (une prime à 3 % ne compte plus pour sa valeur pleine).
- **Familles de quêtes** (`quests.categorie`) : récolte / craft / achat / PvP /
  autre, avec facette et sections dédiées dans la liste.
- **Quêtes de craft** : grille 3×3, poste de craft, maîtrise requise,
  pré-remplissage depuis le référentiel de recettes du serveur. Les ingrédients
  restent des `quest_inputs` → « Où trouver dans les coffres » et le flux cockpit
  marchent d'emblée sur les crafts.
- **Quêtes d'achat** (`quest_offers`) : plusieurs offres par quête, payables en
  PA **ou en items** (les monnaies sont des items uniques), lisibles en une ligne
  « 12 × Écaille du devin → Botte de célérité », avec stock, limite et point de
  carte.
- **« Où trouver quoi »** : pour chaque objet, toutes les sources — récompense de
  quête, contenu de contenant (avec probabilité), résultat de craft, offre
  d'achat, source manuelle — **et l'inverse** (« à quoi ça sert »). Tout est
  dérivé des relations existantes, rien n'est ressaisi ; filtre « sans source
  connue » pour repérer les trous de documentation.
- Fiche d'objet au rendu de l'infobulle en jeu (lore violet, nom coloré par la
  rareté, id namespacé), réutilisée en aperçu direct dans l'éditeur.
- Seed : les 5 raretés et les 3 géodes relevées en jeu, idempotent **par ligne**
  (donc applicable à une base déjà remplie), tables de butin laissées vides.
  `SEED_UNIQUE_ITEMS=off` pour ne rien insérer.
- Validation serveur systématique (bornes, `min ≤ max`, FK, énumérations) et
  **refus des cycles** contenant → contenu, directs comme indirects.

## [Unreleased] — audit-corrections-nouvelles-fonctionnalites

### Espace projet — Minecraft (coffres + codex + lecture IA)
- Onglet « ⛏️ Minecraft » par workspace (flag `is_minecraft`) : l'inventaire
  (`minecraft_resources`) est désormais organisable en **coffres**
  (`minecraft_chests` : nom, monde, X/Y/Z, note ; `chest_id` sur les ressources,
  `ON DELETE SET NULL` → les items d'un coffre supprimé repassent en
  « Non rangé »). Vue « Par coffre » (panneaux repliables) ou « Tout ».
- **Codex d'icônes** bundlé dans `public/codex/` : items/blocs custom du serveur
  Minefield (≈2000) + vanilla 1.18.2 (778), avec vraies textures
  (`image-rendering: pixelated`) dans le picker et les cartes, repli emoji.
  Crédit discret « Objets et textures © serveur Minefield ».
- **Mise à jour d'un coffre depuis un screenshot** (hybride) :
  `POST …/minecraft/scan-screenshot` envoie l'image à Claude
  (`@anthropic-ai/sdk`, sortie structurée) → brouillon items + quantités à
  valider, puis `POST …/minecraft/chests/:id/apply` (`replace`|`merge`). Actif si
  `ANTHROPIC_API_KEY` est défini (modèle via `MINECRAFT_VISION_MODEL`, défaut
  `claude-sonnet-4-6`) ; sinon repli sur la saisie manuelle, screenshot en
  référence. Upload en mémoire (jamais persisté).

### Security / Ops (LOT 1)
- `concurrently` passé en ^10 (CVE critique shell-quote) — `npm audit` à zéro.
- Arrêt gracieux SIGTERM/SIGINT (`server.close()` + force-exit 30 s) — les
  reloads PM2 ne coupent plus les requêtes en vol.
- `deploy/deploy.sh` : health-check `/api/health` après reload et **rollback
  automatique** vers le commit précédent (reset + rebuild + reload) en cas
  d'échec.
- Sauvegardes : `deploy/backup.sh` (`sqlite3 .backup` + tar.gz des uploads
  vers `/var/backups/titisite/`, rétention 14 jours) + unité/timer systemd.
- `Cache-Control: public, max-age=31536000, immutable` sur `/api/images/:f`
  et `/api/audio/:f` (noms UUID immuables).
- Analytics : fail-fast si `JWT_SECRET` absent (suppression du salt de repli
  public) + purge au boot des beacons de plus de 180 jours.
- `SALT_ROUNDS` centralisé dans `server/users.js`.
- Nginx : logs d'erreur neutralisés sur `/api/calendar/`,
  `client_max_body_size` 10M par défaut et relevé uniquement par location
  d'upload (builds 1200M, audio 120M, documents 60M, images 50M).
- CI : workflow `build.yml` (lint sécurité + build + tests sur PR et main).

### Frontend / SEO (LOT 2)
- `ErrorBoundary` au root avec fallback stylé.
- `index.html` : canonical, `og:image`/`twitter:image` (placeholder généré
  `public/og-image.jpg`), JSON-LD `Person`.
- Sitemap dynamique `GET /sitemap.xml` (DB : projets portfolio + univers et
  œuvres d'écriture publiés) — `public/sitemap.xml` supprimé.
- Hook `usePageMeta` : titre/description/canonical par route (Public, Photos,
  fiches projet, pages écriture).
- Chunks Vite dédiés `three` (≈ 853 kB, chargé uniquement avec la carte 3D)
  et `react` ; `dispose()` des géométries/textures du terrain voxel.
- A11y : focus-trap dans la `Modal` partagée, `type="button"` sur 126 boutons
  non-submit, `prefers-reduced-motion` + pause sur `visibilitychange` pour
  `AmbientCanvas`/`CursorEffect`.

### Added
- **Formulaire de contact réel** (LOT 3) : table `contact_messages`,
  `POST /api/contact` public (validation, honeypot, rate-limit 5/min/IP,
  notification SMTP best-effort), onglet « Messages » dans l'admin, états
  d'envoi côté section Contact avec mailto en secours, chaînes fr/en/ko.
- **Player musique persistant** (LOT 4) : `MusicPlayerContext` global +
  mini-player flottant qui survit aux changements de route (extrait 30 s
  conservé) ; masqué sur /admin et dans le reader (qui met le clip en pause
  au profit de `ReaderAudio`).
- **Confort de lecture** (LOT 5) : reprise de lecture (position mémorisée par
  œuvre + bandeau « Reprendre au chapitre X ? »), navigation chapitre
  précédent/suivant avec indicateur « chapitre X/N », panneau de réglages
  (taille de police S/M/L, largeur, thème sombre/sépia) persisté.
- **Badges nouveautés workspace** (LOT 6) : `last_seen_at` par membre,
  `GET /api/workspaces/:slug/activity-count`, badges sur les onglets et les
  cartes projets.
- **Autosave** (LOT 6) : brouillons localStorage (débounce 5 s) pour le texte
  des chapitres et les descriptions de features, avec « Restaurer le
  brouillon » si plus récent que la version serveur.

---

## [Précédent] — hierarchie-monde-cite

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
