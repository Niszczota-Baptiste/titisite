# Module « Quêtes » (Nostra / Minefield)

Traqueur de quêtes **global** et **collaboratif à petite échelle** : quelques
membres partagent une même base de quêtes, saisies à la main ; chacun coche
**sa propre** progression. Le site ne tient **aucun score de réputation** (il
reste in-game) — il documente les gains et affiche les paliers comme
référentiel.

Module isolé : back sous `server/quests/` + `server/routes/quests*.js`
(préfixe `/api/quests`), front sous `src/components/quests/` +
`src/pages/Quetes.jsx` (route `/quetes`).

## Installation / migration

Rien de spécial. Les tables sont créées par `migrate()` (`server/db.js`) au
premier boot, comme le reste du schéma (`CREATE TABLE IF NOT EXISTS` +
`ensureColumn` pour les colonnes ajoutées sur `users`). **Aucune variable
d'environnement** n'est requise par le module.

Pour repartir de zéro en local : supprimer `data.sqlite*` puis `npm run dev`.

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
- `quest_prerequisites` — `kind` + réf (quête / faction+palier / item / valeur).
- `quest_map_points` — 1–2 points **X/Y/Z** bruts + `role`.
- `quest_completions` — `(quest_id, member_id, period_key)` **unique**.

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
POST|PUT|DELETE  /quests[/:id]
```

Réponses d'erreur : `{ error: 'code' }` (400 validation, 401/403 accès, 404).
Toutes les entrées sont validées côté serveur (`quests-admin.js`) : enums,
1–2 points de carte max, quantités, jamais de confiance au client.

## Cockpit Minefield (flux PULL)

Le cockpit est une **app Python locale** (pas d'URL publique) : elle **interroge**
un endpoint secret plutôt que de recevoir un push.

- Chaque membre a un `cockpit_token` (comme le token iCal) : récupérable /
  régénérable depuis le bouton **« 🛰️ Cockpit MF »** de `/quetes`
  (`GET /api/me/cockpit-token`, `POST …/rotate`).
- Le cockpit poll : `GET /api/quests/cockpit/<token>.json` (sans cookie,
  rate-limité 60/min). Réponse :

  ```json
  {
    "member": { "id": 1, "name": "…" },
    "generatedAt": 1751700000,
    "remindersEnabled": true,
    "available": { "journaliere": [ … ], "hebdomadaire": [ … ], "mensuelle": [ … ] },
    "deadlines": [ { "id": 3, "titre": "…", "dueDate": 1751780000 } ],
    "counts": { "availableTotal": 4, "deadlines": 1 },
    "potentialGains": { "journaliere": { "pa": 50, "reputations": [ … ], "questCount": 2 }, … }
  }
  ```

  `available` = quêtes récurrentes **non encore faites** par ce membre pour la
  période courante (= « redevenues disponibles » après un reset). `deadlines` =
  quêtes à échéance sous 72 h non faites.
- **Opt-in** : le membre active/désactive les rappels
  (`PUT /api/me/quest-reminders { enabled }`) — décoché, le flux ne renvoie que
  `potentialGains` (pas de liste d'actions).

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
