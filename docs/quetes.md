# Module « Quêtes » (Nostra / Minefield)

Traqueur de quêtes **global** et **collaboratif à petite échelle** : quelques
membres partagent une même base de quêtes, saisies à la main ; chacun coche
**sa propre** progression. Le site ne tient **aucun score de réputation** (il
reste in-game) — il documente les gains et affiche les paliers comme
référentiel.

Module isolé : back sous `server/quests/` + `server/routes/quests*.js`
(préfixe `/api/quests`), front sous `src/components/quests/` +
`src/pages/Quetes.jsx` (route `/quetes`). Point d'entrée : le bouton
« 📜 Quêtes » de l'onglet ⛏️ Minecraft des projets (`QuestsLink`,
`src/components/project/Minecraft.jsx`) — le site public n'y fait plus
référence.

## Installation / migration

Rien de spécial. Les tables sont créées par `migrate()` (`server/db.js`) au
premier boot, comme le reste du schéma (`CREATE TABLE IF NOT EXISTS` +
`ensureColumn` pour les colonnes ajoutées sur `users`). **Aucune variable
d'environnement** n'est requise par le module.

Pour repartir de zéro en local : supprimer `data.sqlite*` puis `npm run dev`.

**Données de démonstration** : au premier boot, si la table `factions` est vide,
`server/seed-quests.js` insère un jeu d'exemple (5 factions dont une « maîtrise »,
une chaîne avec embranchement, des quêtes de chaque cadence) — tout est
supprimable depuis l'onglet « ✎ Éditeur ». Idempotent (rejoué uniquement tant
qu'aucune faction n'existe). Mettre `SEED_DEMO_QUESTS=off` pour ne rien insérer.

## Accès / permissions

Deux flags par membre sur `users` (les admins passent partout) :

| Flag | Effet |
|---|---|
| `can_view_quests` | Lecture du journal (`/quetes`, endpoints GET) |
| `can_edit_quests` | Création/édition quêtes, chaînes, factions, paliers (implique la lecture) |

Activation depuis l'admin **Utilisateurs** (cases à cocher sur la fiche d'un
membre). Exposés au front en camelCase via `/auth/me`
(`canViewQuests`, `canEditQuests`).

## Modèle de données

- `factions` (`type` `faction`|`maitrise`, couleur, description) + `faction_tiers`
  (nom + seuil + ordre) — paliers **propres** à chaque faction.
- `quest_chains` — regroupement + faction optionnelle. La progression « étape
  X / Y » est **rendue à partir du graphe d'arêtes**, pas stockée.
- `quests` — `occurrence_type` (`simple`|`journaliere`|`hebdomadaire`|`mensuelle`),
  `faction_id` (origine), `chain_id`+`chain_rank`, `due_date` optionnel,
  `created_by`/`updated_by`.
- `quest_edges` — graphe orienté de déblocage (embranchements possibles). Les
  arêtes sont **dérivées automatiquement** des récompenses de type `deblocage`
  (`unlock_quest_id`).
- `quest_inputs` / `quest_rewards` — `kind` + `ref_code` (id **codex**, pas de FK :
  le référentiel est le catalogue JSON `public/codex` + `codex_vanilla.json`),
  `faction_id`, `quantite`, `label` (surcharge/affichage), `icon`.
