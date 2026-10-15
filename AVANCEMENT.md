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
- **API B du parcours n° 1 (lot 06, 15/10/2026)** — QR signés, jour J, points. Détail : `ARCHITECTURE.md` § 7 « État après le lot 06 » ; choix : `docs/JOURNAL-DES-CHOIX.md` (lot 06).
  - Migrations `0008` à `0013` : clés et pass, staff de l'événement, lectures et entrées, inscriptions express, saisons, journal des points et contestations, alertes et main courante, QR de compte.
  - QR d'inscription signé Ed25519 (`OR1` + base32, version 6-M alphanumérique), émis à la retenue, révoqué au désistement, au refus et à l'annulation, jamais régénéré après un scan ; `GET /api/applications/:id/pass`, clés publiques `GET /api/keys`. `packages/shared/src/qr/` : encodage, vérification et décision de scan hors ligne pour l'appli (lot 10).
  - Staff : lignes par événement (rôles ajustables), « je suis là / pas là », relance quotidienne arrêtée le jour J, rappel de synchroniser au verrouillage, « Où je suis staff », liste d'accès signée complète ou différentielle (plaque en préfixe + hachage salé, coordonnées au super staff).
  - Jour J : lectures envoyées par lots (idempotentes, premier scan gagnant, doublons entre appareils, pass révoqué ou inconnu), pointage manuel et rapide par plaque, recherche, rapport, direct organisateur (WebSocket `live`), inscription express (route ; écran au lot 13), alertes staff et main courante.
  - Points : règlement à J+2 (participation, malus, staff présent), « pointage en attente », contestation 7 jours tranchée par l'organisateur puis l'administration, grades, report de fin de saison, ajustement admin ; QR de compte dynamique (HOTP 60 s) et sa vérification.
  - Seed complété (et capable de compléter une base existante) : « Salon Argelès » aujourd'hui, verrouillé, 112 retenus, 6 staffs, 38 entrées et un doublon ; « Nocturne de rentrée » réglée avec un malus contesté.
  - Vérifié : `pnpm test`, `typecheck`, `lint` ; scénario `apps/api/test/scenario-parcours1-b.test.ts` (QR signé → synchro → vérification hors API → scans de deux appareils → J+2 → contestation).
- **Système de design web (lot 03, 15/10/2026)** : `packages/design-system` fournit au site les jetons (générés depuis `docs/design-system/tokens.json`), les deux thèmes Béton et Sable, le mouvement « tout se gare » et les 16 composants React du système v1 (AppBar, Brand, Button, Chip, Counters, Cover, Field, Ground, Icons, Motion, Plate, PosterCard, ScanResult, StatusBadge, TabBar, VehicleCard).
  - Import côté site : `import "@orasso/design-system/web/styles.css"` (une fois, dans `root.tsx`) puis `import { Button, … } from "@orasso/design-system/web"`. Commun au natif (lot 04) : `@orasso/design-system` (jetons `tokens`, `duration`/`curve`/`park`, `badgeLabels`, `iconShapes`, `tabSets`), sans React.
  - Thème : cookie `orasso-theme` (`beton` | `sable` | `auto`, défaut Béton) lu par le serveur, `data-theme` sur `<html>`, sans flash ; `ThemeProvider`, `useTheme`, `ThemeScope`. Archivo variable auto-hébergée (une seule famille, trois largeurs).
  - Page de recette `/_ds` (non liée) : tous les composants dans les deux thèmes ; `?only=<composant>&theme=<beton|sable>`. Les choix et écarts aux aperçus sont dans `docs/JOURNAL-DES-CHOIX.md`.
  - Vérifié : `pnpm --filter @orasso/design-system run build`, `run test` (20 tests : jetons, mouvement, rendu serveur, aucune valeur en dur) et `run typecheck` ; `pnpm lint` ; `pnpm --filter @orasso/web run build`.
