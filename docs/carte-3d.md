# Carte du monde voxel (espace Écriture)

Petit monde interactif inspiré de Minecraft / Tiny Glade, affiché sur la page
publique d'un univers (`/projets/ecriture/:project`). Le terrain est un
diorama **voxel multi-biomes** entièrement piloté par données ; les zones
cliquables (bâtiments) représentent les livres, personnages, termes du lexique
ou des lieux libres. La carte n'apparaît **que si l'univers a au moins une
zone** configurée dans l'admin — sinon la page reste inchangée.

## Deux modes d'affichage

- **3D** : monde isométrique voxel (three.js + react-three-fiber), rotation /
  zoom, survol (halo + aperçu), clic (zoom cinématique + panneau latéral),
  bascule **jour / nuit** (transition douce type lever de soleil), brume au
  sol, lucioles, eau scintillante animée, étoiles la nuit.
- **2D** : carte type « carte de Minecraft », **générée automatiquement depuis
  les mêmes grilles que la 3D** (`terrain.js` est sans three.js) : canvas
  pixelisé avec ombrage de relief NW, marqueurs DOM cliquables, aperçu au
  survol, mêmes panneau/recherche/filtres. Chargement instantané — le chunk
  three.js n'est jamais téléchargé dans ce mode. Choix persisté en
  `localStorage`.

## Stack

- `three` + `@react-three/fiber` (rendu) + `@react-three/drei`. React 18 →
  fiber v8 / drei v9 (ne pas monter en v9/v10 sans passer à React 19).
- Tout le code three.js vit derrière `React.lazy(() => import('./Scene'))` :
  le chunk (~236 kB gzip) n'est chargé que lorsque la carte 3D approche du
  viewport (IntersectionObserver, marge 300 px).
- Performance : terrain entier = **1 draw call** (géométrie fusionnée à
  couleurs par sommet), décor fusionné = 1, chaque bâtiment = 2 (solide +
  parties émissives). Qualité auto (mobile / ≤ 4 cœurs : moins de
  particules/étoiles, DPR plafonné).

## Modèle de données

- `writing_projects.map_biome` — biome de base (allowlist : `plaines`,
  `foret`, `montagne`, `desert`, `marais`, `toundra`, `neige`, `ocean`,
  `volcan`).
- `writing_projects.map_terrain` — **JSON de terrain** libre (voir schéma),
  stocké tel quel (≤ 120 Ko), normalisé/clampé par le moteur client. Ajouter
  montagnes, rivières ou biomes ne touche jamais le code.
