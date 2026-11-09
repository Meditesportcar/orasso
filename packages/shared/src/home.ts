// Accueil complet (lot 30, ARCHITECTURE-SUITE § 13.3) : widgets réglables, suggestions autour de moi, lavage et carburant
// les plus proches, garage favori, emplacement sponsorisé. Types et réglages partagés entre l'API, le site et l'appli.
import { BUSINESS_TIMEZONE } from "./enums";
import type { ArrivalSlot } from "./rules/arrival";
import type { MyApplication } from "./schemas/application";
import type { EventCard } from "./schemas/event";
import type { HomeMemoryBlock } from "./schemas/memories";
import type { HomeLive } from "./schemas/presence";
import type { ProCard } from "./schemas/pro";
import type { MyWeather } from "./weather";

/**
 * Widgets de l'accueil dans l'ordre par défaut ; « Prochaine sortie » (`next_access`) reste toujours en tête. Lot R7d1 :
 * « En cours » (événement en cours où j'ai une place) juste après. Lot R7a2 (maquette R7.4, décision D38) : Mes sorties,
 * Mon crew, Du nouveau chez tes potes, Au spot, Souvenirs ; `spot_meetup` et `memories` sont proposés mais vides tant que
 * les lots R7i (rendez-vous au spot) et R7j (souvenirs) n'existent pas.
 */
export const homeWidgetIds = [
  "next_access",
  "live",
  "my_outings",
  "my_crew",
  "friends_news",
  "spot_meetup",
  "memories",
  "nearby",
  "weather",
  "agenda",
  "favorite_garage",
  "pending",
  "wash",
  "fuel",
] as const;
export type HomeWidgetId = (typeof homeWidgetIds)[number];

/**
 * Lot R1 (décision de Damien du 24/10) : les stations de lavage et de carburant sont retirées pour l'instant. Elles
 * montraient les stations les plus proches de soi ; la fonction voulue est autre (les stations proches d'un événement)
 * et viendra plus tard. Tant que ce réglage vaut `false` : l'API ne les cherche plus (Overpass et prix des carburants
 * restent en place, sans appel), l'Explorer (appli et site), l'Accueil du site et ses réglages ne les montrent plus.
 */
export const NEARBY_STATIONS_ENABLED = false;

/** Les widgets des stations (lavage, carburant), coupés par `NEARBY_STATIONS_ENABLED`. */
export const stationWidgetIds = ["wash", "fuel"] as const satisfies readonly HomeWidgetId[];

/** Ce widget est-il proposé aujourd'hui ? (les stations sont retirées tant que `NEARBY_STATIONS_ENABLED` est faux) */
export function homeWidgetOffered(id: HomeWidgetId, stations = NEARBY_STATIONS_ENABLED): boolean {
  return stations || !(stationWidgetIds as readonly HomeWidgetId[]).includes(id);
}

/** Le seul widget qui ne se déplace ni ne se masque : il porte le néon moutarde de l'écran. */
export const HOME_FIXED_WIDGET: HomeWidgetId = "next_access";

/** Réglage enregistré dans `profiles.home_widgets`. */
export type HomeWidgetsConfig = { order: HomeWidgetId[]; hidden: HomeWidgetId[] };

/**
 * Lot R7a2 : les blocs par défaut sont ceux que Damien a validés (Prochaine sortie, Mes sorties, Mon crew, Du nouveau chez
 * tes potes, Au spot, Souvenirs, Autour de moi, Météo, plus « En cours » pendant un événement). Les trois autres
 * (Agenda, Garage favori, Candidatures en attente) restent proposés dans « Ajouter » ; « Mes sorties » dit déjà l'état de
 * chaque place.
 */
export const defaultHiddenHomeWidgets: readonly HomeWidgetId[] = ["agenda", "favorite_garage", "pending"];

export const defaultHomeWidgets: HomeWidgetsConfig = {
  order: [...homeWidgetIds],
  hidden: [...defaultHiddenHomeWidgets],
};

const isWidgetId = (v: unknown): v is HomeWidgetId =>
  typeof v === "string" && homeWidgetIds.includes(v as HomeWidgetId);

/**
 * Réglage valable à partir de n'importe quelle valeur enregistrée : identifiants inconnus ou en double retirés, widgets
 * manquants ajoutés à la fin (un widget ajouté plus tard apparaît sans réglage), « Prochain accès » en tête et jamais
 * masqué. Valeur illisible (ancien format, `null`) : l'ordre par défaut (`favoriteGarage` : le compte a un garage favori,
 * qui reste alors affiché par défaut).
 */
