// Accueil complet (lot 30, ARCHITECTURE-SUITE § 13.3) : widgets réglables, suggestions autour de moi, lavage et carburant
// les plus proches, garage favori, emplacement sponsorisé. Types et réglages partagés entre l'API, le site et l'appli.
import type { MyApplication } from "./schemas/application";
import type { EventCard } from "./schemas/event";
import type { ProCard } from "./schemas/pro";
import type { MyWeather } from "./weather";

/** Widgets de l'accueil dans l'ordre par défaut (docs/02) ; « Prochain accès » reste toujours en tête. */
export const homeWidgetIds = [
  "next_access",
  "pending",
  "nearby",
  "weather",
  "agenda",
  "favorite_garage",
  "wash",
  "fuel",
] as const;
export type HomeWidgetId = (typeof homeWidgetIds)[number];

/** Le seul widget qui ne se déplace ni ne se masque : il porte le néon moutarde de l'écran. */
export const HOME_FIXED_WIDGET: HomeWidgetId = "next_access";

/** Réglage enregistré dans `profiles.home_widgets`. */
export type HomeWidgetsConfig = { order: HomeWidgetId[]; hidden: HomeWidgetId[] };

export const defaultHomeWidgets: HomeWidgetsConfig = { order: [...homeWidgetIds], hidden: [] };

const isWidgetId = (v: unknown): v is HomeWidgetId =>
  typeof v === "string" && homeWidgetIds.includes(v as HomeWidgetId);

/**
 * Réglage valable à partir de n'importe quelle valeur enregistrée : identifiants inconnus ou en double retirés, widgets
 * manquants ajoutés à la fin (un widget ajouté plus tard apparaît sans réglage), « Prochain accès » en tête et jamais
 * masqué. Valeur illisible (ancien format, `null`) : l'ordre par défaut.
 */
export function normalizeHomeWidgets(raw: unknown): HomeWidgetsConfig {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawOrder = Array.isArray(obj.order) ? obj.order : [];
  const rawHidden = Array.isArray(obj.hidden) ? obj.hidden : [];
  const order: HomeWidgetId[] = [HOME_FIXED_WIDGET];
  for (const id of rawOrder) if (isWidgetId(id) && !order.includes(id)) order.push(id);
  for (const id of homeWidgetIds) if (!order.includes(id)) order.push(id);
  const hidden = homeWidgetIds.filter((id) => id !== HOME_FIXED_WIDGET && rawHidden.includes(id));
  return { order, hidden };
}

/** Widgets visibles, dans l'ordre réglé. */
export function visibleHomeWidgets(config: HomeWidgetsConfig): HomeWidgetId[] {
  return config.order.filter((id) => !config.hidden.includes(id));
}

/** Monte (`-1`) ou descend (`+1`) un widget ; « Prochain accès » reste en première place. */
export function moveHomeWidget(config: HomeWidgetsConfig, id: HomeWidgetId, delta: -1 | 1): HomeWidgetsConfig {
  const order = [...config.order];
  const from = order.indexOf(id);
  const to = from + delta;
  if (id === HOME_FIXED_WIDGET || from < 0 || to < 1 || to >= order.length) return config;
  [order[from], order[to]] = [order[to] as HomeWidgetId, order[from] as HomeWidgetId];
  return { order, hidden: config.hidden };
}

/** Masque ou affiche un widget. */
export function toggleHomeWidget(config: HomeWidgetsConfig, id: HomeWidgetId): HomeWidgetsConfig {
  if (id === HOME_FIXED_WIDGET) return config;
  const hidden = config.hidden.includes(id) ? config.hidden.filter((h) => h !== id) : [...config.hidden, id];
  return { order: config.order, hidden };
}

// --- Rayon et listes -------------------------------------------------------------------------------------------

/** Curseur de rayon des suggestions (même plage que le réglage `radiusKm` du profil). */
export const HOME_RADIUS = { min: 10, max: 300, step: 10, default: 50 } as const;
/** Événements affichés dans « Autour de moi ». */
export const HOME_NEARBY_LIMIT = 5;
/** Stations affichées pour le lavage et le carburant. */
export const HOME_PLACES_LIMIT = 3;
/** Stations gardées en cache par département (la liste affichée est triée selon la position de la personne). */
export const PLACES_CACHE_LIMIT = 10;
/** Rayon de recherche des stations autour du centre du département (km). */
export const WASH_SEARCH_KM = 25;
export const FUEL_SEARCH_KM = 20;

/**
 * Tarif d'un emplacement sponsorisé, à titre informatif (docs/01 : « tarif et fréquence restent à fixer »). Aucun
 * encaissement : les emplacements sont créés par l'administration. En centimes d'euro, par mois.
 */
export const SPONSORED_PRICE_CENTS = 4900;

// --- Données de l'accueil ----------------------------------------------------------------------------------------

export type FuelPrices = { sp95: number | null; sp98: number | null; gazole: number | null; e85: number | null };

/** Une station (lavage ou carburant) : données ouvertes, normalisées. */
export type NearbyPlace = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** Distance à vol d'oiseau jusqu'à ma position (secteur ou position envoyée pour cette requête), en km. */
  distanceKm: number;
};
export type FuelStation = NearbyPlace & { prices: FuelPrices; updatedAt: string | null };

/** Cache d'une source externe (pas de distance : elle dépend de la position de chaque personne). */
export type CachedPlace = Omit<NearbyPlace, "distanceKm">;
export type CachedFuelStation = CachedPlace & { prices: FuelPrices; updatedAt: string | null };

export type HomeNudgeKind = "add_vehicle" | "create_crew" | "enable_2fa" | "verify_email";
/** Une seule incitation à la fois : la première qui s'applique, dans l'ordre ci-dessous (la sécurité d'abord). */
export const homeNudgeOrder: HomeNudgeKind[] = ["verify_email", "enable_2fa", "add_vehicle", "create_crew"];

export type HomeFavoriteGarage = Pick<
  ProCard,
  "slug" | "name" | "logoUrl" | "activities" | "city" | "department" | "lat" | "lng" | "verified"
> & { phone: string | null };

export type HomeSponsored = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string;
  pro: { slug: string; name: string; logoUrl: string | null };
};

export type HomeData = {
  nextAccess: MyApplication | null;
  pendingStatuses: MyApplication[];
  nearby: { radiusKm: number; source: "device" | "sector" | null; events: EventCard[] } | null;
  weather: MyWeather | null;
  favoriteGarage: HomeFavoriteGarage | null;
  wash: NearbyPlace[];
  fuel: FuelStation[];
  agenda: MyApplication[];
  /** Compteurs de l'en-tête : candidatures en attente et places retenues à venir. */
  counts: { pending: number; retained: number };
  nudge: HomeNudgeKind | null;
  sponsored: HomeSponsored | null;
  widgets: HomeWidgetsConfig;
};
