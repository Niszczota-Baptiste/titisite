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
  stable, coords nullables (x/z vont ensemble, y libre), `monde`
  (nostra/novum) × `dimension`, `discovered_at` nullable, `peuple_id` pour les
  PNJ. (`is_canon` existe encore en base mais n'est plus exposé dans l'UI :
  tout le contenu est posé par la modération, la distinction n'avait plus de
  sens.)
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
- `lore_maps` — une carte par couple (`monde`, `dimension`). Deux fonds
  possibles, cumulables : les **tuiles** (ci-dessous) et/ou un render global
  calibré par **deux points de référence** (X des coins bas-gauche/bas-droit +
  Z du bord bas ; Nostra overworld : -5353/4646/-636), dont la hauteur se
  déduit du ratio naturel de l'image côté client.
- `lore_map_tiles` — le fond collaboratif : la **grille des cartes Minecraft**,
  sur **deux niveaux de zoom** (`zoom` ∈ `TILE_ZOOMS` = {0, 2}, cf.
  `server/lore/enums.js`), `UNIQUE (map_id, zoom, tile_x, tile_z)`. Au niveau
  `n` une case fait `128·2ⁿ` blocs : **0 = détail** (128×128, la carte de base)
  et **2 = atlas** (512×512, la carte deux crans dézoomée). Un joueur posé en
  (0,0) étant au centre de sa carte, la tuile (i, j) couvre
  `[i·côté-64, i·côté-64+côté)` × idem en Z — **le décalage de -64 est
  l'invariant**, et il vaut aux DEUX niveaux (formule du jeu :
  `i = 128·2ⁿ ; centre = floor((pos+64)/i)·i + i/2 - 64`). Conséquence
  exploitée partout : une case d'atlas contient **exactement 4×4 cases de
  détail**, jamais à cheval — l'empilement des deux couches est un simple
  z-order, sans recalage. Tout ça est testé dans
  `test/lore-map-math.test.js` ; si ces tests tombent, le fond ment.
  Chacun dépose la capture d'une case ; re-déposer **remplace** l'image
  (upsert + suppression de l'ancien fichier) **à son niveau seulement** —
  déposer un atlas n'efface donc jamais le détail déjà posé dessous. Le
  niveau est facultatif à l'upload (absent = 0).
- `lore_peuples` + `lore_dialogues` — les peuples, et les répliques relevées
  des PNJ. Un PNJ **n'est pas** une table à part : c'est une `lore_entries` de
  type `pnj` avec un `peuple_id`, donc il garde coordonnées, images, relations
  et preuves. Un PNJ porte autant de dialogues qu'il en faut, chacun avec un
  `quest_name` libre (étiquette, pas une FK vers le module Quêtes).
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
(`LoreMap` + `MapTab` — onglets **monde** Nostra/Novum × **dimension**,
pan/molette, formes par type, modes origine avec rose des vents / mesure /
➕ point → éditeur pré-rempli / ✏️ tracé / 🧩 cartes, aperçu du
screenshot au survol), 👥 Peuples (`PeuplesTab` — peuples dépliables, leurs
PNJ et leurs dialogues, ajout en ligne), 🧪 Hypothèses (kanban, pistes mortes
repliées par défaut), 🕸 Graphe (`GraphTab`, simulation de forces maison — pas
de d3-force), 🕰 Timeline, 📤 Export (JSON + `DossierView` imprimable, palette
papier via le flag `print` du renderer markdown). `/lore?tab=carte` ouvre
directement un onglet — c'est ce qu'utilise le raccourci « 🔍 Lore — carte »
du dashboard admin.

**Les deux couches du fond** (`LoreMap`) s'empilent du plus grossier au plus
fin : render calibré, puis **atlas 512**, puis **détail 128**. Le détail
n'apparaît qu'en dessous de `DETAIL_MAX_SPAN` (2048 blocs de large) — c'est
tout le principe : on arrive sur l'atlas, on zoome sur une zone et le détail
se pose dessus là où des cases y ont été déposées. Le bouton « 🧩 128 »
de la barre de vue force ce choix (`auto` / `toujours` / `masqué`). Le budget
de `tilesInView` fait le reste : trop dézoomé, une couche rend une liste vide
plutôt que des milliers de `<img>` — et il coupe le détail ~4× plus tôt (par
axe) que l'atlas, ce qui laisse toujours un fond visible.

La **vue d'arrivée** est cadrée sur l'union rectangle des cases d'atlas
(`fitTiles`, pas sur leurs centres — cadrer sur les centres couperait la
moitié des cases du bord) ; à défaut, le render calibré, puis les points,
puis les cases de détail.

Le **niveau de dépôt** du mode 🧩 est un état de `MapTab` (`tileZoom`), pas une
déduction du zoom courant : `LoreMap` ne fait que le *proposer* à l'entrée
dans le mode (`onSuggestTileZoom`), et le panneau permet de le forcer — on
peut déposer une case 512 en étant zoomé, et inversement.

**Piège de cadrage** (corrigé, à ne pas réintroduire) : les tuiles arrivent par
une requête par carte, donc *après* le montage. Elles sont mémorisées avec
l'id de leur carte (`tileState = { mapId, list }`) et n'alimentent le rendu que
si cet id correspond à la carte courante — sinon, en changeant de monde, la
vue se cadrait sur les tuiles du monde précédent et les nouvelles tombaient à
des milliers de blocs hors champ.

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

## Onglet « 🛡 Admin » — surveillance du module

Réservé au **rôle admin** : le tag `can_view_lore` ouvre la salle d'enquête, pas
la surveillance. Un enquêteur ne doit voir ni les adresses e-mail de ses
camarades, ni le poids de leurs dépôts, ni qui regarde quoi. Le serveur refait
le contrôle (`requireRole('admin')` sur `/api/lore/admin/*`) ; masquer l'onglet
côté client n'est qu'un confort.

Trois vues, trois questions :

| Vue | Répond à |
|---|---|
| 👥 Membres | qui produit quoi (entrées, hypothèses, **commentaires**) ; combien d'octets chacun a déposés ; combien de suppressions à son actif |
| 🖼 Médias | *le site sert-il d'hébergement d'images perso ?* — inventaire trié par poids, avec type MIME, dimensions, auteur, et un drapeau « rattaché à rien » |
| 💬 Discussions | les fils les plus actifs : nombre de messages, participants, dernière activité. Un fil dont le sujet a été supprimé est signalé (les messages survivent à leur cible) |
| 📜 Journal | *que s'est-il passé, et surtout qu'a-t-on effacé ?* — filtrable par membre / action / type d'objet |

### Pourquoi une table plutôt qu'une requête

Tout le module est en cascade : supprimer une entrée efface ses médias, ses
liens, ses preuves et ses révisions, et `unlink` les fichiers. Après coup,
**aucune requête ne peut dire ce qui a disparu** — c'est précisément le cas à
surveiller.

`lore_audit` est donc une table **en ajout seul** (aucune route ne la modifie ni
ne la vide) qui fige au moment de l'action :

- `actor_name` — survit à la suppression du compte (la FK est `SET NULL`) ;
- `label` — le titre de la cible **avant** sa disparition ;
- `detail` — JSON : poids, MIME, dimensions, et le décompte de ce que la cascade
  a emporté (`mediaCount`, `mediaBytes`, `evidenceCount`).

C'est ce qui permet d'afficher « *Suppr. · Entrée · Tablette gravée — avec
1 média(s), 1 Ko · Member* » alors que plus rien de tout cela n'existe en base.

### Comment c'est branché

Un **middleware unique**, `auditLore` (`server/lore/audit.js`), monté sur
`loreRouter` après le gate et avant tous les handlers — plutôt que d'instrumenter
les ~40 handlers un par un : moins de code touché, et impossible d'oublier une
route. Il fait correspondre `méthode + chemin` à une table `ROUTES`, prend son
instantané *avant* `next()`, et n'écrit la ligne qu'en `res.on('finish')` si le
statut est 2xx — une tentative rejetée n'est pas une action. Une erreur du
journal est logguée mais ne casse jamais la requête observée.

> ⚠️ **Ajouter une route mutante au module = ajouter sa ligne dans `ROUTES`.**
> Sans quoi l'action se fera en silence.

### Le cas des commentaires

Les fils de discussion des entrées et des hypothèses (`CommentsThread.jsx`)
passent par la table **globale** `comments` et le routeur `/api/comments` —
donc **hors** du middleware `auditLore`, monté sur `/api/lore`. Sans crochet
dédié, la discussion serait le seul pan du module invisible au journal, alors
que « X a effacé le message de Y » est précisément le genre de nuisance que la
page doit montrer.

`server/routes/comments.js` appelle donc `recordLoreComment()` sur POST et
DELETE. C'est un **no-op pour toutes les autres cibles** (`document`,
`feature`, `discussion`, `thread`) : le journal du lore ne contient que du lore.
Le DELETE lit la ligne entière *avant* de l'effacer, pour figer le sujet et
l'extrait du message ; il note aussi `ofSomeoneElse` quand l'acteur efface le
message d'un autre — affiché en rouge dans le journal.

Le journal ne commence qu'à sa mise en place : l'historique antérieur n'existe
pas, et la page le dit.

## Pour ajouter…

| Ajouter… | …où |
|---|---|
| Un type d'entrée / statut / relation | `server/lore/enums.js` + le méta visuel dans `src/components/lore/theme.js` |
| Une route mutante (toute méthode ≠ GET) | la route **et** sa ligne dans `ROUTES` (`server/lore/audit.js`), sinon elle échappe au journal |
| Un monde (3e serveur) | `MONDES` dans `server/lore/enums.js` ET `src/components/lore/theme.js` (+ `MONDE_ORDER`) — rien d'autre, les cartes se créent à la demande |
| Un champ d'entrée | colonne dans `db.js#migrate` (bloc lore_), mapper + validation dans `store.js`/`routes/lore.js`, éditeur `EntryEditor` |
| Un onglet | `TABS` dans `src/pages/Lore.jsx` + composant dans `src/components/lore/` |
| Une règle géo | `server/lore/geo.js` + son test — jamais côté client |
