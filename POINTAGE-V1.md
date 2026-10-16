# Pointage V1 d'Orasso — ce qui est fait, ce qui manque (16/10/2026)

Comparaison de chaque fonction **validée** du projet (`docs/01` section « Validé », `docs/02`) avec le code de `main` (`fffe6a3`, après le lot 13 ; le lot 14 pros/billetterie est en cours). Référence : le projet **corrigé** par nos décisions (`docs/JOURNAL-DES-CHOIX.md`, `ARCHITECTURE.md`, décisions du plan) — quand une correction existe, c'est elle qui compte (ex. format des QR, désistement après verrouillage). Règle de Damien : une absence n'est justifiée que par une **raison écrite valable** ; « plus tard », « pas dans ce lot » ou « l'API ne l'a pas » ne sont pas des raisons → **à faire**.

Détail par chapitre (preuves fichier:ligne) : `C:\Users\DELL\.claude\relais\orasso\pointage\01…08-*.md`.

## Ce qui est fait (parcours n° 1 complet, site public, création d'événement)
Socle et déploiement (dev.orasso.fr, sauvegardes, APK), design system web et natif, comptes e-mail + mot de passe, 2FA obligatoire organisateurs, structures et vérification SIRET/RNA + justificatif + badge, création d'événement en 12 étapes (formats V1, véhicules, places, public, admission libre/filtration, critères, avant-première, règlement, zones, duplication, récurrence), page événement publique et `/evenements` avec carte, candidatures, tri (file au clavier, vue liste, décisions en masse, motifs, compteurs temps réel), liste d'attente automatique et délais, désistement et verrouillage H-2, QR d'inscription signés, mode staff hors ligne (synchro vérifiée, scan continu, recherche plaque/pseudo, pointage manuel et par plaque, placement, alerte, main courante), inscription express, points et malus à J+2, contestation, grades et saisons, QR de compte dynamique (appli), avis et réponse de l'organisateur, notifications (base, push, e-mail journal, heures calmes, préférences par type côté API), premier lancement, jour J hors ligne, garage (véhicules, photos, plaque unique), deux thèmes.

## Reporté avec une raison valable (ne bloque pas)
| Fonction | Raison |
|---|---|
| E-mails réels (Brevo) | clé Brevo et adresses d'envoi à créer (contact@orasso.fr en cours) — le code est prêt |
| Photos sur stockage objet OVH | clés OVH à créer — pilote disque en attendant (le pilote S3 sera écrit) |
| Connexion Google / Apple | identifiants OAuth et compte Apple Developer à créer |
| Publication Play Store / App Store, iPhone réel | comptes développeur Google / Apple à créer |
| Billetterie payante réelle (Stripe) | clés de test Stripe à fournir ; encaissement réel après le 21/06/2027 (docs) |
| Floutage automatique des plaques | docs : « plus tard » |
| Formats roulants et piste | docs : « viendront après » |
| Lecture de plaque par caméra | docs : « à tester », pas une fonction ferme |
| Motorisation générée depuis une base Orasso | la base de motorisations est à constituer (C18 : texte libre en V1) |
| Avantage de l'organisateur qui amène ses partenaires | docs : « forme à définir » |

