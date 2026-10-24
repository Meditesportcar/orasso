#!/bin/sh
# Démarrage de l'API dans son conteneur : migrations versionnées, puis serveur.
# Le seed de démonstration n'est pas lancé ici (il passerait à chaque redémarrage) : voir remote-deploy.sh.
set -e
cd /app/apps/api
tsx src/db/migrate.ts
# Lot R3c : référentiel des véhicules (ajoute ce qui manque, idempotent). Un échec ne bloque pas le démarrage.
tsx scripts/reference-sync.ts || echo "[orasso] ATTENTION : synchronisation du référentiel impossible"
exec tsx src/index.ts
