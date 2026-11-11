import type { WeatherCode } from "../weather";
import { keepUnits } from "./units.fr";

// Météo : libellés des conditions et des écrans (lot 28). Les phrases du rappel de la veille sont dans `rules/weather.ts`.

export const weatherCodeLabels: Record<WeatherCode, string> = {
  clear: "Ciel dégagé",
  partly_cloudy: "Éclaircies",
  cloudy: "Couvert",
  fog: "Brouillard",
  drizzle: "Bruine",
  rain: "Pluie",
  heavy_rain: "Fortes pluies",
  snow: "Neige",
  thunderstorm: "Orages",
  wind: "Vent fort",
};

export const weatherTexts = {
  // Lot R6-police : « jour J » ne se coupe jamais (espace insécable).
  upcomingTitle: keepUnits("Météo prévue sur place le jour J"),
  todayTitle: "Météo du jour",
  rain: "Pluie",
  wind: "Vent",
  suggestionTitle: "Météo annoncée mauvaise : passer en Incertain",
  suggestionBody:
    "La météo annoncée pour cet événement est mauvaise. Les inscrits seront prévenus du passage en Incertain.",
  suggestionAction: "Passer en Incertain",
  unavailable: "Météo indisponible pour le moment.",
} as const;

/**
 * Lot R8m (maquette R8.8, `meteoBlock` et `meteoDetail`) : « Ma météo ». Les phrases d'explication de la maquette (« Deux lieux
 * au plus. Toucher une carte… ») n'existent pas dans le produit, sauf `positionNote`.
 */
export const myWeatherTexts = {
  title: "Ma météo",
  useMyPosition: "Utiliser ma position",
  /** Sous « Utiliser ma position », dans « Changer de lieu ». */
  positionNote: "La position n'est jamais enregistrée. Sans elle, la météo est celle de ta ville.",
  detailTitle: "Ma météo",
  hourByHour: "Heure par heure",
  wind: "Vent",
  rain: "Pluie",
  changePlace: "Changer de lieu",
  secondPlace: "Second lieu",
  removePlace: "Retirer ce lieu",
  /** Compte sans département ni lieu choisi (T10) : l'invitation. */
  choosePlace: "Choisis ta ville",
  searchPlaceholder: "Chercher une ville",
  searchEmpty: "Aucune ville trouvée",
  searchHint: "Tape au moins deux lettres",
  searchFailed: "Recherche indisponible pour le moment",
  savedFailed: "Lieu non enregistré. Réessaie.",
  /** Libellé de repli quand la commune de la position n'est pas trouvée. */
  myPositionFallback: "Ma position",
  /** Même phrase que l'Accueil : la dernière météo connue reste affichée. */
  offline: "Hors ligne : voici ce que ton téléphone a gardé.",
  /** Le fournisseur ne répond pas : la carte garde le nom du lieu. */
  unavailable: "Météo indisponible pour le moment.",
  /** Source d'un lieu : « Perpignan · ma position », « Perpignan · ta ville » ; un lieu choisi n'a que son nom. */
  place: (label: string, source: "position" | "city" | "saved") =>
    source === "saved" ? label : `${label} · ${source === "position" ? "ma position" : "ta ville"}`,
  /** « Vent 18 km/h · pluie 5 % » ; sans probabilité (MET Norway) : « Vent 18 km/h ». */
  windRain: (windKmh: number, probability: number | null) =>
    keepUnits(
      probability === null
        ? `Vent ${Math.round(windKmh)} km/h`
        : `Vent ${Math.round(windKmh)} km/h · pluie ${Math.round(probability)} %`,
    ),
  /** « Ressenti 12° · vent 18 km/h · pluie 5 % » */
  detailLine: (feelsLike: number | undefined, windKmh: number, probability: number | null) =>
    keepUnits(
      [
        feelsLike === undefined ? null : `Ressenti ${Math.round(feelsLike)}°`,
        `vent ${Math.round(windKmh)} km/h`,
        probability === null ? null : `pluie ${Math.round(probability)} %`,
      ]
        .filter(Boolean)
        .join(" · "),
    ),
  /** « 18 km/h, rafales 30 » */
  windDetail: (windKmh: number, gustKmh: number | undefined) =>
    keepUnits(`${Math.round(windKmh)} km/h${gustKmh === undefined ? "" : `, rafales ${Math.round(gustKmh)}`}`),
  /** « 5 % » ; sans probabilité (MET Norway), rien. */
  rainDetail: (probability: number | null) => (probability === null ? "" : keepUnits(`${Math.round(probability)} %`)),
  rainAmount: (mm: number) => keepUnits(`${String(Math.round(mm * 10) / 10).replace(".", ",")} mm`),
  hourLabel: (hour: number) => keepUnits(`${hour} h`),
  aria: (label: string, sky: string, temp: number) => `Ma météo, ${label} : ${sky}, ${temp} degrés`,
} as const;
