// Partenariats pro ↔ passionné (lot R7m1, maquettes R7.19 et R7.20) : libellés de l'API, du site et de l'appli, mêmes mots
// partout. « Collaboration commerciale » n'est pas ici : il est posé par le lot R7m2, seulement quand le partenaire est
// mentionné. Aucune somme, aucune « rémunération » : Orasso ne touche à aucun paiement entre un pro et un passionné.

export const partnershipLabels = {
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
  },
} as const;
