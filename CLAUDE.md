# Orasso

Plateforme web + appli mobile qui relie les organisateurs d'événements automobiles (associations, clubs, circuits) et les passionnés qui y participent : création d'événements, candidatures avec un véhicule, tri par l'organisateur, accès par QR, accueil sur place par le staff, points et grades, professionnels partenaires. Fondateur : Damien Caron (association MéditeSportCar, Pyrénées-Orientales). Succède à Rasso 2.0, repris de zéro. Langue du projet : français (code en anglais, interface, docs et messages de commit en français).

## Lire avant tout

Tout est décidé et écrit dans `docs/`. Ne pas réinventer, ne pas deviner : chercher la réponse dans ces fichiers avant de poser une question ou de choisir.

| Fichier | Contenu | Quand le lire |
|---|---|---|
| `docs/00-contexte-projet.md` | Qui est Damien, pourquoi Orasso, sa philosophie | Une fois, au début de chaque session |
| `docs/01-conception-technique-decisions.md` | **La référence fonctionnelle et technique.** Stack, comptes, rôles, organisateurs (6 blocs), pros, candidatures, QR, billetterie, garage… Sections « Validé », « Idées », « En discussion » | Avant de coder n'importe quelle fonctionnalité |
| `docs/02-structure-appli-decisions.md` | Où vit chaque fonction : onglets, casquettes, modes plein écran, routes du site, 6 parcours clés | Avant tout écran ou toute route |
| `docs/03-identite-etat-et-suite.md` | État de l'identité visuelle, ce qui est livré, ordre de la suite | Pour l'ordre de travail et les points ouverts |
| `docs/design-system/` | **Système de design v1, gelé le 15/10/2026 : référence du code.** `tokens.json` (jetons des deux thèmes), `README.md` (livre de marque), `components/*/README.md` + `preview.html` (15 composants), `assets/Logo/` | Avant d'écrire un style, un composant ou une animation |
| **Artefact « Orasso DA v2 »** : https://claude.ai/artifact/JZmQ1Vkn28dRv69CZDXQzQ (copie locale `.claude/prototype-v2/index.html`, hors git ; la rafraîchir par l'outil Artifact, action `read` avec `path: index.html`) | **LA référence visuelle et fonctionnelle (décision D33 du 21/10/2026)** : visuel, logiques de fonctionnement, place de chaque fonction, tutos, appli ET site. Elle prime sur les docs ci-dessous là où elle diffère ; liberté d'améliorer quand c'est pertinent. Chaque lot visuel rend des paires « artefact \| réel » | Avant tout écran, tout style, toute navigation |
| `docs/prototype/index.html` | Prototype cliquable complet (passionné, staff, organisateur, pro, prestataire, deux thèmes). Ouvrir dans un navigateur | Pour voir à quoi doit ressembler un écran avant de le coder |
| `docs/structure-appli/` | Planches du canevas de conception : navigation (`Nav*`), parcours, écrans finaux Béton (`F-*`), Sable (`S-*`), site (`W-*`), animations (`A-*`), direction artistique (`DA6`, `DA7`). HTML exporté, non autoportant (pas de `support.js`) : à lire comme source, pas à ouvrir | Détail d'un écran ou d'une animation |
| `identite/` | Kit d'identité complet (logo, monogramme, favicon, réseaux, animation). Voir `identite/LISEZ-MOI.md` | Pour tout fichier de marque |

## Règles de travail

