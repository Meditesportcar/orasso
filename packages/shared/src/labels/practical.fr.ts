import type { PracticalKind } from "../rules/practical";
import { keepUnits } from "./units.fr";

// Pratique (lot R8q, maquette R8.12) : la station-service et le lavage les plus proches, de moi ou de ma sortie.
// Libellés copiés de `pratiqueBlock` et `pratH` ; les notes « pnote » de la maquette ne sont pas dans le produit.
export const practicalTexts = {
  title: "Pratique",
  /** En-tête de l'écran « Voir tout ». */
  screenTitle: "Pratique",
  screenSubtitle: "Stations-service et lavage",
  seeAll: "Voir tout",
  back: "Retour",
  nearMe: "Près de moi",
  nearOuting: "Près de ma sortie",
  fuelNearest: "Station-service la plus proche",
  washNearest: "Lavage le plus proche",
  goThere: "Y aller",
  /** La feuille de « Y aller » : le même choix que sur la fiche d'un événement. */
  goMaps: "Maps",
  goWaze: "Waze",
  /** `aria-label` de « Y aller » : « Y aller : Station du Vernet ». */
  goA11y: (title: string) => `Y aller : ${title}`,
  usePosition: "Utiliser ma position",
  /** Une position est déjà donnée : une nouvelle se demande par ce bouton. */
  relocate: "Me relocaliser",
  /** Hors ligne : la dernière réponse de la séance reste affichée. */
  offline: "Hors ligne : voici ce que ton téléphone a gardé.",
  offlineWeb: "Hors ligne : voici la dernière réponse.",
  /** « Autour de Perpignan, ta ville. » */
  aroundCity: (city: string) => `Autour de ${city}, ta ville.`,
  /** « Autour de la Nocturne de Canet, l'événement où tu vas. » */
  aroundOuting: (title: string) => `Autour de ${title}, l'événement où tu vas.`,
  /** Sans position donnée ni département : aucune ville à proposer (le bloc invite à donner la position). */
  noOrigin: "Donne ta position pour voir les lieux proches.",
  nothingNear: keepUnits("Rien à moins de 30 km."),
  loading: "Recherche des lieux proches…",
  /** Première lecture en échec : une nouvelle tentative sans quitter l'écran. */
  retry: "Réessayer",
  /** Les deux sources n'ont pas répondu : le bloc se replie sur cette ligne, sans erreur. */
  unavailable: "Lieux proches indisponibles pour le moment.",
  /** Sous le nom d'un lieu : « Station-service · 1,2 km ». */
  kindLabel: { fuel: "Station-service", wash: "Lavage" } satisfies Record<PracticalKind, string>,
  /** Chips de l'écran : « Tout · Stations-service · Lavage ». */
  filterAll: "Tout",
  filterFuel: "Stations-service",
  filterWash: "Lavage",
  /** Titre d'un lieu sans nom ni rue. */
  unnamed: { fuel: "Station-service", wash: "Station de lavage" } satisfies Record<PracticalKind, string>,
  list: "Liste",
  map: "Carte",
  mapAttribution: "© contributeurs OpenStreetMap",
  /** Petit lot de fin D : les stations viennent du jeu public des prix, d'OpenStreetMap, ou des deux (les deux sont alors cités). */
  fuelSourcesBoth: "Données : data.economie.gouv.fr (licence ouverte) et © contributeurs OpenStreetMap",
  fuelSourcesOsm: "Données : © contributeurs OpenStreetMap",
  /** Carte d'un lieu touché pour une sortie : « Station-service · 0,8 km de l'événement ». */
  fromOuting: "de l'événement",
  myPosition: "Ma position",
  mapLabel: "Carte des lieux proches",
} as const;
