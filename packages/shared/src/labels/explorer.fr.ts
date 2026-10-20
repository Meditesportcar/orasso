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
} as const;
