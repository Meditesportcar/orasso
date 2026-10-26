import { CREW_OUTING_MAX_AHEAD_DAYS, CREW_OUTINGS_UPCOMING_MAX } from "../rules/crewPage";

// Page du crew (lot R5c2, maquettes R5.7 à R5.9 validées par Damien le 26/10) : page à onglets, sorties du crew,
// vitrine, demande avec message, réglages. Mêmes mots dans l'appli et sur le site.

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const crewPageLabels = {
  // En-tête de la page.
  idLine: (department: string, members: number, since: number) =>
    `Crew · ${department} · ${members} ${plural(members, "membre", "membres")} · depuis ${since}`,
  youLead: "Tu es le chef",
  discussion: "Discussion",
  discussionA11y: (unread: number) =>
    unread > 0
      ? `Discussion du crew, ${unread} ${plural(unread, "message non lu", "messages non lus")}`
      : "Discussion du crew",
  inviteA11y: "Inviter dans le crew",
  settingsA11y: "Réglages du crew",
  instagramA11y: (handle: string) => `Instagram du crew : ${handle}`,
  archived: "Ce crew est dissous. La discussion reste lisible.",

  // Onglets.
  tabFeed: "Fil",
  tabOutings: "Sorties",
  tabGarage: "Garage",
  tabMembers: "Membres",
  tabCount: (label: string, n: number) => (n > 0 ? `${label} · ${n}` : label),

  // Sorties.
  proposeOuting: "Proposer une sortie",
  outingsTitle: "Sorties du crew",
  outingsHint: "réservées au crew",
  outingsEmpty: "Aucune sortie prévue pour l'instant.",
  proposeReserved: "Le chef a gardé pour lui les sorties du crew : demande-lui d'en proposer une.",
  rsvpYes: "Je viens",
  rsvpMaybe: "Peut-être",
  rsvpNo: "Non",
  rsvpA11y: "Ta réponse",
  rsvpCount: (yes: number, maybe: number) =>
    [
      yes > 0 ? `${yes} ${plural(yes, "vient", "viennent")}` : "Personne ne vient encore",
      maybe > 0 ? `${maybe} peut-être` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  outingRdv: (hour: string, place: string) => `RDV ${hour} · ${place}`,
  outingBy: (pseudo: string | null) => (pseudo ? `Proposée par ${pseudo}.` : "Proposée par un ancien membre."),
  /** Fil du crew (maquette R5.7) : « Kenji_66 propose une sortie : Balade des Aspres ». */
  feedOuting: (pseudo: string | null, title: string) =>
    pseudo ? `${pseudo} propose une sortie : ${title}` : `Sortie du crew : ${title}`,
  feedOutingYouGo: "Tu viens",
  feedOutingYesToast: (title: string) => `Tu viens à ${title} : le crew le voit.`,
  maps: "Maps",
  waze: "Waze",
  mapsA11y: (place: string) => `Ouvrir Maps vers ${place}`,
  wazeA11y: (place: string) => `Ouvrir Waze vers ${place}`,
  editOuting: "Modifier",
  editOutingA11y: (title: string) => `Modifier la sortie « ${title} »`,
  removeMemberA11y: (pseudo: string) => `Retirer ${pseudo} du crew`,
  nameTooShort: "Le nom du crew : 3 caractères au moins.",
  cancelOuting: "Annuler la sortie",
  cancelOutingConfirm: (title: string) =>
    `Annuler « ${title} » ? Ceux qui venaient sont prévenus, la sortie disparaît de la page.`,
  outingCancelled: "Sortie annulée : ceux qui venaient sont prévenus.",
  crewEventsTitle: "Où va le crew",
  crewEventsHint: "événements Orasso",
  crewEventsEmpty: "Aucun membre n'est retenu à un événement à venir, et le crew n'est inscrit nulle part.",
  crewEventGoing: (city: string | null, n: number) =>
    [city, `${n} du crew ${plural(n, "y va", "y vont")}`].filter(Boolean).join(" · "),
  crewEventRegistered: (city: string | null, n: number) =>
    [city, `Inscrits en crew · ${n} · en attente du tri`].filter(Boolean).join(" · "),
  tagRetained: "Retenus",
  tagRegistered: "Inscrits",
  registerCrew: "Inscrire le crew à un événement",

  // Garage.
  garageTitle: "Le garage du crew",
  garageCount: (n: number) => `${n} ${plural(n, "véhicule", "véhicules")}`,
  garageEmpty: "Aucun véhicule dans le garage du crew pour l'instant.",
  mainVehicle: "Principal",

  // Membres.
  requestsTitle: "Demandes",
  requestsHint: "Toi seul les vois",
  requestNoMessage: "Pas de message.",
  membersTitle: "Membres",
  roleLeader: "Chef",
  noVehicle: "Pas encore de véhicule",
  inviteSomeone: "Inviter quelqu'un",

  // Vitrine (non-membre).
  friendsIn: (n: number) => (n > 1 ? `${n} de tes amis en font partie` : "1 de tes amis en fait partie"),
  friendsNames: (names: readonly string[]) =>
    names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`,
  membersOnly: "Le fil, les sorties du crew et la discussion sont réservés aux membres.",
  leaderAccepts: (pseudo: string | null) =>
    pseudo ? `Le chef, ${pseudo}, accepte les demandes.` : "Le chef accepte les demandes.",
  requestJoin: "Demander à rejoindre",
  requestSentTo: (pseudo: string | null) => (pseudo ? `Demande envoyée à ${pseudo}` : "Demande envoyée"),
  requestSentHint: "Sa réponse arrive dans ta Boîte.",
  cancelRequest: "Annuler la demande",

  // Feuille « Demander à rejoindre » (vitrine, recherche, Explorer, site).
  sheetTitle: (name: string) => `Rejoindre ${name}`,
  sheetLabel: (pseudo: string | null) => (pseudo ? `Un mot pour ${pseudo}, le chef` : "Un mot pour le chef"),
  sheetPlaceholder:
    "Salut ! Je roule en Mazda MX-5 NB, souvent à Canet le dimanche. Je peux venir à la prochaine balade ?",
  sheetHint:
    "Facultatif. Par exemple : ta voiture, où tu roules, ce que tu aimes. Le chef voit aussi ton pseudo, ton grade et ton véhicule principal.",
  sheetSend: "Envoyer la demande",
  sheetClose: "Fermer",
  counter: (n: number, max: number) => `${n} / ${max}`,

  // Proposer une sortie (R5.9).
  outingFormTitle: "Proposer une sortie",
  outingEditTitle: "Modifier la sortie",
  outingFormSub: (crew: string) => `${crew} · réservée au crew`,
  outingBack: "Retour au crew",
  outingName: "Nom de la sortie",
  outingNamePlaceholder: "Balade des Aspres",
  outingDay: "Jour",
  outingTime: "Rendez-vous à",
  outingPlace: "Point de rendez-vous",
  outingPlacePlaceholder: "Parking de la cave coopérative, Thuir",
  outingFind: "Placer sur la carte",
  outingFinding: "Recherche de l'adresse…",
  outingFound: (label: string) => `Point placé : ${label}`,
  outingNotFound: "Adresse introuvable : déplace la carte pour placer le point.",
  outingMapHint: "Déplace la carte pour placer le point",
  outingMapHintWeb: "Fais glisser l'épingle pour placer le point",
  outingPointSet: "Point de rendez-vous placé",
  outingPointMissing: "Pas encore de point sur la carte : Maps et Waze chercheront l'adresse.",
  outingProgram: "Le programme",
  outingProgramPlaceholder: "Café à Thuir, puis la route de Castelnou et Prades. Retour vers 13 h.",
  outingVisibility: (n: number) => `Les ${n} ${plural(n, "membre", "membres")} du crew la voient`,
  outingVisibilityHint: "Elle arrive dans le fil et dans leurs notifications.",
  outingNote:
    "Pas de candidature, pas de QR, pas de points : chacun dit s'il vient. Le point de rendez-vous s'ouvre dans Maps ou Waze.",
  outingSend: "Proposer la sortie",
  outingSave: "Enregistrer la sortie",
  outingMissing: (what: readonly string[]) => `Il manque : ${what.join(", ")}.`,
  outingMissingName: "le nom (3 caractères au moins)",
  outingMissingDay: "le jour",
  outingMissingTime: "l'heure de rendez-vous",
  outingMissingPlace: "le point de rendez-vous",
  /** Tour 2 : jour ou heure qui n'existe pas, adresse changée après le placement du point. */
  outingNoSuchDay: "Ce jour n'existe pas : vérifie le jour du mois.",
  outingNoSuchHour: "Cette heure n'existe pas ce jour-là (passage à l'heure d'été) : choisis-en une autre.",
  /** Tour 2 : modifier une sortie sans en avoir le droit (ni auteur ni chef, ou rendez-vous passé). */
  outingCannotEdit:
    "Tu ne peux pas modifier cette sortie : seuls son auteur et le chef la modifient, avant le rendez-vous.",
  /** Tour 2 : la sortie a commencé, les réponses sont closes. */
  outingStarted: "C'est parti : les réponses sont closes.",
  outingPointReset: "L'adresse a changé : replace le point sur la carte, ou laisse Maps et Waze chercher l'adresse.",
  outingProposed: "Sortie proposée : le crew est prévenu.",
  outingSaved: "Sortie enregistrée.",

  // Réglages du crew (écran à part).
  settingsTitle: "Réglages du crew",
  identityTitle: "Le crew",
  imagesTitle: "Logo et bannière",
  banner: "Bannière",
  changeBanner: "Changer la bannière",
  removeBanner: "Retirer la bannière",
  bannerHint: "La bannière se voit aussi hors du crew : masque la plaque, ou confirme qu'aucune plaque n'est visible.",
  bannerHidden: "Ta bannière n'est pas montrée hors du crew : aucune décision sur la plaque. Envoie-la de nouveau.",
  bannerNoPlate: "Aucune plaque visible sur cette photo",
  bannerSend: "Poser la bannière",
  instagram: "Instagram du crew",
  instagramPlaceholder: "@roussillondrift",
  instagramHint: "Le pseudo seul, ou l'adresse du compte.",
  outingsRight: "Les membres peuvent proposer une sortie",
  outingsRightHint: "Toi, tu peux toujours en proposer une.",
  yes: "Oui",
  no: "Non",
  removeTitle: "Retirer un membre",
  removeEmpty: "Aucun autre membre pour l'instant.",
  dangerTitle: "Dissoudre le crew",
  saved: "Réglages enregistrés",
} as const;

/** Messages d'erreur des sorties du crew (API). */
export const crewOutingErrors = {
  notFound: "Sortie introuvable",
  proposeReserved: "Le chef a gardé pour lui les sorties du crew.",
  manageForbidden: "Seuls l'auteur de la sortie et le chef peuvent la modifier ou l'annuler.",
  past: "Choisis une date et une heure à venir.",
  tooFar: `Une sortie se propose au plus ${CREW_OUTING_MAX_AHEAD_DAYS} jours à l'avance.`,
  tooMany: `Le crew a déjà ${CREW_OUTINGS_UPCOMING_MAX} sorties à venir : attends qu'une passe ou annule-en une.`,
  cancelled: "Cette sortie est annulée.",
  over: "Cette sortie est passée.",
} as const;
