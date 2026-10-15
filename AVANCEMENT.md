# Avancement

À lire au début de chaque session, à mettre à jour à la fin.

## Terminé

- **Socle (15/10/2026)** : dépôt Git, monorepo pnpm (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `packages/design-system`), TypeScript strict, Biome, Vitest, base PostgreSQL 17 locale, première migration (tables de Better Auth, dont la double authentification).
  - API Hono : `GET /api/health` (vérifie la base), Better Auth sur `/api/auth/*` (e-mail + mot de passe ; Google et Apple inactifs sans identifiants), pg-boss démarré (schéma `pgboss`, aucune tâche), WebSocket `/api/ws` (écho).
  - Site React Router 8 en rendu serveur : page provisoire, polices Archivo, favicon, `/api` relayé vers l'API en dev.
  - Appli Expo SDK 57 (Expo Router) : écran provisoire qui interroge `/api/health`, nom « Orasso », identifiant `fr.orasso.app`, icône et écran de démarrage.
  - `packages/shared` : statuts de candidature, grades, rôles avec les libellés des docs. `packages/design-system` : vide (rempli par le lot 03).
- **API A du parcours n° 1 (lot 05, 15/10/2026)** — référence technique : `ARCHITECTURE.md` à la racine ; choix non écrits : `docs/JOURNAL-DES-CHOIX.md`.
  - Migrations `0001` à `0007` : profils, catégories, appareils, structures (membres, abonnés, bannis), référentiel véhicules, garage (photos, catégories, demandes de transfert de plaque), événements (jours, zones, invitations), candidatures et leur journal, notifications, file des e-mails, journal d'administration.
  - `packages/shared` : énumérations et libellés français, règles pures (transitions de candidature, échéance des offres de la liste d'attente, verrouillage H−2, avant-première, heures calmes, grades, plaque normalisée), schémas zod d'entrée et types de sortie.
  - Routes : profil (`/api/me`, profil d'un autre selon public/privé, appareils), garage (CRUD, photos 1–8 recompressées en WebP, plaque unique parmi les actifs, jamais exposée hors propriétaire et organisateur), référentiel, structures (création, membres et invitations, abonnés, bannis, vérification par le super admin tracée), événements (liste et page publiques par slug, création en brouillon, publication réservée aux structures vérifiées, modification, Maintenu/Incertain, annulation, zones), candidatures (candidater avec un ou plusieurs véhicules, cartes « Accès », désistement, offre de place à accepter ou refuser), tri (liste filtrée, file une par une, compteurs, décisions unitaires et en masse, motifs envoyés ou non, liste d'attente réordonnable, zones, avis du staff de filtration), notifications (Journal paginé, lu/non lu), journal d'administration.
  - Règles : machine à états journalisée, liste d'attente automatique (24 h, 3 h la veille, 2 h le jour J, jamais après le verrouillage), désistement sans malus jusqu'au verrouillage puis marqué pour le malus de J+2, admission libre retenue d'office, 2FA obligatoire organisateurs et administration (`DEV_SKIP_2FA` en développement seulement).
  - Notifications en base + WebSocket + e-mail (transport « journal ») ; Expo Push prêt (envoi si un jeton est enregistré) ; heures calmes 22:00–08:00 hors jour J. Temps réel `/api/ws` : canaux `user:<id>` et `event:<id>:triage|live|access` avec contrôle des droits.
  - Tâches pg-boss : expiration des offres, verrouillage, avant-première, rappels J−7 et veille, livraison des notifications différées.
  - Seed `pnpm db:seed` (MéditeSportCar, Nocturne de Canet avec les volumes du prototype, Expo Rivesaltes, C&C Perpignan, Hivernale 2027 en brouillon) ; tests Vitest (règles pures, garage, candidatures, liste d'attente, verrouillage, droits, plaque) et scénario de bout en bout `apps/api/test/scenario-parcours1-a.test.ts`.
- **Système de design web (lot 03, 15/10/2026)** : `packages/design-system` fournit au site les jetons (générés depuis `docs/design-system/tokens.json`), les deux thèmes Béton et Sable, le mouvement « tout se gare » et les 16 composants React du système v1 (AppBar, Brand, Button, Chip, Counters, Cover, Field, Ground, Icons, Motion, Plate, PosterCard, ScanResult, StatusBadge, TabBar, VehicleCard).
  - Import côté site : `import "@orasso/design-system/web/styles.css"` (une fois, dans `root.tsx`) puis `import { Button, … } from "@orasso/design-system/web"`. Commun au natif (lot 04) : `@orasso/design-system` (jetons `tokens`, `duration`/`curve`/`park`, `badgeLabels`, `iconShapes`, `tabSets`), sans React.
  - Thème : cookie `orasso-theme` (`beton` | `sable` | `auto`, défaut Béton) lu par le serveur, `data-theme` sur `<html>`, sans flash ; `ThemeProvider`, `useTheme`, `ThemeScope`. Archivo variable auto-hébergée (une seule famille, trois largeurs).
  - Page de recette `/_ds` (non liée) : tous les composants dans les deux thèmes ; `?only=<composant>&theme=<beton|sable>`. Les choix et écarts aux aperçus sont dans `docs/JOURNAL-DES-CHOIX.md`.
  - Vérifié : `pnpm --filter @orasso/design-system run build`, `run test` (20 tests : jetons, mouvement, rendu serveur, aucune valeur en dur) et `run typecheck` ; `pnpm lint` ; `pnpm --filter @orasso/web run build`.
- **Version de test en ligne (15/10/2026)** : https://dev.orasso.fr (site protégé par mot de passe, API ouverte sous `/api`, WebSocket `/api/ws`, certificat Let's Encrypt). Conteneurs Docker isolés sur le VPS commun (`orasso-db`, `orasso-api`, `orasso-web`), déploiement en une commande avec retour arrière automatique, sauvegarde nocturne de la base (01:15 UTC, 7 jours, restauration testée). Tout est dans `deploy/` (détail : `deploy/README.md`).

## En cours

- Rien dans ce dépôt : la suite est découpée en lots (relais du coordinateur).

## Prochaine étape

- API B (lot 06) : QR signés et pass émis à la retenue (brancher dans `apps/api/src/modules/applications/service.ts`), synchro du staff, scans hors ligne, pointage, points et malus à J+2 (`ARCHITECTURE.md` § 7, lot 06 ; migrations à partir de `0008`).
- Système de design natif : les composants React Native à partir de `@orasso/design-system` (lot 04). Les écrans du site s'écrivent avec les composants web (lot 07).
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
   - `pnpm db:seed` : données de démonstration (ne fait rien si elles sont déjà là ; `pnpm db:seed --reset` pour tout effacer et recommencer, `--small` pour des volumes réduits). Comptes en `@orasso.local` (Damien : `damien@orasso.local`, super admin et propriétaire de MéditeSportCar ; Kenji, Léa, Nina, Marc, Julie, Théo, Sarah ; `pilote1@orasso.local`…), mot de passe : `SEED_PASSWORD` du `.env`. Les comptes du seed n'ont pas de double authentification : garder `DEV_SKIP_2FA=true` en développement pour entrer dans l'espace organisateur.
5. **Lancer** (un terminal par application) :
   - `pnpm dev:api` → http://localhost:3001/api/health
   - `pnpm dev:web` → http://localhost:5173 (l'API est aussi joignable sur http://localhost:5173/api) ; la page de recette du système de design est sur `/_ds`
   - `pnpm dev:mobile` → Metro (Expo) ; scanner le QR code avec Expo Go, ou `a` pour un émulateur Android.
6. **Vérifier** : `pnpm test` (la base doit tourner ; les tests de l'API créent et migrent eux-mêmes une base séparée `orasso_test`, la base de dev et son seed ne sont pas touchés), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`.
7. **E-mails en développement** : transport « journal », chaque e-mail est écrit dans `.data/mail/` (un fichier HTML) et résumé dans la console de l'API. Photos envoyées : `.data/storage/`, servies par `/api/files/…`.

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
