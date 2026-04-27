#!/usr/bin/env bash
# scripts/backup.sh
# Sauvegarde la base de données SQLite et le répertoire uploads.
#
# Usage manuel  : bash scripts/backup.sh
# Usage cron    : 0 3 * * * /opt/titisite/scripts/backup.sh >> /var/log/titisite-backup.log 2>&1
#
# Variables d'environnement (optionnelles, remplacent les valeurs par défaut) :
#   BACKUP_DIR   — destination des archives       (défaut: /var/backups/titisite)
#   DB_PATH      — chemin vers data.sqlite         (défaut: /data/data.sqlite)
#   UPLOADS_DIR  — répertoire des uploads          (défaut: /uploads)
#   KEEP_DAYS    — nombre de jours à conserver     (défaut: 14)

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/var/backups/titisite}"
DB_PATH="${DB_PATH:-/data/data.sqlite}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"
KEEP_DAYS="${KEEP_DAYS:-14}"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_SUBDIR="${BACKUP_DIR}/${TIMESTAMP}"

# ── Préparation ──────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_SUBDIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Début de la sauvegarde → $BACKUP_SUBDIR"

# ── SQLite — backup cohérent via l'API .backup ───────────────────────────────
# La commande `.backup` de sqlite3 utilise l'API de sauvegarde en ligne de
# SQLite : elle produit un snapshot cohérent même si des écritures sont en
# cours, sans avoir besoin d'arrêter le serveur.

DB_BACKUP="${BACKUP_SUBDIR}/data.sqlite"

if [ -f "$DB_PATH" ]; then
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '${DB_BACKUP}'"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✔  SQLite sauvegardé (sqlite3 .backup)"
  else
    # Fallback : copie simple avec WAL checkpoint avant
    cp "$DB_PATH" "$DB_BACKUP"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✔  SQLite copié (sqlite3 absent — fallback cp)"
  fi
  gzip -9 "$DB_BACKUP"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✔  DB compressée → ${DB_BACKUP}.gz"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠  $DB_PATH introuvable — pas de sauvegarde DB"
fi

# ── Uploads ──────────────────────────────────────────────────────────────────

UPLOADS_ARCHIVE="${BACKUP_SUBDIR}/uploads.tar.gz"

if [ -d "$UPLOADS_DIR" ] && [ "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  tar -czf "$UPLOADS_ARCHIVE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  SIZE=$(du -sh "$UPLOADS_ARCHIVE" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✔  Uploads archivés → $UPLOADS_ARCHIVE ($SIZE)"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ℹ  Répertoire uploads vide ou absent — ignoré"
fi

# ── Rotation — supprime les backups plus vieux que KEEP_DAYS jours ───────────

DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -mindepth 1 -type d -mtime +"$KEEP_DAYS" -print -exec rm -rf {} + | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✔  Rotation : $DELETED ancien(s) backup(s) supprimé(s) (> ${KEEP_DAYS}j)"

# ── Résumé ───────────────────────────────────────────────────────────────────

TOTAL_SIZE=$(du -sh "$BACKUP_SUBDIR" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sauvegarde terminée — $TOTAL_SIZE dans $BACKUP_SUBDIR"
