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
  // Lot M4, tour 2 (décision de Damien du 23/10) : « Autour de… », un point de départ ; lot R1 (24/10) : gardé pour les
  // prochaines visites (« Autour de moi » : le mode, jamais la position).
  aroundButton: "Autour de",
  aroundSheet: "Autour de…",
  aroundMine: "Mon coin",
  aroundMineHint: (depts: readonly string[]) =>
    depts.length ? `Ton secteur : ${depts.join(", ")}` : "Ajoute ton département dans ton profil",
  aroundMe: "Autour de moi",
  aroundMeHint: "Ta position, lue à chaque visite, jamais gardée",
  aroundElsewhere: "Ailleurs…",
  aroundElsewhereHint: "Un autre département que ton coin",
  aroundDept: (code: string) => `Le ${code}`,
  aroundDistance: "Distance",
  aroundKm: (km: number) => `${km} km`,
  everywhere: "Partout en France",
  aroundSheetHint: "Ces choix restent pour tes prochaines visites : ils ne changent ni ton profil ni tes préférences.",
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

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Explorer R2 (maquette « Explorer R2 », validée par Damien le 24/10 : « Parfait ! Juste l'entête, on garde toujours
 * Orasso ») : dans les trois segments, le segment, la recherche, puis une ligne de trois pastilles qui montrent leur
 * valeur ; une feuille « Où chercher ? » commune aux Événements et aux Pros ; les Pros par métier ; Personnes et crews
 * sans annuaire ; la carte avec les dates en clair.
 */
