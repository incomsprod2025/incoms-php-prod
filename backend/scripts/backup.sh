#!/bin/bash
# scripts/backup.sh — Sauvegarde automatique de la BDD INCOMS
# Ajouter au crontab : 0 2 * * * /var/www/incoms/backend/scripts/backup.sh

DB_PATH="/var/www/incoms/backend/data/incoms.db"
BACKUP_DIR="/var/backups/incoms"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/incoms_$DATE.db"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Copie SQLite en mode WAL-safe
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
    echo "[$DATE] ✅ Backup réussi : $BACKUP_FILE"
    gzip "$BACKUP_FILE"
else
    echo "[$DATE] ❌ Échec du backup" >&2
    exit 1
fi

# Supprimer les backups de plus de X jours
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete
echo "[$DATE] 🗑  Nettoyage : backups > ${RETENTION_DAYS}j supprimés"
