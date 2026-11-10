import type { HomeNudgeKind, HomeWidgetId } from "../home";
import { keepUnits } from "./units.fr";

// Accueil (lot 30) : titres des widgets, réorganisation, incitations, sources des données ouvertes.

export const homeWidgetTitles: Record<HomeWidgetId, string> = {
  next_access: "Prochain accès",
  event_weather: "Météo de l'événement",
  live: "En cours",
  my_outings: "Mes sorties",
  my_crew: "Mon crew",
  friends_news: "Du nouveau chez tes potes",
  spot_meetup: "Au spot",
  memories: "Souvenirs",
  pending: "En attente",
  nearby: "Autour de moi",
  weather: "Météo",
  agenda: "Agenda",
  favorite_garage: "Garage favori",
  wash: "Lavage le plus proche",
  fuel: "Carburant le plus proche",
};

export const homeLabels = {
  title: "Accueil",
  reorder: "Réorganiser",
  reorderHint: "Choisis l'ordre des blocs et ceux que tu veux voir. « Prochain accès » reste en tête.",
  moveUp: "Monter",
  moveDown: "Descendre",
  hide: "Masquer",
  hiddenTag: "masqué",
  show: "Afficher",
  done: "Terminé",
  saveFailed: "Réglage non enregistré : réessaie.",
  loadFailed: "Accueil indisponible pour le moment.",
  // Autour de moi.
  radius: (km: number | null) => (km === null ? "Rayon : partout en France" : `Rayon : ${km} km`),
  radiusLabel: "Rayon des suggestions",
  nearbyEmpty: (km: number | null) =>
    km === null
      ? "Aucun événement à venir en France pour le moment."
      : `Aucun événement à venir à moins de ${km} km : élargis le rayon.`,
  nearbyNoPlace:
    "Ajoute un département dans ton profil, ou utilise ta position, pour voir les événements autour de toi.",
  usePosition: "Utiliser ma position",
  stopPosition: "Revenir à mon secteur",
  usingPosition: "Position de l'appareil, utilisée pour cet affichage seulement.",
  positionDenied: "Position indisponible : on garde ton secteur.",
  // En attente.
  pendingEmpty: "Aucune candidature en attente.",
  // Garage favori.
  garageEmpty: "Marque un pro abonné comme garage favori depuis sa fiche.",
  garageSet: "Garage favori",
  garageUnset: "Retirer des favoris",
  call: "Appeler",
  route: "Itinéraire",
  // Lavage et carburant.
  placesEmpty: "Rien trouvé près de toi pour le moment.",
  washUnnamed: "Station de lavage",
  fuelUnnamed: "Station-service",
  distance: (km: number) => `${km.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`,
  priceUnit: "€/L",
  fuelNames: { sp95: "SP95", sp98: "SP98", gazole: "Gazole", e85: "E85" },
  washAttribution: "Données : © contributeurs OpenStreetMap",
  fuelAttribution: "Prix : data.economie.gouv.fr (licence ouverte)",
  // Emplacement sponsorisé.
  sponsored: "Sponsorisé",
  // Agenda.
  agendaEmpty: "Tes dates apparaîtront ici dès que tu auras candidaté.",
  // Prochain accès.
  nextAccess: "Prochain accès",
  applicationInProgress: "Candidature en cours",
  openAccess: "Mode jour J",
  moreInfo: "En savoir plus",
  seeAccess: "Voir mes accès",
  explore: "Explorer les événements",
  // Compte et garage (site).
  accountQrTitle: "Mon QR de compte",
  accountQrHint: "Montre-le à un pro partenaire pour ta remise. Il change toutes les 60 secondes.",
  accountQrWarning: "Ne le partage pas : une capture d'écran ne sert qu'une minute ou deux, mais c'est ton identité.",
  accountQrUnavailable: "QR de compte indisponible : ouvre cette page en HTTPS ou depuis l'appli.",
  accountQrSecondsLeft: (n: number) => `Prochain code dans ${n} s`,
} as const;

