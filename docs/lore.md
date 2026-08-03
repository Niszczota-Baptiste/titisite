# Module Lore « Nostra » (`/lore`)

Salle d'enquête collaborative sur le lore de la map Minefield (monde
« Nostra »). Pas un blog, pas un wiki : un **outil d'enquête** — le statut
épistémique de chaque affirmation est visible, et les pistes mortes restent
consultables avec la raison de leur abandon. Voir aussi `README-lore.md`
(installation, tag, API) — ce fichier documente l'architecture.

## Patron

Module **global** sur le modèle des quêtes : gate `users.can_view_lore`
(admins outre, un seul flag = lecture ET écriture — l'outil est collaboratif),
routeur `/api/lore` (`server/routes/lore.js`), helpers `server/lore/*`, front
`src/components/lore/*` + page `src/pages/Lore.jsx` (`/lore`). Entrée de menu :
lien « 🔍 Lore » de l'onglet Minecraft des projets, rendu **uniquement** si
`canViewLore` — les autres comptes ne voient pas que le module existe.

## Données (préfixe `lore_`, dans `db.js#migrate`)

- `lore_entries` — l'unité de base (découverte/observation). Slug unique et
  stable, coords nullables (x/z vont ensemble, y libre), `dimension`,
  `is_canon` (posé par la modération du serveur vs interprétation joueur),
  `discovered_at` nullable.
- `lore_hypotheses` — `status` ∈ open/testing/confirmed/refuted/abandoned,
  `confidence` 0-100, `resolution_note` **exigée par l'API pour tout statut
  terminal** (refuted ET abandoned : la raison d'un abandon est la donnée
  précieuse). Rouvrir efface `resolved_at` mais garde la note.
- `lore_evidence` — le cœur : N-N hypothèse↔entrée avec `stance`
  (supports/contradicts/neutral), **UNIQUE par paire** — une observation peut
  soutenir ici et contredire ailleurs, mais n'a qu'une position par hypothèse.
- `lore_media` — WebP recompressé + miniature 400 px, rattaché à une entrée OU
  une hypothèse (ou ni l'un ni l'autre : fond de carte). Servi UNIQUEMENT par
  `/api/lore/media/file/:f` derrière le gate — jamais en statique (privé).
- `lore_tags` + `lore_entry_tags`, `lore_links` (relations orientées,
  UNIQUE (from, to, type)), `lore_revisions` (snapshot du body_md à chaque
  save, purgé par les delete du store — pas de FK, deux tables cibles).
- `lore_maps` — calibration du render par **deux points de référence** (X des
  coins bas-gauche/bas-droit + Z du bord bas ; Nostra : -5353/4646/-636), la
  hauteur se déduit du ratio naturel de l'image côté client.
- `lore_shapes` — tracés d'enquête (lignes/polygones, sommets JSON [[x,z]],
  2..500, validés serveur).
- `lore_fts` — FTS5 (première du repo), synchronisée **explicitement** dans
  `server/lore/store.js` (pas de triggers) : toute écriture qui contourne le
  store désynchronise la recherche.
- Les commentaires réutilisent la table globale `comments`
  (`target_type = 'lore_entry' | 'lore_hypothesis'`, gate lore dans
  `canAccessTarget`). Les enums sont dans `server/lore/enums.js`, sans CHECK
  SQL (extensibles).

## Géométrie — LA convention à ne pas casser

X croît vers l'est, **Z croît vers le sud** : le nord est **Z décroissant**,
le relèvement est `atan2(dx, -dz)`. Source de vérité unique :
`server/lore/geo.js` (pur, testé dans `test/lore-geo.test.js`) — le front ne
refait AUCUNE trigonométrie, le mode origine de la carte consomme
`GET /api/lore/geo/ring` (tous les points avec cap/distance/écart au plus
proche des 8 axes, triés par angle, alignés à ±tolérance marqués). Les maths
d'affichage de la carte (placement du render, molette, %) sont dans
`src/components/lore/mapMath.js`, testées dans `test/lore-map-math.test.js`.

## Front (`src/components/lore/`)

Onglets de la page : 📖 Entrées (liste + filtres serveur), 🗺 Carte
(`LoreMap` + `MapTab` — pan/molette, formes par type, modes origine avec rose
des vents / mesure / ➕ point → éditeur pré-rempli / ✏️ tracé, aperçu du
screenshot au survol), 🧪 Hypothèses (kanban, pistes mortes repliées par
défaut), 🕸 Graphe (`GraphTab`, simulation de forces maison — pas de
d3-force), 🕰 Timeline, 📤 Export (JSON + `DossierView` imprimable, palette
papier via le flag `print` du renderer markdown).

Markdown : renderer maison XSS-safe dédié (`markdown.jsx` — aucun HTML brut,
pas de dépendance), token `[[Titre d'entrée|Label]]` résolu par titre ou slug,
autocomplétion `[[` dans l'éditeur. Champ coordonnées à parsing intelligent
(`coords.js`, collage F3 accepté, testé dans `test/lore-coords.test.js`).

## Seed

`server/seed-lore.js` — les **vraies données relevées** (KotaNostra, 21
bâtiments, 9 tours à coords nulles, 5 Poèmes de Jade, 7 hypothèses avec leur
statut réel, calibration de la carte). Idempotent (skip dès la première
entrée), `SEED_LORE=off` pour couper. Il passe par le store, donc FTS et
révisions restent cohérents.

## Pour ajouter…

| Ajouter… | …où |
|---|---|
| Un type d'entrée / statut / relation | `server/lore/enums.js` + le méta visuel dans `src/components/lore/theme.js` |
| Un champ d'entrée | colonne dans `db.js#migrate` (bloc lore_), mapper + validation dans `store.js`/`routes/lore.js`, éditeur `EntryEditor` |
| Un onglet | `TABS` dans `src/pages/Lore.jsx` + composant dans `src/components/lore/` |
| Une règle géo | `server/lore/geo.js` + son test — jamais côté client |