- **Version de test en ligne (15/10/2026)** : https://dev.orasso.fr (site protégé par mot de passe, API ouverte sous `/api`, WebSocket `/api/ws`, certificat Let's Encrypt). Conteneurs Docker isolés sur le VPS commun (`orasso-db`, `orasso-api`, `orasso-web`), déploiement en une commande avec retour arrière automatique, sauvegarde nocturne de la base (01:15 UTC, 7 jours, restauration testée). Tout est dans `deploy/` (détail : `deploy/README.md`).

- **Système de design natif (lot 04, 15/10/2026)** : `@orasso/design-system/native` fournit à l'appli Expo les mêmes composants que le web (AppBar, Brand, Button, Chip, Counters, Cover, Field, Ground, Icons, Motion, Plate, PosterCard, ScanResult, StatusBadge, TabBar, VehicleCard), alimentés par les mêmes jetons, en Béton et en Sable, avec le mouvement « tout se gare » (Reanimated), le fond vivant et les barres brossées redessinés en `react-native-svg`, Archivo en six instances statiques, l'indicateur de chargement, l'écran d'ouverture (logo animé 1,6 s) et le résultat de scan (carte ou plein écran, trois sons provisoires).
  - Utilisation : `<ThemeProvider>` à la racine (`apps/mobile/src/app/_layout.tsx`), attendre `useOrassoFonts()`, puis `import { Button, PosterCard, … } from "@orasso/design-system/native"`. Thème : `useTheme()` (`theme`, `preference`, `setPreference`, jetons `t`) ; réduction des animations : réglage de l'appareil (`/_ds?reduce=1` pour la recette).
  - Recette : route cachée `/_ds` de l'appli (chaque composant en Béton et Sable ; `?only=<composant>&theme=<beton|sable>`), à voir avec `pnpm --filter @orasso/mobile exec expo start --web` (puis http://localhost:8081/_ds, ou le port choisi). Les choix et écarts sont dans `docs/JOURNAL-DES-CHOIX.md`.
  - Vérifié : `pnpm typecheck`, `pnpm test` (32 tests du design system dont aucune valeur de couleur ou de durée en dur dans les composants natifs), `pnpm lint`, `expo export --platform android` et `--platform ios`, rendu de `/_ds` dans le navigateur. **Pas encore sur simulateur ni appareil.**

