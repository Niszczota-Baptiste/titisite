#!/usr/bin/env bash
# ============================================================
#  deploy.sh — Mise à jour du site en production
#  À lancer depuis le VPS quand tu as poussé un nouveau commit :
#    sudo bash /var/www/titisite/deploy/deploy.sh
#
#  Sécurité : le commit courant est mémorisé avant le pull. Après le
#  reload PM2, un health-check sur /api/health décide du sort du déploiement ;
#  s'il échoue, on revient automatiquement à l'ancien commit (rebuild + reload).
# ============================================================
set -euo pipefail

APP_DIR="/var/www/titisite"
APP_USER="titisite"
HEALTH_URL="http://127.0.0.1:3001/api/health"

echo "[deploy] Mise à jour titisite..."

cd "$APP_DIR"

# Mémorise le commit courant pour pouvoir revenir en arrière.
PREVIOUS_COMMIT="$(sudo -u "$APP_USER" git rev-parse HEAD)"
echo "[deploy] Commit actuel : $PREVIOUS_COMMIT"

build_and_reload() {
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
}

health_check() {
  # Laisse le temps au process de booter (migrations + seed), puis sonde
  # /api/health plusieurs fois — un seul 200 suffit.
  for _ in $(seq 1 10); do
    sleep 3
    if curl -fsS --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

# Pull les derniers commits
sudo -u "$APP_USER" git pull origin main

build_and_reload

if health_check; then
  echo "[deploy] ✅ Déploiement terminé ($(sudo -u "$APP_USER" git rev-parse --short HEAD))."
else
  echo "[deploy] ❌ /api/health ne répond pas — rollback vers $PREVIOUS_COMMIT" >&2
  sudo -u "$APP_USER" git reset --hard "$PREVIOUS_COMMIT"
  build_and_reload
  if health_check; then
    echo "[deploy] ↩️  Rollback OK — l'ancien commit est de nouveau en ligne." >&2
  else
    echo "[deploy] 🔥 Rollback effectué mais /api/health ne répond toujours pas — vérifie les logs PM2." >&2
  fi
  exit 1
fi

sudo -u "$APP_USER" \
  PM2_HOME="/home/$APP_USER/.pm2" \
  pm2 status titisite
