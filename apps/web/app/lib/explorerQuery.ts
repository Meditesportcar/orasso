// Réglages de l'Explorer du site (lot R2, parité avec l'appli : `apps/mobile/src/features/explorer/queries.ts` et
// `explorerChoice.ts`) → paramètres de l'API. Fonctions pures (testées). Les règles du lieu (« Où chercher ? ») sont
// celles de `@orasso/shared`; ici, seulement la lecture de l'adresse de la page et la traduction vers l'API.
import {
  addDays,
  clampKm,
  departments,
  type EventFormat,
  type ExplorerWhere,
  eventFormats,
  fromWallTime,
  type Grade,
  grades,
  type LatLng,
  type PeopleWhere,
  type ProActivity,
  type ProCard,
  proActivities,
  wallTime,
  whereQuery,
} from "@orasso/shared";

export type When = "all" | "weekend" | "month";
export const WHENS: readonly When[] = ["all", "weekend", "month"];

export const EVENT_SORTS = ["date", "distance", "recent", "seats"] as const;
export type EventSort = (typeof EVENT_SORTS)[number];
export const PRO_SORTS = ["distance", "name"] as const;
export type ProSort = (typeof PRO_SORTS)[number];
export const PEOPLE_SHOWS = ["all", "people", "crews"] as const;
export type PeopleShow = (typeof PEOPLE_SHOWS)[number];
/** Personnes et crews : des départements seulement, jamais de position ni de distance (docs/01). */
export type { PeopleWhere };

const isDepartment = (code: string) => (departments as readonly string[]).includes(code);

/** Anciennes valeurs de `tri` (avant le lot R2), toujours comprises. */
const SORT_ALIASES: Record<string, string> = { nouveautes: "recent", places: "seats", nom: "name" };

export function parseEventSort(raw: string): EventSort {
  const v = SORT_ALIASES[raw] ?? raw;
  return (EVENT_SORTS as readonly string[]).includes(v) ? (v as EventSort) : "date";
}

export function parseProSort(raw: string): ProSort {
  const v = SORT_ALIASES[raw] ?? raw;
  return (PRO_SORTS as readonly string[]).includes(v) ? (v as ProSort) : "distance";
}

/**
 * Le lieu choisi dans l'adresse (`autour` : `moi` avec `rayon`, `coin`, `partout`, `ailleurs` avec `ailleurs=<code>`, ou
 * directement un département), `null` si rien n'est choisi (réglages habituels). Jamais de coordonnées dans le résultat.
 */
export function parseChosenWhere(get: (name: string) => string): ExplorerWhere | null {
  const autour = get("autour");
  if (autour === "moi") {
    const raw = get("rayon");
    return { kind: "me", km: clampKm(raw === "" ? Number.NaN : Number(raw)) };
  }
  if (autour === "coin") return { kind: "mine" };
  if (autour === "partout") return { kind: "all" };
  if (autour === "ailleurs") return isDepartment(get("ailleurs")) ? { kind: "dept", code: get("ailleurs") } : null;
  return isDepartment(autour) ? { kind: "dept", code: autour } : null;
}

/**
 * Le lieu de Personnes et crews choisi dans l'adresse (`lieu` : `coin`, `partout`, `ailleurs` avec `ailleurs=<code>`, ou
 * directement un département), `null` si rien n'est choisi : les suggestions viennent de mon coin et une recherche s'élargit
 * d'elle-même à toute la France (lot R2, tour 2).
 */
export function parsePeopleWhere(lieu: string, ailleurs = ""): PeopleWhere | null {
  if (lieu === "coin") return { kind: "mine" };
  if (lieu === "partout") return { kind: "all" };
  if (lieu === "ailleurs") return isDepartment(ailleurs) ? { kind: "dept", code: ailleurs } : null;
  if (isDepartment(lieu)) return { kind: "dept", code: lieu };
  return null;
}

/** Message d'une lecture de l'API en échec (`null` : la lecture a réussi, ou n'a pas eu lieu). 429 et 503 ont leur texte. */
export const RATE_LIMITED = "Trop de demandes en peu de temps. Réessaie dans un instant.";
export const UNAVAILABLE = "Le service est momentanément indisponible.";
type Outcome = { ok: true } | { ok: false; status: number; error?: { message?: string } } | null | undefined;
export function failureMessage(res: Outcome): string | null {
  if (!res || res.ok) return null;
  if (res.status === 429) return RATE_LIMITED;
  if (res.status === 503) return UNAVAILABLE;
  return res.error?.message || UNAVAILABLE;
}

/** Le premier message d'échec d'une série de lectures : une erreur n'est jamais présentée comme une liste vide. */
export const firstFailure = (...results: Outcome[]): string | null => {
  for (const r of results) {
    const m = failureMessage(r);
    if (m) return m;
  }
  return null;
};

export function parseWhen(raw: string): When {
  return (WHENS as readonly string[]).includes(raw) ? (raw as When) : "all";
}