## À faire (absent ou partiel sans raison valable)
### Compte et sécurité
- Réinitialisation du mot de passe par e-mail ; vérification de l'e-mail à l'inscription.
- Alerte e-mail au changement de mot de passe et à la connexion depuis un nouvel appareil.
- Clé d'accès (passkey, Face ID / empreinte) comme double authentification.
- **Suppression du compte depuis l'appli** (exigée par les stores) et le site.
- Écran **Moi** complet (appli et site `/app/moi`) : modifier le profil (photo, pseudo, description, aperçu « ce que voient les autres »), notifications par type, compte public/privé et ses règles d'affichage, secteur, centres d'intérêt, rayon, 2FA et appareils, mes casquettes, devenir staff.
- Notifications « événement correspondant à tes centres d'intérêt dans ton rayon ».
- SDK Sentry/GlitchTip posé (actif dès qu'un DSN existe).

### Social
- **Amis** : suivi avec acceptation des deux côtés ; profils des autres (public/privé, amis voient tout).
- **Recherche de personnes** : pseudo, véhicule (marque, modèle, génération), « autres propriétaires près de chez moi », filtres département / centres d'intérêt / véhicule / grade ; **QR ami**.
- **Messagerie** : messages entre amis, demande de contact unique et filtrée, organisateurs toujours joignables, **confirmation de lecture** ; onglet **Boîte** (messages + demandes) appli et site.
- **Fil d'actualité** fusionné avec les notifications dans le **Journal** (appli et site).
- **Crews** : crews privés (logo, nom, description, département, créateur), demandes et invitations, fil de discussion de groupe avec images, trouvables par nom et département ; **inscription en crew** aux événements (chaque membre, confirmation, retrait individuel), crew visible au tri.

### Découverte et accueil
- Explorer de l'appli complet : carte, segments **Pros** et **Personnes et crews**, filtres ; découverte par affinités et organisateurs suivis.
- **Recherche de premier niveau** (personnes, véhicules, crews, événements, pros) dans l'appli et le site.
- **Accueil** : widgets réglables (statuts, suggestions autour de moi avec rayon, météo, garage favori, lavage et carburant les plus proches), emplacement sponsorisé.
- Site : `/app` (accueil complet), `/app/explorer`, `/app/boite`, `/app/moi`, QR de compte sur le site.

### Garage, points, certification
- Poids et pays de la marque ; statuts **vendu / souvenir / accidenté** ; catégories incohérentes limitées par marque et type.
- **Transfert de plaque** confirmé par l'ancien propriétaire, sinon arbitré par l'équipe Orasso.
- **Fiches véhicule à partager sur Instagram** (story 9:16, publication 1:1).
- **Certification** : demande à partir d'un seuil, validation manuelle, perte après modification ou 6 mois sans événement.
- **Points de parrainage** (ami invité dont l'e-mail est confirmé) ; **priorité liste d'attente et avant-première pour les hauts grades** si l'organisateur l'active.

### Organisateurs
- **Casquettes** dans l'appli (organisateur, pro, prestataire ; avatar, appui long, pastille) et **casquette Organisateur** de l'appli : Direct, Événements, **Tri par glissement**, Boîte, Staff ; créer une structure depuis l'appli.
- **Communication** : consignes et annonces, **messages groupés par segment** (avec limite aux abonnés), **modèles de messages**, **fil public de l'événement**, **discussions du staff** (permanente et par événement, fermée à J+1, lisible à J+7) ; statut Maintenu/Incertain/Annulé envoyé et affiché ; **météo** (suggestion « Incertain », rappel de la veille, jour J).
- **Staff côté site** : membres, rôles, invitations, présences ; rôle **boutique** (contrôle des billets du public, compteur d'entrées).
- **Invitations nominatives** (personne ou véhicule), **événement privé sur invitation**, invitation des retenus à l'édition suivante ; **événements sur plusieurs jours** (accès à tout l'événement ou par jour).
- **Après l'événement** : **bilan automatique**, **remerciement** avec lien d'avis, **export** des participants (tracé), **note interne** privée.
- Jour J : direct **par catégorie** et prestataires arrivés, **photo** dans la main courante, **position** dans l'alerte.
- Badge de structure : **rappels** à 1 mois, 1 semaine, la veille et **suspension** sans nouvelles ; changement de propriétaire par l'équipe sur justificatif.

### Prestataires et photographes
- **Casquette Prestataire** (candidatures, profil, boîte, QR de stand), **candidature des prestataires** aux événements et onglet de tri dédié, présence affichée sur la fiche de l'événement ; **photographes** (Instagram, portfolio, contact, accréditation « média officiel », amateurs sans structure) ; un pro peut candidater pour tenir un stand.

### Modération et administration
- **Signaler** partout (profil, véhicule, message, photo, événement, avis, crew) avec motif et capture ; file du **modérateur** (suspension) ; échelle des **sanctions** ; suspension automatique sur signalements répétés avec protections contre les meutes ; **contestation** d'une sanction ; information du signaleur et du sanctionné ; historique d'un message privé signalé ; conservation un an puis suppression.
- **Administration** : registres (utilisateurs, structures, pros, base véhicules, journal des accès), réglages (interrupteurs, listes, points et grades), **newsletter** gérée dans l'admin, mode assistance (survol, intervention sur demande tracée), file des « Autre » du référentiel.

### Pros et billetterie (à repointer après le lot 14)
- Hors lot 14 : fiche de base gratuite après le 21/06/2027, **emplacements sponsorisés** (tarif en constante), mention « paiement sur place » pour une entrée payante hors Orasso.
