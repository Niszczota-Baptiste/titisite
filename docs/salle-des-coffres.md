# Atelier « Salle des coffres » (Minefield)

Outil de **conception** d'une salle des coffres géante avant de la construire
en jeu. C'est un **schéma d'organisation**, pas un builder ni un inventaire :

- la palette ne contient que du fonctionnel — coffres, zones, circulation ;
  **aucun bloc de décoration** n'existe dans le modèle ni dans l'UI ;
- **aucune ressource, aucune quantité, aucun stock** n'est stocké. Un coffre
  est une case, un type (simple 27 slots / double 54) et une orientation. Le
  suivi d'inventaire réel reste l'onglet ⛏️ Minecraft des projets.

Module **global** (comme les quêtes) : route `/atelier-coffres`, back sous
`/api/vault-plans` + `/api/vault-categories`. Point d'entrée : le bouton
« 🗝️ Salle des coffres » de l'onglet ⛏️ Minecraft d'un projet (et un onglet
dédié pour les projets 100 % Minecraft), qui passe `?projet=<slug>` pour le
lien de retour — même mécanique que `/quetes`.

## Accès

`users.can_view_vault` ouvre la section (les admins passent outre), case à
cocher dans l'éditeur d'utilisateurs de `/admin`. Le flag donne accès à
l'atelier, **pas aux plans des autres** : un plan n'est visible que de son
créateur et des comptes avec qui il est explicitement partagé — sans
exception pour les admins. Un plan inaccessible répond `404` (et non `403`)
pour ne pas laisser sonder l'existence de ceux des autres.

## Modèle

Un plan = des métadonnées en colonnes + un document JSON édité et autosauvé
d'un bloc (`server/db.js#migrate`) :

| Table | Rôle |
|---|---|
| `vault_plans` | gabarit (`dim_x/y/z`, `origin_*` optionnel), `data` (document), `revision` |
| `vault_plan_shares` | partage par compte, droits d'édition complets |
| `vault_plan_versions` | snapshots : document + gabarit + copie des catégories utilisées |
| `vault_categories` | catégories de rangement, **globales**, amorcées depuis le codex |

Document (`floors` / `zones` / `chests` / `circulation`) :

- **Étages** : tranches Y libres et **non chevauchantes** (vérifié à la
  sauvegarde). Un étage peut faire 3 blocs comme 40, d'où le sélecteur de
  niveau Y dans le panneau Étages : plusieurs rangées peuvent s'empiler au
  même endroit, les autres niveaux restant affichés en repère.
- **Zones** : rectangle sur un étage, couleur, catégories, `reservedSlots`
  (réserve manuelle, en slots) et `reserved` (zone tampon gardée libre pour
  une future MàJ — hachurée partout, exclue des calculs, comptée à part).
- **Coffres** : `x/y/z`, `kind`, `facing`, `label` libre (le *rôle* du coffre,
  jamais son contenu). La **paire d'un coffre double est déduite de son
  orientation**, comme en jeu : nord/sud → accolés le long de X, est/ouest le
  long de Z. Rien n'est stocké en plus et la touche `R` réoriente la paire.
- **Circulation** : `couloir` (cases peintes, une entrée par étage), `escalier`
  (case + liaison entre deux étages), `entree` (case + libellé).

`server/vault/validate.js` renormalise le document à chaque écriture : le
stockage est canonique (mêmes clés, pas de champ parasite), ce qui garde les
révisions lisibles et l'export futur (`.schem` / pipeline Anvil) propre.

### Ce qui bloque une sauvegarde, et ce qui ne bloque pas

`422` uniquement sur une incohérence **structurelle** : dimensions hors
bornes, étages qui se chevauchent, référence d'étage inconnue, élément hors
gabarit, escalier qui ne relie pas deux étages distincts, id dupliqué.

Les défauts de **conception** sont des warnings non bloquants (panneau
« Vérifs », cliquables pour cadrer l'élément) : coffre sans circulation
adjacente, coffre hors zone, zones superposées, coffres superposés, étage
sans escalier, réserve supérieure à la capacité posée. Sinon un plan en cours
d'édition deviendrait insauvegardable en pleine autosave. Dans le même esprit,
supprimer une zone détache ses coffres au lieu de refuser l'écriture.

## Collaboration (asynchrone, sans WebSocket)

Autosave 2 s après la dernière modification, plus une sauvegarde au
`pagehide` / passage en arrière-plan (fetch `keepalive`) et `Ctrl+S`.

Chaque `PUT` porte la révision attendue ; la sauvegarde est un **UPDATE
conditionnel** (`… WHERE id = ? AND revision = ?`), pas un read-then-write —
deux éditeurs simultanés ne peuvent donc pas s'écraser silencieusement. En cas
de `409`, l'autosave se met en pause et la modale propose **Recharger** ou
**Écraser** (`force: true`), avec téléchargement du JSON local en filet.

## Capacité

Structurelle, sans jamais toucher à l'inventaire :

- **disponible** = Σ des coffres posés (27 / 54) ;
- **besoin** = la réserve manuelle saisie sur la zone ;
- jauges à trois seuils (< 80 % vert, 80–100 % orange, > 100 % rouge) sur la
  zone, dans la carte logique et dans le tableau de bord ;
- les zones `reserved` sont exclues et comptées à part (« espace réservé
  MàJ : X % du volume »).

Le calcul vit en double : `server/vault/capacity.js` (résumé des plans) et
`src/components/vault/capacity.js` (par zone, par catégorie, warnings) — le
front ne pouvant pas importer du serveur, les règles sont recopiées, pas
inventées deux fois.

## Catégories

Table **globale** éditable, amorcée au premier boot avec les 9 catégories du
codex Minefield et leurs items (`server/vault/seed-categories.js`). Les
entrées vanilla n'ayant **aucune catégorie** dans le codex, elles se
rattachent à la main — c'est précisément la raison d'être de cette table
plutôt que d'une lecture directe du codex. Les `item_ids` sont purement
descriptifs : ils disent ce qui va dans la catégorie, jamais combien.

Une zone référence des catégories par id, sans FK : supprimer une catégorie
ne réécrit pas tous les plans, le front ignore un id inconnu. Un **snapshot**
embarque donc une copie des catégories utilisées, et sa restauration recrée
celles qui ont disparu en remappant les zones.

## Snapshots

`POST …/snapshots` fige document + gabarit + catégories. La restauration
**duplique dans un nouveau plan** dont l'appelant devient propriétaire :
l'original n'est jamais écrasé.

## Fichiers

```
server/vault/         validate.js · capacity.js · store.js · seed-categories.js
server/routes/vault.js
src/pages/Atelier.jsx
src/hooks/useVaultPlan.js          chargement, autosave, révision, 409
src/components/vault/
  planGeometry.js   maths pures (vue, rectangles, rangées, orientation)
  capacity.js       jauges + validations douces
  logicLayout.js    mise en page du diagramme
  PlanCanvas.jsx    canvas 2D + gestes
  Toolbar · FloorsPanel · Inspector · ItemsPanel · ConflictModal
  LogicMap · Dashboard · VolumeView + VolumeScene · SnapshotsPanel
  VaultApp.jsx      coquille (onglets Plan / Volume / Logique / Capacité)
test/vault.test.js            API (409, 422, partage, snapshots, isolation)
test/vault-geometry.test.js   maths pures + capacité + warnings
```

## Hors périmètre v1

Export `.schem` / `.mca` (le document JSON reste propre et exportable pour
plus tard), temps réel / curseurs partagés, blocs de décoration, rendu
texturé, hoppers et tri redstone, droits fins (lecture seule) et plus de deux
collaborateurs.
