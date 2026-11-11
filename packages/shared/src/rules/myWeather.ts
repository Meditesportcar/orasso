// Lot R8m : règles pures de « Ma météo » (maquette R8.8). L'endroit où je suis ou ma ville, deux lieux au plus.
// `now` est toujours passé. La position d'une personne n'a de règle ici que pour être arrondie : la case à 0,1° est tout
// ce qui part vers le fournisseur et le cache (jamais une coordonnée plus fine).
import { z } from "zod";

import { departmentPrefectures } from "../prefectures";
import type {
  DailyForecast,
  HourlyForecast,
  MyWeatherPlace,
  PlaceWeather,
  StoredForecast,
  WeatherAt,
} from "../weather";
import { wallTime } from "./time";

/** Deux lieux au plus dans « Ma météo ». */
export const WEATHER_PLACES_MAX = 2;
/** Nombre d'heures du détail « Heure par heure ». */
export const WEATHER_NEXT_HOURS = 6;

const HOUR = 3_600_000;

export type WeatherCell = { lat: number; lng: number; key: string };

/** `+ 0` remplace un `-0` (une case juste sous l'équateur ou le méridien) par `0` : la clé reste stable. */
const tenth = (n: number) => Math.round(n * 10) / 10 + 0;
const hundredth = (n: number) => Math.round(n * 100) / 100 + 0;

/** La case de 0,1° (environ 11 km) d'une position, et sa clé de cache (« 42.7,2.9 »). */
export function weatherCell(p: { lat: number; lng: number }): WeatherCell {
  const lat = tenth(p.lat);
  const lng = tenth(p.lng);
  return { lat, lng, key: `${lat.toFixed(1)},${lng.toFixed(1)}` };
}

/** Un lieu choisi est arrondi à 0,01° (environ 1 km) : une ville, pas une adresse. */
export function roundPlace(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: hundredth(p.lat), lng: hundredth(p.lng) };
}

/** Boîtes de la France métropolitaine, de la Corse et de l'outre-mer du référentiel (971, 972, 973, 974, 976). */
const FRANCE_BOXES: { latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  { latMin: 41.2, latMax: 51.2, lngMin: -5.3, lngMax: 9.7 },
  { latMin: 14.3, latMax: 18.2, lngMin: -63.2, lngMax: -60.7 },
  { latMin: 2.0, latMax: 5.9, lngMin: -54.7, lngMax: -51.5 },
  { latMin: -21.5, latMax: -20.8, lngMin: 55.1, lngMax: 55.9 },
  { latMin: -13.1, latMax: -12.5, lngMin: 44.9, lngMax: 45.4 },
];

export function inFrance(p: { lat: number; lng: number }): boolean {
  return FRANCE_BOXES.some((b) => p.lat >= b.latMin && p.lat <= b.latMax && p.lng >= b.lngMin && p.lng <= b.lngMax);
}

const coordinate = (axis: "lat" | "lng") =>
  z
    .number({ message: "Coordonnée invalide" })
    .refine((n) => Number.isFinite(n), "Coordonnée invalide")
    .refine((n) => (axis === "lat" ? Math.abs(n) <= 90 : Math.abs(n) <= 180), "Coordonnée invalide");

/** Un lieu choisi : une ville (libellé de 1 à 80 caractères) dans la France du référentiel. */
export const weatherPlaceInput = z
  .object({
    label: z.string().trim().min(1, "Nom du lieu requis").max(80, "80 caractères au plus"),
    lat: coordinate("lat"),
    lng: coordinate("lng"),
  })
  .strict()
  .refine((p) => inFrance(p), { message: "Ce lieu est hors de France", path: ["lat"] });

/** `PUT /me/weather/places` : 0 à 2 lieux, qui remplacent tous les précédents. */
export const weatherPlacesInput = z
  .object({ places: z.array(weatherPlaceInput).max(WEATHER_PLACES_MAX, "Deux lieux au plus") })
  .strict();

/** `POST /weather/at` : la position, en corps de requête (jamais dans l'adresse). */
export const weatherAtInput = z
  .object({ lat: coordinate("lat"), lng: coordinate("lng") })
  .strict()
  .refine((p) => inFrance(p), { message: "Position hors de France", path: ["lat"] });

/** `GET /geo/cities?q=` : 2 caractères au moins, 80 au plus. */
export const citySearchQuery = z.object({ q: z.string().trim().min(2, "2 caractères au moins").max(80) });

export type SavedWeatherPlace = { slot: number; label: string; lat: number; lng: number };
export type WeatherPlaceToShow = SavedWeatherPlace & { source: "saved" | "default" };

/**
 * Les lieux à montrer, deux au plus : les lieux choisis (dans l'ordre des emplacements), sinon la préfecture du premier
 * département du profil (T10, `source: "default"`), sinon aucun.
 */
export function myWeatherPlaces(input: { saved: SavedWeatherPlace[]; departments: string[] }): WeatherPlaceToShow[] {
  const saved = [...input.saved].sort((a, b) => a.slot - b.slot).slice(0, WEATHER_PLACES_MAX);
  if (saved.length > 0) return saved.map((p) => ({ ...p, source: "saved" as const }));
  const code = input.departments[0];
  const prefecture = code ? departmentPrefectures[code] : undefined;
  if (!prefecture) return [];
  return [{ slot: 0, label: prefecture.city, lat: prefecture.lat, lng: prefecture.lng, source: "default" }];
}

/** Début de l'heure (UTC) qui contient `now`. */
const hourStart = (now: Date) => Math.floor(now.getTime() / HOUR) * HOUR;

