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

# Installe les nouvelles dépendances si package.json a changé
sudo -u "$APP_USER" npm ci --omit=dev

# Rebuild le front
sudo -u "$APP_USER" npm run build

# Redémarre le processus Node (zero-downtime avec PM2)
sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 reload titisite --update-env

echo "[deploy] ✅ Déploiement terminé."
sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 status titisite
