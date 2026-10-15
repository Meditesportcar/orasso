# Orasso — structure de l'appli et du site : décisions

Validé par Damien le 15/10/2026, à l'issue des étapes 1 (inventaire) et 2 (navigation) du canevas « Orasso — Structure de l'appli ». Ce document complète « Orasso — conception technique : décisions » : il dit où vit chaque fonction, pas ce qu'elle fait.

## Principes
- Une seule appli mobile (iPhone, Android), pas d'appli staff séparée. Les modes jour J et staff prennent tout l'écran à l'intérieur de l'appli.
- L'appli s'organise autour de l'accès (ta place à l'événement), pas autour de la publication : pas de fil à l'ouverture, pas de grille de photos, pas d'onglet « profil ».
- Le site permet tout. Le compte connecté sur le site reprend les cinq sections de l'appli. Les espaces organisateur, pro et administration sont des outils de gestion en barre latérale, utilisables aussi sur téléphone.
- Le staff n'est pas une casquette : c'est un mode lié à un événement précis, ouvert depuis « Accès > Où je suis staff », fermé à J+1. Le changement de casquette couvre : structures organisatrices, fiche pro, profil prestataire.
- Le prestataire (food truck, photographe, barbier…) est une casquette séparée, pas un « véhicule » du garage.
- Le fil d'actualité n'est jamais l'écran d'accueil : il est fusionné avec les notifications dans le Journal, derrière la cloche.
- Recherche de premier niveau (personnes, véhicules, crews, événements, pros), en haut de tous les onglets.

## Appli — casquette passionné (par défaut)
Barre du haut, identique partout : avatar à gauche (→ Moi et changement de casquette, pastille si une autre casquette a quelque chose à traiter) ; recherche et cloche à droite (cloche → Journal, pastille avec le nombre).