export function normalizeHomeWidgets(raw: unknown, opts: { favoriteGarage?: boolean } = {}): HomeWidgetsConfig {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawOrder = Array.isArray(obj.order) ? obj.order : [];
  // Pas de liste de blocs masqués (aucun réglage, ancien format) : les blocs masqués par défaut. Une liste enregistrée,
  // même vide, est respectée telle quelle.
  // Lot R7a2, tour 2 : un compte qui a un garage favori (donnée qu'il a choisie) le garde affiché par défaut.
  const rawHidden = Array.isArray(obj.hidden)
    ? obj.hidden
    : defaultHiddenHomeWidgets.filter((id) => !(opts.favoriteGarage && id === "favorite_garage"));
  const order: HomeWidgetId[] = [HOME_FIXED_WIDGET];
  for (const id of rawOrder) if (isWidgetId(id) && !order.includes(id)) order.push(id);
  // Un bloc qui manque au réglage enregistré (ajouté depuis) prend sa place de l'ordre par défaut : juste après le dernier
  // bloc qui le précède par défaut et que le réglage connaît (« En cours » sous « Prochaine sortie », « Mes sorties » avant
  // « Autour de moi »), jamais au bout de l'écran.
  for (const id of homeWidgetIds) {
    if (order.includes(id)) continue;
    const before = homeWidgetIds.slice(0, homeWidgetIds.indexOf(id)).filter((p) => order.includes(p));
    const last = before[before.length - 1];
    order.splice(last ? order.indexOf(last) + 1 : order.length, 0, id);
  }
  const hidden = homeWidgetIds.filter((id) => id !== HOME_FIXED_WIDGET && rawHidden.includes(id));
  return { order, hidden };
}

/** Widgets visibles, dans l'ordre réglé. */
export function visibleHomeWidgets(config: HomeWidgetsConfig): HomeWidgetId[] {
  return config.order.filter((id) => !config.hidden.includes(id));
}

/**
 * Monte (`-1`) ou descend (`+1`) un widget ; « Prochain accès » reste en première place. Lot R1, tour 2 : un widget ne
 * s'échange qu'avec son voisin proposé (`offered`) ; les widgets retirés pour l'instant (stations) gardent leur place dans
 * l'ordre enregistré, ils ne comptent pas (sinon descendre un widget l'échangerait avec une station invisible).
 */
export function moveHomeWidget(
  config: HomeWidgetsConfig,
  id: HomeWidgetId,
  delta: -1 | 1,
  offered: (id: HomeWidgetId) => boolean = (w) => homeWidgetOffered(w),
): HomeWidgetsConfig {
  const order = [...config.order];
  const from = order.indexOf(id);
  if (id === HOME_FIXED_WIDGET || from < 0 || !offered(id)) return config;
  let to = from + delta;
  while (to >= 1 && to < order.length && !offered(order[to] as HomeWidgetId)) to += delta;
  if (to < 1 || to >= order.length) return config;
  [order[from], order[to]] = [order[to] as HomeWidgetId, order[from] as HomeWidgetId];
  return { order, hidden: config.hidden };
}

/**
 * Lot R7a2 (écran « Personnaliser ») : monte (`-1`) ou descend (`+1`) un widget AFFICHÉ, d'un cran parmi les widgets affichés
 * (jamais en échangeant avec un widget masqué ou retiré, ce qui ne se verrait pas). « Prochaine sortie » reste en tête.
 */
export function moveVisibleHomeWidget(
  config: HomeWidgetsConfig,
  id: HomeWidgetId,
  delta: -1 | 1,
  offered: (id: HomeWidgetId) => boolean = (w) => homeWidgetOffered(w),
): HomeWidgetsConfig {
  if (id === HOME_FIXED_WIDGET) return config;
  const visible = config.order.filter((w) => !config.hidden.includes(w) && offered(w));
  const from = visible.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 1 || to >= visible.length) return config;
  const order = [...config.order];
  const a = order.indexOf(id);
  const b = order.indexOf(visible[to] as HomeWidgetId);
  [order[a], order[b]] = [order[b] as HomeWidgetId, order[a] as HomeWidgetId];
  return { order, hidden: config.hidden };
}

/** Lot R7a2 (« Ajouter ») : affiche un widget masqué, à la fin des widgets affichés (il ne surgit pas au milieu de l'écran). */
export function addHomeWidget(
  config: HomeWidgetsConfig,
  id: HomeWidgetId,
  offered: (id: HomeWidgetId) => boolean = (w) => homeWidgetOffered(w),
): HomeWidgetsConfig {
  if (id === HOME_FIXED_WIDGET || !config.hidden.includes(id)) return config;
  const hidden = config.hidden.filter((h) => h !== id);
  const rest = config.order.filter((w) => w !== id);
  const lastVisible = [...rest].reverse().find((w) => !hidden.includes(w) && offered(w));
  rest.splice(lastVisible ? rest.indexOf(lastVisible) + 1 : rest.length, 0, id);
  return { order: rest, hidden };
}

