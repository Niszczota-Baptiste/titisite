# titisite

Portfolio public + admin de gestion + espace projet d'équipe (Kanban / docs / réunions / discussion / iCal).

**Stack** : Vite + React 18 (front, SPA) · Express + better-sqlite3 (back, monolithique) · JWT (auth) · multer (upload jusqu'à 1 Go).

---

## Fonctionnalités

### Site public — `/`
Portfolio one-page bilingue (FR / EN / KO), 2 thèmes (dark / light), 3 accents, easter-egg coréen.
L'ordre des sections (Projets / Musique / À propos / Formation / Expérience / En cours / Contact) est **piloté depuis l'admin** — chaque section peut être réordonnée ou cachée à la volée.

### Admin — `/admin`
Réservé aux comptes `role=admin`.
- **Page publique** : drag-and-drop pour réordonner et toggle de visibilité par section
- **Portfolio · Projets / Musique / Expérience / Formation / En cours** : CRUD du contenu public
- **Projets d'équipe** : créer / archiver / supprimer les workspaces, gérer les membres
- **Utilisateurs** : créer / modifier / supprimer les comptes (admin et member)
- **Musique** : upload de pistes audio + sélection d'un clip 30 s pour le lecteur public

### Espace projet — `/project`
Réservé aux membres d'un projet (admin ou member).

| Onglet | Contenu |
|---|---|
| Vue d'ensemble | Stats Kanban, prochaines réunions, derniers builds, derniers documents |
| Kanban | 4 colonnes drag-and-drop, priorités, échéances, sous-tâches, tags, assignés, recherche, filtres |
| Calendrier | Vue mois (desktop) / agenda vertical (mobile), événements cliquables → modale |
| Documents | Upload ≤ 1 Go, téléchargement authentifié, commentaires par doc |
| Builds | Versions du jeu : fichier ≤ 1 Go ou lien externe, statut alpha/beta/release, changelog |
| Réunions | Upcoming / passées, fichiers liés, descriptif |
| Discussion (`/project/discussion`) | Fil global cross-projets |

### Synchro calendrier téléphone
Page d'accueil ou onglet Calendrier → bouton **📆 Exporter mon calendrier**.
- URL `webcal://` à coller dans iOS Calendar / Google Calendar / Outlook → réunions et échéances apparaissent automatiquement, refresh ~5 min
- Lien `.ics` téléchargeable pour un import one-shot
- Token rotatable, scope = workspaces accessibles à l'utilisateur

### Mobile
Layout adaptatif : header collapse en burger, Kanban une colonne avec barre d'onglets en bas, Calendar en agenda vertical, grilles stackées.

---

## Démarrer en local

```bash
npm install
cp .env.example .env
# Éditer .env (JWT_SECRET, ADMIN_*, MEMBER_*)
npm run dev          # backend (3001) + Vite (5173) en parallèle
```

Premier boot : la base SQLite est créée et seedée depuis `src/data/*.js` (contenu portfolio) + les comptes définis dans `.env`.

```bash
npm run build        # bundle Vite vers dist/
npm start            # NODE_ENV=production, sert dist/ + /api sur le même port
```

---

## Variables d'environnement

| Var | Requis | Défaut | Description |
|---|---|---|---|
| `JWT_SECRET` | oui | — | Clé de signature JWT (ex. `openssl rand -hex 32`) |
| `ADMIN_EMAIL` | oui | — | Email du compte admin créé au seed |
| `ADMIN_PASSWORD` | oui | — | Mot de passe admin (hashé en bcrypt) |
| `ADMIN_NAME` | non | — | Nom affiché |
| `MEMBER_EMAIL` | oui | — | Email du compte membre projet |
| `MEMBER_PASSWORD` | oui | — | Mot de passe membre |
| `MEMBER_NAME` | non | — | Nom affiché |
| `PORT` | non | `3001` | Port Express |
| `DB_PATH` | non | `./data.sqlite` | Chemin SQLite |
| `UPLOADS_DIR` | non | `./uploads` | Dossier des fichiers |
| `MAX_UPLOAD_BYTES` | non | `1073741824` | Taille max par upload (1 Go) |

---

## Architecture

```
titisite/
├── server/                    Express + SQLite
│   ├── index.js               Mount des routes, sert dist/ en prod
│   ├── db.js                  Schéma SQLite + migrations idempotentes
│   ├── auth.js                JWT verify + role guards
│   ├── users.js               bcrypt + tokens iCal par user
│   ├── workspaces.js          CRUD workspaces + migration "Projet principal"
│   ├── seed.js                Seed initial (users + données portfolio)
│   ├── uploads.js             multer (disk storage, UUID + extension)
│   ├── middleware/scope.js    resolveWorkspace (vérif appartenance)
│   └── routes/
│       ├── auth.js            POST /login, GET /me
│       ├── users.js           CRUD admin only
│       ├── settings.js        public-sections (GET public, PUT admin)
│       ├── workspaces.js      CRUD workspaces + members
│       ├── features.js        Kanban (scoped /:slug/features)
│       ├── meetings.js        Réunions (scoped)
│       ├── documents.js       Upload + download auth (scoped)
│       ├── builds.js          Builds avec fichier OU URL externe (scoped)
│       ├── tags.js            Rename / delete tags globalement (scoped)
│       ├── comments.js        Polymorphe (document | feature | discussion)
│       ├── calendar.js        ICS feed public (token-based)
│       ├── tracks.js          CRUD musique + upload audio
│       ├── me.js              /me/events (cross-project) + /me/ical-token
│       └── collection.js      JSON-blob CRUD (projects/education/experience/currently)
│
├── src/                       React app
│   ├── main.jsx · App.jsx     Routes (Public / Admin / Project)
│   ├── pages/
│   │   ├── Public.jsx         Portfolio public, lit l'ordre des sections
│   │   ├── Admin.jsx          Wrapper auth (role=admin)
│   │   └── Project.jsx        Wrapper auth (role admin|member) + sub-router
│   ├── api/client.js          Fetch wrapper, helpers par ressource
│   ├── auth/AuthContext.jsx   Provider JWT + login/logout
│   ├── data/                  Seed du portfolio (i18n + collections)
│   ├── hooks/                 useContent, useReveal, useMagnetic, useIsMobile
│   ├── styles.css             Tokens + animations
│   └── components/
│       ├── ambient/           Canvas, scroll progress, cursor, code rain
│       ├── layout/            Nav, Section, Footer
│       ├── sections/          Hero, Projects, Music, About, Education, …
│       ├── ui/                Tokens (ACC, Button, Input, Field, …)
│       ├── overlays/          EasterEgg, TweaksPanel
│       ├── admin/             Dashboard + editors par tab
│       └── project/           Layout, Home, Kanban, Calendar, Documents, …
│
├── public/uploads/            (placeholder pour la photo "À propos")
├── index.html · vite.config.js · package.json
└── .env.example
```

---

## Schéma DB

Tables auto-créées au boot via `migrate()` (idempotent, `ensureColumn()` pour les colonnes ajoutées en cours de route).

- **Public-site** (JSON blob, ordre par `position`) : `projects`, `tracks`, `education`, `experience`, `currently`
- **Auth** : `users(email, name, password_hash, role, ical_token)`
- **Workspaces** : `workspaces(slug, name, color, icon, status, …)` + `workspace_members(workspace_id, user_id)`
- **Workspace data** (toutes scopées par `workspace_id`) : `features`, `meetings`, `documents`, `builds`
- **Polymorphes** : `comments(target_type, target_id, body)`, `attachments(target_type, target_id, document_id)`
- **Réglages** : `site_settings(key, value)` — utilisé pour l'ordre des sections publiques

---

## Déploiement

Le serveur est monolithique : `npm run build && npm start` lance un seul process Node qui sert l'API ET le bundle.

Hébergeurs validés : **Railway, Render, Fly.io, VPS** — n'importe quel runtime Node persistant.
**Vercel / Netlify static** ne marchent pas : SQLite + uploads ont besoin d'un disque persistant.

Volumes persistants requis pour :
- `data.sqlite` (DB) → pointer `DB_PATH` dessus
- `uploads/` (fichiers) → pointer `UPLOADS_DIR` dessus

Caps à connaître :
- **Cloudflare gratuit** : 100 Mo max par requête → utiliser le champ "lien externe" pour les builds plus gros
- **Nginx devant Express** : `client_max_body_size 1200M;`

---

## Sécurité

- bcrypt (10 rounds) pour les mots de passe
- JWT HS256, 7 jours, stocké en localStorage
- Token iCal séparé du JWT (rotatable), scope = lecture seule des events accessibles à l'utilisateur
- Endpoints écriture sur le contenu public : admin only
- Endpoints `/api/workspaces/:slug/**` : `resolveWorkspace` vérifie l'appartenance avant tout enfant (features/meetings/documents/builds/tags)
- CORS off en prod (même origine)

À ajouter pour exposition publique large : rate-limit sur `/auth/login` (`express-rate-limit`).

---

## Easter eggs

- 3 clics sur le caractère `한` du footer → modal coréen
- `TweaksPanel` (accent + police) activable via `postMessage({ type: '__activate_edit_mode' })` depuis une fenêtre parente — utile pour de l'édition embarquée, pas exposé en prod publique
