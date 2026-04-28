# ✅ Checklist — Mise en ligne baptiste-niszczota.com

---

## Étape 1 — Pointer le DNS vers le VPS

Dans l'interface IONOS, crée ces deux enregistrements DNS :

| Type | Nom | Valeur |
|------|-----|--------|
| `A` | `@` (ou `baptiste-niszczota.com`) | `<IP du VPS>` |
| `A` | `www` | `<IP du VPS>` |

> L'IP de ton VPS se trouve dans la console IONOS → "Mes serveurs".
> La propagation DNS peut prendre jusqu'à 1 h.

---

## Étape 2 — Se connecter au VPS

```bash
ssh root@<IP-du-VPS>
```

---

## Étape 3 — Télécharger et lancer le script d'installation

```bash
# Sur le VPS, en root :
curl -fsSL https://raw.githubusercontent.com/Niszczota-Baptiste/titisite/main/deploy/setup.sh -o setup.sh
chmod +x setup.sh
bash setup.sh
```

> Le script s'arrête automatiquement si `.env` n'existe pas encore (étape 4).

---

## Étape 4 — Remplir le fichier .env

Le script crée `/var/www/titisite/.env` depuis `.env.example`.
Tu dois renseigner les valeurs sensibles :

```bash
nano /var/www/titisite/.env
```

```env
# Génère JWT_SECRET avec :
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<clé-64-chars-aléatoire>

ADMIN_EMAIL=<ton-email>
ADMIN_NAME=Baptiste
ADMIN_PASSWORD=<mot-de-passe-fort-12-chars-min>

MEMBER_EMAIL=<email-collaborateur>
MEMBER_NAME=<prénom>
MEMBER_PASSWORD=<mot-de-passe-fort>

PORT=3001
DB_PATH=/var/data/titisite/data.sqlite
UPLOADS_DIR=/var/data/titisite/uploads
CANONICAL_ORIGIN=https://baptiste-niszczota.com
```

Puis relance le script pour terminer l'installation :

```bash
bash setup.sh
```

---

## Étape 5 — Vérifier que tout fonctionne

```bash
# Statut du processus Node
sudo -u titisite pm2 status

# Logs en direct
sudo -u titisite pm2 logs titisite

# Test HTTPS
curl -I https://baptiste-niszczota.com
```

Tu dois voir `HTTP/2 200` et l'en-tête `strict-transport-security`.

---

## Étape 6 — (Optionnel) Ajouter une image Open Graph

Crée une image `1200 × 630 px` représentant ton portfolio,
place-la dans `public/og-image.jpg`, puis ajoute dans `index.html` :

```html
<meta property="og:image" content="https://baptiste-niszczota.com/og-image.jpg" />
```

---

## Mises à jour futures

Pour chaque nouveau commit poussé sur `main` :

```bash
# Sur le VPS :
sudo bash /var/www/titisite/deploy/deploy.sh
```

---

## En cas de problème

```bash
# Nginx
sudo nginx -t && sudo systemctl status nginx

# Logs Node
sudo -u titisite pm2 logs titisite --lines 50

# Relancer manuellement
sudo -u titisite pm2 restart titisite
```
