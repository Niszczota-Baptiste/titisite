# Carte du monde 3D (espace Écriture)

Carte interactive isométrique low-poly affichée sur la page publique d'un
univers (`/projets/ecriture/:project`). Chaque univers possède sa propre île ;
les zones cliquables y représentent ses livres, personnages, termes du lexique
ou des lieux libres. La carte n'apparaît **que si l'univers a au moins une
zone** configurée dans l'admin — sinon la page reste inchangée.

## Stack

- `three` + `@react-three/fiber` (rendu) + `@react-three/drei` (OrbitControls,
  Html, Line, Stars). React 18 → fiber v8 / drei v9 (ne pas monter en v9/v10
  sans passer à React 19).
- Tout le code three.js vit derrière `React.lazy(() => import('./Scene'))` :
  le chunk (~233 kB gzip) n'est chargé que lorsque la carte approche du
  viewport (IntersectionObserver, marge 300 px). Le bundle principal ne
  contient aucune dépendance 3D.

## Modèle de données

- `writing_projects.map_biome` — preset de terrain (`plaines | foret | desert |
  ocean | neige | volcan`), éditable dans l'onglet admin **Carte 3D**.
- Table `writing_map_zones` (scopée par `project_id`, `ON DELETE CASCADE`) :
  - `kind` : `work` / `character` / `glossary` (zone **liée** — titre,
    description, couverture, tags, lien et stats sont résolus depuis l'entité
    cible à la lecture, zéro double saisie) ou `libre` (tous les champs lui
    appartiennent). Les champs propres non vides **surchargent** toujours les
    valeurs héritées.
  - `x`, `z` (clampés à ±20), `scale`, `rotation`, `building` (10 types
    low-poly), `connections` (JSON d'ids de zones du même projet → arcs
    lumineux), `content` (Markdown maison, tokens `[[perso:…]]` / `{{kr:…}}`
    inclus).
- Une zone publique dont la cible est dépubliée/supprimée disparaît de la
  carte (filtrée dans `projectMap`), et ses connexions sont élaguées.

## API

- Public : le payload de `GET /api/ecriture/:project` contient
  `map: { biome, zones }` (zones résolues, brouillons exclus, stats
  chapitres/mots/minutes calculées).
- Admin (cookie admin requis) :
  `GET|POST /api/writing/projects/:id/map-zones`,
  `PUT|DELETE /api/writing/map-zones/:id`, biome via
  `PUT /api/writing/projects/:id` (`mapBiome`). Côté client :
  `api.writing.mapZonesFor(projectId)`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/components/writing/map/presets.js` | Biomes, bâtiments, rayon, PRNG — **allowlists miroir de `server/routes/writing-admin.js`** |
| `src/components/writing/map/Scene.jsx` | Canvas + composition de la scène (point d'entrée lazy, mode `editable` pour l'admin) |
| `src/components/writing/map/Terrain.jsx` | Île déformée, eau/lave, décor procédural déterministe (seed = id du projet) |
| `src/components/writing/map/buildings.jsx` | 10 bâtiments en primitives three, parties émissives à la couleur d'accent |
| `src/components/writing/map/ZoneMarker.jsx` | Zone cliquable : halo au survol, pulse au clic, label + carte d'aperçu (drei Html) |
| `src/components/writing/map/CameraRig.jsx` | Animation d'intro (sautée si `prefers-reduced-motion`) + recentrage doux sur la zone sélectionnée |
| `src/components/writing/map/effects.jsx` | Lucioles (Points) et arcs de connexion animés (Line pointillée) |
| `src/components/writing/map/WorldMap.jsx` | Wrapper public : lazy-mount, qualité auto, état recherche/filtres/sélection |
| `src/components/writing/map/MapHud.jsx` | Recherche, filtres par catégorie, stats contextuelles |
| `src/components/writing/map/ZonePanel.jsx` | Panneau latéral de détail (Markdown via le renderer maison, CTA interne/externe) |
| `src/components/admin/editors/writing/MapEditor.jsx` | Onglet admin : biome, création, drag & drop 3D (position sauvée au drop), formulaire complet |

## Performance / accessibilité

- Qualité auto : mobile ou ≤ 4 cœurs → moins de particules/étoiles, DPR
  plafonné à 1.5. Contrôles tactiles natifs (OrbitControls).
- Le filtrage recherche/catégorie **estompe** les zones non correspondantes au
  lieu de les démonter (pas de re-création de géométrie).
- Fallback lecteur d'écran/clavier : une liste `<nav>` masquée visuellement
  expose chaque zone en `<button>` (ouvre le même panneau). Les listes
  classiques de la page (Contenu / Personnages / Lexique) restent sous la
  carte — le SEO ne dépend pas du WebGL.

## Ajouter un biome ou un bâtiment

1. `presets.js` : ajouter l'entrée `BIOMES` (couleurs + type de décor) ou
   `BUILDINGS` (label).
2. `buildings.jsx` : pour un bâtiment, écrire le composant en primitives et
   l'enregistrer dans `TYPES` + `BUILDING_HEIGHT` (ancre du label).
3. `server/routes/writing-admin.js` : ajouter la clé à l'allowlist `BIOMES` /
   `BUILDINGS` correspondante.