export function parseShow(raw: string): PeopleShow {
  return raw === "people" || raw === "crews" ? raw : "all";
}

export function parseJob(raw: string): ProActivity | "" {
  return (proActivities as readonly string[]).includes(raw) ? (raw as ProActivity) : "";
}

export function parseGrade(raw: string): Grade | "" {
  return (grades as readonly string[]).includes(raw) ? (raw as Grade) : "";
}

/**
 * Les types de « Tes préférences » qui filtrent vraiment : ni vides ni tous cochés (comme `preferenceFilterCount`).
 */
export function preferredFormats(formats: readonly EventFormat[] | null | undefined): EventFormat[] {
  return formats && formats.length > 0 && formats.length < eventFormats.length ? [...formats] : [];
}

export type EventFilters = {
  format: EventFormat | "";
  formats: EventFormat[];
  when: When;
  /** « Mes affinités » : l'ordre par affinités au lieu du tri choisi. */
  affinity: boolean;
  /** « Structures suivies » : seulement leurs événements. */
  followed: boolean;
};

/** Nombre de filtres actifs (nombre moutarde de la pastille « Filtres »). */
export function activeFilters(f: EventFilters): number {
  return (
    (f.format ? 1 : 0) +
    (f.formats.length > 0 ? 1 : 0) +
    (f.when !== "all" ? 1 : 0) +
    (f.affinity ? 1 : 0) +
    (f.followed ? 1 : 0)
  );
}

/**
 * Période du filtre « Quand », heure de Paris : ce week-end (samedi 0 h → dimanche 23 h 59, celui en cours le samedi et le
 * dimanche), ce mois-ci (maintenant → dernier jour du mois, 23 h 59). `{}` : toutes dates. (Même règle que l'appli.)
 */
export function whenRange(when: When, now: Date): { from?: string; to?: string } {
  if (when === "all") return {};
  const today = { ...wallTime(now), hour: 0, minute: 0 };
  if (when === "month") {
    const firstNext =
      today.month === 12
        ? { ...today, year: today.year + 1, month: 1, day: 1 }
        : { ...today, month: today.month + 1, day: 1 };
    const last = addDays(firstNext, -1);
    return { from: now.toISOString(), to: fromWallTime({ ...last, hour: 23, minute: 59 }).toISOString() };
  }
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const saturday = weekday === 6 ? today : weekday === 0 ? addDays(today, -1) : addDays(today, 6 - weekday);
  const sunday = addDays(saturday, 1);
  return {
    from: fromWallTime(saturday).toISOString(),
    to: fromWallTime({ ...sunday, hour: 23, minute: 59 }).toISOString(),
  };
}

type Params = Record<string, string | number | undefined>;

function clean(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") out.set(key, String(value));
  return out;
}

export type ExplorerPlace = { where: ExplorerWhere; coin: readonly string[] };

/** Paramètres de `GET /events` (liste : première page avec le nombre en tout ; carte : 100 au plus). */
export function eventsParams(opts: {
  q: string;
  filters: EventFilters;
  sort: EventSort;
  place: ExplorerPlace;
  position: LatLng | null;
  now: Date;
  mode: "list" | "map";
  limit: number;
  cursor?: string;
}): URLSearchParams {
  const { filters: f, place } = opts;
  return clean({
    q: opts.q.trim() || undefined,
    format: f.format || undefined,
    formats: !f.format && f.formats.length ? f.formats.join(",") : undefined,
    ...whenRange(f.when, opts.now),
    sort: f.affinity ? "affinity" : opts.sort,
    followed: f.followed ? "1" : undefined,
    ...whereQuery(place.where, opts.position, place.coin),
    limit: opts.limit,
    withTotal: opts.mode === "list" && !opts.cursor ? "1" : undefined,
    cursor: opts.cursor,
  });
}

/** Paramètres de `GET /pros` (`forCounts` : ceux de `GET /pros/activities`, sans le métier ni la page). */
export function prosParams(opts: {
  q: string;
  job: ProActivity | "";
  sort: ProSort;
  place: ExplorerPlace;
  position: LatLng | null;
  mode: "list" | "map";
  limit: number;
  cursor?: string;
  forCounts?: boolean;
}): URLSearchParams {
  const { everywhere: _all, around: _around, ...where } = whereQuery(opts.place.where, opts.position, opts.place.coin);
  if (opts.forCounts) return clean({ q: opts.q.trim() || undefined, sort: opts.sort, ...where });
  return clean({
    q: opts.q.trim() || undefined,
    activity: opts.job || undefined,
    sort: opts.sort,
    ...where,
    limit: opts.limit,
    withTotal: opts.mode === "list" && !opts.cursor ? "1" : undefined,
    cursor: opts.cursor,
  });
}

/** Un pro sans atelier (zone d'intervention seulement) : il se déplace. */
export const isMover = (p: Pick<ProCard, "lat" | "city" | "interventionDepartments">) =>
  p.lat === null && !p.city && p.interventionDepartments.length > 0;
