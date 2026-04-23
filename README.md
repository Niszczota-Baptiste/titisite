# titisite — Portfolio + espace projet

Portfolio one-page bilingue (FR / EN / KO) **+** admin du contenu **+** workspace projet multi-utilisateurs pour gérer la création d'un jeu vidéo.

**Stack :** Vite + React 18 · Express + SQLite · JWT auth (bcrypt) · multer (upload 1 Go).

---

## Pages

| Route       | Qui                         | Ce qu'on y fait                                                                 |
|-------------|-----------------------------|---------------------------------------------------------------------------------|
| `/`         | Tout le monde               | Portfolio public                                                                |
| `/admin`    | `role=admin` seulement      | Éditer projets / musique / expérience / formation / en cours                    |
| `/project`  | `role=admin` ou `role=member`| Espace projet jeu vidéo : Kanban, docs, builds, réunions, discussion          |

---

## Comptes utilisateurs

Deux rôles :
- **`admin`** : accès total (/admin + /project)
- **`member`** : accès à /project uniquement

Les comptes sont créés au **1er démarrage** à partir des variables d'environnement. Voir `.env.example`.

Mots de passe hashés en **bcrypt** (10 rounds). Tokens JWT signés HS256, 7 jours.

---

## Espace projet — `/project`

6 onglets :

### Vue d'ensemble
Dashboard : compteurs par colonne Kanban, progression globale, prochaines réunions, derniers builds, derniers documents.

### Kanban
4 colonnes (Backlog / À faire / En cours / Terminé).
Chaque carte : titre, description, priorité, assigné, compteur de commentaires. Boutons ← / → pour déplacer entre colonnes. Modal d'édition avec fil de commentaires attaché.

### Documents
Upload de fichiers de conception (≤ 1 Go) avec progression. Liste avec taille, auteur, date, notes. Téléchargement authentifié. Chaque document a son propre fil de commentaires.

### Builds
Liste des MVPs/livrables avec version (`v0.3.1`), statut (alpha/beta/release), notes (changelog).
**Deux modes d'ajout :** fichier direct (≤ 1 Go) **ou** lien externe (Itch.io, Drive, etc.) pour les fichiers trop gros.

### Réunions
Agenda split en **à venir** / **passées**, avec horodatage, description, auteur. Triable par date.

### Discussion
Fil général pour les sujets divers qui ne rentrent pas ailleurs. Commentaires avec auteur, date, suppression (propre commentaire ou admin).

---

## Architecture

```
titisite/
├── server/
│   ├── index.js, db.js, auth.js, users.js, seed.js, uploads.js
│   └── routes/
│       ├── auth.js           ← /api/auth/{login,me}
│       ├── collection.js     ← /api/{projects,tracks,education,experience,currently} (admin-only writes)
│       ├── users.js          ← /api/users (listing for assignees)
│       ├── documents.js      ← /api/documents + upload + download
│       ├── builds.js         ← /api/builds + upload + download
│       ├── features.js       ← /api/features (kanban)
│       ├── meetings.js       ← /api/meetings
│       └── comments.js       ← /api/comments (polymorphic target)
│
├── src/
│   ├── main.jsx, App.jsx, styles.css
│   ├── api/client.js         ← fetch + upload XHR (with progress) + download
│   ├── auth/AuthContext.jsx  ← AuthProvider, useAuth, role helpers
│   ├── data/                 ← i18n, projects.js, tracks.js, …  (seed + fallback)
│   ├── hooks/                ← useContent, useReveal, useMagnetic
│   ├── pages/
│   │   ├── Public.jsx        ← portfolio
│   │   ├── Admin.jsx         ← admin gate (role=admin)
│   │   └── Project.jsx       ← project gate + nested router
│   └── components/
│       ├── ambient|layout|sections|ui|overlays/   ← portfolio
│       ├── admin/            ← Login, Dashboard, editors/*
│       └── project/
│           ├── Layout.jsx    ← header + tab nav
│           ├── Overview.jsx, Kanban.jsx, Documents.jsx, Builds.jsx,
│           │   Meetings.jsx, Discussion.jsx
│           ├── Comments.jsx  ← réutilisé dans docs, features, discussion
│           ├── FileDrop.jsx  ← drag-drop + ProgressBar
│           └── shared.jsx    ← Modal, Section, formatters, primitives
│
├── data.sqlite               ← (auto-créée, gitignore)
├── uploads/                  ← fichiers (gitignore)
└── .env.example
```

### Schéma DB

- **Public** (JSON-blob) : `projects`, `tracks`, `education`, `experience`, `currently`
- **Users** : `users(id, email, name, password_hash, role, created_at)`
- **Workspace** :
  - `documents(id, title, filename, original_name, mime_type, size, notes, uploaded_by, created_at)`
  - `builds(id, version, title, status, filename?, original_name?, mime_type?, size?, external_url?, notes, uploaded_by, released_at)`
  - `features(id, title, description, status, priority, assignee_id, created_by, position, created_at, updated_at)`
  - `meetings(id, title, description, starts_at, ends_at, created_by, created_at)`
  - `comments(id, target_type, target_id, author_id, body, created_at)` — polymorphique sur `{document, feature, discussion}`

