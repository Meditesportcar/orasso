#!/bin/sh
# Démarrage de l'API dans son conteneur : migrations versionnées, puis serveur.
# Le seed de démonstration n'est pas lancé ici (il passerait à chaque redémarrage) : voir remote-deploy.sh.
set -e
cd /app/apps/api
tsx src/db/migrate.ts
exec tsx src/index.ts
