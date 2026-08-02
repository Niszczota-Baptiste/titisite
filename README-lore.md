# Module Lore « Nostra »

Espace de recherche collaboratif pour documenter et théoriser sur le lore de la
map Minecraft RP (serveur Minefield, monde « Nostra »). Ce n'est pas un blog :
c'est un **outil d'enquête** — observations géolocalisées, hypothèses avec
statut épistémique (`open` / `testing` / `confirmed` / `refuted` / `abandoned`),
preuves croisées, et **les pistes mortes restent consultables** avec la raison
de leur abandon.

## Installation

Rien à installer de plus : le module vit dans le process Express existant et
dans `data.sqlite`. Les tables `lore_*` (+ la table virtuelle FTS5 `lore_fts`)
sont créées automatiquement au boot par `server/db.js#migrate()`, comme le
reste du schéma — pas de fichier de migration séparé dans ce repo.

Au premier boot, `server/seed-lore.js` insère les **données réellement
relevées** (21 bâtiments, 9 tours des vents, 5 Poèmes de Jade, 7 hypothèses
dont 4 réfutées, la calibration de la carte du monde). Le seed est idempotent :
court-circuité dès qu'une entrée existe. `SEED_LORE=off` pour le désactiver.

```bash
npm run dev     # backend (3001) + Vite (5173)
npm test        # inclut test/lore-geo.test.js + test/lore.test.js
```

## Variables d'environnement

| Var | Défaut | Rôle |
|---|---|---|
| `SEED_LORE` | *(actif)* | `off` = ne jamais insérer le jeu de données initial |
| `LORE_IMAGE_MAX_BYTES` | `10485760` (10 Mo) | Taille max d'une image uploadée |
| `UPLOADS_DIR` | `./uploads` | Répertoire disque partagé de tous les uploads du site (fichiers UUID) |

Aucune autre : l'auth, le rate limiting global, Helmet et la CSP sont ceux du
site (déjà en place — cookie HttpOnly `SameSite=Strict`, pas de JWT en
localStorage).

## Donner le tag `lore` à un compte

L'accès suit le pattern des autres modules « globaux » du site (quêtes,
vault) : un flag par utilisateur, **les admins passent outre**. Le flag ouvre
la lecture **et** l'écriture — l'outil est collaboratif.

- **Via le dashboard** : `/admin` → onglet Utilisateurs → éditer le compte →
  cocher « Accès au 🔍 Lore Nostra ».
- **Via l'API** (admin) :

```bash
curl -X PUT https://<site>/api/users/<id> \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <jwt>' \
  -d '{"canViewLore": true}'
```

Un compte sans le tag reçoit **403 sur toutes les routes du module, GET et
médias compris**, et l'entrée de menu ne lui est pas montrée
(`canViewLore` sur `/api/auth/me`).

## API — `/api/lore/*`

Tout est derrière `requireAuth` + `requireLoreView`. Écritures limitées à
60/min/IP, uploads à 12/min/IP (en plus du cap global 600/min).

| Ressource | Routes |
|---|---|
| Entrées | `GET/POST /entries`, `GET/PUT/DELETE /entries/:id` (`:id` ou slug en GET), `GET /entries/:id/revisions` |
| Hypothèses | `GET/POST /hypotheses`, `GET/PUT/DELETE /hypotheses/:id`, `GET /hypotheses/:id/revisions` |
| Preuves | `POST /hypotheses/:id/evidence`, `PUT/DELETE /evidence/:id` |
| Tags | `GET/POST /tags`, `PUT/DELETE /tags/:id` |
| Liens | `POST /links`, `DELETE /links/:id` |
| Cartes | `GET/POST /maps`, `PUT/DELETE /maps/:id`, `POST /maps/:id/image` |
| Médias | `POST /media` (multipart `image` + `entryId`\|`hypothesisId`), `PUT/DELETE /media/:id`, `GET /media/file/:filename` |
| Carte | `GET /map/points` |
| Géo | `POST /geo/bearing`, `GET /geo/ring?origin_x&origin_z&tolerance&dimension` |
| Transverse | `GET /search?q=` (FTS5), `GET /graph`, `GET /export` |

Filtres de `GET /entries` : `type`, `dimension`, `canon`, `tag` (id), `q`
(full-text), `x1/z1/x2/z2` (rectangle). Réponses en camelCase comme le reste
de l'API du site (`bearingDeg`, `cardinal8`, `cardinal16`).

Règles métier notables :

- Passer une hypothèse en `confirmed` / `refuted` / **`abandoned`** exige une
  `resolutionNote` (400 `resolution_note_required` sinon). La réouverture
  efface `resolvedAt` mais **garde la note** — c'est la trace de la piste.
- Une paire (hypothèse, entrée) n'a qu'une position (`supports` /
  `contradicts` / `neutral`) — doublon → 409.
- `body_md` est snapshoté dans `lore_revisions` à la création et à chaque
  save qui le modifie.
- Les commentaires réutilisent la table globale `comments`
  (`targetType: 'lore_entry' | 'lore_hypothesis'` via `POST /api/comments`),
  gated par le tag lore.
- **Convention géo** : X croît vers l'est, **Z croît vers le sud** — le nord
  est Z décroissant. Verrouillé par `test/lore-geo.test.js`.

## Médias

- Upload `multer` → recompression **systématique** en WebP par `sharp`
  (métadonnées EXIF retirées, bord long ≤ 3840 px) + miniature ≤ 400 px.
  Un fichier que sharp ne décode pas est **rejeté** (415) : la validation se
  fait sur le contenu réel, pas sur l'extension déclarée. Types acceptés :
  PNG, JPEG, WebP. 10 Mo max.
- Nom sur disque = UUID ; l'original n'est gardé qu'en base.
- **Servi par Express derrière le gate lore** (`GET /api/lore/media/file/:f`,
  cross-check en base + `Cache-Control: private, immutable`), pas par Nginx :
  un `location` statique servirait les pièces d'enquête **sans
  authentification**. C'est un choix délibéré, différent de la spec initiale.

### Option Nginx (non recommandée)

Si un jour le volume le justifie, il faudrait passer par `auth_request` pour ne
pas rendre le dossier public. Bloc de référence :

```nginx
# NON activé par défaut — les fichiers seraient servis sans le gate lore.
# Nécessite auth_request vers un endpoint de vérification de session.
location /lore-media/ {
    internal;                      # seulement via X-Accel-Redirect
    alias /var/www/titisite/uploads/;
    add_header Cache-Control "private, max-age=31536000, immutable";
}
```

et côté Express, répondre `X-Accel-Redirect: /lore-media/<uuid>.webp` après le
check d'auth. Tant que le trafic reste celui d'une équipe d'enquête, le
`res.sendFile` actuel suffit largement.

## Modèle de données

`lore_entries` (slug unique, coords nullables, `dimension`, `is_canon`,
`discovered_at`) · `lore_hypotheses` (`status`, `confidence` 0-100,
`resolved_at`, `resolution_note`) · `lore_evidence` (N-N hypothèse↔entrée,
`stance`, UNIQUE par paire) · `lore_media` · `lore_tags` + `lore_entry_tags` ·
`lore_links` (`relation_type` ∈ same_system, points_to, contradicts,
variant_of, located_in) · `lore_revisions` (snapshots) · `lore_maps`
(calibration = X gauche/droit + Z bas du render, ex. carte du monde :
`-5353 / 4646 / -636`) · `lore_fts` (FTS5).

Les listes de valeurs (`entry_type`, statuts, stances, relations) sont dans
`server/lore/enums.js` — volontairement sans CHECK SQL pour rester extensibles.
