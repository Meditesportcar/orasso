# Recette du parcours n° 1 (lot 12, 16/10/2026)

Parcours : page événement → candidater → tri → retenu → accès → jour J → scan staff hors ligne → points → **avis**.
Recette faite **en local** (base PostgreSQL 54341, API 3111, site 5283, appli `expo start --web` derrière le relais
d'isolation sur 8111, seed du dépôt). Aucune connexion à dev.orasso.fr : le parcours connecté en ligne est pour Damien.

Captures : `C:\Users\DELL\.claude\relais\orasso\lot-12-captures\` (`site/` : 20 écrans × Béton/Sable × bureau/390 px,
avec `audit.json` ; `appli/` : 15 écrans à 390 px).

## 1. Ce qui a été ajouté : les avis après l'événement

docs/01 « Découvrir et participer » (Validé) : 1 à 3 étoiles, commentaire obligatoire, pseudo affiché ; seuls les
participants pointés notent, pendant une semaine après l'événement ; un avis par participant et par événement ; droit
de réponse public de l'organisateur ; moyenne affichée à partir de **3 avis** ; on note l'événement ; chaque avis pourra
être signalé (point d'accroche `reviews.hidden_at`, sans bouton tant que la modération n'existe pas).

- API : migration `0017_reviews`, `POST /api/applications/:id/review`, `GET /api/events/by-slug/:slug/reviews`,
  `GET /api/events/:id/reviews` (organisateur), `PUT /api/reviews/:id/reply`, champ `review` de `MyApplication`.
- Site : carnet de route (`/app/acces?vue=passes`), « Avis des participants » sur `/e/:slug`, panneaux « Avis » et
  « Contestations » dans « Jour J et après » (l'organisateur ne pouvait pas trancher une contestation sur le site).
- Appli : « Laisser un avis » dans le carnet de route → feuille « Ton avis » ; avis sur la page événement.

## 2. Ce qui a été testé

### Tests automatiques (résultats réels en fin de lot)
| Paquet | Résultat |
|---|---|
| `packages/shared` | 69 tests verts (dont 3 nouveaux : fenêtre, moyenne, schéma d'avis) |
| `packages/design-system` | 32 verts |
| `apps/mobile` | 43 verts |
| `apps/api` | 113 verts (104 avant le lot ; nouveaux : `reviews.test.ts` 5, `lib/security.test.ts` 4) |

### Site (Playwright, `apps/web/e2e/`, Chrome du PC)
- `recette.spec.ts` — **le scénario complet** : organisateur Damien, staffs Julie (scan) et Marc (contrôle), cinq
  passionnés. Capacité 3 : Alpha, Bravo, Charlie retenus, Delta et Echo en liste d'attente ; Bravo se désiste (sans
  pénalité) → place libérée proposée à Delta, qui l'accepte (QR affiché) ; Echo reste 1er en attente. Jour J : la liste
  signée du staff ne contient aucune plaque ; Marc envoie le scan d'Alpha comme le fait la file hors ligne de l'appli
  (accepté), le même QR lu par Julie est un doublon ; Julie pointe Delta par sa plaque sur le site ; le staff ne voit
  pas les avis. Charlie absent. J+2 : +20 Alpha et Delta, −10 Charlie, rien pour Bravo et Echo. Charlie conteste et ne
  peut pas noter (non pointé) ; Alpha (3 étoiles) et Delta (2 étoiles) notent depuis le carnet (bouton désactivé tant
  qu'aucune note n'est choisie, plus de QR dans le carnet) ; deuxième avis refusé (409). Damien répond à Delta et annule
  le malus de Charlie depuis « Jour J et après » (points de Charlie à 0). Page publique : « Événement terminé », pas de
  « Candidater », 2 avis avec pseudo et réponse, « la moyenne s'affiche à partir de 3 avis », aucune plaque.
- `recette.spec.ts` — **double authentification réelle** : activation sur `/app/securite` avec un code TOTP calculé par
  le test (RFC 6238), puis connexion qui demande le code (mauvais code refusé, bon code accepté).
- `recette.spec.ts` — **mouvement réduit** (`prefers-reduced-motion`) : sur la page événement et la connexion, dans les
  deux thèmes, aucune animation autre qu'un fondu de 120 ms au plus.
- Tests existants rejoués : `parcours1`, `tri`, `attente`, `malus` (tous verts).
- `captures.spec.ts` (`CAPTURES=1`) : 20 écrans × 2 thèmes × 2 largeurs, avec contrôle automatique du système de design
  (`audit.ts` : boutons principaux, néons moutarde, boutons sans icône, vert, texte tronqué, défilement horizontal).

### Appli (Playwright sur `expo start --web`, 390 × 844)
- `appli.spec.ts` (Sable puis Béton) : connexion, carnet de route (présent +20 / absent −10 / « Contester le malus »),
  feuille « Ton avis » (2 étoiles, commentaire) envoyée, « Avis donné » et étoiles, avis sur la page événement
  (moyenne 2,7 / 3), points de Moi ; 0 erreur dans la console.
- `appli-staff.spec.ts` : Julie synchronise la liste du Salon du seed, **réseau coupé** (navigateur hors ligne), QR
  valide d'un pilote → plein écran « OK · zone EXP » ; QR falsifié (un caractère de la signature) → « Refusé · QR
  falsifié » ; la lecture attend dans la file ; réseau rétabli → la file part seule et l'organisateur voit l'entrée.
- Limites : pas de téléphone ni de simulateur (pas d'APK, lot 11) ; caméra remplacée par l'injection de recette.

### Design system, écran par écran
`audit.json` (après corrections) et regard sur les captures :
- **Un seul bouton principal** : respecté partout après correction de la liste des événements de l'organisateur
  (19 boutons principaux → 1).
- **Tout bouton porte une icône** : aucun bouton sans icône relevé.
- **Pas de vert** : aucune couleur verte relevée (scan OK moutarde).
- **Nom de véhicule jamais tronqué** : aucun texte coupé par des points de suspension.
- **Pas de défilement horizontal à 390 px** : corrigé sur la candidature 3/3 et le jour J (voir § 3).
- **Un seul néon moutarde** : corrigé sur la page événement (le repère de la carte portait aussi le néon) ; restent
  **deux** néons sur les écrans du compte qui ont un bouton principal (Accueil, Accès, Garage, ajout de véhicule : le
  bouton + l'onglet Accès, toujours allumé). Règle du système de design à trancher : « À revoir avec Damien ».
- Pas de roue qui tourne : indicateur « voiture qui se gare » seulement. Pas de contour ni de néon sur un texte.

### Contrastes WCAG mesurés en Sable
| Texte / fond | Rapport | Verdict |
|---|---|---|
| Encre `#131417` / surface `#ded7c7` | 12,85:1 | AA |
| Encre / sol `#cfc8b8` | 11,06:1 | AA |
| Texte atténué du site (`.s-muted`, encre à 78 %) / surface | 7,33:1 | AA |
| Encre / champ `#e8e2d3` | 14,25:1 | AA |
| Encre / bouton moutarde | 9,95:1 | AA |
| Rouge texte `#a3261f` / surface | 5,13:1 | AA |
| Crème `#f3ebdd` / plaque Sable (≈ `#393b42`) | 9,44:1 | AA |
| Crème atténuée `#c9c2b4` / plaque | 6,31:1 | AA |
| Moutarde `#e9b824` / plaque | 6,04:1 | AA |
| Bleu attente sur plaque `#7fa6ff` | 4,69:1 | AA |
| Moutarde lisible `--accent-text #8a6200` / surface (liens) | 3,83:1 | grand texte seulement |
| Encre atténuée `--ink-muted #6b6660` / surface | 3,97:1 | grand texte seulement |
| Bleu attente `#2f5fb8` / surface | 4,25:1 | grand texte seulement |
| `--ink-faint` et statut « Refusée » `#8f897d` / surface | 2,42:1 | **échec** |
| Rouge Béton `#ff6a5f` / plaque Sable (après correction) | 3,98:1 | grand texte seulement |
| ~~Moutarde lisible / plaque (appli, avant correction)~~ | 2,04:1 | corrigé |
| ~~Rouge texte / plaque (appli, avant correction)~~ | 1,52:1 | corrigé |

## 3. Défauts trouvés et corrigés (un commit chacun)
1. **Connexions du site toutes dans un seul compteur de débit** (sécurité, `31f5d8e`) : les appels du rendu serveur
   ne transmettaient pas l'adresse du visiteur ; en production, Better Auth (3 essais / 10 s) aurait bloqué la
   connexion pour tout le monde dès quelques visiteurs. `X-Forwarded-For` transmis.
2. **Pas de limite de débit sur les routes sensibles** (`dfbbdfc`, test `lib/security.test.ts`) : sondage de plaque
   par l'ajout de véhicules, QR de compte, recherche et pointage par plaque du staff.
3. **Pas d'en-têtes de sécurité** (`55719fe` API, `31f5d8e` site) : nosniff, interdiction d'encadrement
   (espace organisateur), référent réduit.
4. **19 boutons principaux** sur la liste des événements de l'organisateur (`2d741c5`).
5. **Défilement horizontal à 390 px** (`96f0a91`) : « Envoyer ma candidature » débordait ; le libellé masqué de la
   colonne « Action » sortait du tableau du jour J.
6. **Carnet de route** (`8ec6bec`) : QR « Présente ce QR à l'entrée » sur des événements passés, « Saison Saison
   2026 » ; page d'un événement terminé avec un « Candidater » désactivé et « Inscriptions closes ».
7. **Texte illisible sur les plaques de l'appli en Sable** (`9bd5cef`) : « pointage en attente » (2,0:1), « absent ·
   −10 pts » et erreurs (1,5:1) dans le carnet, Moi, l'encart d'erreur, la candidature.
8. **L'organisateur ne pouvait pas trancher une contestation sur le site** (`8b304a5`, avec les avis).
9. **Deux néons moutarde sur la page événement** (`310c861`) : le repère de la carte en plus du bouton « Candidater ».

## 4. Revue de sécurité ciblée
Relecture méthodique de toutes les routes de l'API et des appels du site :
- **Permissions** : chaque route vérifie l'utilisateur et le rôle (organisateur avec 2FA, staff par rôle et par
  événement, propriétaire). Plaque : jamais dans la liste du staff, la recherche, les pages publiques ni les avis
  (vérifié par les tests et la recette). Coordonnées : organisateur (tri) et super staff (synchro) seulement. Données
  d'une autre structure : refusées (`requireOrganizer` partout, tests). Staff hors fenêtre : liste, recherche et synchro
  refusées hors veille → J+2 ; écritures fermées au règlement. Avis : réponse refusée au staff, à une autre structure et
  à l'auteur (tests).
