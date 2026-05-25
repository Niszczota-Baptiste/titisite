#!/usr/bin/env bash
# ============================================================
#  deploy.sh — Mise à jour du site en production
#  À lancer depuis le VPS quand tu as poussé un nouveau commit :
#    sudo bash /var/www/titisite/deploy/deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="/var/www/titisite"
APP_USER="titisite"

echo "[deploy] Mise à jour titisite..."

cd "$APP_DIR"

# Pull les derniers commits
sudo -u "$APP_USER" git pull origin main

# Installe toutes les dépendances (dev incluses) — vite & co sont
# nécessaires pour builder le front.
# --include=dev est indispensable : si NODE_ENV=production est présent dans
# l'environnement (PM2 / shell de l'utilisateur), npm omet sinon les
# devDependencies et le build échoue avec « vite: not found ».
sudo -u "$APP_USER" npm ci --include=dev

# Rebuild le front
sudo -u "$APP_USER" npm run build

# Retire les devDependencies du node_modules : le runtime n'en a pas besoin
# et ça évite de laisser des CVE de build (ex. fast-uri) sur le disque en prod.
sudo -u "$APP_USER" npm prune --omit=dev

# Redémarre le processus Node (zero-downtime avec PM2)
sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 reload titisite --update-env

echo "[deploy] ✅ Déploiement terminé."
sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 status titisite
