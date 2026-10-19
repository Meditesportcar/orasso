// Accueil complet (lot 30, ARCHITECTURE-SUITE § 13.3) : widgets réglables, suggestions autour de moi, lavage et carburant
// les plus proches, garage favori, emplacement sponsorisé. Types et réglages partagés entre l'API, le site et l'appli.
import type { ArrivalSlot } from "./rules/arrival";
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
/**
 * Stations gardées en cache par département (tout le département, pas un cercle autour de son centre : à Perpignan, à
 * 33 km du centre des Pyrénées-Orientales, on ne trouverait sinon aucune station). Le tri par la position de la
 * personne se fait à la réponse ; seules les `HOME_PLACES_LIMIT` plus proches sortent.
 */
export const PLACES_CACHE_LIMIT = 800;

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

// --- Accueil par profil (lot 43, prototype DA v2 `s-home`) ----------------------------------------------------------

/**
 * Le profil dont l'accueil est demandé (`?persona=` de `GET /me/home`, casquette active de l'appli) : l'exposant (`fan`),
 * le visiteur, le pro, le prestataire, le média. L'organisateur et l'administrateur n'ont pas cet accueil (Direct, lot
 * 52) : ils reçoivent celui de l'exposant, sans blocs de profil.
 */
export const homeProfiles = ["exhibitor", "visitor", "pro", "provider", "media"] as const;
export type HomeProfile = (typeof homeProfiles)[number];

/** Casquette → accueil. Sans casquette (ancien client, site) : l'accueil de l'exposant. */
export function homeProfileOf(persona: string | undefined): HomeProfile {
  switch (persona) {
    case "visitor":
      return "visitor";
    case "pro":
      return "pro";
    case "provider":
      return "provider";
    case "media":
      return "media";
    default:
      return "exhibitor";
  }
}

/** Structure organisatrice telle que l'accueil l'affiche : logo, nom, pastille « Structure validée ». */
export type HomeOrganizer = { name: string; logoUrl: string | null; verified: boolean };

/** Le prochain accès de l'exposant : la candidature, plus l'arrivée, l'organisateur et l'affiche de l'événement. */
export type HomeNextAccess = MyApplication & {
  arrival: ArrivalSlot | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
};

/** Visiteur : son prochain billet valable, avec le créneau d'arrivée du public. */
export type HomeNextTicket = {
  id: string;
  name: string;
  event: { slug: string; title: string; startsAt: string; endsAt: string; city: string | null };
  arrival: ArrivalSlot | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
};

export type HomeProScan = { grade: string; percent: number; usedAt: string };
export type HomeProEvent = {
  event: Pick<EventCard, "id" | "slug" | "title" | "startsAt" | "city" | "posterUrl">;
  /** Mes abonnés qui y sont retenus (« N de tes clients y vont »). */
  clientsGoing: number;
};

/** Pro : remises et vues de la semaine, événements proches, passionnés du coin, derniers scans. */
export type HomePro = {
  slug: string;
  name: string;
  discountsThisWeek: number;
  profileViews: number;
  nearbyEventsWithClients: HomeProEvent[];
  /** Passionnés inscrits dans le département de la fiche (la position des personnes n'est jamais gardée). */
  fansNearby: number;
  /** Personnes qui t'ont mis en garage favori. */
  favoritedBy: number;
  lastScans: HomeProScan[];
};

/** Prestataire : sa prochaine mission (emplacement, arrivée, message de l'organisateur) et les missions proches. */
export type HomeProviderMission = {
  applicationId: string;
  status: "accepted" | "pending" | "waitlisted" | "offered";
  event: { id: string; slug: string; title: string; startsAt: string; city: string | null };
  trade: string | null;
  spotLabel: string | null;
  installAt: string | null;
  /** Message de l'organisateur (note d'emplacement). */
  organizerMessage: string | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
};
export type HomeNearbyMission = {
  slug: string;
  title: string;
  startsAt: string;
  city: string | null;
  distanceKm: number | null;
  structureName: string;
};
export type HomeProvider = {
  nextMission: HomeProviderMission | null;
  nearbyMissions: HomeNearbyMission[];
};

/** Média : son prochain reportage (accrédité ou en attente), son badge, les consignes, à couvrir, ses contenus. */
export type HomeMediaReport = {
  applicationId: string;
  status: "accepted" | "pending" | "waitlisted" | "offered";
  event: { id: string; slug: string; title: string; startsAt: string; city: string | null };
  formats: string[];
  briefing: { zones: string | null; instructions: string | null; contact: string | null } | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
};
export type HomeMedia = {
  name: string;
  logoUrl: string | null;
  nextReport: HomeMediaReport | null;
  /** Événements gardés dans « Mon agenda », à venir. */
  toCover: { slug: string; title: string; startsAt: string; city: string | null }[];
  contents: { id: string; title: string; eventTitle: string; views: number }[];
};

export type HomeData = {
  /** Lot 43 : le profil de cet accueil (`?persona=`). */
  profile: HomeProfile;
  nextAccess: HomeNextAccess | null;
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
  /** Lot 43 : blocs propres au profil (`null` pour les autres profils, ou tant que la donnée n'existe pas). */
  nextTicket: HomeNextTicket | null;
  pro: HomePro | null;
  provider: HomeProvider | null;
  media: HomeMedia | null;
  /** Lot 49 : tampons de la saison dans le passeport. */
  stampsThisSeason: number | null;
};
