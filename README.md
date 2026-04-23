# titisite — Portfolio Baptiste Niszczota

Portfolio one-page bilingue (FR / EN / KO) — **Développeur créatif & compositeur** — avec interface admin pour éditer les contenus à chaud.

**Stack :** Vite + React 18 · Express + SQLite · JWT auth.

---

## ✨ Fonctionnalités

### Site public (`/`)
- One-page avec ancres (`#projects`, `#music`, `#about`, `#education`, `#experience`, `#contact`)
- 3 langues (FR / EN / KO), 2 thèmes (dark / light), 3 accents (violet / ambre / sauge)
- Canvas ambiant réactif, curseur custom + trail, code rain hero, glitch text
- Lecteur musical, carte "Currently Building", formulaire contact, easter egg coréen
- Le contenu est chargé dynamiquement depuis l'API — **fallback automatique** sur les données statiques de `src/data/` si l'API est injoignable (le site reste visible même serveur éteint)

### Admin (`/admin`)
- Login par mot de passe (stocké en `.env`)
- CRUD complet : projets, musique, expérience, formation, projet en cours
- Édition des textes localisés (FR / EN / KO) en ligne
- Réordonnancement (flèches ↑/↓)
- Token JWT valable 7 jours, stocké en `localStorage`

---

## 🗂️ Architecture

```
titisite/
├── server/                   ← Backend Express
│   ├── index.js              ← serveur HTTP
│   ├── db.js                 ← SQLite + helpers CRUD
│   ├── auth.js               ← JWT + comparaison mdp
│   ├── seed.js               ← seed initial depuis src/data/
│   └── routes/
│       ├── auth.js           ← POST /api/auth/login, GET /api/auth/me
│       └── collection.js     ← CRUD générique (projects, tracks, …)
│
├── src/                      ← Frontend
│   ├── main.jsx              ← bootstrap + BrowserRouter
│   ├── App.jsx               ← routes (Public / Admin lazy)
│   ├── styles.css            ← tokens, keyframes, responsive
│   ├── api/client.js         ← fetch wrapper + gestion token
│   ├── data/                 ← données seed + fallback
│   ├── hooks/
│   │   ├── useContent.js     ← fetch API + fallback
│   │   ├── useReveal.js
│   │   └── useMagnetic.js
│   ├── pages/
│   │   ├── Public.jsx        ← site portfolio
│   │   └── Admin.jsx         ← gating auth + dashboard
│   └── components/
│       ├── ambient/          ← AmbientCanvas, CursorEffect, ScrollProgress, …
│       ├── layout/           ← Nav, Section, SectionHeader, Footer
│       ├── sections/         ← Hero, Projects, Music, About, …
│       ├── ui/               ← GlitchText
│       ├── overlays/         ← EasterEgg, TweaksPanel
│       └── admin/
│           ├── ui.jsx        ← primitives (Input, LocalizedField, …)
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── ItemList.jsx  ← shell CRUD générique
│           └── editors/
│               ├── ProjectsEditor.jsx
│               ├── TracksEditor.jsx
│               ├── EducationEditor.jsx
│               ├── ExperienceEditor.jsx
│               └── CurrentlyEditor.jsx
│
├── index.html / vite.config.js / package.json
├── .env.example
└── data.sqlite               ← (généré au 1er run, ignoré par git)
```

**Schéma DB :** une table par collection (`projects`, `tracks`, `education`, `experience`, `currently`) avec colonnes `id`, `position`, `data` (JSON blob), `created_at`, `updated_at`. C'est dénormalisé volontairement — la structure de chaque item est flexible et évolue sans migration.

---

## 🚀 Installation

```bash
npm install
cp .env.example .env
# puis éditer .env pour définir ADMIN_PASSWORD et JWT_SECRET
```