/** Masque ou affiche un widget. */
export function toggleHomeWidget(config: HomeWidgetsConfig, id: HomeWidgetId): HomeWidgetsConfig {
  if (id === HOME_FIXED_WIDGET) return config;
  const hidden = config.hidden.includes(id) ? config.hidden.filter((h) => h !== id) : [...config.hidden, id];
  return { order: config.order, hidden };
}

// --- Rayon et listes -------------------------------------------------------------------------------------------

/** Curseur de rayon des suggestions (même plage que le réglage `radiusKm` du profil). */
export const HOME_RADIUS = { min: 10, max: 200, step: 10, default: 50 } as const;
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

/** Où a lieu l'événement : pour Maps et Waze (les coordonnées d'abord, sinon l'adresse). */
export type HomeLocation = { lat: number | null; lng: number | null; addressLine: string | null; city: string | null };

/** Structure organisatrice telle que l'accueil l'affiche : logo, nom, pastille « Structure validée ». */
export type HomeOrganizer = { name: string; logoUrl: string | null; verified: boolean };

/** Le prochain accès de l'exposant : la candidature, plus l'arrivée, l'organisateur et l'affiche de l'événement. */
export type HomeNextAccess = MyApplication & {
  arrival: ArrivalSlot | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
  /** Lot C5 : la photo de la voiture de l'affiche, `null` sans photo. */
  photoUrl: string | null;
  location: HomeLocation | null;
};

/** Visiteur : son prochain billet valable, avec le créneau d'arrivée du public. */
export type HomeNextTicket = {
  id: string;
  name: string;
  /** Prix unitaire en centimes, `null` = gratuit. */
  priceCents: number | null;
  event: { slug: string; title: string; startsAt: string; endsAt: string; city: string | null };
  arrival: ArrivalSlot | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
  /** Lot C5 : la photo de la voiture de l'affiche, `null` sans photo. */
  photoUrl: string | null;
  location: HomeLocation | null;
};

export type HomeProScan = { grade: string; percent: number; usedAt: string };
export type HomeProEvent = {
  event: Pick<EventCard, "id" | "slug" | "title" | "startsAt" | "city" | "posterUrl" | "photoUrl">;
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
  event: { id: string; slug: string; title: string; startsAt: string; endsAt: string; city: string | null };
  trade: string | null;
  spotLabel: string | null;
  installAt: string | null;
  /** Message de l'organisateur (note d'emplacement). */
  organizerMessage: string | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
  /** Lot C5 : la photo de la voiture de l'affiche, `null` sans photo. */
  photoUrl: string | null;
  location: HomeLocation | null;
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
  event: { id: string; slug: string; title: string; startsAt: string; endsAt: string; city: string | null };
  formats: string[];
  briefing: { zones: string | null; instructions: string | null; contact: string | null } | null;
  organizer: HomeOrganizer | null;
  posterUrl: string | null;
  /** Lot C5 : la photo de la voiture de l'affiche, `null` sans photo. */
  photoUrl: string | null;
  location: HomeLocation | null;
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
  nearby: { radiusKm: number | null; source: "device" | "sector" | null; events: EventCard[] } | null;
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
  /** Lot R7d1 : le bloc « En cours » ; `null` sans événement en cours à moi, ou bloc masqué (alors il n'est pas calculé). */
  live: HomeLive | null;
  /** Lot R7a2 : blocs réglables ; `null` sans donnée, ou bloc masqué (alors il n'est pas calculé). */
  myOutings: HomeMyOutings | null;
  myCrew: HomeMyCrew | null;
  friendsNews: HomeFriendsNews | null;
  /** `spotMeetup` : réservé à R7i, `null` d'ici là. `memories` (R7j) : les souvenirs du jour, `null` hors de ces jours. */
  spotMeetup: HomeSpotMeetup | null;
  memories: HomeMemory | null;
};

// --- Lot R7a2 : blocs de l'Accueil « tableau de bord » (maquette R7.4) -------------------------------------------------

