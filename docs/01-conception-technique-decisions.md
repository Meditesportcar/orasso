# Orasso — conception technique : décisions

Ne figure ici que ce que Damien a validé clairement. Le reste est dans « En discussion ».

## Validé (14-15/10/2026)

### Technique et hébergement
- Le code d'Orasso est versionné dans Git et développé sur le PC. Le serveur ne reçoit que des versions déployées : plus de développement directement sur le serveur.
- Hébergement : au départ, Orasso est déployé sur le VPS commun (déjà prévu pour les nouveaux projets), isolé dans ses propres conteneurs avec sa propre base. Il passera sur un VPS dédié quand la charge l'exigera (fort potentiel, risque de surcharge pendant les événements).
- Applications sur Google Play et l'App Store, en plus d'un site web. Contraintes acceptées : compte développeur Apple (environ 99 $/an) et Google (25 $ une fois), validation des mises à jour par Apple, connexion avec Apple obligatoire dès qu'on propose Google, suppression du compte possible depuis l'appli.

### Stack (fixée le 15/10/2026, à valider par Claude Code au démarrage)
- TypeScript partout, un seul dépôt Git : site, appli, API et code partagé (types, validations des formulaires).
- Une API unique pour le site et l'appli, où vivent toutes les règles métier : Hono sur Node.js en version LTS (24 aujourd'hui).
- Site : React Router 8 en mode framework, avec rendu serveur (référencement, aperçus de liens). Next.js reste une alternative valable.
- Appli : Expo (React Native). Pas de Mac : les applis iPhone sont compilées et envoyées sur l'App Store via le cloud d'Expo (EAS, offre gratuite limitée puis Starter à 19 $/mois).
- Base de données : PostgreSQL, accès via Drizzle, schéma modifié uniquement par migrations versionnées.
- Tâches planifiées : pg-boss (dans PostgreSQL) pour les relances du staff, les points à J+2, le rappel J-7, les délais de liste d'attente.
- Temps réel : WebSocket dans l'API (messagerie, compteurs, tableau de bord du jour J).
- Connexion : Better Auth (licence MIT, gratuit, données dans notre base).
- Photos : stockage objet OVH dès le départ (pas sur le disque du VPS), compression automatique à l'envoi.
- E-mails : Brevo comme service d'envoi, depuis un sous-domaine dédié ; newsletter gérée dans l'admin Orasso ; les boîtes Zimbra restent pour les échanges humains.
- Notifications : Expo Push.
- Cartes : MapLibre + OpenStreetMap.
- Paiements : Stripe Connect.
- Déploiement : selon l'outillage déjà en place sur le VPS ; sauvegarde de la base chaque nuit hors du VPS ; certificats HTTPS gérés par le serveur web, jamais dans le code.
- Suivi des erreurs : Sentry.
- Répartition site / appli : le site permet tout. L'appli est plus fluide (ajout de véhicule, etc.) et ses notifications remplacent autant que possible les e-mails. Le formulaire d'inscription express se remplit aussi sur le site (la personne sur place n'a pas à installer l'appli). La gestion lourde se fait sur le site, et sera aussi optimisée pour le téléphone.

### À qui s'adresse la plateforme
- Objectif : une plateforme utile à tous (passionnés, organisateurs, professionnels).
- Clients payants : les commerces qui cherchent des clients (garages, préparateurs, detailing, covering, vendeurs de pièces…), par abonnement (tarifs à définir). Leur intérêt : être visibles auprès des passionnés de la plateforme.
- Ces professionnels sont gratuits jusqu'au 21 juin 2027, payants à partir de cette date.
- Accès gratuit à la plateforme pour les food trucks, barbiers, tatoueurs, photographes et l'animation.
- Un organisateur qui fait venir ses partenaires sur Orasso y gagne quelque chose (forme à définir), à condition d'être réellement une association déclarée, pas un simple groupe d'amis.
- Organisateurs : gratuits, pour les attirer sur la plateforme.
- Organisateurs visés : associations, clubs, circuits et professionnels. Les collectivités viendront plus tard, mais sont à prévoir dès le développement.
- Séparation dès le départ entre les personnes (comptes) et les structures (association, club, circuit, entreprise, collectivité plus tard), chacune avec ses rôles. Une structure peut avoir plusieurs casquettes (organisatrice et professionnelle).
- Public (visiteurs) présent dès la V1. Positionnement : pas de concurrence avec HelloAsso ou Weezevent, car Orasso porte toute l'organisation de l'événement derrière la billetterie.
- Les prestataires (photographe, food truck, tatoueur, barbier, animation…) peuvent créer un compte et candidater pour participer aux événements publiés par les organisateurs. L'organisateur accepte ou refuse depuis son espace de gestion.