Les fichiers uploadés sont stockés sous un nom UUID dans `UPLOADS_DIR` ; la DB garde le nom d'origine pour le téléchargement.

---

## Installation

```bash
npm install
cp .env.example .env
# Éditer .env (JWT_SECRET, ADMIN_*, MEMBER_*)
```

Générer un JWT_SECRET :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Développement

```bash
npm run dev
```

Lance en parallèle :
- Express (port 3001, `node --watch`)
- Vite (port 5173, HMR)

Vite proxifie `/api/*` vers le backend. Aller sur :
- http://localhost:5173/ — site public
- http://localhost:5173/admin — login admin
- http://localhost:5173/project — login équipe projet

Au 1er lancement : seed automatique des users depuis `.env` + seed des données publiques depuis `src/data/*.js`.

**Re-seed forcé** (remplace tout le contenu public, pas les users) :
```bash
rm data.sqlite* && npm run seed -- --force
```

---

## Build & production

```bash
npm run build
npm start
```

Un seul process Node sert `/api/*` + le SPA.

### Variables d'env

| Variable          | Obligatoire | Défaut         | Description                                     |
|-------------------|-------------|----------------|-------------------------------------------------|
| `JWT_SECRET`      | oui         | —              | Secret pour signer les tokens                   |
| `ADMIN_EMAIL`     | oui         | —              | Email du compte admin                           |
| `ADMIN_PASSWORD`  | oui         | —              | Mot de passe admin (hashé au seed)              |
| `ADMIN_NAME`      | non         | `Admin`        | Nom affiché                                     |
| `MEMBER_EMAIL`    | oui         | —              | Email du compte collaborateur                   |
| `MEMBER_PASSWORD` | oui         | —              | Mot de passe collaborateur                      |
| `MEMBER_NAME`     | non         | `Member`       | Nom affiché                                     |
| `NODE_ENV`        | oui en prod | —              | `production` pour servir `dist/`                |
| `PORT`            | non         | `3001`         | Port d'écoute                                   |
| `DB_PATH`         | non         | `./data.sqlite`| Chemin SQLite                                   |
| `UPLOADS_DIR`     | non         | `./uploads`    | Dossier des fichiers uploadés                   |
| `MAX_UPLOAD_BYTES`| non         | `1073741824`   | Taille max upload (1 Go)                        |

---

## Déploiement

Node persistant + **volume persistant** requis pour SQLite **et** `uploads/`. Monter un disque partagé et pointer `DB_PATH` + `UPLOADS_DIR` dessus.

### Railway
1. Build : `npm run build` · Start : `npm start`
2. Env : toutes les vars du tableau ci-dessus
3. Ajouter un volume sur `/app/data`, puis `DB_PATH=/app/data/data.sqlite` et `UPLOADS_DIR=/app/data/uploads`

### Render
- **Web Service** · Build : `npm ci && npm run build` · Start : `npm start`
- **Persistent Disk** monté sur `/var/data` (au moins 2-5 Go si les builds font 1 Go)
- Env : `DB_PATH=/var/data/data.sqlite`, `UPLOADS_DIR=/var/data/uploads`

### Fly.io
```toml
[mounts]
  source = "data"
  destination = "/data"
```
`DB_PATH=/data/data.sqlite`, `UPLOADS_DIR=/data/uploads`. `fly secrets set` pour les secrets.

### ⚠️ Limites d'upload
Beaucoup d'hébergeurs ont un cap sur la taille des requêtes :
- **Cloudflare (gratuit)** : 100 Mo max → builds > 100 Mo forcément en lien externe
- **Railway / Render** : OK jusqu'à plusieurs Go
- **Nginx devant Express** : `client_max_body_size 1200M;`

**Vercel / Netlify statique** : incompatibles (pas de filesystem persistant ni d'Express).

---

## Sécurité

- Mots de passe hashés en bcrypt (10 rounds)
- JWT HS256, 7 jours, stocké en `localStorage` (XSS → compte compromis : standard)
- Endpoints en lecture public-site : **publics** (`GET /api/projects`, etc.)
- Endpoints en écriture public-site : **admin only**
- Endpoints `/project/**` : **admin ou member**
- CORS off en prod (même origine)
- Rate-limiting sur `/auth/login` : **à ajouter** si exposition publique élevée (paquet `express-rate-limit`)

---

## Easter egg & tweaks panel

- Cliquer 3 fois sur `한` en bas à droite du footer → easter egg coréen
- Le `TweaksPanel` (accent/police) s'active via `postMessage({ type: '__activate_edit_mode' })` — inutile en prod publique, présent pour édition embarquée
