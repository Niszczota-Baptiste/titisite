# ✅ Checklist — Avant la mise en ligne

Complète ces points avant de déployer en production.
Coche chaque case (`[x]`) au fur et à mesure.

---

## 🔑 Variables d'environnement obligatoires

- [ ] **`JWT_SECRET`** — génère une clé forte :
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **`ADMIN_EMAIL`** / **`ADMIN_PASSWORD`** — mot de passe ≥ 12 caractères

- [ ] **`MEMBER_EMAIL`** / **`MEMBER_PASSWORD`** — idem

- [ ] **`CANONICAL_ORIGIN`** — URL publique **exacte** du site, exemple :
  ```
  CANONICAL_ORIGIN=https://baptiste.dev
  ```
  > ⚠️ Sans cette variable le serveur **refuse de démarrer** en `NODE_ENV=production`.
  > Elle sert à générer les URLs iCal sans fuite via l'en-tête `Host`.

---

## 🌐 Domaine à renseigner dans deux fichiers

Une fois ton domaine connu, mets-le à jour ici :

- [ ] **`public/robots.txt`** ligne `Sitemap:` :
  ```
  Sitemap: https://TON-DOMAINE.com/sitemap.xml
  ```

- [ ] **`public/sitemap.xml`** balise `<loc>` :
  ```xml
  <loc>https://TON-DOMAINE.com/</loc>
  ```

---

## 🖼️ Open Graph — image de partage social

- [ ] Crée une image **1200 × 630 px** (capture d'écran du site, bannière, etc.)
  et place-la dans `public/og-image.jpg` (ou `.png`).

- [ ] Ajoute les deux balises manquantes dans **`index.html`** :
  ```html
  <meta property="og:url"   content="https://TON-DOMAINE.com/" />
  <meta property="og:image" content="https://TON-DOMAINE.com/og-image.jpg" />
  ```

---

## 🗄️ Volumes persistants (hébergeur)

La base SQLite et les fichiers uploadés **doivent survivre aux redéploiements**.
Configure un disque/volume persistant sur ta plateforme et pointe les variables :

```env
DB_PATH=/data/data.sqlite
UPLOADS_DIR=/data/uploads
```

| Plateforme | Comment faire |
|---|---|
| **Railway** | Dashboard → ton service → *Volumes* → `Mount Path: /data` |
| **Render** | Dashboard → ton service → *Disks* → `Mount Path: /data` |
| **Fly.io** | `fly volumes create data --size 1` puis dans `fly.toml` : `[mounts] source = "data" destination = "/data"` |
| **VPS** | Dossier sur le disque, variable `DB_PATH` + `UPLOADS_DIR` dans le `.env` |

> ⚠️ Un redéploiement **sans volume** efface la base et les uploads. Vérifie
> que le volume est bien attaché **avant** le premier boot en prod.

---

## 🎨 Favicon

- [ ] Le fichier `public/favicon.svg` a été créé (monogramme « B » violet).
  Teste-le dans le navigateur — si tu veux un `.ico` multi-résolution :
  ```bash
  # avec ImageMagick
  convert favicon.svg -resize 48x48 public/favicon.ico
  ```

---

## 📧 Email digest (optionnel)

- [ ] Si tu veux activer les digests email, configure dans `.env` :
  ```env
  SMTP_HOST=smtp.example.com
  SMTP_PORT=587
  SMTP_USER=ton-user
  SMTP_PASS=ton-mot-de-passe
  SMTP_SECURE=false
  SMTP_FROM=Baptiste <no-reply@TON-DOMAINE.com>
  ```

---

## 🔒 Reverse proxy (si Nginx devant Express)

- [ ] Ajoute dans la config Nginx :
  ```nginx
  client_max_body_size 1200M;   # builds jusqu'à 1 Go
  gzip on;
  gzip_types text/plain application/json application/javascript text/css;
  brotli on;                    # si module ngx_brotli installé
  ```

---

## 🚀 Commande de démarrage finale

```bash
npm run build     # génère dist/
npm start         # NODE_ENV=production, port 3001 (ou $PORT)
```