/** L'heure en cours : celle qui contient `now`, `null` si la prévision ne la couvre pas. */
export function currentHour(hours: HourlyForecast[], now: Date): HourlyForecast | null {
  const start = hourStart(now);
  return hours.find((h) => Date.parse(h.time) === start) ?? null;
}

/** Les `count` heures qui suivent l'heure en cours (« 15 h … 20 h » à 14 h 20), dans l'ordre, sans trou. */
export function nextHours(hours: HourlyForecast[], now: Date, count = WEATHER_NEXT_HOURS): HourlyForecast[] {
  const start = hourStart(now);
  const out: HourlyForecast[] = [];
  for (let i = 1; i <= count; i++) {
    const found = hours.find((h) => Date.parse(h.time) === start + i * HOUR);
    if (!found) break;
    out.push(found);
  }
  return out;
}

/** La journée d'aujourd'hui (Paris) de la prévision, `null` si elle n'y est pas. */
export function todayForecast(days: DailyForecast[], now: Date): DailyForecast | null {
  const w = wallTime(now, "Europe/Paris");
  const today = `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
  return days.find((d) => d.date === today) ?? null;
}

/** Ce qu'une prévision gardée dit d'un lieu maintenant : aujourd'hui, l'heure en cours, les six suivantes ; `null` sans l'un d'eux. */
export function placeForecast(
  stored: StoredForecast,
  now: Date,
): { today: DailyForecast; now: HourlyForecast; hours: HourlyForecast[] } | null {
  const today = todayForecast(stored.days, now);
  const current = currentHour(stored.hours, now);
  if (!today || !current) return null;
  return { today, now: current, hours: nextHours(stored.hours, now) };
}

/** Une prévision de cache ne garde que ce qui sert : les jours et 48 heures à partir de l'heure d'avant. */
export function trimForecast(days: DailyForecast[], hours: HourlyForecast[], now: Date): StoredForecast {
  const from = hourStart(now) - HOUR;
  return { days, hours: hours.filter((h) => Date.parse(h.time) >= from).slice(0, 48) };
}

/** Points cardinaux de la direction du vent (degrés d'où il vient), en abrégé : « NO ». */
export function windCompass(deg: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return names[i] ?? "N";
}

// --- Ce que montrent l'Accueil et le détail (appli et site : une seule règle) -------------------------------------------

/** Une carte de « Ma météo » : la position donnée à l'instant, la ville par défaut, ou une ville choisie. */
export type WeatherCard = {
  key: string;
  kind: "position" | "city" | "saved";
  /** Emplacement enregistré (0 ou 1) d'une ville choisie, `null` pour la position et la ville par défaut. */
  slot: number | null;
  label: string;
  weather: PlaceWeather | null;
};

/**
 * Les cartes à montrer, deux au plus. La position donnée à l'instant (gardée en mémoire de l'écran, jamais enregistrée) prend
 * la place du premier lieu ; le second lieu choisi reste à côté.
 */
export function weatherCards(places: MyWeatherPlace[], at: WeatherAt | null): WeatherCard[] {
  const asCard = (p: MyWeatherPlace): WeatherCard => ({
    key: `${p.source}-${p.slot}`,
    kind: p.source === "saved" ? "saved" : "city",
    slot: p.source === "saved" ? p.slot : null,
    label: p.label,
    weather: p.weather,
  });
  if (!at) return places.slice(0, WEATHER_PLACES_MAX).map(asCard);
  const second = places.find((p) => p.source === "saved" && p.slot === 1);
  const first: WeatherCard = { key: "position", kind: "position", slot: null, label: at.label, weather: at.weather };
  return second ? [first, asCard(second)] : [first];
}

export type PlaceCoords = { label: string; lat: number; lng: number };

const coords = (p: MyWeatherPlace): PlaceCoords => ({ label: p.label, lat: p.lat, lng: p.lng });
const savedOf = (places: MyWeatherPlace[]): PlaceCoords[] =>
  places
    .filter((p) => p.source === "saved")
    .sort((a, b) => a.slot - b.slot)
    .map(coords);

/**
 * « Changer de lieu » sur une carte : la ville choisie prend sa place (la position et la ville par défaut sont remplacées
 * par le premier emplacement). Rend ce qu'il faut enregistrer (`PUT /me/weather/places`).
 */
export function placesAfterChange(
  places: MyWeatherPlace[],
  card: Pick<WeatherCard, "slot">,
  city: PlaceCoords,
): PlaceCoords[] {
  const saved = savedOf(places);
  const slot = card.slot ?? 0;
  const next = [...saved];
  next[Math.min(slot, next.length)] = city;
  return next.slice(0, WEATHER_PLACES_MAX);
}

/**
 * « Second lieu » : la ville s'ajoute après le premier lieu. Quand le premier lieu est la ville par défaut, elle est
 * enregistrée avec lui (sinon le second lieu prendrait sa place). Déjà deux lieux : rien ne change.
 */
export function placesAfterAdd(places: MyWeatherPlace[], city: PlaceCoords): PlaceCoords[] {
  const saved = savedOf(places);
  if (saved.length >= WEATHER_PLACES_MAX) return saved;
  if (saved.length === 0) {
    const fallback = places.find((p) => p.source === "default");
    return fallback ? [coords(fallback), city] : [city];
  }
  return [...saved, city];
}

/** « Retirer ce lieu » (un lieu choisi) : les autres restent, dans l'ordre. */
export function placesAfterRemove(places: MyWeatherPlace[], slot: number): PlaceCoords[] {
  return savedOf(places).filter((_, i) => i !== slot);
}
