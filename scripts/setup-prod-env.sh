#!/usr/bin/env bash
# scripts/setup-prod-env.sh
# Génère un .env de production avec des secrets forts.
# Usage : bash scripts/setup-prod-env.sh
# Le fichier .env créé n'est jamais commité (voir .gitignore).

set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [ -f "$ENV_FILE" ]; then
  echo "⚠  Un .env existe déjà à $ENV_FILE"
  read -rp "   Écraser ? [y/N] " overwrite
  [[ "$overwrite" =~ ^[Yy]$ ]] || { echo "Annulé."; exit 0; }
fi

# ── Fonctions utilitaires ────────────────────────────────────────────────────

gen_secret() {
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
}

read_required() {
  local prompt="$1" val=""
  while [ -z "$val" ]; do
    read -rp "$prompt" val
  done
  echo "$val"
}

read_password() {
  local prompt="$1" val="" confirm=""
  while true; do
    read -rsp "$prompt" val; echo
    if [ "${#val}" -lt 12 ]; then
      echo "  → Minimum 12 caractères, recommencez."; continue
    fi
    read -rsp "  Confirmez : " confirm; echo
    [ "$val" = "$confirm" ] && break
    echo "  → Les mots de passe ne correspondent pas."
  done
  echo "$val"
}

# ── Collecte des informations ────────────────────────────────────────────────

echo ""
echo "=== Configuration production — titisite ==="
echo ""

JWT_SECRET=$(gen_secret)
echo "✔  JWT_SECRET généré automatiquement."
echo ""

CANONICAL_ORIGIN=$(read_required "Domaine public (ex: https://monsite.fr) : ")
# Supprimer le slash final si présent
CANONICAL_ORIGIN="${CANONICAL_ORIGIN%/}"

echo ""
echo "── Compte admin ──"
ADMIN_EMAIL=$(read_required "Email admin : ")
ADMIN_NAME=$(read_required "Nom admin   : ")
ADMIN_PASSWORD=$(read_password "Mot de passe admin (≥ 12 chars, sera masqué) : ")

echo ""
echo "── Compte collaborateur ──"
MEMBER_EMAIL=$(read_required "Email collaborateur : ")
MEMBER_NAME=$(read_required "Nom collaborateur   : ")
MEMBER_PASSWORD=$(read_password "Mot de passe collaborateur (≥ 12 chars, sera masqué) : ")

echo ""
echo "── SMTP (optionnel — Entrée pour ignorer) ──"
read -rp "SMTP_HOST   : " SMTP_HOST
read -rp "SMTP_PORT   : " SMTP_PORT
read -rp "SMTP_USER   : " SMTP_USER
read -rsp "SMTP_PASS   : " SMTP_PASS; echo
read -rp "SMTP_SECURE [false] : " SMTP_SECURE
read -rp "SMTP_FROM   : " SMTP_FROM

# ── Écriture du fichier ──────────────────────────────────────────────────────

cat > "$ENV_FILE" <<EOF
# Généré par scripts/setup-prod-env.sh le $(date '+%Y-%m-%d %H:%M:%S')
# NE PAS COMMITER CE FICHIER.

JWT_SECRET=${JWT_SECRET}

ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_NAME=${ADMIN_NAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

MEMBER_EMAIL=${MEMBER_EMAIL}
MEMBER_NAME=${MEMBER_NAME}
MEMBER_PASSWORD=${MEMBER_PASSWORD}

CANONICAL_ORIGIN=${CANONICAL_ORIGIN}

# Données runtime (valeurs par défaut recommandées pour un VPS)
DB_PATH=/data/data.sqlite
UPLOADS_DIR=/uploads

EOF

if [ -n "${SMTP_HOST:-}" ]; then
  cat >> "$ENV_FILE" <<EOF
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_FROM=${SMTP_FROM}
EOF
fi

# Droits restrictifs : lisible uniquement par le propriétaire
chmod 600 "$ENV_FILE"

echo ""
echo "✔  .env écrit dans $ENV_FILE (chmod 600)"
echo ""
echo "Prochaine étape :"
echo "  npm ci --omit=dev && npm run build && NODE_ENV=production npm start"
