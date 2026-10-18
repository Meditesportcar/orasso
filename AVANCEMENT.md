# Avancement

À lire au début de chaque session, à mettre à jour à la fin. Réécrit le 17/10/2026 à la fin de la recette finale (lot 34) : l'historique détaillé lot par lot est dans `ARCHITECTURE.md` (§ 7, paragraphes « État après le lot NN » et « État après la suite »), dans `docs/JOURNAL-DES-CHOIX.md` et dans le relais du coordinateur (`C:\Users\DELL\.claude\relais\orasso\JOURNAL.md`).

## Terminé

**Toutes les fonctions « Validé » de docs/01 et les six parcours clés de docs/02, sur le site et dans l'appli.** `POINTAGE-V1.md` (repointé au lot 34) n'a plus de ligne « À faire » ; ce qui manque a une raison écrite (comptes ou clés à créer, docs « plus tard », aucun paiement dans l'appli).

- **Socle et parcours n° 1 (lots 01 à 14)** : monorepo TypeScript (API Hono, site React Router 8, appli Expo SDK 57, design system web et natif, `shared`), PostgreSQL + Drizzle, déploiement sur dev.orasso.fr ; comptes, 2FA, structures et vérification, création d'événement, candidatures, tri, liste d'attente, verrouillage H-2, QR signés, mode staff hors ligne, inscription express, points et malus à J+2, avis ; site public ; pros et billetterie en mode présentation ; builds EAS.
- **La suite (lots 15 à 33)** : compte et sécurité (réinitialisation, vérification, alertes, clés d'accès, suppression), Moi complet et casquettes, social (amis, profils, recherche, QR ami, Journal), messagerie et Boîte, crews et inscription en crew, communication de l'organisateur, prestataires et photographes, casquette Organisateur de l'appli et tri par glissement, staff côté site et rôle boutique, invitations nominatives et événement privé, événements sur plusieurs jours, après l'événement et badge, météo, Explorer et recherche, Accueil complet, garage et certification, modération, administration.
- **Horloge simulée (lot 34a)** et **parité de l'appli (lots 35a à 35d, décision D20 « tout se gère depuis l'appli »)** : structure et équipe, événements, billetterie, pro, compte, garage, administration et modération dans l'appli.
- **Recette finale (lot 34, branche `lot-34-recette-finale`)** :
  - recette de bout en bout en local, sur une base remise à zéro : 24 fichiers de recette Playwright du site (45 tests verts, les captures sautées), 19 de l'appli dans le navigateur (38 verts ; billetterie payante et double authentification vertes dans leurs passages dédiés, avec Stripe factice et `DEV_SKIP_2FA=false`), un parcours rejoué avec l'horloge simulée (offre, H-2, pointage, J+2, J+8) ; `pnpm test` vert (shared 282, design-system 32, mobile 261, api 736), typecheck, lint, build du site, `expo export` Android ;
  - corrections : publications pro en suppression douce (migration `0041_pro-posts-soft-delete`) ; recettes fiabilisées (chacune prépare ce dont elle dépend) ;
  - ajouts : sélecteur natif de date et d'heure dans l'assistant (`@react-native-community/datetimepicker`), justificatifs en PDF (`expo-document-picker`), filtre « Jour » du mode liste du tri, affiche gardée dans le brouillon, création de la fiche pro dans l'appli, billets du public dans l'appli (réserver, Mes billets, rendre un billet) ;
  - système de design : grep sans vert ni couleur en dur, rayons de l'appli passés aux jetons ;
  - captures des écrans nouveaux (Béton et Sable, 390 px) : `docs/recette/suite/appli/` ;
  - « À revoir avec Damien » regroupé en une liste ordonnée à la fin de `docs/JOURNAL-DES-CHOIX.md`.

- **Corrections des retours de Damien après l'APK de référence (lot 36, branche `lot-36-corrections-retours`, 18/10/2026)** : adresse obligatoire ; fin de l'assistant Publier / Garder en brouillon / Aperçu (aperçu public d'un brouillon pour l'équipe) ; saisie de l'assistant jamais perdue ; champ en saisie au-dessus du clavier (bord à bord) ; champs longs extensibles avec compteur ; photos recadrées, retrait confirmé, couverture au choix, avancement de l'envoi ; Android App Links (`/.well-known/assetlinks.json`, écran `verification-email` dans l'appli ; iOS préparé, inactif) ; inscription express sans QR à la fin, page `/appli` et e-mail « Installe l'appli » ; case conditions générales obligatoire et tracée partout (express, site, appli ; migration `0042_terms-accepted`) ; mot de passe de 10 caractères partout ; « l'équipe organisatrice » ; raison d'une inscription impossible ; copie d'événement (année affichée, ouverture qui suit le début) ; rôle « Entrée visiteurs » ; staff accepté sans rôle ; badge pro jamais sans SIRET contrôlé ; adresse pro vérifiée ; photos de réalisations dans l'appli ; « Survoler l'espace » réparé ; météo explicite ; fond au thème (bande blanche Android). Détail : `docs/JOURNAL-DES-CHOIX.md` (lot 36), `ARCHITECTURE.md` (« État après le lot 36 »).

## En cours

- La branche `lot-36-corrections-retours` attend la fusion du coordinateur.

## Prochaine étape

1. **Coordinateur** : relire et fusionner `lot-36-corrections-retours` dans `main` ; déployer (migration `0042_terms-accepted` appliquée au démarrage de l'API ; variables facultatives `APP_ANDROID_URL`, `ANDROID_CERT_SHA256`, `APPLE_TEAM_ID` ; **nginx** : appliquer `location /.well-known/` sans mot de passe de `deploy/nginx/dev.orasso.fr.conf`, sinon Android ne vérifie pas les liens) ; vérifier `https://dev.orasso.fr/.well-known/assetlinks.json` (200, sans mot de passe).
2. **APK à reconstruire** : aucune dépendance native nouvelle, mais la configuration native change (`intentFilters` avec `autoVerify`, `backgroundColor` dans `app.json`). Sur le téléphone : clavier (mot de passe de la suppression du compte, règlement), recadrage des photos, bande blanche en bas, lien de vérification d'un e-mail qui ouvre l'appli.
3. **Damien** : relire « À revoir avec Damien » (points 37 à 41 ajoutés au lot 36) ; la direction artistique v2 se prépare à part.

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
   - `pnpm db:seed` : données de démonstration (complète seulement ce qui manque : QR des retenus, jour J « Salon Argelès » ; `pnpm db:seed --reset` pour tout effacer et recommencer, `--small` pour des volumes réduits). Comptes en `@orasso.local` (Damien : `damien@orasso.local`, super admin et propriétaire de MéditeSportCar ; Kenji, Léa, Nina, Marc, Julie, Théo, Sarah ; `pilote1@orasso.local`…), mot de passe : `SEED_PASSWORD` du `.env`. Les comptes du seed n'ont pas de double authentification : garder `DEV_SKIP_2FA=true` en développement pour entrer dans l'espace organisateur.
5. **Lancer** (un terminal par application) :
   - `pnpm dev:api` → http://localhost:3001/api/health
   - `pnpm dev:web` → http://localhost:5173 (l'API est aussi joignable sur http://localhost:5173/api) ; la page de recette du système de design est sur `/_ds`
   - `pnpm dev:mobile` → Metro (Expo) ; scanner le QR code avec Expo Go, ou `a` pour un émulateur Android. Dans un navigateur : `npx expo start --web` depuis `apps/mobile` (mettre l'origine de Metro dans `CORS_ORIGINS` du `.env` de l'API, ex. `http://localhost:8081`, et l'API dans `EXPO_PUBLIC_API_URL`).
   - Mode staff dans un navigateur (expo-sqlite en WebAssembly exige une page isolée) : `expo start --web --port 8102` puis `node apps/mobile/scripts/web-isolated.mjs 8101 8102`, ouvrir http://localhost:8101 (et `CORS_ORIGINS=http://localhost:8101`). Sans caméra, la recette injecte une lecture : champ « Recette · charge utile » de l'écran de scan ou `__orassoScan("OR1…")` dans la console (développement seulement).
6. **Vérifier** : `pnpm test` (la base doit tourner ; les tests de l'API créent et migrent eux-mêmes une base séparée `orasso_test`, la base de dev et son seed ne sont pas touchés), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`. Recettes Playwright : voir `apps/web/playwright.config.ts` et l'en-tête de chaque `apps/web/e2e/*.spec.ts` (site : API et site lancés sur la base seedée ; appli : `APP_URL` vers le relais `apps/mobile/scripts/web-isolated.mjs` devant `expo start --web`, `CORS_ORIGINS` et `EXPO_PUBLIC_API_URL` posés ; `horloge-parcours.spec.ts` en dernier puis `pnpm db:seed --reset`).
7. **Clés des QR** : sans `QR_SIGNING_KEYS` dans le `.env`, l'API de développement signe avec une clé de démonstration publique (`kid 0`). Pour une vraie clé : `pnpm --filter @orasso/api keys:generate` et coller les deux lignes dans le `.env`. Vérifier un QR hors de l'API, avec les seules clés publiques : `pnpm --filter @orasso/api pass:verify --keys http://localhost:3001/api/keys [--event-no N] <OR1…>`. Clé compromise : `pnpm --filter @orasso/api keys:revoke <kid>` (procédure : `deploy/README.md`).
8. **E-mails en développement** : transport « journal », chaque e-mail est écrit dans `.data/mail/` (un fichier HTML) et résumé dans la console de l'API. Photos envoyées : `.data/storage/`, servies par `/api/files/…`.

Plusieurs copies du dépôt (worktrees) : dans le `.env` de chacune, changer le port de `DATABASE_URL`, `DB_DATA_DIR`, `API_PORT`, `WEB_PORT` et le port de `PUBLIC_URL` (qui doit être celui du site).

Créer un compte de test (API lancée) :
```
curl -X POST http://localhost:3001/api/auth/sign-up/email -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -d "{\"email\":\"test@orasso.test\",\"password\":\"motdepasse-test-123\",\"name\":\"Test\"}"
```

## Avancer le temps en développement (horloge simulée, lot 34a)

Pour voir verrouillage (H-2), points et malus (J+2), bilan (J+8), expirations d'offres sans attendre. **Développement seulement** : `DEV_CLOCK=on` dans le `.env` (modèle : `.env.example`) ; l'API refuse de démarrer en production avec cette variable ; sans elle, ni route, ni page, ni en-tête. Le site doit voir la même variable (même `.env` en local).

```
pnpm dev:clock status                       # heure simulée, heure réelle, décalage
pnpm dev:clock +2h                          # aussi +1d, +1d4h, +30m
pnpm dev:clock to 2026-11-18T09:00          # heure de Paris (ou une date ISO avec fuseau)
pnpm dev:clock event <slug> h-2|start|end|j+2|j+8
pnpm dev:clock reset                        # retour à l'heure réelle
```

- Le décalage ne fait qu'avancer (un recul répond 409) ; il est gardé en base (table `dev_clock`), survit au redémarrage de l'API, qui le relit en moins de 3 s quand le script le change.
- Chaque avance libère les tâches pg-boss dont l'échéance simulée est passée et lance les balayages de rattrapage (points, offres de la liste d'attente, bilans, badges…) ; tout est idempotent.
- Page `/admin/horloge` du site (super admin, 2FA de session) : +1 h, +1 jour, une date, les jalons d'un événement, « Revenir à l'heure réelle » ; routes `GET /dev/clock`, `GET /dev/clock/events`, `POST /dev/clock/advance`, `POST /dev/clock/reset` (tracées dans `admin_audit_log`).
- Le site et l'appli prennent l'heure du serveur (en-tête `x-orasso-clock-offset`) ; bandeau « Horloge simulée : +2 j 4 h » tant que le décalage n'est pas nul. Le mode staff hors ligne garde le dernier décalage connu.
- Limite : les horodatages techniques (`created_at`, `updated_at`) restent à l'heure système ; créer les données avant d'avancer le temps plutôt qu'après (par exemple la confirmation d'une venue en crew, 72 h après sa création, se calcule sur l'heure système de sa création).
- Sur dev.orasso.fr, l'API tourne en `NODE_ENV=production` : `DEV_CLOCK` y est refusée. La simulation en ligne demande un autre signal que `NODE_ENV` (décision du coordinateur).
## Déployer la version de test (dev.orasso.fr)

Depuis le PC, dans Git Bash, à la racine du dépôt (accès SSH `claude@51.210.242.118` par clé) :

```
bash deploy/deploy.sh            # envoie le commit courant, construit sur le VPS, démarre, contrôle
bash deploy/deploy.sh status     # version en ligne, état des conteneurs
bash deploy/deploy.sh logs api   # journaux (api, web ou db)
bash deploy/deploy.sh rollback   # version précédente
```

Seul ce qui est commité part. Migrations appliquées au démarrage de l'API ; seed de démonstration lancé à chaque déploiement si `db:seed` existe. Le VPS est partagé avec d'autres sites en production : lire `deploy/README.md` avant d'y toucher (nginx, secrets, sauvegarde, restauration). Identifiants du site : `C:\Users\DELL\.claude\relais\orasso\secrets-dev.txt`.



## Builds de l'appli (EAS, lot 11)

Configuration dans `apps/mobile/eas.json` (profils `development`, `preview` = APK Android vers https://dev.orasso.fr, `preview-simulator` = iOS simulateur). Aucune variable n'est secrète : l'adresse de l'API et la clé publique des QR (`kid 1`) sont dans le profil. **État** : projet EAS créé (`extra.eas.projectId` et `owner` dans `app.json`) ; les APK des vagues sont construits par le coordinateur (connecteur Expo, quota gratuit de 15 builds Android par mois) et déposés sur le Drive `gdrive:Orasso APK`. La section « Première fois » reste pour mémoire.

**Première fois (une fois, par Damien, depuis un terminal à la racine du dépôt) :**
1. `cd apps/mobile`, puis `npx eas-cli@latest login` (compte Expo de Damien) et `npx eas-cli@latest init` : crée le projet `orasso` et écrit `extra.eas.projectId` et `owner` dans `app.json` (à commiter, ce ne sont pas des secrets).
2. Sur expo.dev, projet > GitHub : installer l'application GitHub d'Expo, relier `Meditesportcar/orasso`, base directory `apps/mobile`.
3. Pas de compte Apple ni Google : aucun identifiant à fournir (l'APK est signé par une clé que EAS génère ; répondre « oui » à la création du keystore Android au premier build en ligne de commande, ou laisser le connecteur le faire).

**Refaire un build :**
- Android : `cd apps/mobile && npx eas-cli build -p android --profile preview` (ou, via Claude, le connecteur Expo : `build_run`, plateforme ANDROID, profil `preview`, `baseDirectory` `apps/mobile`, branche à construire).
- iOS simulateur (Mac seulement pour l'installer) : `npx eas-cli build -p ios --profile preview-simulator`.
- Le build part de ce qui est poussé sur GitHub (connecteur) ou du dossier local (ligne de commande). Offre gratuite : quota mensuel limité, ne pas relancer en boucle ; lire les journaux (`build_logs`) avant de recommencer.
- Changer l'API visée ou la clé épinglée (rotation) : modifier `env` dans `eas.json`, puis nouveau build.

**Installer l'APK sur un Android :** ouvrir le lien de téléchargement du build (page du build sur expo.dev, ou QR de cette page) depuis le téléphone, télécharger `.apk`, autoriser « installer des applications inconnues » pour le navigateur quand Android le demande, installer, ouvrir Orasso. Le site est derrière une authentification basique mais `/api/` ne l'est pas : l'appli n'a rien à saisir de plus.

**Plus tard, iOS sur appareil / boutiques :** il faudra un compte Apple Developer (99 USD par an) pour signer, un profil `production` ou `preview` iOS sans `simulator`, l'enregistrement de l'iPhone (`eas device:create`) pour une distribution interne, et un compte Google Play pour publier sur Android (format AAB, profil `production`). Rien de cela n'est fait ici.
