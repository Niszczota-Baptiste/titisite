#!/usr/bin/env bash
# scripts/setup-vps.sh
# Configure Nginx, SSL (Certbot) et UFW sur un VPS Ubuntu 22.04/24.04.
# À exécuter une seule fois en tant que root (ou avec sudo).
#
# Usage : sudo bash scripts/setup-vps.sh yourdomain.com contact@yourdomain.com

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${3:-/opt/titisite}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: sudo bash scripts/setup-vps.sh <domain> <email> [app_dir]"
  echo "  domain   — ex: monsite.fr"
  echo "  email    — pour les alertes Certbot"
  echo "  app_dir  — chemin vers le repo (défaut: /opt/titisite)"
  exit 1
fi

echo ""
echo "=== Setup VPS : $DOMAIN ==="
echo ""

# ── 1. Packages ──────────────────────────────────────────────────────────────

echo "→ Installation nginx, certbot, sqlite3, ufw…"
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx sqlite3 ufw

# ── 2. Nginx — config titisite ───────────────────────────────────────────────

echo "→ Configuration Nginx…"
NGINX_CONF="/etc/nginx/sites-available/titisite"
cp "${APP_DIR}/nginx.conf" "$NGINX_CONF"
# Substituer le domaine placeholder
sed -i "s/yourdomain\.com/${DOMAIN}/g" "$NGINX_CONF"

# Activer la config
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/titisite
# Désactiver la config par défaut si elle existe
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
echo "   ✔  Nginx rechargé"

# ── 3. SSL — Certbot ─────────────────────────────────────────────────────────

echo "→ Obtention du certificat SSL pour $DOMAIN…"
# --non-interactive : pas de prompt, --agree-tos : accepte les CGU,
# --redirect : force le rewrite HTTP→HTTPS dans la config Nginx.
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  -d "$DOMAIN" \
  -d "www.${DOMAIN}" \
  -m "$EMAIL"
echo "   ✔  Certificat obtenu et Nginx mis à jour"

# Renouvellement automatique (certbot installe un timer systemd, on vérifie)
systemctl is-enabled certbot.timer &>/dev/null \
  && echo "   ✔  certbot.timer actif (renouvellement automatique)" \
  || { systemctl enable --now certbot.timer && echo "   ✔  certbot.timer activé"; }

# ── 4. Firewall UFW ──────────────────────────────────────────────────────────

echo "→ Configuration UFW…"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh          # SSH en premier pour ne pas se couper
ufw allow 'Nginx Full' # 80 + 443
# 3001 n'est PAS ouvert — le serveur Node n'écoute que sur 127.0.0.1 en prod
ufw --force enable
ufw status verbose
echo "   ✔  UFW actif : SSH + HTTP/HTTPS ouverts, port 3001 fermé au public"

# ── 5. Répertoires runtime ───────────────────────────────────────────────────

echo "→ Création des répertoires de données…"
mkdir -p /data /uploads /var/backups/titisite /var/log/titisite-backup.log
# Adapter le propriétaire selon l'utilisateur qui lance le serveur Node
chown -R "$SUDO_USER":"$SUDO_USER" /data /uploads /var/backups/titisite 2>/dev/null || true
echo "   ✔  /data, /uploads, /var/backups/titisite créés"

# ── 6. Cron backup ───────────────────────────────────────────────────────────

echo "→ Installation de la tâche cron de backup (3h du matin)…"
CRON_LINE="0 3 * * * ${APP_DIR}/scripts/backup.sh >> /var/log/titisite-backup.log 2>&1"
# Ajouter seulement si pas déjà présent
( crontab -l 2>/dev/null | grep -v "titisite/scripts/backup" ; echo "$CRON_LINE" ) | crontab -
echo "   ✔  Cron installé : $CRON_LINE"

# ── 7. Test final ─────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────"
echo " Vérification : https://${DOMAIN}/api/health"
echo " (Démarrer d'abord l'app : pm2 start ecosystem.config.cjs --env production)"
echo "─────────────────────────────────────────────────"
echo ""
echo "✅  Setup terminé. Prochaines étapes :"
echo "   1. cd ${APP_DIR}"
echo "   2. bash scripts/setup-prod-env.sh   ← génère le .env"
echo "   3. npm ci --omit=dev && npm run build"
echo "   4. pm2 start ecosystem.config.cjs --env production"
echo "   5. pm2 save && pm2 startup"
echo "   6. curl https://${DOMAIN}/api/health"