export const homeNudges: Record<HomeNudgeKind, { title: string; body: string; action: string }> = {
  verify_email: {
    title: "Vérifie ton e-mail",
    body: "Un lien de confirmation t'a été envoyé : sans lui, certaines fonctions restent fermées.",
    action: "Ouvrir mon compte",
  },
  enable_2fa: {
    title: "Active la double authentification",
    body: "Elle est obligatoire pour gérer un événement : protège ton compte d'organisateur.",
    action: "Sécuriser mon compte",
  },
  add_vehicle: {
    title: "Ajoute ton premier véhicule",
    body: "Ton garage, c'est toi. Tu auras besoin d'un véhicule pour candidater.",
    action: "Ajouter un véhicule",
  },
  create_crew: {
    title: "Crée ton crew",
    body: "Rassemble ta bande et inscrivez-vous ensemble aux événements.",
    action: "Créer un crew",
  },
};

// --- Sorties en tickets, accueil par profil, accès flottant (lot 43, prototype DA v2 `s-sorties`, `s-home`) --------------

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

export const sortiesLabels = {
  theTeam: "l'équipe organisatrice",
  pendingLine: (who: string) => `En attente de la réponse de ${who}`,
  offerLead: (left: string) => `Place libérée · accepte avant ${left}`,
  offerNote: "Un retenu s'est désisté. Si tu ne réponds pas à temps, la place passe au suivant.",
  myQr: "Mon QR",
  withdraw: "Retirer",
  withdrawBefore: (date: string) => `Désistement sans pénalité jusqu'au ${date}`,
  enteredAt: (when: string) => `Entrée enregistrée ${when}`,
  withdrawHelp: "Empêché ? Retire-toi depuis le ticket : ta place part à la liste d'attente.",
  giveBackHelp: "Un empêchement ? Rends ton billet depuis le ticket",
  myTicket: "Mon billet",
  publicTicketLine: (name: string) => `Billet · ${name}`,
  willBeThere: "Je serai là",
  staffRoleGiven: (structure: string) => `Rôle donné par ${structure} pour cet événement`,
  staffModeOpensEve: (when: string) => `Le mode staff s'ouvre la veille (${when}) : synchronise la liste ce jour-là.`,
  staffUnsent: (n: number) => `${n} envoi${n > 1 ? "s" : ""} en attente : ils partiront au retour du réseau.`,
  reviewUntil: (date: string) => `Avis possible jusqu'au ${date}`,
  audienceRank: (rank: number, of: number) => `Prix du public : ${ordinal(rank)} sur ${of}`,
  emptyUpcomingTitle: "Rien de prévu",
  emptyUpcomingText: "Trouve un événement et candidate avec l'un de tes véhicules : ton ticket apparaîtra ici.",
  emptyStaffTitle: "Pas de mission staff",
  emptyStaffText: "Quand une structure te donne un rôle sur un événement, il apparaît ici.",
  emptyPastTitle: "Ton carnet est vide",
  emptyPastText: "Il se remplira après ta première sortie : présence, points, avis.",
} as const;

/** Accès flottant (barre au-dessus des onglets dès J-7). */
export const nextAccessBarLabels = {
  open: "Ouvrir mon prochain accès",
  line: (day: string, title: string, countdown: string) => `${day} · ${title} · ${countdown}`,
} as const;