- `quest_custom_items` — **items custom** (onglet « Items » de `/quetes`) : un
  item du codex rebaptisé (ex. « Chair de zombie » → « Chair de noyé »), avec
  `ref_code` (item de base, pour l'icône), `enchantements` (JSON array de
  textes libres) et une note. Les lignes de quêtes (entrées / récompenses /
  prérequis `item_possede`) les référencent via `ref_code = 'custom:<id>'` —
  côté front, `customCatalogEntries()` (`src/data/minefieldCatalog.js`) les
  injecte dans le codex des pickers (`/quetes` ET l'onglet ⛏️ Minecraft des
  projets, pour l'autocomplete et les icônes des coffres).
- `quest_prerequisites` — `kind` + réf (quête / faction+palier / item / valeur).
- `quest_map_points` — 1–2 points **X/Y/Z** bruts + `role`.
- `quest_completions` — `(quest_id, member_id, period_key)` **unique**.
- `quest_maps` — **plusieurs cartes** nommées (Overworld, Nether, régions…),
  chacune avec son **centre + zoom** propre (`center_x/center_z/default_span`)
  car un monde n'est pas toujours centré en 0,0. Éditables, non supprimable s'il
  n'en reste qu'une. Peut porter une **vraie image de carte 2D** en fond
  (`image_filename`, réutilise le pipeline `/api/images`), calée sur les
  coordonnées via `img_center_x/img_center_z/img_span` (centre + largeur en
  blocs) ; l'aperçu superpose les marqueurs et se règle en direct.
- `quest_map_pois` — **points d'intérêt libres** (non liés à une quête) :
  bâtiments, zones de farm, PNJ… avec catégorie, note, X/Y/Z. Les points de
  quête (`quest_map_points`) et les POI portent un `map_id` (NULL = carte par
  défaut) ; l'onglet « Carte » agrège les deux, par carte.
- `quest_groups` + `quest_group_items` — **groupes personnalisés** (many-to-many),
  un axe de rangement libre en plus des factions (origine) et chaînes (séquence).
  Une quête peut appartenir à plusieurs groupes ; gérés dans l'onglet « Groupes »
  de l'éditeur, filtrables dans la liste, affichés en puces sur les cartes/fiches.

### Le reset : `period_key` (pas de job qui mute la DB)

`server/quests/period.js` mappe l'instant courant vers une clé déterministe,
ancrée à **07:00 Europe/Paris** :

| Occurrence | `period_key` | Fenêtre |
|---|---|---|
| `simple` | `once` | jamais |
| `journaliere` | `d:AAAA-MM-JJ` | chaque jour 07:00 |
| `hebdomadaire` | `w:AAAA-MM-JJ` (vendredi ancre) | vendredi 07:00 |
| `mensuelle` | `m:AAAA-MM` | 1er 07:00 |

« Fait cette période ? » = existe-t-il une complétion pour la `period_key`
courante. Le reset est donc **implicite, idempotent et rejouable** : rien n'est
effacé (l'historique est conservé), et un serveur redémarré **se rattrape
automatiquement** puisque la clé est recalculée à chaque lecture. Il n'y a
donc **pas de tâche cron** à faire tourner. `nextResetAt()` fournit le
« prochain reset » pour les badges et le cockpit.
*(Note : un basculement d'heure d'été décale l'ancre 07:00 d'une heure deux
fois par an — sans effet sur la granularité jour/semaine/mois.)*

## API (`/api/quests`)

Lecture (flag `can_view_quests`) :

```
GET  /factions                 factions + paliers
GET  /chains                   chaînes
GET  /chains/:id/graph         { nodes, edges } pour la vue chaîne
GET  /gains                    gains potentiels « si tu fais tout » par cadence
GET  /reputation               factions + paliers + quêtes qui en octroient
GET  /maps                     liste des cartes
GET  /map?map=<id>             { questPoints, pois } d'une carte (défaut si omis)
GET  /custom-items             items custom (nom, refCode base, enchantements)
GET  /quests?faction=&chain=&occurrence=   liste (+ `done` du membre)
GET  /quests/:id               fiche complète (+ `done` + mon historique)
GET  /me/quests                { done: { questId: true } } (période courante)
POST /quests/:id/complete      coche (member + period_key courante)
POST /quests/:id/uncomplete    décoche
```

Édition (flag `can_edit_quests`) — payload **imbriqué** (les sous-entités
inputs/rewards/prerequisites/mapPoints sont remplacées en bloc) :

```
POST|PUT|DELETE  /factions[/:id]     (tiers dans le payload)
POST|PUT|DELETE  /chains[/:id]
POST|PUT|DELETE  /groups[/:id]
POST|PUT|DELETE  /pois[/:id]         (points d'intérêt libres de la carte)
POST|PUT|DELETE  /maps[/:id]         (cartes ; DELETE refuse la dernière)
POST|PUT|DELETE  /custom-items[/:id] (items custom : nom, refCode, enchantements)
POST|PUT|DELETE  /quests[/:id]
```

Réponses d'erreur : `{ error: 'code' }` (400 validation, 401/403 accès, 404).
Toutes les entrées sont validées côté serveur (`quests-admin.js`) : enums,
1–2 points de carte max, quantités, jamais de confiance au client.

## Cockpit Minefield (flux PULL)

Le cockpit est une **app Python locale** (pas d'URL publique) : elle **interroge**
un endpoint secret plutôt que de recevoir un push.

**Accès : admins uniquement.** L'onglet « Cockpit » du dashboard, les
endpoints `/api/me/cockpit-token*`, `/api/me/quest-reminders` et
`/api/me/cockpit/*` exigent le rôle `admin`, et le flux
`GET /api/quests/cockpit/<token>.json` répond 404 si le jeton appartient
à un compte non admin (un jeton émis avant la restriction devient inerte).
Le cockpit ne s'atteint QUE depuis `/admin` — le bandeau de `/quetes` porte à
la place un bouton « ⛏️ ← Retour au projet » vers l'onglet Minecraft du projet
d'origine (le lien « 📜 Quêtes » passe `?projet=<slug>`, mémorisé en
sessionStorage).

- Chaque admin a un `cockpit_token` (comme le token iCal) : récupérable /
  régénérable depuis la page admin « Cockpit »
  (`GET /api/me/cockpit-token`, `POST …/rotate`).
- Le cockpit poll : `GET /api/quests/cockpit/<token>.json` (sans cookie,
  rate-limité 60/min). Réponse :

  ```json
  {
    "member": { "id": 1, "name": "…" },
    "generatedAt": 1751700000,
    "remindersEnabled": true,
    "available": {
      "journaliere": [
        {
          "id": 1, "titre": "Livrer 16 pains", "faction": "Bourg",
          "factionCouleur": "#a78bfa", "periodKey": "d:2026-07-06",
          "nextResetAt": 1751780000,
          "inputs":  [ { "kind": "item", "label": "Pain", "quantite": 16, "refCode": null, "factionId": null, "icon": null } ],
          "rewards": [ { "kind": "pa", "label": "", "quantite": 50, "refCode": null, "factionId": null } ],
          "mapPoints": [ { "label": "boulangerie", "role": "rendu", "x": 128, "y": 64, "z": -342 } ]
        }
      ],
      "hebdomadaire": [], "mensuelle": []
    },
    "deadlines": [
      { "id": 7, "titre": "…", "faction": "…", "dueDate": 1751780000,
        "inputs": [], "rewards": [], "mapPoints": [] }
    ],
    "wanted": [
      { "id": 3, "name": "Diamant", "quantity": 64, "priority": 1,
        "note": "pour la beacon", "workspace": "Base principale",
        "x": -1204, "y": 11, "z": 356 }
    ],
    "counts": { "availableTotal": 4, "deadlines": 1, "wanted": 1 },
    "potentialGains": { "journaliere": { "pa": 50, "reputations": [ … ], "questCount": 2 }, … }
  }
  ```

  `available` = quêtes récurrentes **non encore faites** par ce membre pour la
  période courante (= « redevenues disponibles » après un reset). `deadlines` =
  quêtes à échéance sous 72 h non faites. Chaque quête des deux listes porte
  ses `inputs` (entrées, triées par `ordre`), `rewards` et `mapPoints`.
- **`wanted` = liste d'items PERSO** (`cockpit_items`, par utilisateur — pas la
  wishlist de groupe `minecraft_wanted` des coffres) : items non faits, triés
  par `priority` (1 haute → 3 basse) puis `position`. Chaque item peut porter
  une note, un projet lié (`workspace` = nom résolu, sinon `null`) et des
  coordonnées x/y/z optionnelles.
- **Quêtes suivies** (`cockpit_quest_follows`, par utilisateur) : tant que le
  membre ne suit **aucune** quête, tout est envoyé (mode par défaut) ; dès
  qu'il en suit ≥ 1, seules les quêtes suivies apparaissent dans `available`
  et `deadlines` (`potentialGains` reste global).
- **Opt-in** : le membre active/désactive les rappels
  (`PUT /api/me/quest-reminders { enabled }`) — décoché, le flux ne renvoie que
  `potentialGains` (les listes actionnables, `wanted` compris, sont vidées).

### Page admin « Cockpit » (réglages perso)

Onglet « 🛰️ Cockpit » du dashboard `/admin` — chaque admin y gère
**uniquement ses propres** réglages ; réservé aux admins (les membres, même
avec `can_view_quests`, n'ont plus accès au dashboard). Contenu :

- l'URL secrète du flux (copier / régénérer) + l'interrupteur des rappels ;
- les **items perso** (CRUD + cocher fait) avec nom, quantité, priorité, note,
  projet lié (select des workspaces accessibles), coordonnées x/y/z ;
- la liste des **quêtes** groupées par occurrence avec un interrupteur
  « envoyer au cockpit » par quête + l'état clair du mode (« tout est envoyé »
  tant que rien n'est suivi) ;
- un **aperçu du flux** (fetch de l'endpoint avec son jeton, JSON affiché).

API sous `/api/me/cockpit/…` (cookie de session, jamais d'id utilisateur pris
du client ; accès admin uniquement) :

```
GET/POST           /items          liste / création
PUT/DELETE         /items/:id      édition / suppression
PATCH              /items/:id/done coche ↔ décoche « récupéré »
GET                /quests         liste des quêtes + état follow + followedCount
PUT                /quests/:id/follow { followed: bool }
```

### Où trouver les entrées d'une quête (lien avec les coffres)

`GET /api/quests/quests/:id/stock` (flag `can_view_quests`) rapproche chaque
entrée de type `item` de l'inventaire Minecraft (`minecraft_resources`) des
workspaces accessibles à l'appelant (admin : tous les workspaces minecraft
actifs ; membre : ses adhésions). Match par **nom normalisé** (accents/casse)
sur le label de l'entrée et/ou le nom résolu du `ref_code` — nom codex
(`server/codex.js`), ou **nom custom** si `ref_code = 'custom:<id>'`
(`quest_custom_items`) : il suffit donc de ranger l'objet dans un coffre sous
son nom custom pour que le suivi le retrouve. Réponse par entrée :
`needed`, `totalHave` et les
`locations` (workspace, quantité, coffre + monde + X/Y/Z, `chest: null` =
« non rangé »). La fiche de quête (`QuestDetail`) affiche ces emplacements
dans la section « 📦 Où trouver dans les coffres ».

Exemple de polling Python :

```python
import requests
FEED = "https://baptiste-niszczota.com/api/quests/cockpit/<token>.json"
feed = requests.get(FEED, timeout=10).json()
for q in feed["available"]["journaliere"]:
    print("À faire aujourd'hui :", q["titre"])
```

Le flux est une **lecture pure** (idempotent, sûr à poller aussi souvent que
voulu). En cas de fuite du jeton, régénère-le depuis l'UI — l'ancienne URL
cesse aussitôt de fonctionner.

## Étendre le module

- **Ajouter une faction / un palier** : via l'éditeur (`/quetes` → onglet
  « ✎ Éditeur » → « Factions & paliers »). Programmatique : `POST /api/quests/factions`
  avec `{ nom, type, couleur, tiers: [{ nomPalier, seuil }] }`.
- **Ajouter un type d'entrée / récompense / prérequis** : étendre le `CHECK (kind IN …)`
  de la table concernée dans `server/db.js#migrate`, le `Set` de validation
  correspondant dans `server/routes/quests-admin.js`, puis les libellés/icônes
  dans `src/components/quests/theme.js` (`INPUT_KINDS`/`REWARD_KINDS`/`PREREQ_KINDS`)
  et le rendu conditionnel du champ dans `QuestEditor.jsx`.
- **Ajouter une occurrence récurrente** : ajouter la valeur au `CHECK` de
  `quests.occurrence_type`, une entrée dans `RECURRING` + le calcul de clé dans
  `server/quests/period.js`, et l'entrée `OCCURRENCES` de `theme.js`.