**Générer un JWT_SECRET fort :**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# ou :  openssl rand -hex 32
```

---

## 🧑‍💻 Développement

```bash
npm run dev
```

Lance **en parallèle** :
- `dev:server` — Express sur http://localhost:3001 avec `node --watch` (reload auto)
- `dev:client` — Vite sur http://localhost:5173 avec HMR

Vite proxifie `/api/*` vers le backend → rien à configurer côté client.

**Premier lancement :** si `data.sqlite` n'existe pas, les données de `src/data/*.js` sont importées automatiquement (voir `server/seed.js`).

**Forcer un re-seed :**
```bash
rm data.sqlite* && npm run seed -- --force
```

---

## 📦 Build & production

```bash
npm run build     # compile le frontend dans dist/
npm start         # lance Express en mode prod (sert l'API + dist/)
```

En prod, **un seul process Node** sert à la fois `/api/*` et le SPA (fallback `index.html` sur toutes les routes non-API).

### Variables d'env requises en prod

| Variable         | Obligatoire | Description                              |
|------------------|-------------|------------------------------------------|
| `ADMIN_PASSWORD` | oui         | Mot de passe d'accès à `/admin`          |
| `JWT_SECRET`     | oui         | Secret pour signer les tokens            |
| `PORT`           | non         | Port d'écoute (défaut 3001)              |
| `DB_PATH`        | non         | Chemin de la DB SQLite (défaut `./data.sqlite`) |
| `NODE_ENV`       | oui         | Doit valoir `production` pour servir `dist/` |

---

## ☁️ Déploiement

Le site n'est plus purement statique — il faut un runtime Node persistant avec un **filesystem persistant** (pour SQLite).

### Railway (recommandé, setup rapide)
1. Connecter le repo
2. Définir les env vars `ADMIN_PASSWORD`, `JWT_SECRET`, `NODE_ENV=production`
3. Build command : `npm run build`
4. Start command : `npm start`
5. Ajouter un volume persistant monté sur `/app/data/` et positionner `DB_PATH=/app/data/data.sqlite`

### Render
- Service type : **Web Service**
- Build : `npm install && npm run build`
- Start : `npm start`
- Ajouter un **Persistent Disk** monté sur `/var/data`, avec `DB_PATH=/var/data/data.sqlite`

### Fly.io
- `fly launch`, puis `fly volumes create data --size 1` et monter sur `/data`
- Dans `fly.toml`, env `DB_PATH=/data/data.sqlite`
- Secrets : `fly secrets set ADMIN_PASSWORD=… JWT_SECRET=…`

### VPS / Docker
Un `Dockerfile` simple suffirait : `node:20-alpine`, copier, `npm ci && npm run build`, `CMD ["npm","start"]`, volume sur le dossier de la DB.

### ⚠️ Vercel / Netlify
**Ne marcheront pas directement** : ces plateformes n'ont pas de filesystem persistant pour SQLite. Pour y déployer, il faudrait migrer la DB vers un service externe (Supabase / Neon / Turso).

---

## 🛠️ Utilisation de l'admin

1. Aller sur `/admin`
2. Se connecter avec le `ADMIN_PASSWORD` du `.env`
3. Naviguer entre les onglets : Projets, Musique, Expérience, Formation, En cours
4. Chaque élément a les actions : **Éditer**, **Supprimer**, **↑ / ↓** (réordonnancer)
5. Bouton **+ Ajouter** en haut à droite
6. Les textes multilingues ont trois champs côte-à-côte (`FR / EN / KO`)
7. Les modifications sont **instantanément visibles** sur le site public (refresh)

---

## 🔒 Sécurité

- Mot de passe comparé en temps constant (pas de timing attack)
- JWT signé HS256, expire après 7 jours
- Les endpoints de lecture (`GET`) sont **publics** (le site public en dépend)
- Les endpoints d'écriture (`POST / PUT / DELETE`) exigent `Authorization: Bearer <token>`
- CORS désactivé en prod (même origine), activé en dev

**Pour une utilisation sérieuse**, envisager : rate-limiting sur `/api/auth/login`, rotation du JWT_SECRET, hash bcrypt du mot de passe.

---

## 🔎 Notes

- **Fallback statique** : le site public tente de fetch `/api/*` au chargement ; en cas d'échec il utilise les données de `src/data/*.js`. Les fichiers `src/data/*.js` servent donc **à la fois** de seed initial et de roue de secours.
- **Easter egg** : cliquer 3 fois sur le caractère `한` en bas à droite du footer.
- **Tweaks panel** : activé via `postMessage({ type: '__activate_edit_mode' })` depuis une fenêtre parente (édition embarquée, non utilisé en prod publique).