/** Accueil par profil. */
export const homeProfileLabels = {
  greeting: (name: string) => `Salut ${name}`,
  myAccess: "Mon accès",
  myTicket: "Mon billet",
  myProviderAccess: "Mon accès prestataire",
  myPressBadge: "Mon badge presse",
  structureValidated: "Structure validée · organisateur",
  openingAt: (hour: string) => `${hour} · ouverture`,
  installAt: (hour: string) => `${hour} · installation`,
  publicOpening: (hour: string) => `Ouverture au public ${hour}`,
  maps: "Maps",
  waze: "Waze",
  onMap: "Sur la carte",
  otherOutings: "Tes autres sorties",
  seeAll: "Tout voir",
  staffNudge: "Tu es staff",
  passportTile: (n: number) => `${n} tampon${n > 1 ? "s" : ""} cette saison`,
  passportTitle: "Passeport Orasso",
  // Lot C2a (artefact DA v2 `s-home`) : rail d'affiches, incitations.
  // Trait d'union insécable (U+2011) : « mois‑ci » ne se coupe jamais en fin de ligne (retour 01, lot M5).
  aroundThisMonth: (place: string) => `Autour du ${place} ce mois‑ci`,
  aroundThisMonthNoPlace: "Autour de toi ce mois‑ci",
  // Lot M5 (maquette 6.1) : « Ta prochaine sortie », les tickets qui glissent.
  nextOuting: "Ta prochaine sortie",
  outingOf: (i: number, n: number) => `${i} sur ${n}`,
  myApplication: "Ma candidature",
  waitlistLine: "Prévenu si une place se libère",
  exploreLink: "Explorer",
  staffModeEve: "le mode staff s'ouvre la veille",
  passportNext: "Le prochain t'attend à ta prochaine sortie.",
  tutoTitle: "Découvre ce qu'il y a de nouveau",
  tutoBody: "Un tour rapide de ton espace.",
  // Lot R6-police : « jour J » ne se coupe jamais (espace insécable).
  weatherDayJ: keepUnits("Météo prévue sur place le jour J"),
  // Pro.
  discountsThisWeek: "Remises cette semaine",
  profileViews: "Vues de ta fiche",
  scanAccountQr: "Scanner un QR de compte",
  eventsNearWorkshop: "Événements près de l'atelier",
  clientsGoing: (n: number) => `${n} de tes clients y vont`,
  fansNearbyTitle: "Passionnés du coin",
  fansNearby: (n: number) => `${n} dans ton département`,
  favoritedBy: (n: number) => `${n} t'${n > 1 ? "ont" : "a"} mis en garage favori`,
  lastScans: "Derniers scans",
  stats: "Stats",
  noScans: "Aucun scan pour le moment : les remises utilisées apparaîtront ici.",
  // Prestataire.
  organizerMessage: "Message de l'organisateur",
  spot: (label: string) => `Emplacement ${label}`,
  missionsNearby: "Missions qui t'attendent",
  noMission: "Pas encore de mission retenue",
  noMissionBody: "Candidate à une mission : ta prochaine sortie et ton emplacement apparaîtront ici.",
  // Média.
  accredited: "Accréditée",
  pressInstructions: "Consignes de l'organisation",
  toCover: "À couvrir bientôt",
  yourContents: "Tes contenus",
  views: (n: number) => `${n.toLocaleString("fr-FR")} vue${n > 1 ? "s" : ""} depuis les pages d'événements`,
  noReport: "Pas de reportage à venir",
  noReportBody: "Demande une accréditation sur un événement : ton badge presse et les consignes apparaîtront ici.",
} as const;

// --- Lot R7a2 : blocs de l'Accueil et écran « Personnaliser » (maquette R7.4 et R7.5, textes de la maquette) -------------

export const homeBlockLabels = {
  seeAll: "Tout voir",
  /** Mes sorties. */
  outingsTitle: "Mes sorties",
  /** Mon crew : raccourci vers l'onglet Crew. */
  crewTitle: "Mon crew",
  crewLink: "Onglet Crew",
  crewMembers: (n: number) => (n > 1 ? `${n} membres` : "1 membre"),
  crewUnread: (n: number) => (n > 1 ? `${n} messages non lus` : "1 message non lu"),
  crewPhoto: "Photo",
  crewReplies: (n: number) => (n > 1 ? `${n} réponses` : n === 1 ? "1 réponse" : "pas encore de réponse"),
  crewNextOuting: "Prochaine sortie du crew",
  crewGoing: (n: number) => (n > 1 ? `${n} viennent` : n === 1 ? "1 vient" : "personne pour l'instant"),
  crewDiscussion: "Discussion",
  /** Du nouveau chez tes potes. */
  friendsTitle: "Du nouveau chez tes potes",
  friendsLink: "Le Fil",
  /** Au spot, Souvenirs (réservés : R7i, R7j). */
  spotTitle: "Au spot",
  memoriesTitle: "Souvenirs",
  /** En cours (pendant un événement). */
  liveEyebrow: (day: number, count: number) => (count > 1 ? `En cours · jour ${day} sur ${count}` : "En cours"),
  liveTitle: "En cours",
  liveOnSite: (n: number) => (n > 0 ? "sur place maintenant" : "Personne encore sur place"),
  liveVotes: (n: number) => (n > 1 ? `Votes · ${n} ouverts` : "Vote ouvert"),
  liveVote: "Voter",
  /** Les chiffres affichés viennent du téléphone (réseau coupé). */
  liveOffline: "Données hors ligne",
  liveProgram: "Programme du jour",
  liveSheet: "La fiche",
  liveStoryEmpty: "Pas encore de story de l'organisateur",
  /** Bas de l'Accueil. */
  personalize: "Personnaliser l'accueil",
  personalizeShort: "Personnaliser",
} as const;