### Utilisateurs : le compte (bloc clos)
- Un seul type de compte personnel pour tout le monde (passionné, visiteur, bénévole, membre de structure, prestataire, pro). Les possibilités dépendent des véhicules et des structures dont on est membre.
- Connexion : e-mail et mot de passe (le pseudo ne sert pas d'identifiant), connexion avec Google, connexion avec Apple.
- Sécurité : réinitialisation du mot de passe par e-mail pour tous ; double authentification (appli d'authentification ou clé d'accès Face ID / empreinte) obligatoire pour les organisateurs et l'administration, facultative pour les autres ; alerte par e-mail à chaque changement de mot de passe ou connexion depuis un nouvel appareil. Pas de question secrète.
- Inscription express sur place : le staff de l'organisation dispose d'une fonction « inscription express », demande seulement l'e-mail de la personne, qui reçoit un lien. Un seul formulaire : pseudo, mot de passe saisi deux fois, nom, prénom, plaque, voiture, photo prise sur place (environ 2 minutes). Le véhicule est directement accepté pour l'événement en cours.
- Secteur : chaque utilisateur indique son secteur par départements, et peut en choisir plusieurs.
- Chaque utilisateur a un QR code de compte (en plus d'un QR code par inscription). Un pro qui le scanne ne voit que ce qu'il a le droit de voir : le pseudo, le grade et la remise liée.
- Pas de suivi automatique d'organisateurs à l'inscription sur la plateforme.
- Inscription à un événement : deux cases. « Suivre l'organisateur » cochée d'office et décochable (logique : on s'inscrit, on reçoit ses notifications). « Newsletter Orasso » libre, non cochée.
- Lien d'invitation propre à chaque organisateur (par exemple en story Instagram) : la création de compte via ce lien fait suivre l'organisateur. La newsletter Orasso reste optionnelle.
- Avantage pour les abonnés d'un organisateur : ouverture des inscriptions en avant-première. Plus tard : choix de sa place.
- Autorisation des notifications du téléphone demandée au bon moment (juste après une candidature), pas au premier lancement.
- Centres d'intérêt : l'utilisateur choisit ses centres d'intérêt ; il est notifié des événements qui y correspondent, dans un rayon autour de lui fixé dans ses paramètres.
- Compte public ou privé (corrigé le 15/10) : public par défaut, modifiable à tout moment. Dans les deux cas, le compte est trouvable et peut recevoir des demandes d'ami ou de contact. Public : les autres utilisateurs voient le profil complet (garage, photos, événements, crews). Privé : les autres utilisateurs voient seulement le pseudo, la photo de profil, le grade, et la marque et le modèle des véhicules ; les amis voient tout. Sur la liste des participants d'un événement, un compte privé montre le pseudo, la marque et le modèle. Quel que soit le réglage : l'organisateur voit tout de ses inscrits et de ses abonnés, les profils sont réservés aux utilisateurs connectés, et la plaque n'est jamais publique. (Remplace l'ancien réglage « profil partagé ou non » et le bouton « apparaître dans la découverte », supprimés.)
- Profils et garages visibles uniquement par les utilisateurs connectés (les comptes utilisent des pseudos) ; pas de réglage public ou privé véhicule par véhicule.
- Âge : compte à partir de 15 ans, candidature avec un véhicule à partir de 17 ans. Aucune case ni contrôle dans l'application : les règles figurent uniquement dans les conditions d'utilisation.
- Plaque d'immatriculation : obligatoire, jamais publique, visible uniquement par l'organisateur. Format libre pour les plaques étrangères ou anciennes, et option « non immatriculé » que l'organisateur voit et peut refuser.
- Photos de véhicules : conseil au moment de l'envoi pour ne pas montrer la plaque ; floutage automatique des plaques plus tard.

### Administration et rôles (bloc clos)
- Rôles de la plateforme : super administrateur (Damien) ; modérateur (aide visuelle uniquement ; en cas de signalement, il peut suspendre un compte, puis le super administrateur consulte le signalement et prend la décision) ; organisateur ; utilisateur, avec ses rôles (pro, staff, food truck, photographe, etc.).
- Super administrateurs : voient tous les utilisateurs, tous les organisateurs, tous les professionnels, et l'interface de chaque organisateur (sélecteur de structure visible d'eux seuls). Un journal enregistre leurs accès. Dans l'espace d'un organisateur, le mode assistance est un simple survol ; le super administrateur intervient si l'organisateur le lui demande.
- Rôles internes d'une structure : un propriétaire (le président ; droits complets, dont la connexion Stripe et la suppression de la structure), des co-organisateurs (gèrent les événements et le staff), le staff.
- Organisateur : voit tout, y compris les coordonnées, pour des raisons de sécurité : les inscrits à ses événements (pendant l'événement et jusqu'à J+7, au cas où) et les utilisateurs qui suivent sa structure. Le suivi lui permet de donner des consignes, d'entrer en contact directement (exemple : remercier pour le soutien, rappeler à l'ordre un départ trop rapide) et de rechercher des véhicules pour des expositions sur invitation. Un utilisateur qui ne suit pas une structure n'y est pas visible.
- Bannissement : un organisateur peut bannir quelqu'un de ses propres événements. Seule l'équipe Orasso peut bannir de la plateforme.
- Staff : rattaché à une structure précise, jamais à toute la plateforme ; une personne peut être staff dans plusieurs structures. La demande peut venir de l'utilisateur ou d'une invitation de la structure. Rôles : scan accueil, boutique, placement, contrôle, filtration (aide à la validation des véhicules avant l'événement). Rôles fixés au niveau de la structure, ajustables pour chaque événement. Chaque rôle ne voit que les informations utiles. Le staff ne voit ni le téléphone ni l'e-mail ; un rôle « super staff » peut les voir. Tout le staff peut consulter les participants validés, quel que soit son rôle. L'organisateur peut donner à un staff la capacité de décider pour l'aider dans la filtration.
- Rôle boutique : développé dès la V1, activable ou non par événement (décision du 15/10). Son contenu précis reste à confirmer (proposition : contrôle des billets du public et compteur d'entrées visiteurs).
- Professionnel : aucun accès aux comptes utilisateurs dans son espace. Il peut consulter les pseudos et les profils des utilisateurs, selon le réglage public ou privé de chacun. Il dispose d'un lecteur de QR code pour vérifier le grade d'un client.
- Signalement : système de signalement avec journal et preuves jointes (captures d'écran…). Des signalements répétés dans un laps de temps court suspendent le compte automatiquement et envoient une alerte prioritaire au modérateur et au super administrateur, qui traitent rapidement.

### Signalement et modération
- Bouton « Signaler » partout (profil, véhicule, message, photo, événement, avis, crew), avec un motif choisi dans une liste (insulte, arnaque, contenu choquant, faux profil, harcèlement…) et une capture en pièce jointe.
- Protection contre les signalements en meute : un seul signalement compté par personne ; les comptes créés depuis peu ne déclenchent pas la suspension automatique ; un faux signalement volontaire peut être sanctionné.
- Échelle des sanctions : avertissement, suspension de 7 jours, suspension de 30 jours, bannissement définitif. Bannissement direct pour les cas graves (menaces, contenu sexuel, arnaque).
- Contestation : la personne sanctionnée peut contester une fois ; le super administrateur revoit le dossier.
- Information : la personne qui signale est prévenue que son signalement a été traité ; la personne sanctionnée reçoit le motif.
- Messages privés : Orasso ne les voit pas. Quand un message est signalé, l'équipe Orasso voit l'historique lié au signalement.
- Pas de filtre automatique des photos explicites.
- Conservation des signalements et des preuves : un an après la décision, puis suppression, sauf bannissement ou procédure en cours.

### Social
- Le social est complet : crews, suivi d'amis, messagerie, notifications et fil d'actualité qui relie tout (acceptation, nouvel événement, invitation reçue de la part de…).
- Messagerie : on ne peut pas écrire librement à quelqu'un qui n'est pas son ami ; le message part en demande de contact, rangée à part (filtrée), et une seule demande est possible. Contacter les organisateurs est toujours possible, et inversement.
- Crews : privés. Un crew a un logo, un nom, une description, une localisation par département et un créateur. Seul le créateur accepte les demandes ; il peut aussi inviter des gens. Fil de discussion de groupe avec envoi d'images et échanges. Les crews sont trouvables par leur nom et leur département, avec une demande pour rejoindre.
- Recherche de personnes (corrigé le 15/10, remplace la « découverte de profils ») : recherche par pseudo ; recherche par véhicule (marque, modèle ou génération) ; sur la fiche d'un véhicule, un bouton « autres propriétaires près de chez moi » ; filtres combinables : département, centres d'intérêt, véhicule, grade. QR ami : le scanner envoie une demande d'ami. Tout compte est trouvable (public ou privé). Localisation jamais plus précise que le département. Les 15-17 ans pouvant y apparaître (l'âge n'est pas demandé), la protection repose sur la demande de contact unique, le blocage et le signalement.

### Points et grades
- Points gagnés uniquement par des actions vérifiables : participation à un événement confirmée par le scan à l'entrée, bénévolat ou staff sur un événement, ami invité dont le compte est confirmé.
- Malus : accepté à un événement mais absent sans s'être désisté.
- Une invitation compte quand le lien d'invitation (jeton) est suivi d'une inscription et que l'e-mail du nouveau compte est confirmé.
- Grades par saison : Rodage, Route, Sport, Circuit, Légende. En fin de saison, on descend d'un grade et on continue (pas de remise à zéro).
- Un seul compteur de points.
- QR de compte dynamique : le téléphone génère le code à partir de l'heure (comme une appli de double authentification), donc il fonctionne sans réseau ; une capture d'écran prêtée à un ami ne donne pas sa remise.
- Pas de cosmétiques.
- Avantages : remise chez les pros partenaires selon le grade (financée par les pros) ; priorité sur liste d'attente et avant-première supplémentaire pour les hauts grades, si l'organisateur l'active.
- La certification d'un véhicule devient accessible à partir d'un seuil de points ou d'un grade, sans dépenser de points (elle ne rapporte pas de points), puis l'équipe Orasso la valide manuellement.

### Découvrir et participer (bloc clos)
- Découverte des événements par affinités (catégories : youngtimer, etc.), par organisateurs suivis et par distance.
- Découverte des pros sur le même principe que celle des événements.
- Événements et pros indiquent une adresse précise, affichée et recherchable sur une carte.
- L'adresse de l'événement est publique.
- Pas de questions personnalisées par l'organisateur dans le formulaire de candidature.
- Pas de demande de confirmation de venue avant l'événement.
- Liste d'attente automatique : une place libérée est proposée automatiquement au suivant, qui a 24 h pour l'accepter ; la veille et le jour même, le délai est raccourci (2 à 3 h) pour que la place ne reste pas vide.
- Désistement sans malus possible jusqu'au verrouillage des inscriptions (2 h avant le début par défaut).
- Avis après l'événement : note de 1 à 3 étoiles, commentaire obligatoire, affiché avec le pseudo. Garde-fous : seuls les participants dont l'entrée a été scannée peuvent noter ; avis possible pendant une semaine après l'événement ; droit de réponse public de l'organisateur ; moyenne affichée seulement à partir d'un nombre minimum d'avis ; on note l'événement, jamais des personnes ; chaque avis peut être signalé.
- Notifications : candidature (retenue, liste d'attente, refusée, place libérée) ; événements (nouvel événement d'un organisateur suivi, ouverture des inscriptions en avant-première, événement correspondant à ses centres d'intérêt dans son rayon, rappel la veille avec météo, modification ou annulation, consignes de l'organisateur) ; social (demande d'ami, demande de contact, message, invitation à un crew, invitation à un événement) ; grade (passage de grade, fin de saison). Chaque type peut être coupé ; pas de notification la nuit, sauf le jour J.

### Organisateurs : la structure (bloc 1 clos)
- N'importe quel utilisateur peut créer une structure : type (association, club, circuit, entreprise ; collectivité plus tard), nom, logo, description, adresse, départements, réseaux sociaux, site. Il en devient le propriétaire.
- Vérification minimaliste en deux étapes : numéro SIRET ou RNA contrôlé automatiquement dans les registres publics, puis justificatif (statuts, récépissé de déclaration, Kbis) validé à la main par l'équipe Orasso. Badge « structure vérifiée ».
- Clubs sérieux non déclarés (sans SIRET ni RNA) : validables à la main, avec un responsable physique identifié (pièce d'identité, par exemple). La pièce d'identité est supprimée dès la validation.
- Publication d'événements réservée aux structures vérifiées : la vérification permet à Orasso de ne valider que des clubs sérieux.
- Le badge est valable un an. À l'approche de l'échéance, l'équipe Orasso prend contact ; selon les notes et les retours, le badge est renouvelé ou non. Sans nouvelles au bout d'un an, le compte de la structure est suspendu. La structure est prévenue un mois avant, une semaine avant et la veille ; la suspension ne supprime pas les données et peut être levée.
- Page publique de la structure : logo, description, prochains événements, événements passés, note moyenne, partenaires (pros liés), bouton Suivre, lien d'invitation.
- Pas de fonction de transfert de propriété : chaque année, au renouvellement du badge, on refait le point (dont les changements de bureau). En cas de départ du président en cours d'année (départ, conflit), l'équipe Orasso peut intervenir à tout moment sur justificatif.

### Organisateurs : créer un événement (bloc 2 clos)
- Formats disponibles en V1 : rassemblement, exposition, et les formats statiques qui reposent sur la même mécanique : cars & coffee, salon, portes ouvertes, nocturne. Les formats roulants (balade, road trip, rallye…) et piste (track day, drift, grip…) viendront après.
- Véhicules admis : cases à cocher voiture, moto, camion.
- Nombre de places : au choix, sans limite ou avec une limite (pas forcément par type de véhicule). Même sans limite, l'organisateur voit le nombre d'inscrits en temps réel.
- Prestataires : candidature libre (les food trucks de la plateforme peuvent postuler) ; pas de nombre de places annoncé aux utilisateurs ; l'organisateur coche les types de prestataires acceptés parmi les plus fréquents (food truck, barbier, tatoueur…), avec une option « + » pour en ajouter un qui n'existe pas dans la liste.
- Public : entrée libre, gratuite sur réservation, payante (billetterie Orasso ou lien externe), ou fermé au public.
- Modes d'admission : sans sélection (tout le monde est accepté) ; sur filtration, selon des critères ; exclusivement sur invitation (événement privé). Statut « annulé ».
- Événement privé sur invitation : il n'apparaît pas dans la découverte ; seuls les invités le voient.
- Critères de filtration : catégorie, marque, origine, et d'autres.
- Avant-première des abonnés : 24 h par défaut.
- Duplication d'un événement passé en un clic ; événements récurrents (exemple : chaque premier dimanche du mois) créés une seule fois.
- Rappel par e-mail une semaine avant l'événement, toujours.
- Après publication : si la date ou l'adresse change, tous les inscrits sont prévenus ; en cas d'annulation, tout le monde est notifié.
- Règlement : un modèle général proposé par Orasso, et une option de texte libre.
- Événements sur plusieurs jours : prévoir toutes les possibilités d'accès (tout l'événement, par jour…).

### Organisateurs : trier les candidatures (bloc 3 clos)
- File de tri : une candidature à la fois, grandes photos et fiche complète ; trois décisions (retenir, liste d'attente, refuser) au clavier sur ordinateur et par glissement sur téléphone.
- Vue liste pour les décisions en masse : filtres (catégorie, marque, origine, année, grade, crew, statut), tri, sélection multiple.
- Informations affichées pendant le tri : véhicule (photos, marque, modèle, génération, année, puissance, poids, catégories, préparation, certification) ; candidat (pseudo, grade, nombre d'événements, absences) ; historique avec la structure ; crew et autres candidatures du crew ; avis du staff de filtration ; alertes (plaque en double, banni de la structure, non immatriculé).
- Compteurs en haut de l'écran : places restantes, retenus, à trier, liste d'attente, refusés.
- Motifs de refus prédéfinis, à cocher (hors thème, photos insuffisantes, complet…). Ils sont envoyés au candidat par défaut, et l'organisateur peut choisir de ne pas les envoyer.
- Annonce des décisions : immédiate, au fil des décisions. Damien assume que ceux qui candidatent tard sont désavantagés : « les plus belles voitures n'ont qu'à se dépêcher et s'inscrire comme les autres ».
- Liste d'attente : rangée par ordre d'arrivée, mais l'organisateur la trie aussi, sur le même principe que les candidatures.
- Prestataires : même écran de tri que les véhicules, dans un onglet à part.
- Inscription en crew : le responsable du crew inscrit le crew en indiquant qui vient et avec quel véhicule. Un crew retenu crée une inscription (et un QR) pour chaque membre, pour que chacun puisse arriver à son heure. Chaque membre inscrit reçoit une notification et confirme sa venue (pas d'inscription ni de malus sans son accord) ; un membre peut se retirer seul sans annuler tout le crew.
- Nombre de véhicules par personne : limite réglable par l'organisateur pour chaque événement.

### Organisateurs : communiquer (bloc 4 clos)
- Consignes et annonces de l'organisateur : le public les lira peu, mais elles sont utiles quand la météo est incertaine (l'événement est-il maintenu ?), pour la prévention (bouchons, incendie…) et pour les horaires (exemples : musique coupée à 22 h, animation à 21 h).
- Messages groupés à un segment (acceptés, liste d'attente, prestataires, staff, abonnés de la structure), avec une limite d'envoi aux abonnés pour éviter le spam.
- Staff : pour chaque événement, chaque membre du staff indique « je suis là » ou « je ne suis pas là ». Tant qu'il n'a pas répondu, il est relancé chaque jour par notification ou par e-mail.
- Deux discussions de staff : une discussion permanente pour le staff recruté par la structure, et une discussion par événement réservée au staff présent. Le groupe de l'événement est fermé à J+1 (plus de nouveaux messages) et reste lisible par l'organisateur jusqu'à J+7, au cas où un incident serait à reconstituer.
- Relances du staff : elles s'arrêtent le jour de l'événement ; l'organisateur voit qui n'a jamais répondu.
- Fil d'actualité public sur la page de l'événement : oui ; la façon de le développer et de l'utiliser reste à voir.
- Statut de l'événement (Maintenu / Incertain / Annulé), affiché en bandeau sur la page et envoyé à tous les inscrits. Orasso suggère à l'organisateur de passer en « Incertain » quand la météo annoncée est mauvaise.
- Modèles de messages réutilisables d'un événement à l'autre.
- Confirmation de lecture dans la messagerie, avec qui a lu.

### Organisateurs : le jour J (bloc 5 clos)
- Entrée : écran de scan ouvert en continu (sans toucher l'écran), plusieurs staffs en parallèle, QR lisible à travers le pare-brise ; si un QR ne passe pas, recherche par plaque ou par pseudo ; inscription express disponible. Réaliste si l'entrée est bien organisée.
- Pointage manuel : un staff peut cocher les présents dans la liste, pendant ou après l'événement. Plus tard, le système de placement servira aussi au pointage. Pointage rapide par plaque après coup pour les entrées massives (validé le 15/10).
- Pas d'auto-pointage par le participant.
- Tableau de bord en direct pour l'organisateur : arrivés et attendus (par catégorie), prestataires arrivés, staff présent.
- Placement par zones en V1 (exemples : JDM, Allemandes, Exposants) : la zone s'affiche au scan, le staff placement voit qui va où.
- Main courante : journal des incidents (heure, lieu, description, photo) tenu par le staff, accessible à l'organisateur ; utile pour l'assurance et face aux autorités.
- Bouton alerte staff : une alerte prioritaire, avec la position, envoyée à tout le staff présent et à l'organisateur.
- Lecture de plaque par caméra : à tester, comme moyen d'entrée et de pointage.

### Organisateurs : après l'événement (bloc 6 clos)
- Bilan automatique pour l'organisateur : inscrits, présents, absents et taux de présence, catégories et marques venues, départements d'origine, nouveaux abonnés, note moyenne une fois les avis arrivés.
- Points et malus attribués à J+2, le temps que le staff rattrape le pointage. En attendant, le participant voit « pointage en attente » sur son compte. Il peut contester un malus pendant quelques jours ; l'organisateur tranche.
- Message de remerciement (modèle) envoyé aux présents, avec le lien pour laisser un avis.
- Pas de tampon d'événement sur les véhicules.
- Les informations des participants restent conservées par l'organisateur au-delà de J+7, en cas d'incident (exemple : enquête ou demande d'informations des autorités deux semaines après un incident sur la route). Un export est prévu.
- Note interne : l'organisateur peut écrire une note privée sur un participant ou un prestataire, visible seulement par sa structure (exemples : « super food truck, à reprendre », « départ dangereux, 2e avertissement »). Les notes restent factuelles, car la personne peut demander à les voir.
- Édition suivante : duplication pour l'année d'après, et invitation directe des véhicules retenus. Objectif de Damien : fidéliser les abonnés, faire des événements dédiés à une marque avec invitations, améliorer l'organisation et la qualité des événements.

### Professionnels (chapitre 4)
- Vérification : SIRET contrôlé automatiquement, badge « pro vérifié ».
- Fiche pro : logo, activités choisies dans une liste (garage, préparation, detailing, covering, pièces…), adresse ou zone d'intervention (pros sans local, à domicile), horaires, photos de réalisations, contact, réseaux, remises par grade, organisateurs dont il est partenaire.
- Pas d'avis sur les pros.
- Après le 21 juin 2027 : fiche de base gratuite (nom, activité, ville) pour remplir l'annuaire. L'abonnement débloque la fiche complète, la mise en avant dans la découverte, les remises par grade avec le lecteur de QR, les publications, les statistiques et le bouton « garage favori ».
- Publications des pros (offres, actualités) : visibles par leurs abonnés, avec une limite par mois.
- Stand sur un événement et partenariat avec un organisateur sont deux choses distinctes, sans lien entre elles.
- Un pro peut candidater pour tenir un stand sur un événement, comme un prestataire.
- Statistiques du pro : vues de la fiche, clics sur « appeler » et « itinéraire », nombre d'abonnés, remises utilisées (scans du QR).
- Emplacements sponsorisés vendus aux pros de la plateforme (même apparence que le reste, ciblés par département et centres d'intérêt), notamment sur l'accueil de l'appli : validé le 15/10.

### Candidatures
- Chaque demande est séparée et reçoit sa propre décision. Une même personne qui candidate avec sa voiture et avec son food truck peut être acceptée pour l'un et refusée pour l'autre, dans un sens comme dans l'autre.
- Une personne peut inscrire plusieurs véhicules au même événement.
- Un organisateur peut inviter nominativement une personne ou un véhicule à un événement.
- Pas de notification particulière à l'organisateur quand un participant accepté modifie sa fiche.
- Ce que regarde l'organisateur pour sélectionner : la cohérence entre les informations et la voiture.
- Le prestataire (food truck, photographe, barbier…) est une casquette séparée du compte, pas un « véhicule » du garage (décision du 15/10).

### Photographes (V1)
- Profil de photographe (liens Instagram et portfolio, contact), candidature à un événement, présence affichée sur la fiche de l'événement, accréditation « média officiel ». Le reste (galerie, filigrane, identification des propriétaires) viendra plus tard.
- Photographes et animateurs amateurs peuvent candidater sans structure pro.

### Accueil sur place et QR codes
- Deux sortes de QR : un QR de compte par utilisateur, et un QR par inscription.
- Les QR codes sont signés par Orasso (impossibles à falsifier), vérifiés par l'appli du staff sans réseau.
- Les inscriptions sont verrouillées 2 h avant le début de l'événement par défaut, délai réglable par l'organisateur. L'appli du staff synchronise alors la liste des accès et la garde en cache : le scan fonctionne même sans réseau. Un rappel invite le staff à synchroniser.
- Pas de changement de QR côté participant après le scan.
- Le cas de plusieurs staffs sans aucun réseau qui scannent le même QR est accepté comme rare ; parade terrain : une connexion à l'entrée (Starlink par exemple).

### Billetterie
- Tout se fait en ligne. Aucune vente notée sur place dans Orasso, pas de réservation avec paiement en espèces sur place. La vente sur place reste entièrement gérée par les organisateurs eux-mêmes, hors Orasso.
- Paiements via Stripe Connect : l'organisateur connecte son compte via le parcours Stripe (Orasso ne reçoit jamais ses clés ni ses coordonnées bancaires), reversement direct sur son compte, pourcentage de commission pour la plateforme.
- Le développement et les tests de paiement se font avec le compte Stripe d'Orasso en mode test (sans société ni SIRET), sans utiliser les clés d'une association.
- La billetterie payante est développée et visible en mode présentation, sans encaissement avant le 21 juin 2027.
- Billets gratuits (réservation du public) disponibles avant le 21 juin 2027 pour tester tout le circuit en conditions réelles. Deux niveaux d'activation : un interrupteur général pour l'administration, puis un choix de l'organisateur pour chacun de ses événements.
- Si l'entrée est payante sans billetterie Orasso : l'organisateur indique un lien vers sa billetterie en ligne s'il en a une, sinon la mention d'un paiement sur place.
- Billets vendus dans l'appli : pas de commission Apple (événement réel). Abonnements pros vendus sur le site, sans bouton ni lien de paiement dans l'appli.
- Création de la société qui exploitera Orasso en avril 2027.

### Véhicules et garage
- Types gérés dès le départ : voitures, motos, camions. Liste de types extensible.
- Marques et modèles choisis dans une liste préparée à l'avance. Si la marque ou le modèle manque : choix « Autre », sans aucune saisie libre. Les utilisateurs ne peuvent pas ajouter de marque ou de modèle. La liste est enrichie par l'équipe Orasso.
- Niveau de détail : marque, modèle et génération (exemple : BMW, Série 3, E36).
- Informations du véhicule : motorisation, couleur, année, puissance, poids, pays de la marque (en plus de la plaque, des catégories, de la description et des photos). Pas de notion d'importation.
- Motorisation générée de façon cohérente avec le véhicule, à partir d'une base de véhicules construite par Orasso. Pas de recherche par plaque (l'accès aux données d'immatriculation de l'État est très limité, tout comme le droit de les utiliser).
- Catégories (exemples : youngtimer, JDM, ancienne, sportive…), liste à définir. L'utilisateur choisit celles de son véhicule, mais les choix incohérents sont limités (pas de « supercar » sur une Peugeot, pas de « youngtimer » sur une voiture de 2015).
- Photos : une minimum, huit maximum ; compression automatique à l'arrivée chez Orasso.
- Véhicule vendu : archivé avec son historique. Plaque unique parmi les véhicules actifs ; si une plaque déjà enregistrée est ajoutée, transfert confirmé par l'ancien propriétaire, ou arbitrage par l'équipe Orasso.
- Anciens véhicules dans le garage : vendus, gardés par souvenir ou par passion, accidentés. Pour ces véhicules, la plaque est facultative.
- Génération de fiches véhicule à partager sur Instagram (story ou publication).
- Certification d'un véhicule : accessible à partir d'un seuil de points ou d'un grade (sans dépenser de points), puis validée manuellement par l'équipe Orasso (catégories respectées, photos et description conformes). Pas de paiement en argent. Elle se perd si la fiche est modifiée, et si le véhicule ne participe à aucun événement pendant 6 mois.

### Formats d'événements
- Formats à terme : rassemblement, exposition, cars & coffee, salon, portes ouvertes, nocturne (V1) ; puis formats roulants (balade, road trip, rallye touristique ou de régularité, sortie club, convoi) et formats piste (track day, drift, grip, slalom, course de côte, baptêmes, stage de pilotage) ; autres pistes : concours d'élégance, bourse d'échange, rassemblement caritatif, sim racing, projection, concours photo.
- Définition de Damien : un rassemblement est un moment court, une soirée ; une exposition dure une journée complète ou un week-end.
- Libellés dans l'interface : « Rassemblement » et « Exposition », en toutes lettres. Le mot « rasso » est réservé au ton de la communication (réseaux sociaux). Le mot « meet » est écarté.

### Contraintes terrain
- Selon Damien, le réseau mobile fonctionne dans la grande majorité des cas sur ses événements.
- À l'entrée, il faut parfois faire entrer environ 150 véhicules en 30 minutes ; dans ces conditions, le scan a été abandonné pour une grande partie des entrées. Le contrôle d'accès doit être extrêmement rapide, sinon il n'est pas fait.

### Structure de l'appli et du site (validée le 15/10)
- Inventaire des écrans et plan de navigation validés sur le canevas « Orasso — Structure de l'appli » (étapes 1 et 2). Le détail est dans le document « Orasso — structure de l'appli et du site : décisions ».
- En résumé : une seule appli mobile ; cinq onglets Accueil (tableau de bord) · Explorer · Accès (central) · Garage (qui porte le profil et le QR de compte) · Boîte (messages, demandes) ; cloche → Journal (fil d'actualité et notifications) ; Moi derrière l'avatar ; changement de casquette (structures, pro, prestataire) qui change la barre d'onglets ; trois modes plein écran (premier lancement, jour J participant, staff) ; le staff est un mode, pas une casquette ; scan dans l'appli seulement ; le site reprend les mêmes sections pour le compte connecté et ajoute les espaces organisateur, pro et admin en barre latérale.

## Objectifs indiqués par Damien
- Communication auprès des organisateurs cet hiver.
- Mise à disposition des organisateurs d'Occitanie et de PACA.
- Création de la société en avril 2027, lancement des paiements (billetterie et abonnements pros) au 21 juin 2027.

## Idées de Damien (non validées comme fonctionnalités)
- Annuaire de professionnels pour les passionnés (exemple : chercher un poseur de films teintés).
- Remise spéciale chez un pro partenaire d'un organisateur que le passionné suit.
- Mise en avant payante d'événements sur la plateforme.
- Limiter certaines fonctions pour les organisateurs et les faire payer : envisagé, mais Damien n'en est « pas vraiment fan ».
- Choix de sa place par le participant (avantage abonnés, plus tard).
- Plan de l'événement avec placement des véhicules (au-delà des zones de la V1), qui servira aussi au pointage.
- Photographes, plus tard : recherche d'un photographe par les utilisateurs en dehors des événements ; publication des photos sur l'événement avec un filigrane Orasso ; les exposants voient les photos et contactent le photographe ; le photographe retrouve les propriétaires via leur compte et leur Instagram s'ils l'ont partagé.
- Accueil de l'appli : widgets au choix (météo du prochain événement, statuts en attente, suggestions autour de soi avec curseur de rayon, garage favori, station de lavage et station-service les plus proches) validés dans la structure le 15/10 ; mini-jeu avec la voiture du logo (mini drift, parcours d'obstacles), plus tard.
- Crews qui organisent leurs balades privées.
- Publicité sur la page d'accueil pour rentabiliser la plateforme : à terme, le coût viendra surtout des données (stockage, trafic), pas de l'appli.
- Événements privés créés par de simples membres : jamais publiés publiquement, absents de leur historique d'événements, visibles seulement par l'équipe Orasso. Damien doute de l'idée : les crews peuvent déjà remplir ce rôle.

## En discussion (rien de validé)
- Organisateurs pros et circuits payants (événements commerciaux) : piste nuancée par Damien, car certains événements comme les track days sont un plus pour les utilisateurs.
- Frais de service à la charge de l'acheteur du billet, en complément ou à la place de la commission.
- Billetterie générique : vendre des « produits » avec leurs jauges (entrées, baptêmes, roulages, boutique…), acomptes et codes promo, plutôt que de simples billets.
- Consentement (suivi coché d'office, e-mails des organisateurs) : à faire relire par un juriste avant l'ouverture.
- Accès de l'organisateur aux coordonnées de ses abonnés : informer clairement l'utilisateur au moment où il suit une structure (« cet organisateur pourra voir ton nom, ta plaque et tes coordonnées »), le préciser dans la politique de confidentialité, tracer les consultations ; à faire relire par un juriste.
- Avis : en France, publier des avis impose d'indiquer s'ils sont vérifiés et comment ils sont traités ; à faire valider par un juriste. Option d'un retour privé à l'organisateur en plus de l'avis public.
- Calendrier : avec le social complet, découper la V1 en étapes (cet hiver pour les organisateurs, le printemps pour les premiers événements, le 21 juin pour les paiements). Feuille de route à établir à la fin des chapitres fonctionnels.

### Organisateurs : la structure (en discussion)
- Délai de validation de la première vérification : il conditionne la première publication ; viser un traitement rapide.

### Professionnels (en discussion)
- Publicité : privilégier des emplacements sponsorisés vendus directement aux pros de la plateforme plutôt qu'une régie publicitaire externe (Google AdMob…), qui impose un bandeau de consentement, la demande de suivi d'Apple et dégrade l'expérience. Le principe des emplacements sponsorisés est validé ; leur tarif et leur fréquence restent à fixer.
- Tarifs de l'abonnement.

### Organisateurs : créer un événement (en discussion)
- Le format préremplit les options ; tout reste modifiable.
- Informations : titre, affiche, description, dates et horaires, adresse sur la carte, programme facultatif, règlement, consignes envoyées aux acceptés.
- Rappel par e-mail une semaine avant : il s'ajoute à la notification de la veille (exception à la règle « les notifications remplacent les e-mails »).
- Événements privés : proposition de Claude, réservés aux structures vérifiées (sur invitation) ; les sorties entre membres passent par les crews, pas par des événements créés par de simples membres.

### Organisateurs : communiquer (en discussion)
- Confirmation de lecture : la garder pour les messages de l'organisateur et du staff ; dans la messagerie entre amis, laisser chacun la couper.

### Organisateurs : après l'événement (en discussion)
- Conservation des informations des participants : durée à fixer (proposition : un an) ; au-delà de J+7, accès et export tracés dans le journal avec un motif saisi ; fichier exporté marqué au nom de la structure. Les autorités peuvent aussi s'adresser directement à Orasso. À faire relire par un juriste.

### Structure de l'appli (suite du canevas)
- Étapes restantes : 3 maquettes en gris, 4 exploration de la direction artistique, 5 système de design, 6 écrans finaux clair et sombre, 7 animations et micro-interactions, 8 prototype cliquable.
- Rôle staff boutique : contenu à confirmer (proposition : contrôle des billets du public, compteur d'entrées visiteurs).

### Page événement et candidature (en discussion)
- Page événement publique, bien référencée et partageable : affiche, date, adresse, organisateur avec badge « structure vérifiée », programme, catégories recherchées, places restantes, prestataires présents, amis qui y vont, météo à l'approche, boutons « Candidater avec un véhicule », « Réserver une place », « Suivre ».
- Candidature : choix d'un ou plusieurs véhicules du garage (ceux qui correspondent aux critères mis en avant), acceptation du règlement de l'événement, les deux cases (suivi, newsletter), envoi ; statuts en attente, retenue, liste d'attente, refusée, avec notification à chaque changement.
- Sans confirmation de venue, la lutte contre les absences repose sur le malus et le désistement facile.

### Accueil personnalisable (en discussion)
- Sources de données possibles : météo (Open-Meteo ou Météo-France) ; stations-service avec leurs prix (données publiques des prix des carburants) ; stations de lavage (OpenStreetMap) ; « ton garage favori » = un pro abonné, ce qui donne de la valeur à l'abonnement. À vérifier au moment de développer.
- Balades privées de crews : invitation seulement, jamais listées publiquement ; question de responsabilité d'Orasso face aux rassemblements non déclarés.

### Garage (en discussion)
- Base de véhicules construite par Orasso : commencer par les modèles les plus courants sur les événements, générer les motorisations par génération puis les vérifier, enrichir au fil des « Autre ».
- Puissance et poids en nombres, avec des contrôles de vraisemblance.
- Catégories : règles d'éligibilité par catégorie (âge du véhicule, marques ou modèles) et suggestions automatiques.
- Statuts du véhicule : actif, vendu, souvenir, accidenté ; seuls les véhicules actifs peuvent candidater.
- Fiches partagées sur Instagram : image (story 9:16, publication 1:1) avec photo, nom du véhicule et logo Orasso ; le lien mène à la connexion, puisque les garages sont réservés aux utilisateurs connectés.
- Quelles modifications font perdre la certification.

### Points et grades (en discussion)
- Nombre de points par action et seuils de grades à définir.
- Règles du malus transparentes et écrites dans les conditions d'utilisation.

### Recruter les pros (en discussion)
- Rencontre en personne sur les événements, partenaires amenés par les organisateurs, offre « membre fondateur » (remise durable pour ceux qui s'engagent avant le 21 juin 2027), statistiques de vues et de clics visibles pendant la période gratuite, publicité ciblée sur les réseaux, e-mails aux professionnels en lien avec leur activité (avec désinscription). Les e-mails ne sont pas soumis aux règles d'Apple.

### Administration (en discussion)
- Interventions du super administrateur à la demande d'un organisateur : tracées dans le journal, avec la demande de l'organisateur.

### Signalement et modération (en discussion)
- Historique lié à un signalement de message privé : limité à la conversation signalée (le message et quelques messages autour), envoyé par l'appli de la personne qui signale ; accès tracé dans le journal ; écrit dans les conditions d'utilisation et la politique de confidentialité. À faire relire par un juriste.
- Photos explicites : Instagram floute par défaut les photos de nu reçues en message par les moins de 18 ans (depuis 2024). Un floutage (et non un blocage) pourrait être ajouté plus tard.
- Blocage d'un utilisateur par un autre (il ne peut plus écrire ni voir le profil).
- Le règlement européen sur les services numériques impose aux plateformes un mécanisme de signalement et la motivation des décisions de modération : à vérifier avec un juriste.

### Social (en discussion)
- Les crews peuvent être placés ensemble sur le terrain.
- Suivi d'amis avec acceptation des deux côtés ; intérêt principal, voir à quels événements vont ses amis.

### Photographes (en discussion, pour plus tard)
- Stockage des photos : coût et volume (des centaines de photos par photographe et par événement) ; ne garder que des versions web compressées, les originaux restant chez le photographe.
- Droit à l'image des personnes visibles sur les photos et plaques visibles ; modération des photos publiées.

### Candidatures (en discussion)
- Même fonctionnement technique pour les candidatures véhicule et prestataire (statuts, liste d'attente, écran de l'organisateur), chaque demande restant indépendante.
- Droit de place payé par les prestataires à l'organisateur, via Orasso ou non ? À traiter avec les organisateurs et les professionnels.
- Documents demandés par l'organisateur (assurance, Kbis…) : à traiter avec les organisateurs.

### Accueil sur place (en discussion)
- Réduction des doubles scans : chaque scan envoyé dès qu'un appareil retrouve du réseau, entrées attribuées à des appareils précis, rapport des doublons à la synchronisation.
- Contrôle de la plaque affichée par rapport au véhicule présent.
- Vitesse d'entrée (150 véhicules en 30 minutes) : scan en continu sans toucher l'écran, plusieurs scanners en parallèle, QR lisible à travers le pare-brise, créneaux d'arrivée attribués, pointage rattrapé après coup.

## Ordre de travail fixé par Damien
1. À qui s'adresse la plateforme (clos)
2. Les utilisateurs (clos le 15/10 ; correction compte public/privé et recherche de personnes le 15/10)
3. Les organisateurs (clos le 15/10 : blocs 1 à 6)
4. Les professionnels (clos le 15/10, hors tarifs et stand)
5. L'administration (clos le 15/10, modération comprise)
6. Stack fixée le 15/10 (validation par Claude Code au démarrage).
7. Structure de l'appli : inventaire et navigation validés le 15/10 ; maquettes, direction artistique, design et prototype en cours sur le canevas.
8. Ensuite : feuille de route.
