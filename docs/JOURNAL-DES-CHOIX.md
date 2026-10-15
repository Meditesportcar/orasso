# Journal des choix

Ce que les documents de conception ne tranchent pas et que Claude Code a choisi (la solution la plus simple et cohérente avec les docs), pour relecture par Damien. Les entrées s'ajoutent à la fin de chaque section ; on ne réécrit pas une entrée, on la corrige par une nouvelle.

## Choix

### 15/10/2026 — Socle (lot 01)

- **Stack validée au démarrage, versions retenues.** Node 24.12 ; pnpm 12 ; TypeScript 6.0 ; Hono 4.13 sur `@hono/node-server` 2 ; React Router 8.4 (mode framework, rendu serveur) avec Vite 8 ; Expo SDK 57 (React Native 0.86, Expo Router 57) ; React 19.2.3 ; PostgreSQL 17 ; Drizzle ORM 0.45 et drizzle-kit 0.31 ; Better Auth 1.7 ; pg-boss 12 ; zod 4 ; Vitest 5 ; Biome 2.5. Aucun écart avec la stack de `CLAUDE.md`. Raison : versions courantes et compatibles entre elles (peer dependencies vérifiées). Fichiers : `package.json` de chaque paquet.
- **TypeScript 6.0 et non 7.0.** TypeScript 7 (réécriture native) est sorti, mais le modèle d'Expo SDK 57 est sur 6.0 ; une seule version pour tout le dépôt évite les surprises. À reconsidérer quand Expo passera à 7.
- **React 19.2.3 aussi sur le site.** C'est la version fixée par Expo SDK 57 ; avec `node_modules` à plat, une seule copie de React pour le site et l'appli évite les erreurs de « hooks » en double.
- **pnpm avec `nodeLinker: hoisted`, sans Turborepo.** Metro (Expo) gère mal les liens symboliques de pnpm ; les scripts racine utilisent `pnpm -r` / `pnpm --filter`. Seuls `esbuild` et les binaires PostgreSQL locaux sont autorisés à lancer un script d'installation (`allowBuilds`). pnpm a ajouté lui-même `minimumReleaseAgeExclude` pour des paquets publiés depuis moins longtemps que son délai de sécurité. Fichier : `pnpm-workspace.yaml`.
- **pnpm via corepack, installé dans le dossier utilisateur.** `corepack enable` échoue sans droits administrateur (il écrit dans `C:\Program Files\nodejs`) ; `corepack enable --install-directory "%APPDATA%\npm" pnpm` fonctionne et ce dossier est déjà dans le PATH. Fichier : `AVANCEMENT.md`.
- **Base locale : binaires PostgreSQL 17 du paquet `embedded-postgres`, pilotés par `pg_ctl`.** `pnpm db:start` initialise le dossier au premier lancement, démarre PostgreSQL en arrière-plan et crée la base ; `pnpm db:stop` l'arrête. Port, utilisateur, mot de passe et base viennent de `DATABASE_URL`, le dossier de `DB_DATA_DIR` : un worktree = un port et un dossier. Fichier : `scripts/db.mjs`.
- **Locale de la base : `builtin` `C.UTF-8`** (PostgreSQL 17), identique sous Windows et Linux, sans dépendre des locales du système. Le déploiement (lot 08) initialise sa base avec les mêmes options. Un tri « à la française » se fera par une collation ICU sur les colonnes qui en ont besoin.
- **Un seul pilote PostgreSQL : `pg` (node-postgres)**, partagé par Drizzle, Better Auth et pg-boss (qui l'utilise déjà).
- **Migrations.** `pnpm db:generate` (drizzle-kit) écrit les migrations versionnées dans `apps/api/drizzle/` ; `pnpm db:migrate` les applique avec le migrateur de drizzle-orm, sans drizzle-kit, donc utilisable tel quel sur le serveur. Le schéma `pgboss` est créé et mis à jour par pg-boss lui-même, hors migrations Drizzle. Fichiers : `apps/api/src/db/migrate.ts`, `apps/api/drizzle.config.ts`.
- **Tables de Better Auth au singulier** (`user`, `session`, `account`, `verification`, `two_factor`), colonnes en snake_case, plugin de double authentification activé dès le socle ; l'obligation pour les organisateurs et l'administration sera appliquée par l'API métier. Raison : conception technique du lot 02 (`ARCHITECTURE.md` § 1.1). Les clés d'accès (passkeys) viendront avec les comptes (lot 05). Fichiers : `apps/api/src/db/schema/auth.ts`, `apps/api/src/auth.ts`.
- **Pas encore de table `profiles`.** Pseudo, grade, points et le reste du profil sont décrits par `ARCHITECTURE.md` et arrivent avec le lot 05, pour ne pas poser deux fois le même modèle.
- **Connexion Google et Apple déclarées mais inactives** tant que leurs identifiants sont vides dans `.env`.
- **WebSocket** : support natif de `@hono/node-server` 2 avec `ws` (`@hono/node-ws` est déprécié). `/api/ws` renvoie pour l'instant ce qu'il reçoit.
- **Configuration** : un seul `.env` à la racine (API et scripts), validé par zod au démarrage de l'API ; l'appli lit `apps/mobile/.env` (`EXPO_PUBLIC_API_URL`), car Expo ne lit que le `.env` de son projet. Modèles : `.env.example`, `apps/mobile/.env.example`.
- **Ports de développement** : API 3001, site 5173 (Vite proxifie `/api` et `/api/ws` vers l'API : même origine, comme sur dev.orasso.fr), base 54329, Metro 8081.
- **API lancée par `tsx`**, sans étape de compilation, en développement comme en `start`. Le lot 08 décidera de la forme de l'image Docker.
- **Polices du site** : Archivo depuis Google Fonts (axes largeur 62–125, graisse 100–900, italique) et Archivo Narrow 700, présente dans la pile `narrow` de `tokens.json` et dans les aperçus des composants.
- **Icône et écran de démarrage de l'appli** : icône = `identite/favicon/icon-maskable-512.png` (fond Asphalte, marge de sécurité pour l'icône adaptative Android) ; écran de démarrage = monogramme fond sombre sur `#17191C`. Identifiants `fr.orasso.app` (Android et iOS).
- **Rôles partagés** : « organisateur » n'est pas un rôle de plateforme mais découle de l'appartenance à une structure (propriétaire ou co-organisateur) ; rôles de plateforme `user`, `moderator`, `super_admin`. Statut « désisté » d'une candidature : libellé « Désistée » (accordé avec « candidature », comme « Retenue »). Fichiers : `packages/shared/src/`.
- **Lint et format : Biome seul.** `docs/`, `identite/` et les copies de fichiers de marque (`apps/web/public`, `apps/mobile/assets`) sont exclus. Fichier : `biome.json`.
- **Fichier « Contexte orasso ( projet discussion claude ).txt » hors Git** (ignoré) : notes personnelles de Damien, déjà reprises dans `docs/00-contexte-projet.md`. Il reste sur le PC.
- **Vidéos lourdes de l'identité hors Git** (`identite/anime/*.mp4|*.mov|*.webm`) : elles restent sur le PC ; les GIF et SVG animés sont versionnés.

### 15/10/2026 — Déploiement de test dev.orasso.fr (lot 08)

- **Images construites sur le VPS** (pas de Docker sur le PC) à partir d'une archive `git archive HEAD` envoyée par `scp` ; pas encore de clé de déploiement GitHub (variante documentée dans `deploy/README.md`). Étiquette d'image = commit court ; 3 versions gardées. Fichiers : `deploy/deploy.sh`, `deploy/remote-deploy.sh`.
- **Image de l'API sans `devDependencies`**, `tsx` installé à la version exacte du lockfile (438 Mo au lieu de 793 Mo). Conséquence : tout ce que l'API ou son seed importe à l'exécution va dans `dependencies`. Fichier : `apps/api/Dockerfile`.
- **`--config.strict-dep-builds=false` dans les images** : l'installation filtrée embarque les `devDependencies` de la racine, dont les binaires PostgreSQL Linux d'`embedded-postgres` dont le script est refusé ; plutôt que d'élargir `allowBuilds` (fichier partagé), le contrôle est levé dans les images seulement.
- **Migrations à chaque démarrage de l'API** (`deploy/api-start.sh`), **seed à chaque déploiement** (et non à chaque redémarrage) si `SEED_DEMO=1` et si `apps/api` a un script `db:seed` (idempotent, `ARCHITECTURE.md`).
- **Ports sur le VPS** : site `127.0.0.1:3210`, API `127.0.0.1:3211` ; base sans port publié (réseau Docker `orasso` seulement, sauvegarde par `docker exec`). Limites mémoire : base 512 Mo, API 768 Mo, site 384 Mo.
- **Authentification basique sur le site, pas sur `/api/`** : l'appli mobile appelle l'API directement et l'API a sa propre authentification (Better Auth) ; un jeton spécial pour l'appli aurait dû être embarqué dans l'APK sans protéger davantage. Site non indexé (`X-Robots-Tag`, `robots.txt`).
- **Pas de `snippets/supervision.conf` dans le vhost** : il réserve `/api/send` (Umami) et `/api/<n>/envelope/` (GlitchTip), qui tombent dans l'espace de l'API Orasso, et injecte ses scripts dans les pages. Orasso enverra ses erreurs par son propre SDK Sentry (DSN GlitchTip à créer).
- **Sentry : variables prêtes (`SENTRY_DSN` vide = désactivé), SDK pas encore ajouté** : l'ajouter touche `apps/api/package.json` et le lockfile, en cours de modification par le lot 05 ; `ARCHITECTURE.md` place `sentry.ts` dans l'API.
- **Photos** : volume `orasso_uploads` monté sur `/data/uploads` (`UPLOADS_DIR`), seul dossier inscriptible de l'API.
- **Taille d'envoi** : 80 Mo par requête sur `/api/` (8 photos par véhicule).
- **Sauvegarde** : `pg_dump` au format personnalisé chaque nuit à 01:15 UTC (hors 02:30–04:00), 7 jours dans `/var/backups/orasso`, timer systemd `orasso-backup`. Envoi hors VPS préparé, non appliqué (voir « À revoir »).

## À revoir avec Damien

- **Icône de l'appli en 1024 px.** Les stores attendent une icône carrée opaque de 1024 px ; le kit n'en a qu'en 512 px (`icon-maskable-512.png`). Proposition : exporter le monogramme sur fond Asphalte en 1024 px, avec une version « premier plan » transparente pour l'icône adaptative Android. En attendant, l'appli utilise la version 512 px.
- **Sauvegarde d'Orasso hors du VPS (lot 08).** Les dumps restent pour l'instant sur le VPS. Proposition : ajouter `orasso-dev-db:/var/backups/orasso` et `orasso-dev-uploads:/var/lib/docker/volumes/orasso_uploads/_data` à `/etc/vps-backup/files.list`, que `vps-backup.sh` lit déjà (le script lui-même ne change pas). Commande prête dans `deploy/README.md`.
- **API de test ouverte (lot 08).** Sur dev.orasso.fr, `/api/` n'a pas de mot de passe nginx : n'importe qui connaissant l'adresse peut créer un compte de test. Acceptable pour une version de test non indexée ; à revoir si des données réelles y entrent.
