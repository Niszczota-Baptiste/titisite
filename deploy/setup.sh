#!/usr/bin/env bash
# ============================================================
#  setup.sh — Installation initiale du VPS IONOS pour titisite
#  Domaine : baptiste-niszczota.com
#  OS cible : Ubuntu 22.04 / Debian 12
#
#  ── Repo PUBLIC ─────────────────────────────────────────────
#  curl -fsSL https://raw.githubusercontent.com/Niszczota-Baptiste/titisite/main/deploy/setup.sh -o setup.sh
#  chmod +x setup.sh && sudo bash setup.sh
#
#  ── Repo PRIVÉ (cas actuel) ─────────────────────────────────
#  Génère un Personal Access Token (https://github.com/settings/tokens)
#  avec le scope "repo", puis :
#    GITHUB_TOKEN=ghp_xxx
#    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" \
#      https://raw.githubusercontent.com/Niszczota-Baptiste/titisite/main/deploy/setup.sh \
#      -o setup.sh
#    chmod +x setup.sh
#    sudo GITHUB_TOKEN="$GITHUB_TOKEN" bash setup.sh
#
#  Variables surchargeables (export avant de lancer) :
#    REPO_URL      — URL git du dépôt (défaut HTTPS public ; passe en SSH si privé)
#    BRANCH        — branche à déployer (défaut: main)
#    GITHUB_TOKEN  — token PAT pour clone HTTPS d'un repo privé
# ============================================================
set -euo pipefail

DOMAIN="baptiste-niszczota.com"
APP_DIR="/var/www/titisite"
DATA_DIR="/var/data/titisite"
LOG_DIR="/var/log/titisite"
APP_USER="titisite"
NODE_VERSION="22"
BRANCH="${BRANCH:-main}"
REPO_URL_DEFAULT="https://github.com/Niszczota-Baptiste/titisite.git"
if [ -n "${GITHUB_TOKEN:-}" ] && [ -z "${REPO_URL:-}" ]; then
  REPO_URL="https://${GITHUB_TOKEN}@github.com/Niszczota-Baptiste/titisite.git"
fi
REPO_URL="${REPO_URL:-$REPO_URL_DEFAULT}"

echo "========================================="
echo "  Installation titisite — $DOMAIN"
echo "========================================="

# ── 1. Mise à jour système ─────────────────────────────────
echo "[1/9] Mise à jour des paquets..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Dépendances système ─────────────────────────────────
echo "[2/9] Installation des dépendances..."
apt-get install -y -qq \
  curl git build-essential nginx certbot python3-certbot-nginx \
  ufw fail2ban

# ── 3. Node.js LTS via NodeSource ─────────────────────────
echo "[3/9] Installation de Node.js $NODE_VERSION LTS..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
apt-get install -y -qq nodejs
node -v && npm -v

# ── 4. PM2 (gestionnaire de processus) ────────────────────
echo "[4/9] Installation de PM2..."
npm install -g pm2 --quiet

# ── 5. Utilisateur applicatif + répertoires ───────────────
echo "[5/9] Création de l'utilisateur et des dossiers..."
id "$APP_USER" &>/dev/null || useradd --system --shell /bin/bash --create-home "$APP_USER"

mkdir -p "$APP_DIR" "$DATA_DIR/uploads" "$LOG_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"

# ── 6. Clone du dépôt ─────────────────────────────────────
echo "[6/9] Clone du dépôt Git (branche $BRANCH)..."
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  sudo -u "$APP_USER" git fetch origin "$BRANCH"
  sudo -u "$APP_USER" git checkout "$BRANCH"
  sudo -u "$APP_USER" git pull --ff-only origin "$BRANCH"
fi

# Si on a cloné via token, on retire le token de l'origin pour ne pas le
# laisser traîner dans .git/config sur le VPS.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" remote set-url origin "$REPO_URL_DEFAULT"
fi

# ── 7. Dépendances Node + build ────────────────────────────
echo "[7/9] npm install + build..."
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev
sudo -u "$APP_USER" npm run build

# Fichier .env — À REMPLIR avant de continuer !
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo ""
  echo "⚠️  STOP — Édite /var/www/titisite/.env avec tes valeurs"
  echo "    puis relance : sudo bash setup.sh"
  echo ""
  exit 1
fi

# ── 8. Nginx ──────────────────────────────────────────────
echo "[8/9] Configuration Nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/titisite
ln -sf /etc/nginx/sites-available/titisite /etc/nginx/sites-enabled/titisite
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# Certificat SSL Let's Encrypt
certbot --nginx \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --non-interactive --agree-tos \
  --email "$(grep ADMIN_EMAIL "$APP_DIR/.env" | cut -d= -f2)" \
  --redirect

# ── 9. PM2 + démarrage au boot ────────────────────────────
echo "[9/9] Démarrage de l'application avec PM2..."
mkdir -p "$LOG_DIR"
chown "$APP_USER":"$APP_USER" "$LOG_DIR"

sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 start "$APP_DIR/deploy/ecosystem.config.cjs" \
  --env production

sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 save

env PATH=$PATH:/usr/bin pm2 startup systemd \
  -u "$APP_USER" --hp "/home/$APP_USER"

# ── Pare-feu UFW ──────────────────────────────────────────
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

echo ""
echo "✅ Installation terminée !"
echo "   Site accessible sur https://$DOMAIN"
echo ""
echo "   Commandes utiles :"
echo "     sudo -u $APP_USER pm2 logs titisite"
echo "     sudo -u $APP_USER pm2 status"
echo "     sudo bash /var/www/titisite/deploy/deploy.sh   (mises à jour)"