export const explorerR2Labels = {
  segments: "Que chercher ?",
  segmentEvents: "Événements",
  segmentPros: "Pros",
  segmentPeople: "Personnes et crews",
  searchEvents: "Un événement, un organisateur, une ville",
  searchPros: "Un pro, un métier, une ville",
  searchPeople: "Un pseudo, un crew, un modèle…",
  searchLabel: "Rechercher",
  clearSearch: "Effacer la recherche",
  pills: "Réglages de la recherche",
  // « Où chercher ? » (maquette R2.2).
  whereSheet: "Où chercher ?",
  whereMe: "Autour de moi",
  whereMeHint: "Ta position, lue sur ton téléphone. Elle n'est jamais gardée.",
  whereMeDenied: "Position refusée : touche pour la redemander.",
  whereMine: "Mon coin",
  whereMineHint: (depts: string) =>
    depts ? `Tes départements : ${depts}` : "Ajoute tes départements dans Tes préférences",
  whereAway: "Ailleurs",
  whereAwayHint: "Un autre département, le temps d'un week-end ou d'un voyage",
  whereAwayFind: "Chercher un département",
  whereAwayPlaceholder: "66, Aude, Gironde…",
  whereAll: "Partout en France",
  whereAllHint: "Aucune limite de distance",
  wherePeopleHint: "Départements seulement : jamais de position ni de distance.",
  whereKeep: "Gardé pour tes prochaines visites. Tes préférences ne changent pas.",
  km: "km",
  pillMe: (km: number) => `À ${km} km de moi`,
  pillMine: (codes: readonly string[]) => (codes.length ? `Mon coin (${codes.join(", ")})` : "Mon coin"),
  pillDept: (name: string, code: string) => `${name} (${code})`,
  pillAll: "Partout en France",
  lineMe: (km: number) => `jusqu'à ${km} km de toi`,
  lineAll: "partout en France",
  seeEvents: (n: number | null) =>
    n === null
      ? "Voir les événements"
      : n === 0
        ? "Aucun événement ici"
        : n === 1
          ? "Voir l'événement"
          : `Voir les ${n} événements`,
  seePros: (n: number | null) =>
    n === null ? "Voir les pros" : n === 0 ? "Aucun pro ici" : n === 1 ? "Voir le pro" : `Voir les ${n} pros`,
  seeResults: "Voir les résultats",
  // Trier (maquette R2.3).
  sortEventsSheet: "Trier les événements",
  sortProsSheet: "Trier les pros",
  sortHint: "Un toucher suffit : le tri s'applique et la feuille se ferme. Il est gardé pour tes prochaines visites.",
  sortPill: {
    date: "Par date",
    distance: "Par distance",
    recent: "Nouveautés",
    seats: "Places restantes",
    name: "Par nom",
  } as Record<string, string>,
  proSorts: {
    distance: { label: "Distance", hint: "Du plus proche au plus loin" },
    name: { label: "Nom", hint: "Par ordre alphabétique" },
  } as Record<string, { label: string; hint: string }>,
  // Filtres.
  filters: "Filtres",
  filtersSheet: "Filtres",
  /** Format : les types de « Tes préférences » (tant qu'aucun format n'est choisi à la main). */
  formatPrefs: "Mes préférences",
  // Événements (maquette R2.1).
  eventsLine: (n: number, more: boolean) => `${n}${more ? "+" : ""} événement${n > 1 || more ? "s" : ""} à venir`,
  // Pros (maquettes R2.4, R2.5).
  job: "Métier",
  jobAll: "Tous",
  jobSheet: "Quel métier ?",
  jobAllLong: "Tous les métiers",
  jobCount: (n: number) => (n > 0 ? plural(n, "pro", "pros") : "Aucun pour l'instant"),
  jobHint: "Le nombre compte les pros du lieu choisi. Un toucher suffit : la liste se filtre et la feuille se ferme.",
  prosLine: (n: number, more: boolean) => `${n}${more ? "+" : ""} pro${n > 1 || more ? "s" : ""}`,
  prosNearest: "les plus proches d'abord",
  prosByName: "par nom",
  movers: "Se déplacent chez toi",
  moverZone: (depts: readonly string[]) =>
    depts.length === 0
      ? "Se déplace chez toi"
      : `Se déplace dans le ${depts.slice(0, -1).join(", le ")}${depts.length > 1 ? " et le " : ""}${depts.at(-1)}`,
  discountMine: (percent: number, grade: string) => `avec ton grade ${grade}`,
  discountFrom: (grade: string) => `dès le grade ${grade}`,
  discountTag: (percent: number) => `−${percent} %`,
  discountNone: "Pas encore de remise Orasso",
  favorite: "Ton garage favori",
  // Personnes et crews (maquettes R2.6, R2.7).
  show: "Montrer",
  showAll: "Tout",
  showPeople: "Personnes",
  showCrews: "Crews",
  showSheet: "Montrer",
  peopleFiltersHint: "Les centres d'intérêt et le grade ne trouvent que les comptes publics et tes amis.",
  sameModelTitle: (model: string) => `D'autres ${model}`,
  sameModelHint: (vehicle: string) => `Comme ta ${vehicle}`,
  crewsNearTitle: (code: string | null) => (code ? `Crews du ${code}` : "Des crews"),
  crewsNearHint: (mine: string | null) => (mine ? `Ton crew : ${mine}` : "Les plus suivis"),
  publicOnly: "Comptes publics",
  privacyOpen:
    "Ici, seulement des comptes publics, et ce que leur profil montre déjà. Un compte privé se trouve par la recherche. Jamais plus précis que le département.",
  privacyResults:
    "Un compte privé montre son pseudo, son grade, la marque et le modèle de ses véhicules. Le reste est pour ses amis.",
  noSuggestions: "Rien à te suggérer pour l'instant. Cherche un pseudo, un crew ou un modèle.",
  peopleGroup: (n: number, more: boolean) => `Personnes · ${n}${more ? "+" : ""}`,
  peopleGroupHint: "Pseudo ou véhicule",
  crewsGroup: (n: number, more: boolean) => `Crews · ${n}${more ? "+" : ""}`,
  crewsGroupHint: "Par nom",
  noPeople: (q: string) => `Personne ne s'appelle « ${q} » et aucun véhicule ne porte ce nom.`,
  noPeopleFiltered: "Personne ne correspond à ces filtres.",
  noCrews: (q: string) => `Aucun crew ne s'appelle « ${q} ». Essaie un nom de crew ou un département.`,
  noCrewsHere: "Aucun crew par ici pour l'instant.",
  tooShort: "Saisis au moins deux caractères.",
  privateAccount: "Compte privé",
  yourCrew: "ton crew",
  members: (n: number) => plural(n, "membre", "membres"),
  add: "Ajouter",
  requested: "Demande envoyée",
  write: "Écrire",
  join: "Rejoindre",
  joinRequested: "Demande envoyée",
  grade: (g: string) => `grade ${g}`,
  createCrew: "Créer un crew",
  // Carte (maquette R2.8).
  dates: "Dates",
  allDates: "Toutes",
  eventsCount: (n: number) => plural(n, "événement", "événements"),
  prosCount: (n: number) => plural(n, "pro", "pros"),
  mapLocate: "Me localiser",
} as const;
