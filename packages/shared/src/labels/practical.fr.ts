import type { PracticalKind } from "../rules/practical";
import { elide } from "../rules/practicalZone";
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
  // Petit lot de fin F : la recherche et la carte qui suit la zone (maquette du 13/11, option C). Libellés de la maquette, au caractère près.
  searchPlaceholder: "Ville, lieu ou enseigne",
  searchLabel: "Rechercher",
  clearSearch: "Effacer la recherche",
  searchHint: "Tape au moins deux lettres",
  searchEmpty: "Aucun résultat. Essaie un autre mot.",
  /** La recherche de villes est en panne : ce n'est pas un résultat vide (la saisie est gardée). */
  searchCitiesFailed: "La recherche de villes est indisponible pour le moment.",
  searchHere: "Rechercher dans cette zone",
  searchHereOffline: "Il faut du réseau pour chercher dans cette zone.",
  zoomIn: "Zoome sur un secteur pour voir ses lieux.",
  /** La zone resserrée sur la vue revient elle aussi coupée : trop de lieux pour ce zoom. */
  tooDense: "Trop de lieux ici : zoome davantage.",
  loadingZone: "Recherche des lieux de la zone",
  recenter: "Recentrer",
  citiesTitle: "Villes et lieux",
  inZoneTitle: "Dans la zone",
  noBrand: "Les stations-service se cherchent par leur rue : les données publiques ne donnent pas leur enseigne.",
  commune: "Commune",
  nothingInZone: "Rien dans cette zone. Déplace la carte ou cherche une ville.",
  /** « Autour de Canet-en-Roussillon, la zone de la carte. » (élision « d' », « du », « des » gérée). */
  aroundZone: (name: string) => `Autour ${elide(name)}, la zone de la carte.`,
  /** « Autour d'Argelès-sur-Mer, la ville cherchée. » */
  aroundSearched: (name: string) => `Autour ${elide(name)}, la ville cherchée.`,
  /** « Voir les 3 lieux « laveuse » » / « Voir le lieu « laveuse » ». */
  showMatches: (n: number, q: string) => (n > 1 ? `Voir les ${n} lieux « ${q} »` : `Voir le lieu « ${q} »`),
  /** « 2 lieux ici » : la feuille d'une pastille de lieux à la même adresse. */
  groupHere: (n: number) => `${n} lieux ici`,
  groupSame: (title: string) => `Même adresse : ${title}`,
  groupAria: (n: number, stacked: boolean) => `${n} lieux : ${stacked ? "voir la liste" : "zoomer"}`,
  /** La plaque du compteur : « 23 stations · 9 lavages dans la zone », selon le filtre et le texte. */
  zoneCount: (fuel: number, wash: number, text: string, kinds: { fuel: boolean; wash: boolean }) => {
    const parts: string[] = [];
    if (kinds.fuel && (fuel || !text)) parts.push(`${fuel} station${fuel > 1 ? "s" : ""}`);
    if (kinds.wash && (wash || !text)) parts.push(`${wash} lavage${wash > 1 ? "s" : ""}`);
    if (!fuel && !wash) return text ? `Aucun lieu « ${text} » dans la zone` : "Aucun lieu dans la zone";
    return `${parts.join(" · ")}${text ? ` « ${text} »` : ""} dans la zone`;
  },
} as const;

/** Typographie française : espace insécable après « et avant », avant « : ; ? ! ». (La maquette l'applique à chaque phrase affichée.) */
export const practicalNb = (text: string): string =>
  text
    .replace(/« /g, "«\u00a0")
    .replace(/ »/g, "\u00a0»")
    .replace(/ ([:;?!])/g, "\u00a0$1");