- Table `writing_map_zones` (scopée par `project_id`) :
  - `kind` : `work` / `character` / `glossary` (zone **liée** — contenu résolu
    depuis l'entité à la lecture, les champs propres non vides surchargent) ou
    `libre`.
  - `x`, `z` (±40, selon la taille de carte), `scale`, `rotation`, `building` (14 types dont le set
    coréen `pagode`, `hanok`, `pavillon`, `porte`), `content` (Markdown maison,
    tokens `[[perso:…]]` / `{{kr:…}}`).
  - `connections` : `[{ "to": id, "style": "route" | "arc" }]` (les anciens
    ids nus sont normalisés en routes). **route** = chemin creusé dans le
    terrain, pont en planches au-dessus de l'eau, pulse lumineux qui parcourt
    la route quand une extrémité est survolée/sélectionnée ; **arc** = ligne
    lumineuse pointillée animée.

## Éditer le monde

Trois façons, de la plus simple à la plus fine :

1. **Pinceau (admin, sans JSON)** — onglet Carte 3D → « Terrain du monde » →
   **Pinceau** : on peint directement sur la carte 2D (élever, abaisser, eau,
   biome, taille de pinceau). Le dessin est sauvé dans `mapTerrain.grid`
   (grilles explicites compactes, ~9 Ko en 64×64) et **remplace** le relief
   généré ; plages, plateaux de zones et routes restent automatiques.
   « Régénérer le relief » repart de la forme/taille choisie, « Supprimer le
   dessin » revient au généré.
2. **Forme & taille** — sélecteurs dans le même panneau : `ile` (ronde),
   `continent` (côtes irrégulières), `carre` ; tailles 40/48/64/80 blocs
   (32–88 en JSON). Caméra, brouillard et densité de décor s'adaptent.
3. **JSON avancé** — onglet « JSON avancé », pour les rivières/régions
   paramétriques et les biomes personnalisés (schéma ci-dessous).

## Schéma du terrain JSON

```json
{
  "seed": 7,
  "shape": "ile",
  "size": 48,
  "waterLevel": 1,
  "waterColor": "#1d4e6e",
  "baseBiome": "plaines",
  "regions":  [{ "biome": "montagne", "cx": 10, "cz": -10, "r": 8, "height": 6, "relief": 3 }],
  "rivers":   [{ "points": [[10, -18], [0, 2], [-6, 20]], "width": 1.4 }],
  "lakes":    [{ "cx": -12, "cz": 8, "r": 4 }],
  "forests":  [{ "cx": -8, "cz": -6, "r": 7, "density": 0.3 }],
  "paths":    [{ "points": [[0, 0], [8, 4]] }],
  "biomes":   { "cendre": { "top": "#6a5560", "side": "#4a3a44", "decor": "rocher", "density": 0.08 } }
}
```

- `regions` élèvent le relief (collines/montagnes/vallées par contraste) et
  attribuent le biome là où leur poids gagne ; `relief` ajoute du bruit.
- `rivers`/`lakes` creusent sous le niveau d'eau avec berges douces ;
  les plages de sable apparaissent automatiquement au contact de l'eau.
- `biomes` déclare des **biomes personnalisés par projet** (fusionnés sur les
  presets) — décors possibles : `herbe`, `fleurs`, `arbre`, `sapin`,
  `cactus`, `rocher`, `roseau`, `palmier`, `bambou`, `none`.
- Tout est clampé par `presets.js#normalizeTerrain` ; un JSON vide donne une
  île simple du biome de base.
- Champ optionnel `grid` (écrit par le pinceau) : `{ size, heights: [lignes
  hex 0..c], biomes: { palette, cells } }` — quand il est présent, il remplace
  la génération (`regions`/`rivers`/`lakes` sont ignorés).
- Attention au winding : tout quad passe par `voxel.js#GeoBuffer.quad`, qui
  émet les triangles en sens anti-horaire (les listes de coins sont décrites
  en horaire) — inverser l'un sans l'autre fait disparaître les faces
  (backface culling).

## API

- Public : `GET /api/ecriture/:project` → `map: { biome, terrain, zones }`
  (zones résolues, brouillons exclus, stats chapitres/mots/minutes).
- Admin : `GET|POST /api/writing/projects/:id/map-zones`,
  `PUT|DELETE /api/writing/map-zones/:id` ; biome + terrain via
  `PUT /api/writing/projects/:id` (`mapBiome`, `mapTerrain`). Côté client :
  `api.writing.mapZonesFor(projectId)`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `map/presets.js` | Biomes, ambiances jour/nuit, bâtiments, normalisation du terrain — **allowlists miroir de `server/routes/writing-admin.js`** |
| `map/terrain.js` | Moteur de grilles (hauteurs, biomes, eau, routes, ponts, plages) — sans three.js, partagé 3D/2D |
| `map/voxel.js` | Constructeurs de géométrie fusionnée (terrain, décor, blueprints) |
| `map/blueprints.js` | Bâtiments = listes de boîtes (données) ; le set coréen reproduit les builds Minecraft fournis |
| `map/buildings.jsx` | Rendu d'un blueprint (mesh solide + mesh émissif accent) |
| `map/VoxelTerrain.jsx` | Meshes terrain/décor + eau animée (texture scintillante défilante) |
| `map/Scene.jsx` | Canvas, atmosphère jour/nuit, drag des zones sur le relief (point d'entrée lazy) |
| `map/ZoneMarker.jsx` | Zone cliquable : socle, halo, pulse au clic, label + carte d'aperçu |
| `map/CameraRig.jsx` | Intro caméra (sautée si `prefers-reduced-motion`) + recentrage sur sélection |
| `map/effects.jsx` | Lucioles, brume au sol, arcs lumineux + pulses de routes |
| `map/Map2D.jsx` | Vue 2D auto-générée (canvas pixelisé + marqueurs DOM) |
| `map/WorldMap.jsx` | Wrapper public : modes 2D/3D, lazy-mount, recherche/filtres/sélection |
| `map/MapHud.jsx` | Recherche, filtres, bascules 2D/3D et jour/nuit, stats |
| `map/ZonePanel.jsx` | Panneau latéral de détail (Markdown maison, stats, CTA) |
| `admin/editors/writing/TerrainPainter.jsx` | Pinceau 2D : élever/abaisser/eau/biome, forme & taille, sauvegarde en couche `grid` |
| `admin/editors/writing/MapEditor.jsx` | Onglet admin : biome, terrain (pinceau + JSON, aperçu live), drag & drop sur le relief, connexions typées |

## Accessibilité / SEO

- Fallback lecteur d'écran/clavier : liste `<nav>` masquée exposant chaque
  zone en `<button>` ; en 2D les marqueurs sont déjà des boutons DOM.
- Les listes classiques de la page (Contenu / Personnages / Lexique) restent
  sous la carte — le SEO ne dépend ni du WebGL ni du canvas.

## Ajouter… sans toucher au moteur

- **Un biome** : entrée `biomes` du terrain JSON (par projet) ou preset dans
  `presets.js#BIOMES` (+ allowlist serveur si utilisé comme biome de base).
- **Un bâtiment** : nouvelle liste de boîtes dans `blueprints.js`
  (`BLUEPRINTS` + `BUILDING_HEIGHT`) + clé dans l'allowlist serveur. Pour
  reproduire une capture d'écran : décomposer le build en boîtes
  (murs/toits/piliers) comme le set coréen.
- **Une région / rivière / route / connexion / zone** : via l'admin
  uniquement (terrain JSON + drag & drop), zéro code.