/** Lot R8e1 : la ligne météo de la carte « Prochaine sortie » (voir `rules/outingWeather.ts`). */
export const outingWeatherLabels = {
  /** Fond sombre de l'affiche : le bandeau de l'événement « Incertain ». */
  uncertainBanner: "Météo incertaine : on la revérifie la veille et le matin.",
  /** Seconde ligne d'un événement « Incertain » : le nombre de jours avant le début (jamais avant 1). */
  uncertainIn: (days: number) => keepUnits(`Prévision peu sûre à ${days} ${days > 1 ? "jours" : "jour"}`),
  headline: (weekday: string, temp: number, windKmh: number) => ({
    lead: `${weekday} : `,
    temp: `${temp}°`,
    tail: keepUnits(`, vent ${windKmh} km/h`),
  }),
  aria: (weekday: string, sky: string, temp: number, windKmh: number) =>
    keepUnits(`Météo de ${weekday} : ${sky}, ${temp} degrés, vent ${windKmh} km/h`),
} as const;

export const homePersonalizeLabels = {
  title: "Personnaliser",
  subtitle: "Ton Accueil, à ton goût",
  hint: "Monte ou descends un bloc pour changer l'ordre.",
  hintEye: "L'œil masque un bloc ; tu le retrouves plus bas.",
  fixedHint: "Toujours en tête",
  hiddenTitle: "Blocs masqués et à ajouter",
  hiddenEmpty: "Tous les blocs sont affichés.",
  add: "Ajouter",
  hide: "Masquer",
  moveUp: "Monter",
  moveDown: "Descendre",
  reset: "Remettre par défaut",
  save: "Enregistrer",
  saving: "Enregistrement…",
  saved: "Accueil enregistré.",
  saveFailed: "Réglage non enregistré : réessaie.",
  loading: "On récupère ton réglage…",
  loadFailed: "On n'a pas pu récupérer ton réglage : rien n'est modifiable pour ne pas l'écraser.",
  retry: "Réessayer",
  soon: "Bientôt",
  soonTitle: "Défis de la saison",
  soonHint: "Arrive avec la version 2",
  close: "Fermer",
  /** Titre et phrase de chaque bloc. */
  widgets: {
    next_access: { title: "Prochaine sortie", hint: "Toujours en tête" },
    event_weather: {
      title: "Météo de l'événement",
      hint: "Affiche ou masque la ligne météo de la carte « Prochaine sortie »",
    },
    live: { title: "En cours", hint: "Seulement pendant un événement où tu as ta place" },
    my_outings: { title: "Mes sorties", hint: "Ton agenda : retenues, en attente, billets" },
    my_crew: { title: "Mon crew", hint: "Raccourci vers l'onglet Crew" },
    friends_news: { title: "Du nouveau chez tes potes", hint: "3 nouveautés au plus de ceux que tu suis" },
    spot_meetup: { title: "Au spot", hint: "Seulement quand quelqu'un lance un rendez-vous" },
    memories: { title: "Souvenirs", hint: "Seulement les jours où il y en a un" },
    nearby: { title: "Autour de moi", hint: "Les événements près de toi ce mois-ci" },
    weather: { title: "Météo", hint: "Chez toi, aujourd'hui" },
    agenda: { title: "Agenda", hint: "Tes prochaines dates" },
    favorite_garage: { title: "Garage favori", hint: "Ton pro favori et son avantage" },
    pending: { title: "Candidatures en attente", hint: "Celles qui attendent une réponse" },
    wash: { title: "Lavage le plus proche", hint: "Les stations près de toi" },
    fuel: { title: "Carburant le plus proche", hint: "Les prix près de toi" },
  } satisfies Record<HomeWidgetId, { title: string; hint: string }>,
} as const;
