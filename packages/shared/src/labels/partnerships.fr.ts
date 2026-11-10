// Partenariats pro ↔ passionné (lot R7m1, maquettes R7.19 et R7.20) : libellés de l'API, du site et de l'appli, mêmes mots
// partout. Le libellé « Collaboration commerciale » (lot R7m2) est ici, À UN SEUL ENDROIT : formulation et place à faire
// relire par un juriste (loi du 9 juin 2023, décision D38). Aucune somme, aucune « rémunération » : Orasso ne touche à aucun paiement entre un pro et un passionné.

export const partnershipLabels = {
  /** Mention légale (lot R7m2) : posée par l'API sur une story ou une publication qui désigne un pro partenaire. */
  commercialCollaboration: "Collaboration commerciale",
  /** « Collaboration commerciale · Wrap 66 » : le bandeau, la ligne de publication et le fichier qui sort d'Orasso. */
  commercialLine: (pro: string) => `Collaboration commerciale · ${pro}`,
  /** Sous la ligne non décochable, quand un partenaire actif est identifié ou cité. */
  commercialRequired: "Obligatoire pour un contenu fait avec ton partenaire",
  /** « Poser la mention moi-même » (maquette R7.21) : un contenu fait avec une marque ou un pro qui n'est pas ton partenaire. */
  commercialSelf: "Poser « Collaboration commerciale » moi-même",
  commercialSelfHint: "Pour un contenu fait avec une marque, sans l'identifier",
  /** Prévenu : le pro cité (story : il peut aussi la repartager). */
  commercialNotifiedStory: (pro: string) => `${pro} est prévenu et peut repartager ta story.`,
  commercialNotifiedPost: (pro: string) => `${pro} est prévenu.`,
  /** Note de la loi sur l'influence commerciale (à faire relire par un juriste avec le reste). */
  commercialLaw:
    "En France, la loi du 9 juin 2023 sur l'influence commerciale impose d'indiquer clairement « Publicité » ou « Collaboration commerciale » sur un contenu fait dans le cadre d'un partenariat.",
  commercialPick: "Choisis le pro de la collaboration.",
  commercialPickPlaceholder: "Nom du pro",
  commercialPickEmpty: "Aucun pro trouvé.",
  commercialPickError: "La recherche ne répond pas. Réessaie.",
  commercialPicked: (pro: string) => `Avec ${pro}`,
  commercialChange: "Changer",
  commercialOpenPro: (pro: string) => `Voir la fiche de ${pro}`,
  /** Visionneuse, côté pro cité : reprendre la story dans la sienne (bouton principal). */
  commercialReshare: "Repartager dans ma story",
  /** Bouton du profil d'un passionné, vu par un pro vérifié. */
  propose: "Proposer un partenariat",
  proposed: "Proposition envoyée",
  /** Feuille de proposition. */
  sheetTitle: "Proposer un partenariat",
  sheetTo: (pseudo: string) => `à ${pseudo}`,
  messageLabel: "Ton message",
  messageHint: "court",
  messagePlaceholder: "Covering offert, on te suit sur la saison",
  vehicleLabel: "Un véhicule concerné",
  vehicleOptional: "facultatif",
  noVehicle: "Aucun véhicule précis",
  noVehicleHint: (pseudo: string) => `Le partenariat suit ${pseudo}`,
  vehicleHint: (pro: string) => `« Partenaire : ${pro} » apparaîtra sur sa carte`,
  noteRequest: (pseudo: string) => `La demande arrive dans Activité › Demandes de ${pseudo}. Elle accepte ou refuse.`,
  noteEnd: "Chacun peut mettre fin à tout moment, d'un geste.",
  noteMoney: "Orasso ne touche à aucun paiement entre vous.",
  send: "Envoyer la proposition",
  sentTitle: "Proposition envoyée",
  sentBody: (pseudo: string) => `${pseudo} la trouve dans Activité › Demandes. Tu es prévenu dès sa réponse.`,
  close: "Fermer",
  /** Fiche d'un pro. */
  partnersTitle: "Ses partenaires",
  partnersSeeAll: "Voir tout",
  backToFiche: "Retour à la fiche",
  partnersCount: (n: number) => `${n} passionné${n > 1 ? "s" : ""}`,
  partnersEmpty: "Aucun partenaire pour le moment.",
  subscriptionOnly: "Réservé à l'abonnement pro",
  notVerified: "Vérifie ta fiche (SIRET) pour proposer des partenariats.",
  notPublished: "Publie ta fiche pour proposer des partenariats.",
  mineTitle: "Mes partenaires",
  pendingTitle: "Propositions en attente",
  withdraw: "Retirer la proposition",
  /** Profil d'un passionné : la ligne « Partenaires ». */
  unavailablePro: "Pro indisponible",
  retry: "Réessayer",
  partnersLoadError: "Tes partenaires ne se chargent pas.",
  /** Lignes gardées sous l'erreur quand une copie locale existe. */
  partnersStale: (minutes: number) =>
    minutes < 60 ? `Données d'il y a ${Math.max(1, minutes)} min` : `Données d'il y a ${Math.floor(minutes / 60)} h`,
  partnersStaleUnknown: "Données enregistrées sur cet appareil",
  proPartnershipsLoadError: "Tes propositions et tes partenaires ne se chargent pas.",
  partnersLine: (n: number) => `Partenaires · ${n}`,
  partnersLineOpen: (names: string) => `Partenaires : ${names}`,
  /** Demande reçue (Activité › Demandes). */
  requestTitle: (pro: string) => `${pro} te propose un partenariat`,
  requestForVehicle: (vehicle: string) => `Pour ta ${vehicle}`,
  requestForVehicleHint: (pro: string) => `« Partenaire : ${pro} » apparaîtra sur sa carte`,
  requestNote:
    "Accepter ou refuser est ton choix. Tu peux y mettre fin à tout moment, et le pro aussi. Aucun paiement ne passe par Orasso.",
  accept: "Accepter",
  decline: "Refuser",
  /** Mettre fin. */
  end: "Mettre fin",
  endTitle: "Mettre fin au partenariat ?",
  endBody: "Le pro est prévenu. Les contenus déjà publiés gardent leur mention.",
  endBodyForPro: "Le passionné est prévenu. Les contenus déjà publiés gardent leur mention.",
  endKeep: "Garder",
  /** Carte d'un véhicule. */
  vehiclePartner: (pro: string) => `Partenaire : ${pro}`,
  /** Erreurs de l'API. */
  errors: {
    commercial_locked: "La mention « Collaboration commerciale » ne se retire pas d'un contenu publié.",
    commercial_conflict: "Un contenu ne porte qu'une collaboration commerciale : retire l'autre pro.",
    commercial_unknown: "Ce pro n'est pas disponible pour une collaboration commerciale.",
    not_verified: "Seul un pro dont la fiche est vérifiée peut proposer un partenariat.",
    not_published: "Seule une fiche publiée peut proposer un partenariat.",
    subscription_required: "Proposer un partenariat est réservé à l'abonnement pro.",
    self: "Tu ne peux pas te proposer un partenariat à toi-même.",
    exists: "Un partenariat est déjà en cours ou proposé avec cette personne.",
    cooldown: "Une proposition récente à cette personne est restée sans suite : réessaie dans quelques semaines.",
    limit: "Tu as déjà fait trois propositions à cette personne ce mois-ci : réessaie dans quelques semaines.",
    vehicle: "Ce véhicule n'est pas visible sur son profil.",
    gone: "Ce partenariat n'existe plus.",
    notVerifiedAnymore: "Ce pro n'est plus vérifié : le partenariat ne peut pas être accepté.",
  },
  /** Notifications (Journal et push). */
  notifications: {
    proposedTitle: (pro: string) => `${pro} te propose un partenariat`,
    proposedBody: (pro: string) => `${pro} te propose un partenariat sur Orasso. Réponds dans Activité › Demandes.`,
    acceptedTitle: "Partenariat accepté",
    acceptedBody: (pseudo: string) => `${pseudo} a accepté ton partenariat.`,
    declinedTitle: "Partenariat refusé",
    declinedBody: (pseudo: string) => `${pseudo} a décliné ton partenariat.`,
    endedTitle: "Partenariat terminé",
    endedBody: (name: string) => `Ton partenariat avec ${name} est terminé.`,
    /** Au pro cité dans une story ou une publication de son partenaire (`partner_mention`, Journal). */
    mentionedTitle: (pseudo: string) => `${pseudo} te cite`,
    mentionedStoryBody: (pseudo: string) => `${pseudo} t'a cité dans une story, en collaboration commerciale.`,
    mentionedPostBody: (pseudo: string) => `${pseudo} t'a cité dans une publication, en collaboration commerciale.`,
  },
} as const;
