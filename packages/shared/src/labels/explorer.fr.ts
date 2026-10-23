import type { EventCard } from "../schemas/event";
import type { ProCard } from "../schemas/pro";
import type { SearchGroup } from "../schemas/search";

// Recherche de premier niveau et Explorer (lot 29) : libellés d'interface.

export const searchGroupLabels: Record<SearchGroup, string> = {
  events: "Événements",
  pros: "Pros",
  people: "Personnes",
  vehicles: "Véhicules",
  crews: "Crews",
};

export const explorerLabels = {
  title: "Explorer",
  segmentEvents: "Événements",
  segmentPros: "Pros",
  segmentPeople: "Personnes et crews",
  segmentAll: "Résultats",
  searchTitle: "Recherche",
  searchPeopleCrews: "Rechercher une personne ou un crew",
  searchPeopleCrewsPlaceholder: "Pseudo, véhicule ou nom de crew",
  searchPlaceholder: "Événement, ville, pro, pseudo, véhicule…",
  searchIdle: "Cherche un événement, une ville, un pro, une personne ou un véhicule (Supra, Rivesaltes, drift…).",
  searchTooShort: "Saisis au moins deux caractères.",
  searchEmpty: "Aucun résultat. Essaie un autre mot.",
  searchSignedOut: "Connecte-toi pour chercher aussi des personnes, des véhicules et des crews.",
  seeAll: "Voir tout",
  list: "Liste",
  map: "Carte",
  filters: "Filtres",
  filtersApply: "Appliquer",
  filtersReset: "Réinitialiser",
  filterFormat: "Format",
  filterCategory: "Catégorie",
  filterDepartment: "Département",
  filterActivity: "Activité",
  filterFrom: "À partir du",
  filterTo: "Jusqu'au",
  filterRadius: "Rayon",
  filterAll: "Tous",
  filterAllFeminine: "Toutes",
  sort: "Trier par",
  sortAffinity: "Affinités",
  sortDate: "Date",
  sortDistance: "Distance",
  sortName: "Nom",
  usePosition: "Utiliser ma position",
  usingPosition: "Position de l'appareil utilisée (non enregistrée)",
  stopPosition: "Ne plus l'utiliser",
  positionDenied: "La position n'est pas disponible : on utilise ton secteur.",
  positionFromSector: "Distances calculées depuis ton secteur.",
  positionUnknown: "Renseigne ton secteur dans Moi pour trier par distance.",
  eventsEmpty: "Aucun événement ne correspond. Essaie d'autres filtres.",
  prosEmpty: "Aucun pro ne correspond. Essaie d'autres filtres.",
  more: "Voir plus",
  mapUnavailableWeb:
    "La carte est disponible dans l'appli sur téléphone. Sur le web, la liste affiche les mêmes résultats.",
  mapNoPosition: "Aucun résultat n'a de position sur la carte.",
  mapPinOpen: "Ouvrir la fiche",
  reasonFollowed: "Organisateur suivi",
  reasonInterest: (n: number) => (n > 1 ? `${n} centres d'intérêt en commun` : "Centre d'intérêt en commun"),
  reasonNear: "Près de chez toi",
  awayKm: (km: number) => `à ${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`,
  verifiedPro: "Pro vérifié",
  // Page d'une structure dans l'appli.
  structureEvents: "Événements à venir",
  structurePast: "Événements passés",
  structureNoEvents: "Aucun événement à venir.",
  structureFollow: "Suivre",
  structureFollowing: "Suivi",
  structureFollowers: (n: number) => (n > 1 ? `${n} abonnés` : `${n} abonné`),
  structureBecomeStaff: "Devenir staff",
  structureContactSoon: "Contacter · bientôt",
  structureMissing: "Cette structure n'existe pas ou plus.",
  // Fiche d'un pro dans l'appli.
  proMissing: "Cette fiche pro n'existe pas ou plus.",
} as const;

/** Pastilles d'un événement de l'Explorer : pourquoi il est là (affinités) et à quelle distance. */
export function eventHints(event: Pick<EventCard, "affinity" | "distanceKm">): string[] {
  const hints: string[] = [];
  const a = event.affinity;
  if (a?.followed) hints.push(explorerLabels.reasonFollowed);
  if (a && a.commonCategories > 0) hints.push(explorerLabels.reasonInterest(a.commonCategories));
  if (a?.near) hints.push(explorerLabels.reasonNear);
  if (event.distanceKm !== undefined && event.distanceKm !== null) hints.push(explorerLabels.awayKm(event.distanceKm));
  return hints;
}

/** Pastille d'un pro de l'Explorer : la distance, quand elle est connue. */
export function proHints(pro: Pick<ProCard, "distanceKm">): string[] {
  return pro.distanceKm !== undefined && pro.distanceKm !== null ? [explorerLabels.awayKm(pro.distanceKm)] : [];
}

