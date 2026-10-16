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
