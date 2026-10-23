# Avancement

À lire au début de chaque session, à mettre à jour à la fin. Mis à jour le 23/10/2026. L'historique détaillé lot par lot est dans `ARCHITECTURE.md` (§ 7, paragraphes « État après le lot NN »), dans `docs/JOURNAL-DES-CHOIX.md` et dans le relais du coordinateur (`C:\Users\Dams\.claude\relais\orasso\JOURNAL.md`, plan du chantier : `PLAN-DA-V2.md`, conception : `ARCHITECTURE-DA-V2.md`).

## État au 23/10/2026 : mise au point « Exposant » en ligne (lots M1 à M7)

- **En ligne sur dev.orasso.fr** : `main` = `integration` = **`95b2ee23`** (poussé). Migrations jusqu'à `0055_message-about-event` (0052 plaques, 0053 clé d'envoi et tout-terrain, 0054 préférences et motifs de signalement, 0055 « À propos de » des messages).
- **APK** : `Orasso APK/Orasso-2026-10-23-e24c4d20-mise-au-point-exposant.apk` sur le Drive ; installé sur le Xiaomi de Damien (il démarre, aucun plantage). Même code applicatif que `95b2ee23` (les commits suivants ne changent que des recettes).
- **Ce que contient la mise au point** (retours de Damien sur la partie Exposant, maquettes validées le 23/10, relais `validation-maquettes-2026-10-23.md`) :
  - M1 : ajout de véhicule refait, avec photos au carré, étape Plaque sûre (refus par l'API de toute photo sans décision sur la plaque), motorisation, puissance et poids en saisie libre (décision de Damien : pas de catalogue), nuancier, 4x4 pour les tout-terrain.
  - M2 : plaque à forme unique, floutage sûr et pré-remplissage.
  - M3 : fluidité. Sur le Xiaomi, l'ouverture d'une fiche passe de 6,4 s à 1,2 s, avec cache par compte.
  - M4 : Explorer (« Autour de… », préférences), fiche avec la bande organisateur fixe et « Ta place », horaire exposant privé, Mon QR épuré (sans logo O pour l'instant).
  - M5 : Accueil, Garage en mini-fiche, Profil, Aide.
  - M6 : « Ton coin », « Tes préférences » (seule page de réglage de l'exploration), affiche à partager, bandeau d'annonces unique, signalement par type, notifications push liées au compte et à la session.
  - M7 : deux modes d'affichage, navigation (bande ORASSO) ou fiche (en-tête avec ✕).
- **Recettes** : la série complète de l'appli se fait sur la **version web compilée** (`node scripts/appli-compilee.mjs`, voir plus bas), 23 % plus rapide et beaucoup moins gourmande en RAM que Metro. Grosse vérification du 23/10 : API 1002/1002, site vert, appli 168/173. Les échecs restants sont listés dans `lots/c7-finitions.md` du relais.
- **Suite** : retours de Damien sur cet APK, puis finitions C7, recette finale (lot 58), puis analyse des autres profils (organisateur, staff, pro…) avec Damien.
- **Reprendre** par le dernier « POINT DE REPRISE » du journal du relais (`~/.claude/relais/orasso/JOURNAL.md`).

## État au 22/10/2026 : v2 conforme à l'artefact, en ligne ; phase des retours de Damien

- **En ligne sur dev.orasso.fr** : la v2 « conforme à l'artefact » (code applicatif du commit `97bd2516`, état de santé correct). `main` et `integration` sont au même commit : **`d0ee42a9`** (poussé). Migrations jusqu'à `0050_entrance-note`.
- **APK** : `Orasso APK/Orasso-2026-10-22-97bd2516-v2-conforme.apk` sur le Drive ; installé sur le Xiaomi de Damien (il démarre, aucun plantage).
- **Phase en cours** : Damien navigue sur le téléphone et donne ses retours (captures et remarques), puis un plan de corrections est dressé. Aucune évolution n'est codée avant la v2.1.
- **Aucun lot ni agent en cours** à cette date ; rien n'attend d'être fusionné.
- **Reprendre** par le dernier « POINT DE REPRISE » du journal du relais (`~/.claude/relais/orasso/JOURNAL.md`, entrée du 22/10 vers 11 h 45) et par `retours-damien-2026-10-22.md` (même dossier).

### La référence : l'artefact « Orasso DA v2 »

- **Où** : https://claude.ai/artifact/JZmQ1Vkn28dRv69CZDXQzQ (privé) ; copie locale `.claude/prototype-v2/index.html` (dans ce dépôt, non versionnée).
- **Il prime sur les premières docs** (décision D33) : visuel, logiques de fonctionnement, tutos, places des fonctions. Ensuite vient la liberté d'ingénieur (toute amélioration pertinente et faisable est permise d'avance), puis `docs/00` à `03` et le système de design v1, qui restent la base d'origine mais sont dépassés là où l'artefact diffère. Les écarts sont notés dans `docs/JOURNAL-DES-CHOIX.md`.
- **Méthode des paires « artefact | réel »** : pour chaque écran refait, on rend l'artefact et l'appli (ou le site) côte à côte, à 390 px en thèmes Béton et Sable (1 280 px pour le site), et on compare. Les paires de chaque lot sont dans le dossier du relais (`lot-c2a-captures/`, `lot-c2b-captures/`, `lot-c3-captures/`…). Les relectures les contrôlent. Un libellé de bouton ne se coupe jamais, même si l'artefact le fait.
- **Décisions de Damien à connaître** : D33 (hiérarchie des références, ci-dessus) ; D34 (QR d'accès visible dès la validation, option Média de la feuille Créer comme l'artefact, Archivo exactement comme l'artefact en vue mobile, photos de l'artefact en démonstration en attendant celles de Damien).
- **Pas encore tranché avec Damien** (« À revoir ») : opacité du fond battle (50 % en Béton, 32 % en Sable), entrée « Mon profil et mes casquettes » de l'administration, trois mots genrés écartés des tutos, « Suivre » de la candidature, abonnement du pro dans Publications, fond Sable plus gris que l'artefact.

## Terminé

**Toutes les fonctions « Validé » de docs/01 et les six parcours clés de docs/02, sur le site et dans l'appli.** `POINTAGE-V1.md` (repointé au lot 34) n'a plus de ligne « À faire » ; ce qui manque a une raison écrite (comptes ou clés à créer, docs « plus tard », aucun paiement dans l'appli).

- **Socle et parcours n° 1 (lots 01 à 14)** : monorepo TypeScript (API Hono, site React Router 8, appli Expo SDK 57, design system web et natif, `shared`), PostgreSQL + Drizzle, déploiement sur dev.orasso.fr ; comptes, 2FA, structures et vérification, création d'événement, candidatures, tri, liste d'attente, verrouillage H-2, QR signés, mode staff hors ligne, inscription express, points et malus à J+2, avis ; site public ; pros et billetterie en mode présentation ; builds EAS.
- **La suite (lots 15 à 33)** : compte et sécurité, Moi complet et casquettes, social, messagerie et Boîte, crews, communication de l'organisateur, prestataires et photographes, casquette Organisateur de l'appli et tri par glissement, staff côté site et rôle boutique, invitations et événement privé, événements sur plusieurs jours, après l'événement et badge, météo, Explorer et recherche, Accueil complet, garage et certification, modération, administration.
- **Horloge simulée (lot 34a)**, **parité de l'appli (lots 35a à 35d, D20)** et **recette finale (lot 34)** : détail dans `ARCHITECTURE.md` et le journal des choix.
- **Corrections des retours de Damien après l'APK de référence (lot 36)** : **fusionné dans `main` et déployé sur dev.orasso.fr** (`main` = `a2a409b`, 43 migrations, dernière `0042_terms-accepted`).
- **Chantier DA v2 ouvert (19/10/2026)** : prototype v2 (version 41) validé par Damien (lot 37) ; 21 lots (38 à 58) planifiés en huit vagues (`PLAN-DA-V2.md` du relais).
- **Lot 38 — socle v2 (branche `lot-38-socle-v2`, vague 1)** : jetons v2 par surcouche (`packages/design-system/tokens.v2.json`, fusionnée par `scripts/merge-tokens.mjs` ; `tokens.json` inchangé) et huit écarts datés dans le README du système de design ; contour couleur du fond (`OutlinedText`, `Outlined`, `.o-onbg`/`.o-onphoto`) ; barre du haut v2 (`AppBar kind="tab"` : logotype partout, casquette, Recherche, Boîte) et `BigTitle` sur une ligne ; six barres d'onglets (`tabSets.exhibitor/visitor/pro/provider/media/organizer`, le O au centre ; `fan` alias déprécié) et huit pictogrammes ; `personaKinds` à six profils ; thème au choix, jamais imposé, avec « Automatique » solaire (`shared/rules/solar.ts`) sur le site et dans l'appli ; espaces organisateur et pro du site au thème choisi ; recettes `/_ds` (site et appli) avec une section v2 ; audit e2e `unoutlinedOnPhoto`, `setTheme`, `MOBILE`, `e2e/lot38.spec.ts`. Aucun écran refait : l'appli et le site gardent leurs barres v1 (`legacyTabSets`) jusqu'au lot 40.
- **Lot 39 — le O vivant et le fond « battle » (branche `lot-39-o-vivant`, vague 2)** : voiture vue de dessus générée (`brandArt.carTop`, `car-top.svg`) ; géométrie pure testée (`src/native/olive/path.ts` : drift autour du O, meutes à virages sans ligne droite finale, tandem) ; huit variantes natives et web (`OpeningBattle`, `OLoader`, `PullToRefresh` (appli), `SendProgress`, `SendBurst`, `EmptyState`, `StampDrop`, `CenterTabO`) ; `Ground variant="battle"` (`still`, `paused`, `GroundQuiet` posé par `Sheet`) ; ouverture de l'appli en battle de 3 s, envoi de photos par `SendProgress`, O vivant sur l'onglet central ; `Loader` et `OpeningScreen` en alias dépréciés jusqu'au lot 58 ; section « Le O vivant » des recettes `/_ds` ; `e2e/lot39.spec.ts`.

- **Lot 47 — API événement v2 : créneaux d'arrivée et générateur d'affiche (branche `lot-47-api-evenement-v2`, vague 3)** : créneaux d'arrivée exposants / public (strict ou conseillé, note) contrôlés par `validateArrivals`, case « J'ai vu » obligatoire à la candidature (seule, chef de crew, membre à sa confirmation ; 400 `arrival_not_seen`), note au tri, consignes préfixées du créneau ; générateur d'affiche rendu par l'API (`modules/events/poster/`, `sharp` + Archivo, huit styles du prototype, Post 1080 × 1350 et Story 1080 × 1920, PNG < 600 Ko), aperçu `POST /posters/preview` (540 px, 60 / min), `POST /events/:id/poster/generate`, `GET /events/:id/poster/story` ; `EventCard.posterUrl` = affiche générée, `customPosterUrl` = affiche perso ; régénération à la date, à la ville, à la duplication ; migration `0045_event-v2` ; seed : créneaux de la Nocturne et une affiche pour chaque événement. Aucun écran (lots 43, 44, 53, 56).

- **Lot 49 — API du passeport, du prix du public et du récap (branche `lot-49-api-passeport-vote-recap`, vague 3)** : tampons du passeport (au pointage, au billet contrôlé, à la présence du staff le jour J ; forme selon le format, encre selon le département, aléa d'usure ; rares au règlement : première sortie, 10e événement, pleine lune, prix du public), prix du public (une voix par personne pointée, pas pour soi, classement en direct, gagnant à J+2 : 50 points réglables, tampon rare, compteur du véhicule), récap calculé (points projetés à J+1, acquis après J+2) et tâche `event.recap` à J+1 10 h ; migration `0045_passport` ; seed : 9 tampons de Kenji, Béziers Night (64 votants, Kenji 4e). Aucun écran (lots 50 et 57).

- **Lot 45 — API du profil média et de l'accréditation presse (branche `lot-45-api-media`, vague 2)** : profil média, accréditation = candidature `kind = media` décidée par le tri (badge presse = pass, notifications `accreditation_*`), réglages presse de l'organisateur, contenus (publiables si accrédité), mise en avant, vues, agenda, Explorer national (`region`, `accreditationOpen`, temps de route), carte de presse privée vérifiée par l'administration ; migration `0043_media` ; seed Léo / « Sud Cars ». Aucun écran (lots 55 et 57).
- **Lot 46 — API des prestataires v2 (branche `lot-46-api-prestataires-v2`, vague 2)** : missions = besoins de l'organisateur (`/events/:id/needs`), `GET /missions` par métier et rayon du plus proche au plus loin, candidature sur une mission (`needId`), emplacement attribué (`/spot`, notification avec arrivée, électricité et consignes), avis des organisateurs sur un prestataire retenu (1 à 5, 30 jours, public sur la vitrine), vitrine (métiers, menu « une ligne par plat » lu par `parseMenuLines`, besoins sur place, rayon) ; migration `0043_missions` ; seed Sofia_66 / « La Brasa ». Aucun écran (lots 54 et 57).
- **Lot 40 — navigation v2 de l'appli (branche `lot-40-navigation-v2`, vague 2)** : six casquettes et leurs barres de cinq onglets, le O au centre (exposant `(tabs)`, visiteur `(visitor)`, pro, prestataire, média `(media)`, organisateur), toutes sur `PersonaTabs` ; l'API renvoie l'exposant **ou** le visiteur selon les véhicules actifs (ajouter un véhicule change la barre sans redémarrer) ; barre du haut v2 partout (logotype, pastille de casquette, Recherche, Boîte ; appui long sur le logo = retour au profil de base) ; Boîte hors barre avec les notifications ; Mon profil en hub (casquettes et accès rapides, un seul bouton Créer, réglages en tuiles `reglages/<section>`) ; Sorties = ex-Accès ; glissement entre onglets ; « Réduire les animations ». `/acces` et `/moi` redirigent. Recette `apps/web/e2e/appli-lot40.spec.ts`. Les écrans gardent leur contenu (lots 43, 44, 50 à 55).
- **Lot 41 — arrivée : profil, département sur la carte de France, nom et prénom (branche `lot-41-arrivee`, vague 3)** : le flux `app/arrivee/` remplace les trois écrans de bienvenue (« Tu viens comment ? » avec six profils et l'aperçu de la barre d'onglets, « Ton coin » sur la carte des départements, premier choisi = favori, « Qui es-tu ? » avec pseudo, prénom et nom obligatoires et privés, conditions générales) puis un écran de transition jusqu'aux tutos du lot 42 et un écran « casquette » (créer sa fiche pro, sa structure ou son profil prestataire, ou ajouter sa voiture ; « Plus tard » laisse la barre du visiteur avec une carte « Termine ta fiche » sur l'Accueil et dans Mon profil). API : `profiles.main_profile` (nullable, migration `0045_arrivee`), `POST /auth/sign-up/email` exige profil, département, prénom et nom (400 sinon), `PATCH /me/profile` et `GET /me` portent `mainProfile`. Carte de France embarquée (`packages/design-system/src/france/`, svg-maps de Victor Cazanave, CC BY 4.0, crédit sous la carte) et liste des 101 départements outre-mer compris (« Choisir dans une liste », cases à cocher accessibles ; 20 au plus). Site : `/inscription` et les deux invitations avec les mêmes champs. Recette `apps/web/e2e/lot41.spec.ts`, `lot41-liste.spec.ts` (site, dont l'inscription sans JavaScript) et `appli-lot41.spec.ts`, `appli-lot41-liste.spec.ts` (appli, `APP_URL`).

- **Lot 51 — garage v2, ajout de véhicule en cinq étapes, floutage de plaque (branche `lot-51-garage-floutage`, vague 3)** : la carte se construit en haut ; marque › modèle › génération de la liste Orasso (« Autre » sans saisie libre), fiche technique, catégories (origine déduite de la marque, styles grisés avec la raison), photos, plaque floutée (Automatique par ML Kit sur le téléphone, ou cadre à la main), numéro privé, ancien véhicule ; modification par les mêmes étapes ; garage v2 en grandes cartes ; flou appliqué par l'API, définitif (migration `0045_plate-blur`) ; site : floutage à la main à l'ajout et sur la page du véhicule. Dépendance native ML Kit : APK v2 au lot 58. Recettes `appli-lot51.spec.ts`, `lot51.spec.ts`.

- **Lot 43 — Sorties en tickets, Accueil par profil, accès flottant (branche `lot-43-sorties-accueil`, vague 4)** : `GET /me/home?persona=` (profil et blocs de l'exposant, du visiteur, du pro, du prestataire, du média ; aucune migration) ; Sorties en tickets à souche de date (segments À venir / Staff / Passées, Mon QR, Retirer, liste d'attente, place libérée, Mon billet, mission staff, passées avec points, avis et prix du public) ; Accueil par profil (carte du prochain événement à affiche générée, compte à rebours en contour, organisateur validé, arrivée, Mon accès / Mon billet, Maps, Waze, Sur la carte ; accueils du pro, du prestataire et du média) ; accès flottant de J-7 à J+1 au-dessus de la barre d'onglets ; le pro et le prestataire s'ouvrent désormais sur leur Accueil. Recette `apps/web/e2e/appli-lot43.spec.ts`.

- **Lot 42 — tutos par profil, au « tu » (branche `lot-42-tutos`, vague 4)** : six tutos (exposant 7 diapos, visiteur 6, pro 4, organisateur 6, prestataire 4, média 4 : 31), textes du prototype (`shared/labels/tuto.fr.ts`), une illustration animée par diapo en `react-native-svg` + Reanimated (`features/tuto/` : carte, candidature garage › règlement › envoi › « En attente », QR et barre de scan, parking vu de dessus avec la voiture moutarde qui suit le chemin, tampon du passeport, grades et pros, bulles d'équipe, météo et notifications, direct, plan d'emplacement, badge presse…) ; une seule illustration montée, réduction des animations = état final ; joués après l'arrivée (« Passer » et « C'est parti » mènent à `arrivee/casquette`), rejouables depuis Mon profil › Aide (« Revoir le tuto »), route `tuto/[profile]` qui ouvre la tuile de l'Accueil du lot 43 (`TUTO_ROUTE_READY = true`). Aucune migration. Recette `apps/web/e2e/appli-lot42.spec.ts` (`APP_URL`) ; `appli-lot41.spec.ts` adapté.

- **Lot 48 — jour J v2 (branche `lot-48-jour-j-v2`, vague 4)** : QR d'accès tournant `OR2` (nouveau code signé toutes les 20 s avec un secret par pass, vérifié hors ligne par le staff, anneau et n° du code, captures bloquées sur l'écran, en-tête par profil : zone, emplacement, badge presse, billet) ; mode staff v2 (synchro, rôle, « Je suis là », tuiles selon les rôles, entrés par zone, Alerte / Main courante / Discussion en bas, thème au choix) ; accueil drive (la caméra lit la plaque avec ML Kit sur l'appareil, hachage, liste en mémoire, pointage `drive`) ; migration `0049_rotating-qr` ; dépendances natives `expo-screen-capture` et `@react-native-ml-kit/text-recognition` (APK au lot 58). Recette `apps/web/e2e/appli-lot48.spec.ts`.
- **Lot 50 — passeport, prix du public, récap, carte à partager (branche `lot-50-passeport-vote-recap`, vague 4)** : passeport (tampons dessinés en SVG, huit par page, forme / encre / usure / dorure déterministes, le tampon qui tombe au pointage sur le passeport et l'écran jour J ; onglet du visiteur, écran `/mon-passeport` pour les autres profils, tuile de Mon profil), prix du public (`/vote/<événement>` : une voix modifiable, classement en direct, clos, résultats), récap (`/recap/<événement>` : points projetés puis acquis, tampon, avis, partage), « Voir le récap » et « Prix du public » dans Sorties et le jour J, carte à partager au format story en trois styles avec zones masquées par Instagram (rendue par l'API, `share-story.ts`). Aucune migration. Recette `apps/web/e2e/appli-lot50.spec.ts` (`APP_URL`).

- **Lot 52 — appli organisateur v2 (branche `lot-52-orga-v2`, vague 5)** : Événements (« Créer un événement », segments En cours / Brouillons, brouillon qui dit ce qui manque, anciens derrière « … » avec duplication et invitation des retenus expliquée) ; Tri (grande photo, nom en `OutlinedText`, note d'arrivée visible, segments Candidatures · Liste d'attente · Prestataires par mission avec emplacement · Presse, mode liste conservé) ; Direct (hors événement : prochain événement, à trier, zones, équipe ; Prix du public le jour J) ; Équipe en bulles (taille = événements tenus, historique et actions, rôles par événement selon les présences, ce que chaque rôle permet) ; Structure (sceau tournant et pastille au O, message « Vérification en cours », tuiles) ; rôle « Contrôle des billets » ; route `GET /structures/:id/team-history` (aucune migration). Recette `apps/web/e2e/appli-lot52.spec.ts`.
- **Lot 54 — appli pro et prestataire v2 (branche `lot-54-pro-presta-v2`, vague 5)** : Pro : Ma fiche en grille (activités en tuiles, remises par grade en grands chiffres, réalisations en mosaïque avec plein écran, « Y aller » · « Favori » ; segment « Modifier ma fiche » avec exemples de format, SIRET et adresse vérifiés), Scanner (caméra en plein cadre, dernier scan en carte, historique), Stats (deux chiffres en grand, barres par grade). Prestataire : Missions (puces de métier, rayon, tickets « 1 place sur 2 », « Proposer <nom> » avec `SendBurst`), Candidatures (tickets : emplacement, arrivée, électricité, Mon accès, Consignes, retrait ; passées avec l'avis), Vitrine (vue organisateur, modification avec menu une ligne par plat), fiche publique `/providers/[id]`. Aucune migration. Recette `apps/web/e2e/appli-lot54.spec.ts`.

- **Lot 44 — Explorer v2, fiche événement v2, style de carte Orasso (branche `lot-44-explorer-carte`, vague 4)** : style MapLibre aux jetons (`packages/design-system/src/map/` : tuiles vectorielles OpenFreeMap, mer hachurée, autoroutes moutarde, noms en Archivo étroit, sans rotation, repli raster OSM si la source échoue, marqueurs datés / groupes / pros / toi, web et natif) ; glyphes Archivo étroit servis par le site (`apps/web/public/map-fonts/`, `scripts/build-map-glyphs.mjs`) ; les trois cartes du site suivent le thème ; Explorer v2 de l'appli (en-tête de deux lignes, position demandée puis repli sur le département favori, du plus proche au plus loin, filtres Format / Quand / Selon mes goûts, cartes `EventCardV2`, carte stylée aussi dans le navigateur) ; fiche v2 (`features/event/` : affiche en vedette, créneaux d'arrivée en deux plaques, action selon le profil, fermé / pas encore ouvert) ; API `followed=1`. Recettes `e2e/lot44.spec.ts` et `e2e/appli-lot44.spec.ts`. Aucune migration.

- **Lot 55 — appli média : Explorer national, Presse, Contenus, profil média (branche `lot-55-media`, vague 5)** : Explorer (Chercher partout en France : région, format, ce mois-ci, « Accréditation ouverte », carte, temps de route estimé, état de l'accréditation sur chaque ligne, « Demander » par une feuille, « Garder » ; Mon agenda : la semaine, « Cette semaine » / « Plus tard »), Presse (tickets accréditée avec « Mon badge presse » et « Consignes », en attente avec retrait, refusée avec la raison, passées avec les vues), Contenus (compteurs, ajout d'un lien ou d'une galerie de 30 photos, modification, suppression, « Mis en avant sur la page »), création et modification du profil média depuis « Créer » et la ligne de la casquette, « Demander une accréditation » / « Mon accréditation » et bloc Contenus sur la fiche événement ; le badge presse enregistre son kit du jour J sur le téléphone (il manquait). **D26 : plus de numéro de carte de presse** (schémas, API, seed ; colonne laissée vide) et vérification d'administration renommée « vérification du profil média ». Aucune migration. Recette `apps/web/e2e/appli-lot55.spec.ts` (`appli-lot41.spec.ts` et `appli-lot48.spec.ts` adaptés : écran de création du profil média, kit du badge presse synchronisé).
- **Lot 57 — site : parité des fonctions nouvelles de la DA v2 (branche `lot-57-site-parite-v2`, vague 7, à relire et fusionner)** : Mes sorties (`/app/sorties`, `/app/acces` redirige), passeport, prix du public, récap, casquette Média (accréditations, recherche, contenus avec floutage proposé — D28, agenda, profil), fiche d'un média, prestataire v2 et vitrine (`/providers/:id`), carte à partager en trois styles, Mon profil en hub ; organisateur : presse, missions des prestataires (besoins, emplacement, avis), affiche à régénérer, prix du public, entrées drive, note d'arrivée au tri ; administration : profils média à vérifier. Aucune migration ; `POST /me/uploads` accepte `plateRects` (galerie média) ; dessin des tampons déplacé dans `shared`. Tableau de parité : journal des choix, lot 57.

### Vague de conformité à l'artefact (21 et 22/10/2026)

- **Lot C1 — socle du système de design** : fond « battle » par défaut, en-tête, pastille de casquette (organisateur seulement), barre d'onglets flottante avec le O qui déborde, barre masquée dans les écrans de flux, feuilles au-dessus de la barre ; valeurs de l'artefact devenues jetons (`tokens.v2.json`).
- **Lot C2a — passionné, partie a** : Accueil, Explorer, carte, Sorties, Mon accès, Boîte (la carte « Termine ta fiche » vit dans Mon profil, plus sur l'Accueil).
- **Lot C2b — passionné, partie b** : profil, garage, page du véhicule, fiche événement, candidature, crew, vote, partage, récap.
- **Lot C3 — arrivée, ouverture, connexion, tutos** : accueil du premier lancement avec la battle en tandem, flux d'arrivée de l'artefact, 31 diapos de tuto reconstruites d'après l'artefact, photos et logo de démonstration.
- **Lot C4a — organisateur et staff** : Équipe, Direct, Tri, Événements, Structure, assistant de création, page événement, carte du tri, accueil drive, mode staff (hors ligne et QR inchangés).
- **Lot C4b — pro, prestataire, média, administration** : Ma fiche, Scanner, Stats, Missions, Candidatures, Vitrine, Agenda, Accréditation, Contenus, style de l'administration.
- **Lot C5 — API, seed et site `/app`** : photo d'événement et logo d'organisateur partout, QR dès la retenue, seed enrichi, espace `/app` du site refait (la relecture a fait corriger une photo d'événement privé exposée).
- **Lot C6 — ressources réelles** : 23 photos de JohnGRD Photographie (usage autorisé), plaques floutées, vrai logo de MéditeSportCar, icône ; le seed les utilise.
- **Lot C8 — fumée de la battle** : fumée derrière les voitures et affiches du hero du site reprises de l'artefact, en natif (pool de bouffées, pensé pour les téléphones modestes) et en web (canvas), à la demande de Damien le 22/10.
- **Correctif 53c** (missions de l'assistant de création), **lot 57** (parité du site), **lots 59a** (dette de code, recettes déterministes), **59c** (retours de l'APK d'essai : floutage de plaque, poignées du cadre, QR de compte) et **59d** (robustesse) : fusionnés.
- **Correctifs de recettes après la vague (22/10)** : quatre recettes de l'appli dépassées par la v2 adaptées (`appli-lot55`, `appli-lot40`, `appli-structure-staff`, `appli-lot41`), sans changer le code de l'appli.

## Dette et outillage (lot 59)

- **Lot 59a (branche `lot-59a-dette`, dette de code et recettes déterministes)** : `social.spec.ts` cherche l'entrée du Journal de Léa à travers la pagination (« Plus ancien ») au lieu de la supposer en première page ; `scenario-parcours1-b` (API) avait un délai de 20 s trop court sous charge (la comparaison des notifications ne dépendait déjà pas de l'ordre) : 120 s explicites ; `attente.spec.ts` : voir le journal des choix ; les cinq avertissements `noDescendingSpecificity` de `wizard.css` sont réglés sans changer le rendu ; registre des préfixes de cache à identifiant (`CACHE_KEY_PREFIXES` dans `apps/mobile/src/lib/kv.ts`, purge par préfixe à la déconnexion (navigateur), garde dans `cacheScope.test.ts` : un nouveau `cacheKey` à identifiant sans préfixe déclaré fait échouer le test).
- **Partie Codex (fusionnée)** : `meteo.spec.ts` déterministe (stub local d'Open-Meteo : lancer l'API et Playwright avec `WEATHER_PROVIDER=open-meteo` et `METEO_URL=http://127.0.0.1:18591/v1/forecast`), brouillons de l'assistant rangés sous le compte, `site.test.ts` indépendant du `.env`.
- **Reste** : point 5 (`entranceNote` sur la fiche publique) après la fusion des lots 56 et 57 ; segments à 56 px du staff : branche `codex-segments-accessibles` ; `CriteriaStep` du site est encore utilisé par l'assistant (étape « critères »), il n'est pas mort.

## En cours

- **Les retours de Damien sur l'APK conforme** : classés dans `retours-damien-2026-10-22.md` (relais) en BUG, ÉCART ARTEFACT, QUESTION ou ÉVOLUTION (v2.1, non codée), avec une proposition de solution chacun. Premiers constats : titre de la carte d'accueil coupé au milieu d'un mot (« RASSEMBL / EMENT »), filigrane « ORASSO » de l'affiche qui déborde sous le bouton « Sur la carte ». Captures dans `.claude/retours-xiaomi/`.
- **`lots/c7-finitions.md`** (relais), finitions relevées par les relectures, aucune bloquante : SIRET enregistré seulement par « Contrôler », initiales de grade en double, clé React en double ; bouton Boîte rogné dans l'en-tête de l'administration à 390 px ; échecs de chargement masqués dans le journal du site et destination de la carte flottante ; tickets de Presse, Candidatures et Missions au style de l'artefact ; deux recettes instables ; kits locaux à verser dans le socle ; battle autour du O (le lot C8 a repris la fumée et les affiches : à vérifier par paires à 390 et 1 280 px).

## Prochaine étape

1. **Damien** : continuer ses retours sur le téléphone, puis valider le plan de corrections.
2. **Corrections par petits lots**, avec un APK construit sur ce PC à chaque fournée (voir « Construire l'APK sur ce PC »).
3. **Lot C7** (finitions, `lots/c7-finitions.md`).
4. **Lot 58 — recette finale** : APK v2 complet, passage sur le téléphone (rendu du O vivant et du fond, épingle native par geste, ML Kit), retrait des alias dépréciés (`Loader`, `OpeningScreen`, `fan`).
5. **Outillage** (après un essai mesuré, avec l'accord de Damien) : lancer les recettes de l'appli sur la version web compilée (`expo export`, en local) au lieu de Metro. À mesurer d'abord.
6. **v2.1 dans l'artefact** : les évolutions demandées par Damien se dessinent d'abord dans l'artefact, puis se codent ; rien n'est codé avant.

## Méthode (décisions D31 et D32)

- **Deux relectures par lot, en parallèle** : une par Opus, une par Codex, avec contrôle des paires « artefact | réel » pour les lots visuels.
- **Un seul tour de corrections.** Pas de nouvelle relecture des corrections, sauf lot sensible (données, argent, sécurité, hors ligne). Seuls une régression ou un point bloquant arrêtent la fusion ; le reste part en lot de robustesse.
- **Une grosse vérification par mise en ligne** (D31), sur un périmètre figé ; à chaque fusion : tests unitaires, typecheck et build.
- Les règles de `CLAUDE.md` restent : journal des choix pour tout détail non écrit, branche par lot, commits en français.

## Construire l'APK sur ce PC

- **Script** : `C:\Users\Dams\.claude\relais\orasso\outils\build-apk-local.ps1` (8 à 13 minutes). Il construit depuis le checkout `main` (`C:\Users\Dams\Orasso`), signe avec la clé copiée dans `C:\Users\Dams\.orasso-signature` et écrit l'APK dans `C:\Users\Dams\orasso-apk\`. Faire `pnpm install` avant.
- **Installer sur le Xiaomi** : `adb -s cd0ba0d8 install -r <fichier.apk>`.
- **Déposer sur le Drive** : par le VPS (rclone, destination `gdrive:Orasso APK`), nom du type `Orasso-2026-10-22-97bd2516-v2-conforme.apk`.
- **Captures du téléphone** : `adb -s cd0ba0d8 exec-out screencap -p > fichier.png`.

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
   - `pnpm dev:mobile` → Metro (Expo) ; scanner le QR code avec Expo Go, ou `a` pour un émulateur Android. Dans un navigateur : `npx expo start --web` depuis `apps/mobile` (mettre l'origine de Metro dans `CORS_ORIGINS` du `.env` de l'API, ex. `http://localhost:8081`, et l'API dans `EXPO_PUBLIC_API_URL` ; lot 44 : le site dans `EXPO_PUBLIC_SITE_URL`, qui sert aussi les glyphes de la carte, sinon police d'OpenFreeMap).
   - Mode staff dans un navigateur (expo-sqlite en WebAssembly exige une page isolée) : `expo start --web --port 8102` puis `node apps/mobile/scripts/web-isolated.mjs 8101 8102`, ouvrir http://localhost:8101 (et `CORS_ORIGINS=http://localhost:8101`). Sans caméra, la recette injecte une lecture : champ « Recette · charge utile » de l'écran de scan ou `__orassoScan("OR1…")` dans la console (développement seulement).
6. **Vérifier** : `pnpm test` (la base doit tourner ; les tests de l’API créent et migrent eux-mêmes des bases séparées `orasso_test_*`, voir « Tests de l’API » ci-dessous ; la base de dev et son seed ne sont pas touchés), `pnpm typecheck`, `pnpm lint` (`pnpm format` corrige la mise en forme). Compilation de l'appli sans téléphone : `pnpm --filter @orasso/mobile export:android`. Recettes Playwright : voir `apps/web/playwright.config.ts` et l'en-tête de chaque `apps/web/e2e/*.spec.ts` (site : API et site lancés sur la base seedée ; appli : `APP_URL` vers le relais `apps/mobile/scripts/web-isolated.mjs` devant `expo start --web`, `CORS_ORIGINS` et `EXPO_PUBLIC_API_URL` posés ; `horloge-parcours.spec.ts` en dernier puis `pnpm db:seed --reset`).
   **Recettes de l'appli sur la version web compilée (essai, Metro reste le mode par défaut)** :
   - `node scripts/appli-compilee.mjs --port <port de l'appli>` compile (`expo export --platform web`, sortie `apps/mobile/dist/recette`, hors git) avec `API_PORT` et `WEB_PORT` du `.env` intégrés au build, puis sert le résultat sur ce port (repli vers `index.html` pour les routes d'expo-router, en-têtes d'isolation pour le mode staff : ni Metro ni `web-isolated.mjs`). `--skip-export` ne fait que servir, `--clear` vide le cache de Metro.
   - Mettre ce même port dans `CORS_ORIGINS` de l'API, lancer Playwright avec `APP_URL=http://localhost:<port>` : les specs ne changent pas.
   - Le build pose `EXPO_PUBLIC_RECETTE=1`, qui garde les fonctions de recette réservées à `__DEV__` (injection d'un scan sans caméra, `__orassoScan`, maintien du scan : `apps/mobile/src/lib/recette.ts`). Aucun profil EAS ne pose cette variable : l'APK n'a pas ces fonctions.
   - Mesures et recommandation : `~/.claude/relais/orasso/mesure-appli-compilee.md`.
7. **Clés des QR** : sans `QR_SIGNING_KEYS` dans le `.env`, l'API de développement signe avec une clé de démonstration publique (`kid 0`). Pour une vraie clé : `pnpm --filter @orasso/api keys:generate` et coller les deux lignes dans le `.env`. Vérifier un QR hors de l'API, avec les seules clés publiques : `pnpm --filter @orasso/api pass:verify --keys http://localhost:3001/api/keys [--event-no N] <OR1…>`. Clé compromise : `pnpm --filter @orasso/api keys:revoke <kid>` (procédure : `deploy/README.md`).
8. **E-mails en développement** : transport « journal », chaque e-mail est écrit dans `.data/mail/` (un fichier HTML) et résumé dans la console de l'API. Photos envoyées : `.data/storage/`, servies par `/api/files/…`.

### Tests de l'API (parallèles)

`pnpm --filter @orasso/api test` fait tourner les fichiers de test en parallèle (4 processus ; `-- --maxWorkers=2` pour réduire sur un PC chargé ; directement avec Vitest : `node ../../node_modules/vitest/vitest.mjs run --maxWorkers=2` depuis `apps/api`). Une base modèle `<préfixe>_test_<empreinte>_tpl` est créée et migrée une fois, puis chaque processus travaille sur son propre clone `<préfixe>_test_<empreinte>_<n>` et son dossier `.data/test/<n>` (`DATA_DIR` et `UPLOADS_DIR` imposés avant l'import de l'API). Les noms sont limités à 63 octets et distincts de la base source. Modèle et clones sont réutilisés d'un passage à l'autre et recréés tout seuls si `apps/api/drizzle` change (empreinte des migrations). Toute suppression exige aussi le commentaire d'appartenance à la suite.

L'ancienne base `<base>_test` est inutile. Pour repartir à froid, depuis `apps/api` : `node --import tsx test/clean-databases.ts`. Cette commande supprime les bases `*_test_*` générées par cette suite sur le serveur local du `.env` (ici port 54416), après vérification des noms et commentaires ; elle refuse les bases non reconnues et ne supprime pas les anciennes bases sans ce marquage. Avec le Node de ce worktree : `C:\orasso-codex\node\node.exe --import tsx test/clean-databases.ts`. Deux suites lancées en même temps dans le même worktree partagent les clones et dossiers : à éviter. Détail en tête de `apps/api/vitest.config.ts` ; code dans `apps/api/test/databases.ts`, `global-setup.ts` et `setup-process.ts`. Un test doit rester autonome (`resetDb()` avant chaque test, pas de port fixe, dossiers temporaires par `mkdtemp`).

Plusieurs copies du dépôt (worktrees) : dans le `.env` de chacune, changer le port de `DATABASE_URL`, `DB_DATA_DIR`, `API_PORT`, `WEB_PORT` et le port de `PUBLIC_URL` (qui doit être celui du site).

Créer un compte de test (API lancée ; depuis le lot 41 l'inscription exige le profil choisi, au moins un département, le prénom et le nom, en plus des conditions générales) :
```
curl -X POST http://localhost:3001/api/auth/sign-up/email -H "Content-Type: application/json" -H "Origin: http://localhost:5173" -d "{\"email\":\"test@orasso.test\",\"password\":\"motdepasse-test-123\",\"name\":\"Test\",\"termsAccepted\":true,\"mainProfile\":\"visitor\",\"departments\":[\"66\"],\"firstName\":\"Test\",\"lastName\":\"Compte\"}"
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

Seul ce qui est commité part. Migrations appliquées au démarrage de l'API ; seed de démonstration lancé à chaque déploiement si `db:seed` existe. Le VPS est partagé avec d'autres sites en production : lire `deploy/README.md` avant d'y toucher (nginx, secrets, sauvegarde, restauration). Identifiants du site : `C:\Users\Dams\.claude\relais\orasso\secrets-dev.txt`.



## Builds de l'appli (EAS, lot 11)

Configuration dans `apps/mobile/eas.json` (profils `development`, `preview` = APK Android vers https://dev.orasso.fr, `preview-simulator` = iOS simulateur). Aucune variable n'est secrète : l'adresse de l'API et la clé publique des QR (`kid 1`) sont dans le profil. **État** : projet EAS créé (`extra.eas.projectId` et `owner` dans `app.json`) ; les APK sont désormais construits sur ce PC (voir « Construire l'APK sur ce PC »), cette section reste pour mémoire (connecteur Expo, quota gratuit de 15 builds Android par mois). La section « Première fois » reste pour mémoire.

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