/**
 * Explorer v2 (lot 44, prototype DA v2 `s-explore`, validé par Damien le 19/10/2026) : en-tête de deux lignes,
 * position demandée puis repli sur le département favori, tout du plus proche au plus loin, filtres repliés.
 */
export const explorerV2Labels = {
  searchPlaceholder: "Événement, pro, pseudo, crew",
  searchLabel: "Rechercher",
  gpsOn: "Ma position",
  gpsOnA11y: "Position activée : touche pour ne plus l'utiliser",
  gpsOffA11y: "Position refusée : touche pour la redemander",
  gpsBlockedA11y: "Position refusée : touche pour ouvrir les réglages du téléphone",
  gpsAskA11y: "Activer ma position",
  filters: "Filtres",
  map: "Carte",
  list: "Liste",
  groupFormat: "Format",
  groupWhen: "Quand",
  groupTaste: "Selon mes goûts",
  formatAll: "Tous",
  whenAll: "Toutes dates",
  whenWeekend: "Ce week-end",
  whenMonth: "Ce mois-ci",
  tasteAffinity: "Mes affinités",
  tasteFollowed: "Structures suivies",
  askTitle: "Trie par distance depuis là où tu es",
  /** Texte de la demande ; `dept` : département favori (« 66 »), `null` sans département. */
  askText: (dept: string | null) =>
    `${dept ? `Sinon, on part du ${dept}, ton département favori.` : "Sinon, on trie par date."} Ta position, arrondie à 10 km, part avec la recherche pour trier : Orasso ne l'enregistre pas (elle peut rester un temps dans les journaux techniques du serveur).`,
  askEnable: "Activer",
  askLater: "Plus tard",
  /** Ligne d'ordre au-dessus de la liste. */
  sortOn: "Tous les événements, du plus proche au plus loin",
  sortDenied: (dept: string) => `Position refusée : autour du ${dept}, du plus proche au plus loin`,
  sortAround: (dept: string) => `Tous les événements, autour du ${dept}`,
  sortByDate: "Tous les événements, par date",
  // Lot M4 (maquettes 3.1 à 3.3).
  sortButton: "Trier",
  sortSheet: "Trier les événements",
  sortSheetHint: "Le tri s'applique tout de suite. Il est gardé pour tes prochaines visites.",
  sorts: {
    distance: { label: "Distance", hint: "Du plus proche au plus loin" },
    date: { label: "Date", hint: "Les plus proches dans le temps" },
    recent: { label: "Nouveautés", hint: "Publiés ces derniers jours" },
    seats: { label: "Places restantes", hint: "Où il reste le plus de places exposants" },
  } as Record<string, { label: string; hint: string }>,
  count: (n: number, more: boolean) => `${n}${more ? "+" : ""} événement${n > 1 || more ? "s" : ""}`,
  fromPosition: "distances depuis ta position",
  fromDept: (dept: string) => `distances depuis le centre du ${dept}`,
  fromDeptDenied: (dept: string) => `position refusée : distances depuis le centre du ${dept}`,
  fromPrefs: "filtrés selon tes préférences",
  // Lot M4, tour 2 (décision de Damien du 23/10) : « Autour de… », un point de départ temporaire.
  aroundButton: "Autour de",
  aroundSheet: "Autour de…",
  aroundMine: "Mon coin",
  aroundMineHint: (depts: readonly string[]) =>
    depts.length ? `Ton secteur : ${depts.join(", ")}` : "Ajoute ton département dans ton profil",
  aroundMe: "Autour de moi",
  aroundMeHint: "Ta position, le temps de cette recherche",
  aroundElsewhere: "Ailleurs…",
  aroundElsewhereHint: "Un autre département, le temps de cette recherche",
  aroundDept: (code: string) => `Le ${code}`,
  aroundDistance: "Distance",
  aroundKm: (km: number) => `${km} km`,
  everywhere: "Partout en France",
  aroundSheetHint: "Ces choix valent pour cette recherche : ils ne changent ni ton profil ni tes préférences.",
  backHome: "Revenir à mon coin",
  fromDeptElsewhere: (dept: string) => `distances depuis le centre du ${dept}`,
  withinKm: (km: number) => `à ${km} km au plus`,
  everywhereLine: "partout en France",
  listView: "Liste",
  mapView: "Carte",
  sortAffinity: "Selon tes affinités, puis par date",
  sortFollowed: "Tes structures suivies, du plus proche au plus loin",
  prosOn: "Tous les pros, du plus proche au plus loin",
  prosAround: (dept: string) => `Tous les pros, autour du ${dept}`,
  prosByName: "Tous les pros, par nom",
  results: (n: number, more: boolean) => `${n}${more ? "+" : ""} résultat${n > 1 || more ? "s" : ""}`,
  km: (km: number) => `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`,
  seatsLeft: (left: number, capacity: number) => `${left} place${left > 1 ? "s" : ""} exposants sur ${capacity}`,
  seatsFull: (capacity: number) => `Complet · ${capacity} exposants`,
  seatsFree: "Places exposants sans limite",
  waitlistFlag: "Complet · liste d'attente",
  verified: "Structure validée",
  emptyTitle: "Rien par ici",
  emptyText: "Aucun événement ne correspond. Change de format ou de date.",
  prosEmptyText: "Aucun pro ne correspond. Essaie une autre recherche.",
  loading: "On cherche autour de toi…",
  mapHint: "Touche une étiquette pour voir l'événement.",
  mapProHint: "Touche une plaque pour voir le pro.",
  mapLabel: "Carte des résultats",
} as const;

