# Avancement

À lire au début de chaque session, à mettre à jour à la fin.

## Terminé

- **Socle (15/10/2026)** : dépôt Git, monorepo pnpm (`apps/api`, `apps/web`, `apps/mobile`, `packages/shared`, `packages/design-system`), TypeScript strict, Biome, Vitest, base PostgreSQL 17 locale, première migration (tables de Better Auth, dont la double authentification).
  - API Hono : `GET /api/health` (vérifie la base), Better Auth sur `/api/auth/*` (e-mail + mot de passe ; Google et Apple inactifs sans identifiants), pg-boss démarré (schéma `pgboss`, aucune tâche), WebSocket `/api/ws` (écho).
  - Site React Router 8 en rendu serveur : page provisoire, polices Archivo, favicon, `/api` relayé vers l'API en dev.
  - Appli Expo SDK 57 (Expo Router) : écran provisoire qui interroge `/api/health`, nom « Orasso », identifiant `fr.orasso.app`, icône et écran de démarrage.
  - `packages/shared` : statuts de candidature, grades, rôles avec les libellés des docs. `packages/design-system` : vide (rempli par le lot 03).
- **Système de design web (lot 03, 15/10/2026)** : `packages/design-system` fournit au site les jetons (générés depuis `docs/design-system/tokens.json`), les deux thèmes Béton et Sable, le mouvement « tout se gare » et les 16 composants React du système v1 (AppBar, Brand, Button, Chip, Counters, Cover, Field, Ground, Icons, Motion, Plate, PosterCard, ScanResult, StatusBadge, TabBar, VehicleCard).
  - Import côté site : `import "@orasso/design-system/web/styles.css"` (une fois, dans `root.tsx`) puis `import { Button, … } from "@orasso/design-system/web"`. Commun au natif (lot 04) : `@orasso/design-system` (jetons `tokens`, `duration`/`curve`/`park`, `badgeLabels`, `iconShapes`, `tabSets`), sans React.
  - Thème : cookie `orasso-theme` (`beton` | `sable` | `auto`, défaut Béton) lu par le serveur, `data-theme` sur `<html>`, sans flash ; `ThemeProvider`, `useTheme`, `ThemeScope`. Archivo variable auto-hébergée (une seule famille, trois largeurs).
  - Page de recette `/_ds` (non liée) : tous les composants dans les deux thèmes ; `?only=<composant>&theme=<beton|sable>`. Les choix et écarts aux aperçus sont dans `docs/JOURNAL-DES-CHOIX.md`.
  - Vérifié : `pnpm --filter @orasso/design-system run build`, `run test` (20 tests : jetons, mouvement, rendu serveur, aucune valeur en dur) et `run typecheck` ; `pnpm lint` ; `pnpm --filter @orasso/web run build`.

- **Système de design natif (lot 04, 15/10/2026)** : `@orasso/design-system/native` fournit à l'appli Expo les mêmes composants que le web (AppBar, Brand, Button, Chip, Counters, Cover, Field, Ground, Icons, Motion, Plate, PosterCard, ScanResult, StatusBadge, TabBar, VehicleCard), alimentés par les mêmes jetons, en Béton et en Sable, avec le mouvement « tout se gare » (Reanimated), le fond vivant et les barres brossées redessinés en `react-native-svg`, Archivo en six instances statiques, l'indicateur de chargement, l'écran d'ouverture (logo animé 1,6 s) et le résultat de scan (carte ou plein écran, trois sons provisoires).
  - Utilisation : `<ThemeProvider>` à la racine (`apps/mobile/src/app/_layout.tsx`), attendre `useOrassoFonts()`, puis `import { Button, PosterCard, … } from "@orasso/design-system/native"`. Thème : `useTheme()` (`theme`, `preference`, `setPreference`, jetons `t`) ; réduction des animations : réglage de l'appareil (`/_ds?reduce=1` pour la recette).
  - Recette : route cachée `/_ds` de l'appli (chaque composant en Béton et Sable ; `?only=<composant>&theme=<beton|sable>`), à voir avec `pnpm --filter @orasso/mobile exec expo start --web` (puis http://localhost:8081/_ds, ou le port choisi). Les choix et écarts sont dans `docs/JOURNAL-DES-CHOIX.md`.
  - Vérifié : `pnpm typecheck`, `pnpm test` (32 tests du design system dont aucune valeur de couleur ou de durée en dur dans les composants natifs), `pnpm lint`, `expo export --platform android` et `--platform ios`, rendu de `/_ds` dans le navigateur. **Pas encore sur simulateur ni appareil.**

## En cours

- Rien dans ce dépôt. Le chantier est découpé en lots (relais du coordinateur) ; la conception technique du lot 02 (`ARCHITECTURE.md`) sera copiée à la racine par le lot 05.

## Prochaine étape

- Écrans de l'appli avec les composants natifs (lots 09 et 10) ; les écrans du site avec les composants web (lot 07). Le thème choisi par l'utilisateur doit être mémorisé par l'appli (`onPreferenceChange`).
- En parallèle : API du parcours n° 1 (comptes, garage, structures, événements, candidatures, tri, liste d'attente) d'après `ARCHITECTURE.md`, et déploiement de `dev.orasso.fr`.

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
   - `pnpm dev:web` → http://localhost:5173 (l'API est aussi joignable sur http://localhost:5173/api) ; la page de recette du système de design est sur `/_ds`
   - `pnpm dev:mobile` → Metro (Expo) ; scanner le QR code avec Expo Go, ou `a` pour un émulateur Android.
6. **Vérifier** : `pnpm test` (la base doit tourner et être migrée), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`.

Plusieurs copies du dépôt (worktrees) : dans le `.env` de chacune, changer le port de `DATABASE_URL`, `DB_DATA_DIR`, `API_PORT`, `WEB_PORT` et le port de `PUBLIC_URL` (qui doit être celui du site).

Créer un compte de test (API lancée) :
```
curl -X POST http://localhost:3001/api/auth/sign-up/email -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -d "{\"email\":\"test@orasso.test\",\"password\":\"motdepasse-test-123\",\"name\":\"Test\"}"
```