- **Site : parcours n° 1 (lot 07, 15/10/2026)** — `apps/web`. Choix : `docs/JOURNAL-DES-CHOIX.md` (lot 07).
  - Public : `/e/:slug` (affiche, carte MapLibre + OSM, organisateur vérifié, places, Maintenu / Incertain / Annulé, Candidater, Suivre, partager, aperçu de lien Open Graph), `/connexion`, `/inscription` (disponibilité du pseudo, retour exactement là où on était), `/connexion/verification` (2FA), pages légales provisoires, pied « Propulsé par Orasso ».
  - Candidature en 3 écrans (`/e/:slug/candidater`), ajout de véhicule avec photo au moment de candidater (`/app/garage/nouveau?retour=`).
  - Connecté `/app` : Accès (statuts, QR d'inscription, offre de place avec compte à rebours en direct, désistement, carnet de route : points, pointage en attente, contestation du malus ; avis désactivé, voir lot 12), Garage, Sécurité (activer la 2FA).
  - Espace organisateur `/orga/:structure` (Sable imposé, barre latérale) : événements, tri au clavier (V / A / R / Z / Espace, motifs), vue liste (filtres, sélection multiple, décisions en masse), liste d'attente (ordre modifiable), compteurs en temps réel ; jour J : liste, pointage manuel, pointage rapide par plaque, direct. Le staff y accède au jour J seulement.
  - API : `GET /api/pseudo-available`, catégories du référentiel publiques, script `events:simulate-settle` (J+2 simulé, développement).
  - Vérifié : `pnpm test` (shared 66, design-system 32, api 102), `typecheck`, `lint`, build du site ; tests de bout en bout Playwright (`pnpm --filter @orasso/web test:e2e`, 5 tests : parcours passionné → QR → pointage → points, tri, liste d'attente et offre, malus et contestation, captures). Captures Béton / Sable / 390 px : voir le journal du relais.
- **Appli : parcours n° 1 du passionné (lot 09, 15/10/2026)** — `apps/mobile`. Choix : `docs/JOURNAL-DES-CHOIX.md` (lot 09).
  - Navigation Expo Router : premier lancement en 3 écrans (jamais revu, pas de demande de notifications), connexion et inscription e-mail + mot de passe (pseudo vérifié pendant la saisie ; Google et Apple masqués), cinq onglets (Accueil, Explorer, Accès au centre, Garage, Boîte en coquille), Journal derrière la cloche, Moi derrière l'avatar (points, grade, thème Béton / Sable / auto mémorisé, déconnexion), page d'un événement ouverte sans compte (`/e/:slug`, retour exactement là où on était après la connexion).
  - Garage : en-tête (photo, pseudo, grade, points), QR de compte dynamique en grand (HOTP 60 s, secret dans `expo-secure-store`, calculé sans réseau), véhicules actifs en grandes cartes, archivés repliés, ajout d'un véhicule (référentiel marque / modèle / génération avec « Autre », plaque, catégories, photos converties en JPEG), fiche véhicule (photos).
  - Explorer (segment Événements : recherche, formats, liste) → page événement → candidater en 3 écrans → demande de notifications juste après l'envoi.
  - Accès : une carte par candidature (statut, désistement avec avertissement de malus, place libérée à accepter avec son délai), « Où je suis staff » (présence), carnet de route (pointage en attente, points, contestation d'un malus) ; « Retenu » arrive en feuille avec le bandeau tamponné.
  - Mode jour J plein écran (s'ouvre la veille, se ferme après l'entrée ou à J+1) : QR d'inscription en grand, compte à rebours, statut, zone, météo, itinéraire, consignes. Tout vient d'un kit enregistré sur le téléphone dès la retenue (rafraîchi à chaque chargement avec du réseau) : le QR s'affiche sans réseau.
  - API (petits ajouts) : jeton de session en `Authorization: Bearer` (plugin `bearer` de Better Auth), `CORS_ORIGINS` pour la recette dans un navigateur.
  - Vérifié : `pnpm test` (dont 12 tests de l'appli : QR de compte identique à celui de l'API, tracé du QR, fenêtre du jour J, formats), `typecheck`, `lint`, `expo export` Android et iOS ; parcours complet dans le navigateur (`expo start --web --port 8091`, API locale avec `CORS_ORIGINS=http://localhost:8091`), QR affiché API arrêtée. **Pas encore sur simulateur ni appareil** (le connecteur Expo demande un projet EAS : lot 11).

- **Appli : mode staff hors ligne (lot 10, 15–16/10/2026)** — `apps/mobile`. Choix : `docs/JOURNAL-DES-CHOIX.md` (lot 10) ; état technique : `ARCHITECTURE.md` § 7 « État après le lot 10 ».
  - Accès > Où je suis staff : présence, « Mode staff » de la veille 00 h à J+1 (sinon la date d'ouverture), envois en attente. Le mode staff est en Sable quel que soit le thème choisi.
  - Écran d'entrée : poste, compteurs arrivés / attendus / à envoyer, « je suis là », synchro (heure de la liste, « Synchroniser la liste », « Envoyer maintenant »), tuiles selon les rôles (scan, liste, placement, main courante), rapport des doublons et refus renvoyés par le serveur, alerte.
  - Synchro : `GET /api/keys` (clés de confiance de l'appareil) puis la liste signée, vérifiée (Ed25519 du SHA-256 du JSON canonique) avant d'écraser la liste locale ; complète ou différentielle (écrasée par `passId`), refus d'une liste plus ancienne ; différentielle automatique toutes les minutes en ligne. Base SQLite `orasso-staff.db` (événements, liste, clés, file, pointages locaux).
  - Scan : caméra continue (`expo-camera`, écran tenu allumé), décision en mémoire avec `decideScan` du paquet partagé (signature, événement, liste, révocation, déjà entré), anti-rebond 3 s, `ScanResult` plein écran 1 s + son + vibration, retour seul à la caméra ; QR signé absent de la liste → « Accepter quand même » ou « Refuser ». Boutons en bas : plaque ou pseudo (recherche hors ligne : plaque entière hachée, 3 premiers caractères, pseudo), express (lien envoyé, rendu en QR ; mis en file sans réseau), sans scan, liste, incident, alerte.
  - Liste (filtres Tous / Arrivés / Attendus / Sans scan, Pointer, pointage rapide par plaque, coordonnées du super staff), placement (arrivés / attendus et places restantes par zone).
  - File : chaque lecture, pointage, présence, express, incident et alerte est écrit dans SQLite puis envoyé (lots de 200, appareil enregistré, idempotent) à l'ouverture, au retour du réseau et toutes les 30 s ; essais de 5 s à 5 min, jamais perdu ; après le règlement, éléments refusés un par un (`settled`) et retirés. Purge à J+1 et à la déconnexion (liste, coordonnées, clés), sauf les actions non envoyées.
  - Vérifié : 27 tests du mode staff (clés de confiance, vérification de la liste, décisions OK / déjà entré / refusé / falsifié / autre événement / clé inconnue / absent, anti-rebond, fusion, recherche, file hors ligne puis réponse avec doublons, `settled`, purge, stockage SQLite via `node:sqlite`), `pnpm test`, `typecheck`, `lint`, `expo export` Android et iOS ; démonstration dans le navigateur (API arrêtée = hors ligne) avec captures. **Pas encore sur téléphone** (caméra, son, vibration, SQLite natif : APK du lot 11).
## En cours

- Rien dans ce dépôt : la suite est découpée en lots (relais du coordinateur).

## Prochaine étape

- Lot 11 : APK Android et build simulateur iOS (EAS). Un build qui parle à https://dev.orasso.fr **doit** épingler la clé publique des QR (sans elle, le mode staff refuse tout) : `EXPO_PUBLIC_QR_TRUSTED_KEYS=[{"kid":1,"publicKey":"m2FceWYTZw1CBjcfytn1FPL49U6RqVzBVkyfgC9jqjA"}]` dans le profil EAS (voir `apps/mobile/.env.example`) ; la clé de démonstration `kid 0` y est de toute façon refusée. Puis essai du mode staff sur téléphone (caméra à travers un pare-brise, son, vibration, mode avion réel, temps de scan).
- Déploiement de l'API B sur dev.orasso.fr : ajouter `QR_SIGNING_KEYS` et `QR_SIGNING_ACTIVE_KID` à `/etc/orasso/dev.env` **avant** (l'API refuse de démarrer sans elles en production ; voir `deploy/dev.env.example`).
- Sauvegardes d'Orasso hors du VPS : validées par Damien et appliquées le 15/10 (deux lignes dans `/etc/vps-backup/files.list`, voir `deploy/README.md`).

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
6. **Vérifier** : `pnpm test` (la base doit tourner ; les tests de l'API créent et migrent eux-mêmes une base séparée `orasso_test`, la base de dev et son seed ne sont pas touchés), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`.
7. **Clés des QR** : sans `QR_SIGNING_KEYS` dans le `.env`, l'API de développement signe avec une clé de démonstration publique (`kid 0`). Pour une vraie clé : `pnpm --filter @orasso/api keys:generate` et coller les deux lignes dans le `.env`. Vérifier un QR hors de l'API, avec les seules clés publiques : `pnpm --filter @orasso/api pass:verify --keys http://localhost:3001/api/keys [--event-no N] <OR1…>`. Clé compromise : `pnpm --filter @orasso/api keys:revoke <kid>` (procédure : `deploy/README.md`).
8. **E-mails en développement** : transport « journal », chaque e-mail est écrit dans `.data/mail/` (un fichier HTML) et résumé dans la console de l'API. Photos envoyées : `.data/storage/`, servies par `/api/files/…`.

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



## Builds de l'appli (EAS, lot 11)

Configuration dans `apps/mobile/eas.json` (profils `development`, `preview` = APK Android vers https://dev.orasso.fr, `preview-simulator` = iOS simulateur). Aucune variable n'est secrète : l'adresse de l'API et la clé publique des QR (`kid 1`) sont dans le profil. **État : projet EAS pas encore créé** (voir « Première fois » ; le connecteur Expo ne sait ni créer un projet ni le relier à GitHub).

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
