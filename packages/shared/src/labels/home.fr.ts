import type { HomeNudgeKind, HomeWidgetId } from "../home";
import { keepUnits } from "./units.fr";

// Accueil (lot 30) : titres des widgets, réorganisation, incitations, sources des données ouvertes.

export const homeWidgetTitles: Record<HomeWidgetId, string> = {
  next_access: "Prochain accès",
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
