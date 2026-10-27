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
