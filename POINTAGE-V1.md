# Pointage V1 d'Orasso — ce qui est fait, ce qui manque (repointé le 17/10/2026, lot 34)

Comparaison de chaque fonction **validée** du projet (`docs/01` section « Validé », `docs/02`) avec le code de la branche `lot-34-recette-finale` (depuis `main` `0fabe76` : lots 01 à 35d fusionnés). Référence : le projet **corrigé** par nos décisions (`docs/JOURNAL-DES-CHOIX.md`, `ARCHITECTURE.md`, décisions du plan, dont D20 « tout se gère depuis l'appli »). Règle de Damien : une absence n'est justifiée que par une **raison écrite valable** ; « plus tard » ou « pas dans ce lot » ne sont pas des raisons.

Premier pointage (16/10, après le lot 13) et preuves par chapitre : `C:\Users\DELL\.claude\relais\orasso\pointage\01…08-*.md`. Ce repointage reprend chaque ligne de l'ancienne section « À faire » et dit quel lot l'a faite ; la recette du lot 34 l'a vérifiée (Playwright du site et de l'appli dans le navigateur, tests d'intégration de l'API).

## Ce qui est fait

### Socle et parcours n° 1 (lots 01 à 14)
Socle et déploiement (dev.orasso.fr, sauvegardes, APK), design system web et natif, comptes e-mail + mot de passe, 2FA obligatoire organisateurs, structures et vérification SIRET/RNA + justificatif + badge, création d'événement par étapes, page événement publique et `/evenements` avec carte, candidatures, tri (file au clavier, vue liste, décisions en masse, motifs, compteurs temps réel), liste d'attente automatique et délais, désistement et verrouillage H-2, QR d'inscription signés, mode staff hors ligne, inscription express, points et malus à J+2, contestation, grades et saisons, QR de compte, avis et réponse de l'organisateur, notifications, premier lancement, jour J hors ligne, garage, deux thèmes, pros (fiche, remises, QR de compte, statistiques) et billetterie en mode présentation.

