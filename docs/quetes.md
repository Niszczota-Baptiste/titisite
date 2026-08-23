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
- `quest_custom_items` — le **catalogue d'items uniques** (onglet « 📦 Items »
  de `/quetes`). Historiquement « un item du codex rebaptisé » ; c'est désormais
  l'entité de premier plan du module (voir « Catalogue d'items uniques »
  ci-dessous). Le nom de table est resté : l'entité a été **étendue en place**
  pour qu'aucun id ne bouge et que les `ref_code = 'custom:<id>'` déjà écrits
  dans les quêtes continuent de résoudre. Les lignes de quêtes (entrées /
  récompenses / prérequis `item_possede`) et les lignes d'offres les référencent
  ainsi ; côté front, `customCatalogEntries()`
  (`src/data/minefieldCatalog.js`) les injecte dans le codex des pickers
  (`/quetes` ET l'onglet ⛏️ Minecraft des projets, pour l'autocomplete et les
  icônes des coffres).
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

### Catalogue d'items uniques, contenants et familles de quêtes

Un **item unique** est un objet du serveur décrit une fois et référencé partout :
géodes, monnaies, équipement renommé. Il vit **sans quête** — le catalogue est
autonome, les quêtes le référencent.

| Table | Rôle |
|---|---|
| `quest_custom_items` | l'item unique : `slug` (adresse stable, ne suit pas le renommage), `nom`, `ref_code` (= item support du codex, pour l'icône), `lore`, `rarete_id`, `categorie`, `faction_id`, `est_vendable` + `prix_vente` + `prix_unite`, `est_ouvrable`, `tags`, `enchantements`, `stats`, `note` |
| `unique_item_rarities` | échelle **ordonnée et éditable en ligne** (commun → légendaire), avec couleur. Une table et non un enum : de nouveaux paliers apparaissent au fil des découvertes |
| `loot_entries` | table de butin d'un contenant ouvrable : `resultat_type` (`unique_item` **FK** / `item_referentiel` (id codex) / `pa` / `reputation` / `autre`), fourchette `quantite_min`–`quantite_max`, `probabilite`, `probabilite_source` (`officielle`/`estimee`/`observee`) |
| `loot_observations` | journal d'ouvertures : ce qu'un membre a réellement obtenu → taux empiriques |
| `unique_item_sources` | sources **manuelles** uniquement (drop de mob, coffre, événement…) — tout le reste est dérivé |
| `quest_offers` / `quest_offer_lines` | offres d'une quête d'achat : `donne` ↔ `recoit`, payables en PA ou en items |

Sur `quests` : `categorie` (`recolte`|`craft`|`achat`|`pvp`|`autre`) plus la mise
en scène du craft (`craft_station`, `craft_grid` = 9 cases d'ids codex,
`craft_shapeless`, `maitrise_faction_id`/`maitrise_tier_id`).

**Une récompense de quête peut être aléatoire.** Une récolte de géodes donne
« rien, ou 1 à 3 géodes » : les colonnes `probabilite`, `probabilite_source`,
`quantite_min` et `quantite_max` sur `quest_rewards` décrivent ça sans table
supplémentaire. La règle tient en une ligne : **`probabilite` NULL = récompense
garantie** (le cas historique, inchangé), renseignée = ligne du tirage. La fiche
sépare les deux blocs, affiche la somme du tirage (signalée si ≠ 100 %) et le
gain moyen du tirage ; l'éditeur ouvre les champs « min / max / % chance » sur
chaque ligne de récompense. Un tirage se complète avec une ligne « Rien »
(kind `autre`).

Conséquence sur les **gains potentiels** : ils sont désormais **pondérés par la
probabilité** (`SUM(quantité moyenne × probabilité)`), sinon « si tu fais tout »
promettrait 250 PA pour un jackpot à 3 %. Les données existantes ne bougent pas
— une ligne garantie vaut toujours sa quantité. Un seul tirage par quête pour
l'instant (toutes les lignes probabilisées appartiennent au même pool).

**La recette d'une quête de craft n'a pas de table à elle** : ses ingrédients
sont les `quest_inputs` et son résultat une `quest_rewards`. Conséquence
directe et voulue — « 📦 Où trouver dans les coffres » et le flux cockpit
fonctionnent sur les crafts sans une ligne de code de plus.

**« Où trouver quoi » est calculé, jamais ressaisi.** `GET
/unique-items/:id/sources` agrège, à partir des relations existantes : les
quêtes qui donnent l'objet, les contenants qui peuvent le produire (avec leur
probabilité), les recettes qui le fabriquent (avec leurs ingrédients), les
offres où on l'achète — et l'inverse (`usages`) : les crafts qui le consomment,
les quêtes qui l'exigent, les offres où il sert de monnaie. Les compteurs du
catalogue sont agrégés en 8 requêtes `GROUP BY`, jamais une par item. Le filtre
« sans source connue » sert de radar à trous de documentation.

**Vendre ou ouvrir ?** `src/components/quests/items/loot.js` (pur, testé dans
`test/loot-math.test.js`) calcule l'espérance d'une ouverture et la compare au
prix de revente, avec deux règles d'honnêteté : un résultat sans prix connu est
**exclu** du calcul (et sa part de probabilité affichée) au lieu d'être compté
zéro, et **aucun taux de change n'est inventé** entre monnaies — un prix libellé
dans une autre monnaie que celle du contenant rejoint les non valorisés. Le
verdict ne tranche qu'au-delà de ±10 % d'écart. Les taux observés sont assortis
d'un intervalle de **Wilson à 95 %**, correct sur petits effectifs.

La somme des probabilités n'est **jamais** contrainte : elle est affichée et
signalée (< 100 % → reliquat « rien / commun » proposé ; > 100 % → avertissement),
mais une table incomplète reste enregistrable — sinon on ne pourrait pas
documenter une géode au fil des ouvertures.

