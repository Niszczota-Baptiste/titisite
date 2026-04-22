# titisite — Portfolio Baptiste Niszczota

Portfolio one-page bilingue (FR / EN / KO) — **Développeur créatif & compositeur**.

Stack : **Vite + React 18**. 100% statique côté client, pas de backend, pas de SSR.

---

## ✨ Fonctionnalités

- Site one-page avec ancres (`#projects`, `#music`, `#about`, `#education`, `#experience`, `#contact`)
- 3 langues (FR / EN / KO), 2 thèmes (dark / light), 3 accents (violet / ambre / sauge)
- Canvas ambiant réactif (orbes qui s'adaptent à la section active)
- Cursor custom (ring + trail + label contextuel), effet glitch sur le nom, code rain sur le hero
- Lecteur musical factice (shuffle / repeat / volume), carte "Currently Building" avec jauge de progression, formulaire contact, easter egg coréen
- Bouton pause flottant pour couper toutes les animations (perf)

---

## 🗂️ Architecture

```
titisite/
├── index.html              ← entry Vite
├── vite.config.js
├── package.json
├── public/
│   └── uploads/            ← photo "à propos" (à déposer ici)
└── src/
    ├── main.jsx            ← bootstrap React
    ├── App.jsx             ← état global (lang, mode, tweaks) + assemblage
    ├── styles.css          ← tokens CSS, keyframes, classes responsive
    ├── data/               ← contenu et constantes (sans logique)
    │   ├── constants.js    ← ACCENTS, TWEAK_DEFAULTS, SECTION_MOODS, CURSOR_LABELS
    │   ├── i18n.js         ← traductions FR / EN / KO
    │   ├── projects.js
    │   ├── tracks.js
    │   ├── education.js
    │   ├── experience.js
    │   └── currently.js
    ├── hooks/
    │   ├── useReveal.js    ← IntersectionObserver → class "visible"
    │   └── useMagnetic.js  ← attraction curseur
    └── components/
        ├── ambient/        ← AmbientCanvas, CursorEffect, ScrollProgress,
        │                     FloatingPauseButton, CodeCanvas
        ├── layout/         ← Nav, Section, SectionHeader, Footer
        ├── sections/       ← Hero, Projects, Music, About, Education,
        │                     Experience, CurrentlyBuilding, Contact
        ├── ui/             ← GlitchText
        └── overlays/       ← EasterEgg, TweaksPanel
```

**Conventions :**
- Les composants reçoivent `accent`, `lang`, `t` en props — aucun état global caché.
- `window.__animPaused` / `window.__musicPlaying` sont utilisés comme bus global pour synchroniser le pause des boucles `requestAnimationFrame` entre canvases sans re-render React.
- Toutes les couleurs passent par des CSS custom properties (`--text`, `--surface`…) définies dans `styles.css` → bascule dark/light en modifiant une classe sur `<body>`.

---

## 🚀 Installation

Prérequis : **Node.js 18+** et **npm** (ou pnpm / yarn).

```bash
npm install
```

---

## 🧑‍💻 Développement

```bash
npm run dev
```

Ouvre http://localhost:5173 — HMR actif.

### Ajouter la photo "À propos"

La section About référence `/uploads/photo-1776888150170.jpg`. Déposez votre image dans `public/uploads/` — le chemin sera résolu automatiquement par Vite (les fichiers de `public/` sont servis tels quels).

---

## 📦 Build & preview

```bash
npm run build     # génère dist/
npm run preview   # sert dist/ en local pour vérifier le build
```

Le build produit un bundle unique (React + app) dans `dist/assets/` + `dist/index.html`. Poids typique : ~200 ko JS / ~66 ko gzip, ~6 ko CSS.

---

## ☁️ Déploiement

Le site étant entièrement statique, n'importe quel hôte statique fonctionne.

### Vercel
```bash
npm i -g vercel
vercel
```
(Vercel détecte Vite automatiquement — `Build command: npm run build`, `Output: dist`.)

### Netlify
- Build command : `npm run build`
- Publish directory : `dist`

### GitHub Pages
Ajouter `base: '/<repo-name>/'` dans `vite.config.js`, puis :
```bash
npm run build
npx gh-pages -d dist
```

### Cloudflare Pages / Render / S3 + CloudFront
Pointer sur le dossier `dist/` après `npm run build`.

---

## 🛠️ Personnalisation rapide

| Tu veux…                          | Modifier…                          |
|-----------------------------------|------------------------------------|
| Changer les textes                | `src/data/i18n.js`                 |
| Ajouter un projet                 | `src/data/projects.js`             |
| Ajouter une expérience / diplôme  | `src/data/experience.js` / `education.js` |
| Changer le projet "en cours"      | `src/data/currently.js`            |
| Ajouter/modifier une couleur      | `src/data/constants.js` (`ACCENTS`) |
| Ajuster les tokens de thème       | `src/styles.css` (`:root` / `body.mode-light`) |

---

## 🔒 Notes

- **`TweaksPanel`** est caché par défaut. Il s'active via un `postMessage({ type: '__activate_edit_mode' })` envoyé depuis une fenêtre parente — utile en édition embarquée, inutile en production publique.
- **Easter egg** : cliquer 3 fois sur le caractère `한` en bas à droite du footer.