/** Une place dans « Mes sorties » : une candidature (retenue, en attente, liste d'attente) ou un billet. */
export type HomeOuting = {
  /** `app-<id>` ou `ticket-<id>`. */
  key: string;
  kind: "application" | "ticket";
  /** Identifiant de la candidature (QR : `/jour-j/<id>`) ou du billet (`/billet/<id>`). */
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  city: string | null;
  /** Statut de la candidature ; un billet est `ticket`. */
  status: MyApplication["status"] | "ticket";
  waitlistRank: number | null;
  /** Entré sur place (candidature pointée, billet utilisé). */
  checkedIn: boolean;
  /** La place (ou la journée) a commencé et n'est pas finie. */
  ongoing: boolean;
  /** Véhicules des candidatures à cet événement (une ligne par événement, tour 2), chacun avec son propre statut (tour 3). */
  vehicles: HomeOutingPart<{ label: string }>[];
  /** Journées auxquelles la personne est inscrite (événement sur plusieurs jours) ; vide sinon. Date locale `AAAA-MM-JJ`. */
  days: HomeOutingPart<{ date: string; startsAt: string; endsAt: string }>[];
};
/** Un véhicule ou une journée d'une ligne « Mes sorties », avec le statut de SA place (tour 3). */
export type HomeOutingPart<T> = T & { status: HomeOuting["status"] };
const OUTING_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: BUSINESS_TIMEZONE });

const OUTING_STATUS_WORD: Partial<Record<HomeOuting["status"], string>> = {
  accepted: "retenue",
  pending: "en attente",
  waitlisted: "liste d'attente",
  offered: "place libérée",
  ticket: "billet",
};

/**
 * La ligne de détail d'une sortie : ses véhicules, puis ses journées (« jeu 12 · ven 13 ») ; vide s'il n'y a ni l'un ni l'autre.
 * Un véhicule ou une journée dont le statut diffère de celui de la ligne porte le sien : « 911 · Golf (en attente) ».
 */
export function outingDetail(o: Pick<HomeOuting, "vehicles" | "days" | "status">): string {
  const own = (status: HomeOuting["status"]) =>
    status === o.status ? "" : ` (${OUTING_STATUS_WORD[status] ?? status})`;
  const vehicles = (o.vehicles ?? []).map((v) => `${v.label}${own(v.status)}`);
  const days = (o.days ?? []).map(
    (d) => `${OUTING_DAY.format(new Date(d.startsAt)).replace(/\./g, "")}${own(d.status)}`,
  );
  return [...vehicles, ...(days.length ? [days.join(" · ")] : [])].join(" · ");
}

/** « Mes sorties » : les 3 prochaines places, et leur nombre total pour « Tout voir ». */
export type HomeMyOutings = { items: HomeOuting[]; total: number };

/** « Mon crew » : le crew le plus récemment actif de la personne (raccourci vers l'onglet Crew). */
export type HomeMyCrew = {
  crew: { slug: string; name: string; logoUrl: string | null; membersCount: number };
  /** Messages non lus de la Discussion du crew. */
  unread: number;
  /** La Discussion du crew (`null` si elle n'existe pas encore). */
  conversationId: string | null;
  /** Dernière publication du fil du crew : le texte, ou « photo » sans texte (jamais l'image elle-même ici). */
  lastPost: {
    author: { pseudo: string; avatarUrl: string | null };
    text: string | null;
    hasPhoto: boolean;
    createdAt: string;
    replies: number;
  } | null;
  /** Prochaine sortie du crew (non annulée, à venir). */
  nextOuting: { id: string; title: string; startsAt: string; place: string; going: number } | null;
};

/** Ce que touche une nouveauté des potes (l'appli et le site en font leur lien). */
export type HomeFriendTarget =
  | { type: "event"; slug: string }
  | { type: "vehicle"; id: string }
  | { type: "story"; authorKey: string };
/** Une nouveauté d'une personne que je suis (Journal social) : « Kenji_66 va au Rassemblement… ». */
export type HomeFriendNews = {
  id: string;
  kind: "going" | "new_vehicle" | "story";
  actor: { pseudo: string; avatarUrl: string | null };
  /** La phrase, pseudo compris (« Kenji_66 va au Rassemblement de Narbonne »). */
  text: string;
  /** Une précision (la date de l'événement), ou `null`. */
  caption: string | null;
  at: string;
  target: HomeFriendTarget | null;
};
/** « Du nouveau chez tes potes » : 3 nouveautés au plus, la suite est dans Le Fil. */
export type HomeFriendsNews = { items: HomeFriendNews[] };
export const HOME_FRIENDS_NEWS_LIMIT = 3;
export const HOME_OUTINGS_LIMIT = 3;

/** Rendez-vous au spot (lot R7i) : vide tant que ce lot n'existe pas (le bloc ne s'affiche que s'il y a quelque chose). */
export type HomeSpotMeetup = never;
/** Souvenirs du jour (lot R7j) : au moins un, sinon `memories` vaut `null` et le bloc ne s'affiche pas. */
export type HomeMemory = HomeMemoryBlock;