### Ancienne section « À faire » : tout est livré
| Fonction | Lot | Vérifié au lot 34 par |
|---|---|---|
| Réinitialisation du mot de passe, vérification de l'e-mail, alertes (changement de mot de passe, nouvel appareil) | 15 | `securite.spec.ts` (8 tests) |
| Clé d'accès comme double authentification | 15 (création sur le site), 35c (liste, renommage, suppression dans l'appli) | `securite.spec.ts`, `appli-parite.spec.ts` |
| Suppression du compte (appli et site) | 15, 16 | `securite.spec.ts`, `appli-moi.spec.ts` |
| Écran Moi complet (appli et `/app/moi`) | 16 | `appli-moi.spec.ts` |
| Notifications « événement près de chez toi » | 15 | tests de l'API (`account.test.ts`) |
| Sentry / GlitchTip (actif dès qu'un DSN existe) | 15 | tests de l'API (`sentry.test.ts`) |
| Amis, profils des autres, recherche de personnes, QR ami | 17 | `social.spec.ts`, `appli-social.spec.ts` |
| Messagerie, demandes de contact, organisateurs joignables, lu par, Boîte | 18 | `messagerie.spec.ts`, `appli-messagerie.spec.ts` |
| Journal fusionné (fil + notifications) | 17 | `social.spec.ts` |
| Crews et inscription en crew, crew au tri | 19 | `crews.spec.ts`, `appli-crews.spec.ts` |
| Explorer complet, recherche de premier niveau | 29 | `explorer.spec.ts`, `appli-explorer.spec.ts` |
| Accueil (widgets, rayon, météo, garage favori, lavage, carburant, sponsorisé) et `/app` | 30 | `accueil.spec.ts`, `appli-accueil.spec.ts` |
| Garage : poids, pays, statuts, catégories cohérentes, transfert de plaque, fiches Instagram, certification | 31 | `garage.spec.ts`, `appli-parite.spec.ts` |
| Points de parrainage, priorité des hauts grades | 15, 25 | `securite.spec.ts`, tests de l'API |
| Casquettes de l'appli, casquette Organisateur (Direct, Événements, Tri par glissement, Boîte, Staff), créer une structure | 16, 22, 23 | `appli-orga.spec.ts`, `appli-tri.spec.ts` |
| Communication (annonces, consignes, messages groupés, modèles, fil public, discussions du staff), statut Maintenu / Incertain / Annulé | 20 | `communication.spec.ts`, `appli-communication.spec.ts` |
| Météo (suggestion « Incertain », rappel, jour J) | 28 | `meteo.spec.ts` |
| Staff côté site, rôle boutique | 24 | `staff-site.spec.ts`, `appli-boutique.spec.ts` |
| Invitations nominatives, événement privé, invitation des retenus à l'édition suivante | 25, 27 | `invitations.spec.ts`, `appli-invitations.spec.ts`, `appli-evenements.spec.ts` |
| Événements sur plusieurs jours | 26 | `multi-jours.spec.ts`, `appli-tri.spec.ts` (filtre « Jour », lot 34) |
| Après l'événement : bilan, remerciement, export tracé, notes internes | 27 | `apres-evenement.spec.ts`, `appli-structure-staff.spec.ts` |
| Jour J : direct par catégorie, prestataires arrivés, photo de main courante, position de l'alerte | 24 | `appli-boutique.spec.ts`, `appli-orga.spec.ts` |
| Badge de structure : rappels, suspension, changement de propriétaire par l'équipe | 27, 33 | `apres-evenement.spec.ts`, `admin.spec.ts` |
| Casquette Prestataire, candidatures des prestataires, photographes, stand d'un pro | 21 | `prestataires.spec.ts` |
| Signaler partout, file du modérateur, sanctions, suspension automatique, contestation, conservation | 32 | `moderation.spec.ts`, `appli-administration.spec.ts` |
| Administration : registres, réglages, newsletter, mode assistance, file des « Autre » | 33, 35d | `admin.spec.ts`, `appli-administration.spec.ts` |
| Emplacements sponsorisés, fiche de base après le 21/06/2027, « paiement sur place » | 21, 30, 33 | `accueil.spec.ts`, `prestataires.spec.ts`, `admin.spec.ts` |
| **Parité de l'appli (D20)** : structure, équipe, demandes de staff, événements (créer, modifier, dupliquer, publier), billetterie de l'organisateur, pro, compte, garage, administration | 35a à 35d | `appli-structure-staff`, `appli-evenements`, `appli-parite`, `appli-administration` |
| Parité, compléments du lot 34 : sélecteur natif de date et d'heure, justificatifs en PDF, filtre « Jour » du tri, affiche gardée dans le brouillon, **création de la fiche pro dans l'appli**, **billets du public réservés dans l'appli (Mes billets)** | 34 | `appli-parite.spec.ts`, `appli-tri.spec.ts`, `appli-structure-staff.spec.ts`, tests de l'appli |

## Reporté avec une raison valable (ne bloque pas)
| Fonction | Raison |
|---|---|
| Première newsletter réelle | envoi à décider par Damien (Brevo est branché sur dev ; offre gratuite de 300 e-mails par jour, budget partagé avec les e-mails du compte) |
| Photos sur stockage objet OVH | clés OVH à créer — pilote disque en attendant |
| Connexion Google / Apple | identifiants OAuth et compte Apple Developer à créer |
| Publication Play Store / App Store, iPhone réel | comptes développeur Google / Apple à créer |
| Billetterie payante réelle (Stripe) | clés de test Stripe à fournir ; encaissement réel après le 21/06/2027 (docs) ; aucun paiement dans l'appli (règles des stores, « À revoir avec Damien ») |
| Création d'une clé d'accès depuis l'appli | demande un module natif WebAuthn (non prévu dans l'APK de référence) ; la clé se crée sur le site, l'appli la liste, la renomme et la supprime (lot 35c) |
| Floutage automatique des plaques | docs : « plus tard » |
| Formats roulants et piste | docs : « viendront après » |
| Lecture de plaque par caméra | docs : « à tester », pas une fonction ferme |
| Motorisation générée depuis une base Orasso | la base de motorisations est à constituer (C18 : texte libre en V1) |
| Avantage de l'organisateur qui amène ses partenaires | docs : « forme à définir » |
| Placement groupé des crews, galerie et filigrane des photographes | docs : « en discussion » / « plus tard » |

## À faire
Rien sans raison écrite. Les points ouverts sont des **décisions** de Damien, rassemblées dans `docs/JOURNAL-DES-CHOIX.md`, section « À revoir avec Damien — liste consolidée (lot 34) », et les **essais sur téléphone** de la liste de contrôle du lot 34 (relais, `JOURNAL.md`).