/** Fiche événement v2 (lot 44, prototype DA v2 `s-event`, validé par Damien le 19/10/2026). */
export const eventPageLabels = {
  free: "Gratuit",
  when: "Quand",
  where: "Où",
  seeMap: "voir la carte",
  hideMap: "masquer la carte",
  exhibitors: "Exposants",
  seatsLeft: "places restantes",
  noLimit: "sans limite de places",
  publicTitle: "Public",
  arrivals: "Créneaux d'arrivée",
  arrivalExhibitors: "Exposants",
  arrivalPublic: "Public",
  /** Lot 53 : « Précision pour l'entrée » saisie dans l'assistant. */
  entranceNote: "Pour entrer",
  strict: "Strict",
  advised: "Conseillé",
  customPoster: "Affiche de l'organisateur",
  customPosterHint: "Programme, partenaires, plan d'accès",
  customPosterSheet:
    "L'affiche perso de l'organisateur vit ici, dans le détail. Sur les cartes, c'est l'affiche générée qui s'affiche, toujours au même format.",
  rules: "Règlement",
  organizerValidated: "Validée",
  follow: "Suivre",
  following: "Suivie",
  followers: (n: number) => (n > 1 ? `${n} abonnés` : `${n} abonné`),
  applyWith: (vehicle: string) => `Candidater avec ma ${vehicle}`,
  applyNoVehicle: "Candidater avec un véhicule",
  bookEntry: "Réserver mon entrée",
  followOrganizer: "Suivre l'organisateur",
  followingOrganizer: "Organisateur suivi",
  myApplication: "Voir ma candidature",
  triage: "Trier les candidatures",
  closedTitle: "Inscriptions exposants fermées",
  endedTitle: "Événement terminé",
  closedFull: (capacity: number | null) =>
    capacity === 1
      ? "La place est attribuée. La liste d'attente reste ouverte."
      : capacity
        ? `Les ${capacity} places sont attribuées. La liste d'attente reste ouverte.`
        : "Toutes les places sont attribuées. La liste d'attente reste ouverte.",
  joinWaitlist: "Rejoindre la liste d'attente",
  soonTitle: (when: string) => `Candidatures dès ${when}`,
  soonPreview: (structure: string, everyone: string) =>
    `Avant-première pour les abonnés de ${structure}. Pour tout le monde : ${everyone}.`,
  soonFollow: (structure: string) => `Suivre ${structure}`,
  soonFollowing: "Tu suis cette structure : l'avant-première est pour toi.",
  // Lot M4 (maquettes 4.1 à 4.3).
  apply: "Candidater",
  myQr: "Mon QR",
  organizerRole: "organisateur",
  write: (name: string) => `Écrire à ${name}`,
  live: "En cours",
  seatsRow: (left: number) => `${left} place${left > 1 ? "s" : ""} exposants restante${left > 1 ? "s" : ""}`,
  seatsOf: (capacity: number) => `sur ${capacity}`,
  seatsNoLimit: "Places exposants sans limite",
  publicRow: (access: string) => `Public : ${access.charAt(0).toLowerCase()}${access.slice(1)}`,
  publicFrom: (time: string) => `Public dès ${time}`,
  admission: "Admission",
  admissionHelp: {
    open: "Pas de tri : les premières candidatures sont retenues d'office, dans la limite des places.",
    filtered: "L'équipe organisatrice choisit les véhicules au fil des candidatures et te répond dans Sorties.",
    invite_only: "Seules les personnes invitées par l'équipe organisatrice peuvent venir.",
  } as Record<string, string>,
  previewHelp: (hours: number) =>
    `Les abonnés de l'organisateur peuvent candidater ${hours} h avant tout le monde. Suis-le pour en profiter.`,
  myPlace: "Ta place",
  myZone: "Ta zone",
  myArrival: (strict: boolean) => (strict ? "Arrivée exposants, strict" : "Arrivée exposants"),
  /** Lot M4, tour 2 : l'écran du QR (hors ligne) garde le créneau privé et sa consigne. */
  myArrivalTitle: "Ton créneau d'arrivée",
  noZone: "À venir",
  withdraw: "Se retirer",
  withdrawFree: (when: string) => `Sans pénalité jusqu'au ${when}`,
  withdrawLate: "Après le verrouillage : un malus s'applique",
} as const;