1. **Rien ne se code qui ne soit dans « Validé » de `docs/01`.** Une idée de la section « Idées » ou « En discussion » n'est pas une fonctionnalité : la signaler, ne pas l'implémenter.
2. **Le système de design ne s'interprète pas.** Les jetons de `tokens.json` sont la seule source des couleurs, typos, rayons, ombres, durées. Pas de valeur en dur dans un composant. Quelques règles qu'on oublie : pas de vert dans Orasso (le scan OK est moutarde) ; Archivo seule, en trois largeurs ; un seul néon moutarde par écran ; un seul bouton principal par écran ; tout bouton porte une icône ; un nom de véhicule ne se tronque jamais ; pas de contour ni de néon sur un texte ; pas de roue qui tourne (l'indicateur du kit) ; reduced motion = fondu 120 ms partout. Un écart au système est possible, mais il se date et se justifie dans `docs/design-system/README.md`, section « Ce qui a changé depuis le gel ».
3. **Avancer par parcours, de bout en bout**, dans l'ordre de `docs/03` : (1) parcours n° 1 complet (page événement → candidater → tri → retenu → accès → jour J → scan staff hors ligne → points), (2) site public et création d'événement, (3) pros et billetterie en mode présentation. Un parcours terminé vaut plus que trois parcours à moitié.
4. **Autonome, d'une seule traite.** Toute la conception est faite : Damien ne veut pas re-valider ce qui est déjà écrit. Quand les docs tranchent, on applique sans demander. Quand un détail n'est pas écrit (un nom de table, un libellé secondaire, un ordre de champs), on choisit la solution la plus simple et cohérente avec les docs, et on la consigne dans `docs/JOURNAL-DES-CHOIX.md` (date, choix, raison, fichiers concernés) pour que Damien la relise plus tard. On ne s'arrête pour poser une question que si c'est réellement bloquant : une contradiction entre deux docs, un secret ou un compte à créer, une action irréversible. Une question à la fois, avec une proposition de réponse par défaut.
5. **Être un partenaire, pas un exécutant.** Si les docs contredisent la sécurité ou le bon sens terrain (parking, soleil, 150 voitures en 30 minutes, pas de réseau), ne pas bloquer : suivre les docs, et noter l'objection dans `docs/JOURNAL-DES-CHOIX.md`, section « À revoir avec Damien ».
6. **Solide et simple.** Pas de dépendance qui n'apporte pas quelque chose de net. Pas d'abstraction prématurée. Pas de fonctionnalité « au cas où ». Chaque table, chaque route, chaque composant a une raison écrite dans `docs/`.

## Stack (fixée le 15/10/2026 ; à valider au démarrage puis à ne plus discuter)

- TypeScript partout, un seul dépôt (monorepo) : `apps/api` (Hono, Node LTS), `apps/web` (React Router 8, mode framework, rendu serveur), `apps/mobile` (Expo / React Native, builds via EAS), `packages/design-system` (jetons + composants React et React Native), `packages/shared` (types, validations, règles communes).
- Toutes les règles métier dans l'API, une seule API pour le site et l'appli.
- PostgreSQL + Drizzle, schéma modifié uniquement par migrations versionnées. pg-boss pour les tâches planifiées. WebSocket dans l'API pour le temps réel.
- Better Auth (e-mail + mot de passe, Google, Apple ; 2FA obligatoire organisateurs et admin). Stockage objet OVH pour les photos. Brevo pour les e-mails. Expo Push. MapLibre + OSM. Stripe Connect (compte test Orasso uniquement). Sentry.
- Développement sur le PC, versions déployées sur le VPS commun dans des conteneurs isolés. Certificats et secrets jamais dans le code.

## Conventions

- Commits en français, petits, un sujet par commit. Branche par parcours.
- Nommage : code et base en anglais ; libellés d'interface en français, exactement ceux des docs (« Rassemblement », « Exposition », « Retenue », « Liste d'attente », jamais « meet »).
- Tests : au minimum les règles métier de l'API (candidatures, liste d'attente et délais, verrouillage à H-2, signature des QR, points à J+2, malus).
- Une fonctionnalité est terminée quand elle marche sur le site, dans l'appli, dans les deux thèmes, et sur téléphone en plein soleil (thème Sable).
- Ne pas modifier les documents de décision (`docs/00` à `03`, `docs/design-system/`) : ils sont la référence. Le seul fichier que Claude Code écrit dans `docs/` est `docs/JOURNAL-DES-CHOIX.md`.
- À chaque fin de session, mettre à jour `AVANCEMENT.md` à la racine : ce qui est terminé, ce qui est en cours, la prochaine étape, et comment lancer le projet. La session suivante commence par le lire.
