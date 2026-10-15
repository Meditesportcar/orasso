# Avancement

À lire au début de chaque session, à mettre à jour à la fin.

## Terminé

- **Socle (15/10/2026)** : dépôt Git, monorepo pnpm (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `packages/design-system`), TypeScript strict, Biome, Vitest, base PostgreSQL 17 locale, première migration (tables de Better Auth, dont la double authentification).
  - API Hono : `GET /api/health` (vérifie la base), Better Auth sur `/api/auth/*` (e-mail + mot de passe ; Google et Apple inactifs sans identifiants), pg-boss démarré (schéma `pgboss`, aucune tâche), WebSocket `/api/ws` (écho).
  - Site React Router 8 en rendu serveur : page provisoire, polices Archivo, favicon, `/api` relayé vers l'API en dev.
  - Appli Expo SDK 57 (Expo Router) : écran provisoire qui interroge `/api/health`, nom « Orasso », identifiant `fr.orasso.app`, icône et écran de démarrage.
  - `packages/shared` : statuts de candidature, grades, rôles avec les libellés des docs. `packages/design-system` : vide.
- **Version de test en ligne (15/10/2026)** : https://dev.orasso.fr (site protégé par mot de passe, API ouverte sous `/api`, WebSocket `/api/ws`, certificat Let's Encrypt). Conteneurs Docker isolés sur le VPS commun (`orasso-db`, `orasso-api`, `orasso-web`), déploiement en une commande avec retour arrière automatique, sauvegarde nocturne de la base (01:15 UTC, 7 jours, restauration testée). Tout est dans `deploy/` (détail : `deploy/README.md`).

## En cours

- Rien dans ce dépôt. Le chantier est découpé en lots (relais du coordinateur) ; la conception technique du lot 02 (`ARCHITECTURE.md`) sera copiée à la racine par le lot 05.

## Prochaine étape

- Système de design en code (jetons depuis `docs/design-system/tokens.json`, 15 composants web puis natifs, deux thèmes, mouvement).
- En parallèle : API du parcours n° 1 (comptes, garage, structures, événements, candidatures, tri, liste d'attente) d'après `ARCHITECTURE.md`.
- En attente de Damien : envoi des sauvegardes d'Orasso hors du VPS (deux lignes dans `/etc/vps-backup/files.list`, voir `deploy/README.md`).

## Lancer le projet sur ce PC (Windows)

Prérequis : Node 24 (déjà installé), Git.

1. **pnpm** (une seule fois). `corepack enable` sans option demande des droits administrateur ; installer le raccourci dans le dossier utilisateur :
   ```
   corepack enable --install-directory "%APPDATA%\npm" pnpm
   ```
2. **Dépendances** : `pnpm install` à la racine.
3. **Configuration** : copier `.env.example` en `.env` et mettre un vrai `BETTER_AUTH_SECRET` :
   ```
   node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
   ```
   Pour l'appli, copier `apps/mobile/.env.example` en `apps/mobile/.env` et y mettre l'adresse IP du PC sur le Wi-Fi (le téléphone ne voit pas `localhost`).
4. **Base de données** :
   - `pnpm db:start` : démarre PostgreSQL 17 en arrière-plan (port 54329, données dans `.data/pg`, journal dans `.data/pg.log`). La première fois, crée le dossier et la base `orasso`.
   - `pnpm db:migrate` : applique les migrations.
   - `pnpm db:stop` / `pnpm db:status` : arrêter / voir l'état. La base ne redémarre pas seule après un redémarrage du PC : relancer `pnpm db:start`.
   - `pnpm db:generate` après une modification du schéma (`apps/api/src/db/schema/`), puis `pnpm db:migrate`. `pnpm db:studio` pour parcourir la base.
5. **Lancer** (un terminal par application) :
   - `pnpm dev:api` → http://localhost:3001/api/health
   - `pnpm dev:web` → http://localhost:5173 (l'API est aussi joignable sur http://localhost:5173/api)
   - `pnpm dev:mobile` → Metro (Expo) ; scanner le QR code avec Expo Go, ou `a` pour un émulateur Android.
6. **Vérifier** : `pnpm test` (la base doit tourner et être migrée), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`.

Plusieurs copies du dépôt (worktrees) : dans le `.env` de chacune, changer le port de `DATABASE_URL`, `DB_DATA_DIR`, `API_PORT`, `WEB_PORT` et le port de `PUBLIC_URL` (qui doit être celui du site).

Créer un compte de test (API lancée) :
```
curl -X POST http://localhost:3001/api/auth/sign-up/email -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -d "{\"email\":\"test@orasso.test\",\"password\":\"motdepasse-test-123\",\"name\":\"Test\"}"
```

## Déployer la version de test (dev.orasso.fr)

Depuis le PC, dans Git Bash, à la racine du dépôt (accès SSH `claude@51.210.242.118` par clé) :

```
bash deploy/deploy.sh            # envoie le commit courant, construit sur le VPS, démarre, contrôle
bash deploy/deploy.sh status     # version en ligne, état des conteneurs
bash deploy/deploy.sh logs api   # journaux (api, web ou db)
bash deploy/deploy.sh rollback   # version précédente
```

Seul ce qui est commité part. Migrations appliquées au démarrage de l'API ; seed de démonstration lancé à chaque déploiement si `db:seed` existe. Le VPS est partagé avec d'autres sites en production : lire `deploy/README.md` avant d'y toucher (nginx, secrets, sauvegarde, restauration). Identifiants du site : `C:\Users\DELL\.claude\relais\orasso\secrets-dev.txt`.