- **QR** : Ed25519, liste du staff vérifiée avec les seules clés de confiance, clé de démonstration refusée hors API
  locale, QR falsifié refusé hors ligne (recette appli) et par le serveur.
- **Secrets** : aucun secret dans le dépôt (recherche de clés privées, jetons, mots de passe : seulement ceux des
  tests) ; `.env` ignoré ; `DEV_SKIP_2FA` et `kid 0` refusés en production.
- **Débit** : voir § 3 ; Better Auth limite connexion, inscription et 2FA en production ; nginx 30 req/s par adresse.
- **Fichiers** : `/api/files/*` protégé contre la remontée de dossiers. Redirection après connexion : chemins internes
  seulement.
- Reste ouvert (« À revoir ») : CSP complète du site, vérification de l'e-mail à l'inscription, limites en mémoire,
  hachage de plaque retrouvable sur le téléphone du staff (A14, déjà connu).

## 5. Défauts restants
- **Deux néons moutarde** sur les écrans du compte à bouton principal (règle du système de design à trancher).
- **Page événement en Sable sur téléphone** : sections posées sans plaque sur le haut du fond assombri, texte atténué
  peu lisible (à reprendre avec les pages publiques du lot 13).
- **Jetons du Sable sous l'AA** pour le texte courant (liens moutarde 3,8:1, encre atténuée 4,0:1, « Refusée » 2,4:1) :
  jetons gelés, proposition dans le journal des choix.
- Rien vu sur téléphone (APK : lot 11) ; parcours connecté sur dev.orasso.fr non joué (réservé à Damien).

## 6. À revoir avec Damien
Détail dans `docs/JOURNAL-DES-CHOIX.md`, « À revoir avec Damien » → « Recette du parcours n° 1 (lot 12) » :
1. Un seul néon : l'onglet Accès perd son halo quand l'écran a un bouton principal ?
2. Assombrir `accent-text`, `ink-faint` et le statut « Refusée » du Sable (contraste) ; jeton `win-on-plate`.
3. Page événement publique en Sable sur téléphone (plaques).
4. Avis : phrase d'information « avis vérifiés » (juriste) ; moyenne à partir de 3 avis (choix du lot).
5. Vérification de l'e-mail à l'inscription (avec Brevo) ; CSP complète avant l'ouverture.
6. Essai par Damien sur un vrai événement MéditeSportCar (docs/03), à planifier.
