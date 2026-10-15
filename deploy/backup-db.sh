#!/usr/bin/env bash
# Sauvegarde de la base Orasso (conteneur orasso-db) : pg_dump au format personnalisé, 7 jours gardés.
# Installé sur le VPS en /usr/local/sbin/orasso-backup-db.sh, lancé chaque nuit par orasso-backup.timer.
# Restaurer : voir AVANCEMENT.md (« Sauvegarde et restauration »).
set -euo pipefail

DIR=/var/backups/orasso
KEEP_DAYS=7

install -d -m 700 -o root -g root "$DIR"
file=$DIR/orasso-$(date -u +%Y%m%d-%H%M%S).dump
docker exec orasso-db pg_dump -U orasso -d orasso --format=custom >"$file.tmp"
chmod 600 "$file.tmp"
mv "$file.tmp" "$file"
find "$DIR" -name 'orasso-*.dump' -mtime +$((KEEP_DAYS - 1)) -delete
find "$DIR" -name 'orasso-*.dump.tmp' -mmin +60 -delete
echo "sauvegarde : $file ($(du -h "$file" | cut -f1))"
