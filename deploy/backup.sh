#!/usr/bin/env bash
# ============================================================
#  backup.sh — Sauvegarde quotidienne de la base + des uploads
#  Lancé par le timer systemd (voir titisite-backup.timer), ou à la main :
#    sudo bash /var/www/titisite/deploy/backup.sh
#
#  - DB : copie cohérente via `sqlite3 .backup` (sans couper le serveur,
#    compatible WAL), puis gzip.
#  - Uploads : tar.gz du répertoire complet.
#  - Rétention : 14 jours, purge automatique des archives plus vieilles.
# ============================================================
set -euo pipefail

APP_DIR="/var/www/titisite"
BACKUP_DIR="/var/backups/titisite"
RETENTION_DAYS=14

# Reprend DB_PATH / UPLOADS_DIR depuis le .env de l'app (mêmes valeurs que le
# serveur), avec les chemins de prod par défaut.
DB_PATH="/var/data/titisite/data.sqlite"
UPLOADS_DIR="/var/data/titisite/uploads"
if [ -f "$APP_DIR/.env" ]; then
  _env_db="$(grep -E '^DB_PATH=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- || true)"
  _env_up="$(grep -E '^UPLOADS_DIR=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- || true)"
  [ -n "${_env_db:-}" ] && DB_PATH="$_env_db"
  [ -n "${_env_up:-}" ] && UPLOADS_DIR="$_env_up"
fi

STAMP="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# ── Base SQLite (copie cohérente, même pendant les écritures) ────────────
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/data-$STAMP.sqlite'"
  gzip "$BACKUP_DIR/data-$STAMP.sqlite"
  echo "[backup] DB → $BACKUP_DIR/data-$STAMP.sqlite.gz"
else
  echo "[backup] ⚠️  DB introuvable : $DB_PATH" >&2
fi

# ── Uploads (audio, images, documents, builds) ───────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "[backup] uploads → $BACKUP_DIR/uploads-$STAMP.tar.gz"
else
  echo "[backup] ⚠️  Répertoire uploads introuvable : $UPLOADS_DIR" >&2
fi

# ── Rétention : supprime les archives de plus de RETENTION_DAYS jours ────
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'data-*.sqlite.gz' -o -name 'uploads-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "[backup] ✅ Terminé ($(date))."