Cinq onglets :
1. **Accueil** — tableau de bord, pas un fil. Bloc « Prochain accès » en tête quand un événement approche (bouton vers le mode jour J). Widgets réglables : statuts en attente, suggestions autour de moi (curseur de rayon), météo, garage favori, lavage et carburant les plus proches. Agenda de mes dates. Une incitation à la fois (ajoute un véhicule, crée ton crew…). Un emplacement sponsorisé, même apparence que le reste.
2. **Explorer** — recherche en tête, trois segments : Événements (liste et carte ; affinités, suivis, distance ; filtres format, catégorie, département, date), Pros (même principe), Personnes et crews (pseudo, véhicule, filtres département / centres d'intérêt / grade). Pages atteintes : événement, structure, fiche pro, profil d'un autre, véhicule d'un autre (« autres propriétaires près de chez moi »), crew.
3. **Accès** (onglet central, en couleur) — À venir : une carte par candidature ou billet avec son statut (en attente, retenue, liste d'attente, refusée avec motif), place libérée à accepter avec son délai, se désister, confirmer ma venue en crew ; Où je suis staff (« je suis là / pas là », bouton vers le mode staff) ; invitations nominatives reçues. Passés : carnet de route (historique, pointage en attente, points, contester un malus, laisser un avis pendant une semaine). Accès ne contient que les QR d'inscription et le jour J ; le QR de compte est dans Garage.
4. **Garage** — « mon garage, c'est moi » : le profil vit ici. En-tête : photo, pseudo, grade et points de la saison, crews, petite pastille QR à côté du grade qui ouvre le QR de compte en grand (dynamique, hors ligne). C'est ce que voient les autres sur mon profil, selon public / privé. Puis mes véhicules actifs (grandes cartes), page véhicule (photos, fiche, préparation, description, historique, partager sur Instagram, demander la certification), ajouter un véhicule, archivés repliés en bas.
5. **Boîte** — ce qu'on m'écrit : Messages (amis, crews, organisateurs, discussions de staff, confirmation de lecture) et Demandes rangées à part (ami, contact, crew, invitation à un événement, confirmation de venue en crew).

Derrière la cloche : **Journal** — fil d'actualité et notifications fusionnés, chronologique, s'arrête à la semaine passée, s'ouvre en feuille par-dessus l'onglet courant.

Derrière l'avatar : **Moi** — modifier mon profil (photo, pseudo, description, aperçu « ce que voient les autres »), points et grade (saison, avantages, remises), paramètres (notifications par type, compte public / privé, secteur, centres d'intérêt, rayon, sécurité 2FA et appareils, supprimer le compte), mes casquettes (structures, fiche pro, profil prestataire ; créer une structure, une fiche pro, un profil prestataire ; devenir staff).

Trois modes plein écran (la barre d'onglets disparaît) :
- **Premier lancement** : trois écrans (la promesse, ce que tu peux faire, créer un compte), jamais revus, pas de demande de notifications ici.
- **Jour J participant** : depuis Accès à partir de la veille ; QR d'inscription en grand, compte à rebours, statut de l'événement, itinéraire, consignes, zone attribuée, météo ; hors ligne ; se ferme après le scan ou à J+1.
- **Staff** : depuis Accès > Où je suis staff, pour cet événement seulement ; quittable d'un geste (pas de verrouillage kiosque) ; se referme seul à J+1 ; les scans en attente partent au retour du réseau.

## Appli — casquettes
Changer de casquette change la barre d'onglets. Depuis l'avatar, la feuille « Mes casquettes » liste : passionné (toujours en premier), mes structures avec leur logo, ma fiche pro, mon profil prestataire ; en bas, créer une structure / une fiche pro / un profil prestataire. L'avatar porte le logo de la structure active ; appui long sur l'avatar pour revenir au passionné.

- **Organisateur** (une barre par structure) : Direct (tableau de bord de l'événement du jour : arrivés / attendus par catégorie, prestataires, staff présent, alertes, main courante ; hors événement, compteurs du prochain) · Événements (liste par statut, page événement côté organisateur : compteurs, statut Maintenu / Incertain / Annulé, consignes, annonces, inviter ; création et modification renvoyées vers le site) · Tri (file par glissement, compteurs, motifs de refus, liste d'attente, onglet prestataires) · Boîte (messages groupés par segment, modèles, discussions de staff, messages des participants, demandes de staff) · Staff (présences, relances, rôles de l'événement, « passer en mode staff »). Les écrans du staff sont derrière « Staff > passer en mode staff », pas en onglet.
- **Pro** : Scanner (onglet par défaut : lecteur de QR de compte, résultat pseudo + grade + remise, rien d'autre) · Fiche · Publier (compteur mensuel) · Stats. Aucun bouton de paiement : état de l'abonnement et renvoi vers le site.
- **Prestataire** : Candidatures (événements ouverts à mon type, mes candidatures par statut, mon QR de stand le jour J) · Profil (type, photos, contact ; photographe : Instagram, portfolio, accréditation) · Boîte.

## Mode staff (détail)
Écran d'entrée : nom de l'événement, état de la synchro, mon rôle, « je suis là », grandes tuiles selon mes rôles. Scan : caméra ouverte en continu, résultat plein écran coloré et sonore (OK + zone / déjà entré / refusé), retour auto à la caméra en 1 s, boutons « plaque ou pseudo » et « express » toujours visibles en bas. Liste : participants validés, pointage manuel, recherche, pointage rapide par plaque après coup (pour les entrées massives), coordonnées pour le super staff. Placement : zones, attendus / arrivés par zone. Boutique : développé dès la V1, activable par événement ; contenu proposé par Claude (contrôle des billets du public, compteur d'entrées visiteurs), à confirmer. Toujours accessibles en bas : alerte (grand bouton, position), main courante (nouvel incident), discussion du staff. Le scan existe dans l'appli seulement ; le site garde la lecture de liste et le pointage manuel.

## Site — orasso.fr
- **Public, sans connexion, référencé** : accueil `/` (la promesse, les prochains événements près de chez toi, trois entrées passionné / organisateur / pro, téléchargement de l'appli) ; événements `/evenements` (liste, carte, filtres) ; page événement `/e/nom` (la page partagée, boutons Candidater / Réserver / Suivre → compte, aperçu de lien propre) ; page structure `/o/nom` ; annuaire des pros `/pros` et `/p/nom` ; `/organisateurs` ; `/professionnels` ; inscription express `/express/jeton` ; `/connexion`, `/inscription`, `/invitation/jeton` ; pied de page (CGU, confidentialité, mentions légales, contact, badge « Propulsé par Orasso »).
- **Mon compte, connecté** : `/app` (accueil), `/app/explorer`, `/app/acces` (le QR d'inscription s'affiche aussi ici pour qui n'a pas l'appli), `/app/garage` (profil, QR de compte, véhicules), `/app/boite`, `/app/moi`. Même structure que l'appli.
- **Espace organisateur** `/orga/structure`, barre latérale : tableau de bord ; événements (créer par étapes : format, véhicules, places, prestataires, public, admission, critères, avant-première, règlement, infos, zones, billetterie ; dupliquer ; récurrence ; statut) ; candidatures (file au clavier avec grandes photos et trois touches, vue liste avec filtres et sélection multiple, liste d'attente, prestataires, crews) ; communication (consignes, annonces, messages groupés, modèles, fil public) ; staff (membres, rôles, invitations, présences, discussions) ; jour J et après (direct, main courante, pointage, bilan, avis et droit de réponse, contestations, remerciement, export, édition suivante) ; structure (fiche publique, vérification et badge, abonnés, partenaires, bannis, notes internes, Stripe pour le propriétaire, suppression).
- **Espace pro** `/pro/nom` : fiche, publications, statistiques, abonnement (le seul endroit où l'on paie : offre, membre fondateur, factures), stands.
- **Administration** `/admin` : page d'accueil avec toutes les files et leurs compteurs (structures à vérifier, pros, signalements, certifications, transferts de plaque, « Autre ») ; registres (utilisateurs, structures, pros avec mode assistance, base véhicules, journal) ; réglages (interrupteurs, modèles, newsletter, listes de prestataires / formats / départements, points et grades). Le modérateur voit uniquement la file des signalements et peut suspendre.

## Parcours clés (à maquetter puis prototyper)
1. De la découverte à l'avis (passionné) : page événement → candidater (3 écrans max) → retenue (demande de notifications ici) → carte d'accès → mode jour J, QR scanné → points et avis.
2. L'entrée d'un véhicule (staff) : invitation → « je suis là » → synchroniser → scan continu → si ça bloque : plaque ou pseudo, express, « entrés sans scan » → fermeture à J+1.
3. Inscription express sur place : le staff saisit l'e-mail → lien reçu → formulaire de 2 minutes sur le site → QR d'inscription dans le navigateur → scan.
4. De la structure au bilan (organisateur) : créer la structure → vérification → créer l'événement (site) → trier → direct du jour J → bilan.
5. Un lien partagé sur Instagram (visiteur) : page événement sans compte → créer un compte → ajouter un véhicule seulement au moment de candidater → retour exactement là où on était → l'appli proposée après, jamais avant.
6. La remise chez un pro : fiche pro → QR de compte depuis l'en-tête du garage → scan par le pro → remise comptée.

## Suite du canevas
3. Maquettes en gris des écrans clés · 4. Exploration de la direction artistique · 5. Système de design · 6. Écrans finaux clair et sombre · 7. Animations et micro-interactions · 8. Prototype cliquable.