Validation serveur : bornes `[0,100]`, quantités ≥ 1, `min ≤ max`, FK vérifiées
(rareté, faction, item cible, monnaie), et **refus des cycles** contenant →
contenu, directs comme indirects (parcours en profondeur du graphe
d'ouvertures).

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
GET  /custom-items             alias historique du catalogue (forme préservée)
GET  /rarities                 échelle de rareté
GET  /unique-items             catalogue + compteurs de sources/usages
GET  /unique-items/:id         fiche + table de butin + sources manuelles + observations
GET  /unique-items/:id/sources index inversé : { sources, usages } — 100 % dérivé
GET  /unique-items/:id/observations
POST /unique-items/:id/observations   loguer une ouverture (voir ci-dessous)
DELETE /observations/:id       la sienne, ou n'importe laquelle pour un éditeur
DELETE /unique-items/:id/observations[?scope=mine|all]
                               remise à zéro du journal : `mine` = les siens
                               (tout lecteur), `all` (défaut) = tous, éditeurs
                               seulement → { supprimees, resume, recentes }
GET  /quests?faction=&chain=&occurrence=&categorie=   liste (+ `done` du membre)
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
POST|PUT|DELETE  /custom-items[/:id] (alias historique — délègue au catalogue)
POST|PUT|DELETE  /unique-items[/:id] (loot + sourcesManuelles dans le payload)
POST|PUT|DELETE  /rarities[/:id]     (PUT /rarities { ids } réordonne l'échelle)
POST|PUT|DELETE  /quests[/:id]       (+ categorie, craft{…}, offers[])
```

**Le journal d'ouvertures est la seule écriture ouverte aux simples lecteurs**
(`can_view_quests`) : une table de butin s'affine collectivement, exiger le flag
d'édition la condamnerait à rester devinée. Chacun ne supprime que ses propres
observations ; un éditeur peut toutes les retirer. Rien d'autre du catalogue
n'est modifiable sans `can_edit_quests`.

**Repartir de zéro après une mise à jour du serveur de jeu** : quand la table
de butin change en jeu, les relevés décrivent une table qui n'existe plus et
moyenner les deux versions ne veut rien dire. `DELETE
/unique-items/:id/observations` vide le journal du contenant (bouton
« ↺ Tout réinitialiser » de la fiche, éditeurs) ; `?scope=mine` n'efface que
ses propres relevés et suit donc la même règle que la suppression ligne à
ligne (« ↺ Mes relevés », tout lecteur). Dans les deux cas la table de butin
**déclarée** (`loot_entries`) n'est pas touchée : c'est l'observation qui est
périmée, pas la table — et l'appel est rejouable, ne plus rien avoir à effacer
répond `{ supprimees: 0 }`, pas une erreur.

Les deux routes `/custom-items` restent servies pour ne rien casser, mais elles
**délèguent** au catalogue : un seul chemin d'écriture, donc aucun item sans
slug, et une édition par l'ancien formulaire ne peut pas effacer les champs
qu'il ignore (lore, rareté, butin) — elle fusionne au lieu de remplacer.

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
- **Ajouter une rareté** : rien à toucher, c'est une table éditable — onglet
  « 📦 Items » → bouton « Raretés » (nom, couleur, ordre par ↑/↓). L'ordre porte
  le sens : il pilote le tri du catalogue.
- **Ajouter une monnaie** : rien à toucher non plus — créer un item unique de
  catégorie « monnaie ». Il devient aussitôt sélectionnable comme unité de prix
  (`prix_unite = 'custom:<id>'`) et comme ligne d'offre. Note : l'espérance
  d'ouverture ne convertit pas entre monnaies, elle se calcule dans celle du
  contenant.
- **Ajouter une catégorie** (de quête ou d'item) : **deux endroits**, sans
  migration —
  `server/quests/enums.js` (`QUEST_CATEGORIES` / `UNIQUE_ITEM_CATEGORIES`, la
  validation serveur) puis `src/components/quests/theme.js` (même nom, pour le
  libellé, l'icône et la couleur). Ces deux colonnes n'ont **volontairement pas**
  de contrainte `CHECK` : en SQLite un CHECK ne s'étend pas sans reconstruire la
  table, ce qui aurait rendu l'ajout d'une catégorie bien plus lourd que le geste
  qu'il doit être. Les énumérations réellement figées (type de résultat de butin,
  source de probabilité, sens d'une ligne d'offre, type de source manuelle)
  gardent, elles, leur `CHECK` en base **et** leur `Set` dans `enums.js`.
- **Ajouter un type de source manuelle** : le `CHECK` de `unique_item_sources.kind`
  (`server/db.js#migrate`), `MANUAL_SOURCE_KINDS` dans `enums.js`, puis le même
  nom dans `theme.js`.

### Seed du catalogue

`server/seed-unique-items.js` installe les 5 raretés et les contenants relevés
en jeu (les trois géodes + l'Écaille du devin). Il est **idempotent par ligne**
(rareté par nom, item par slug), pas « si la table est vide » : il s'applique
donc aussi à une base déjà remplie et ne réécrit jamais ce que tu as édité.
`SEED_UNIQUE_ITEMS=off` le désactive. Les tables de butin sont laissées
**vides** à dessein — elles se remplissent au fil des ouvertures, depuis la
fiche de l'item.

⚠️ L'**Écaille du devin** est seedée **sans item support** (`ref_code` NULL) :
son id de codex n'a pas été communiqué et le module ne devine jamais un id. Elle
s'affiche avec l'icône de repli 📦 jusqu'à ce que l'item de base soit renseigné
dans l'éditeur.
