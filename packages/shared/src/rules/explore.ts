// Règles de la liste de l'Explorer (lot R1, retours de Damien du 24/10), communes à l'API, au site et à l'appli.
// Lot R2 (maquette « Explorer R2 » validée le 24/10) : « Où chercher ? » (un seul lieu, commun aux Événements et aux
// Pros), les dates en clair de la carte et sa frise.
import { addDays, type WallTime, wallTime } from "./time";

/**
 * Un événement terminé (sa fin est passée ; plusieurs jours : la fin du dernier jour, que porte `endsAt`) ne se montre
 * plus dans l'Explorer : ni dans la liste, ni sur la carte. Il reste dans « passés » (`scope=past`) et sur sa fiche.
 */
export function isEventOver(event: { endsAt: string | Date }, now: Date): boolean {
  const end = event.endsAt instanceof Date ? event.endsAt.getTime() : Date.parse(event.endsAt);
  return Number.isFinite(end) && end < now.getTime();
}

/** Les événements pas encore terminés, dans le même ordre (une liste lue du cache peut dater d'hier). */
export function notOver<T extends { endsAt: string | Date }>(items: readonly T[], now: Date): T[] {
  return items.filter((e) => !isEventOver(e, now));
}

/**
 * Borne basse de la fin des événements « à venir » : le début de la période demandée, jamais avant maintenant. Le
 * filtre « Ce week-end » commence le samedi à 0 h : le dimanche, il ne remonte pas les événements finis la veille.
 */
export function upcomingEndBound(from: Date | undefined, now: Date): Date {
  return from && from.getTime() > now.getTime() ? from : now;
}

// --- Lot R2 : « Où chercher ? » ------------------------------------------------------------------------------------

/**
 * Le lieu de l'Explorer : autour de ma position (avec une distance), mon coin (mes départements, entiers), un autre
 * département (« Ailleurs »), ou partout en France. Les coordonnées ne sont jamais gardées : « Autour de moi » est un mode.
 */
export type ExplorerWhere =
  | { kind: "me"; km: number }
  | { kind: "mine" }
  | { kind: "dept"; code: string }
  | { kind: "all" };

/** Le curseur de distance de « Autour de moi » (maquette R2.2 : 10 à 200 km, par pas de 5). */
export const WHERE_KM = { min: 10, max: 200, step: 5, fallback: 100 } as const;

/** Une distance ramenée sur le curseur. */
export function clampKm(km: number): number {
  if (!Number.isFinite(km)) return WHERE_KM.fallback;
  const stepped = Math.round(km / WHERE_KM.step) * WHERE_KM.step;
  return Math.min(WHERE_KM.max, Math.max(WHERE_KM.min, stepped));
}

/**
 * Les réglages habituels (« Tes préférences ») : la distance habituelle autour de ma position si elle est activée, sinon
 * mon coin ; « partout en France » si c'est la distance habituelle (`radiusKm: null`) ou s'il n'y a pas de coin.
 */
export function habitualWhere(
  prefs: { radiusKm: number | null } | null,
  positionOn: boolean,
  hasCoin: boolean,
): ExplorerWhere {
  if (prefs && prefs.radiusKm === null) return { kind: "all" };
  if (positionOn) return { kind: "me", km: clampKm(prefs?.radiusKm ?? WHERE_KM.fallback) };
  return hasCoin ? { kind: "mine" } : { kind: "all" };
}

/**
 * Le lieu vraiment utilisé : le choix fait (sinon les réglages habituels). « Autour de moi » sans position (refusée, pas
 * encore lue) retombe sur mon coin ; mon coin sans département, sur partout en France. Lot R1 : une recherche par texte
 * cherche partout tant que le lieu n'a pas été choisi (les préférences cadrent la découverte, jamais une recherche).
 */
export function effectiveWhere(
  chosen: ExplorerWhere | null,
  habitual: ExplorerWhere,
  opts: { positionOn: boolean; hasCoin: boolean; searching: boolean },
): ExplorerWhere {
  if (!chosen && opts.searching) return { kind: "all" };
  const want = chosen ?? habitual;
  if (want.kind === "me" && !opts.positionOn) return opts.hasCoin ? { kind: "mine" } : { kind: "all" };
  if (want.kind === "mine" && !opts.hasCoin) return { kind: "all" };
  return want;
}

export function sameWhere(a: ExplorerWhere, b: ExplorerWhere): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "me" && b.kind === "me") return a.km === b.km;
  if (a.kind === "dept" && b.kind === "dept") return a.code === b.code;
  return true;
}

/** Une valeur gardée (cookie, appareil) → un lieu valide, sinon `null` (pas de choix). Jamais de coordonnées. */
export function readWhere(raw: unknown, isDepartment: (code: string) => boolean): ExplorerWhere | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (v.kind === "me") return { kind: "me", km: clampKm(typeof v.km === "number" ? v.km : WHERE_KM.fallback) };
  if (v.kind === "mine") return { kind: "mine" };
  if (v.kind === "all") return { kind: "all" };
  if (v.kind === "dept" && typeof v.code === "string" && isDepartment(v.code)) return { kind: "dept", code: v.code };
  return null;
}

/**
 * Les paramètres de l'API pour ce lieu (événements et pros) : la position et le rayon (autour de moi), les départements
 * (mon coin, ailleurs) ou aucune limite (partout). `coin` : mes départements.
 */
export function whereQuery(
  where: ExplorerWhere,
  position: { lat: number; lng: number } | null,
  coin: readonly string[],
): { lat?: number; lng?: number; radiusKm?: number; departments?: string; around?: string; everywhere?: "1" } {
  if (where.kind === "me" && position) return { lat: position.lat, lng: position.lng, radiusKm: where.km };
  if (where.kind === "mine" && coin.length) return { departments: coin.join(",") };
  if (where.kind === "dept") return { departments: where.code, around: where.code };
  return { everywhere: "1", ...(position ? { lat: position.lat, lng: position.lng } : {}) };
}

/** Temps de route indicatif sous le curseur (« ≈ 1,4 h de route ») : 45 min pour 60 km, puis 70 km/h. */
export function roadTime(km: number): string {
  if (km < 80) return `≈ ${Math.round(km * 0.75)} min de route`;
  return `≈ ${(Math.round((km / 70) * 10) / 10).toString().replace(".", ",")} h de route`;
}

// --- Lot R2 : les dates de la carte -----------------------------------------------------------------------------

const WEEKDAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."] as const;
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

const keyOf = (w: Pick<WallTime, "year" | "month" | "day">) =>
  `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;

/** Le jour d'un événement, heure de Paris : « 2026-11-01 ». */
export function dayKey(iso: string | Date, timeZone?: string): string {
  return keyOf(wallTime(typeof iso === "string" ? new Date(iso) : iso, timeZone));
}

/** Une date en clair (maquette R2.8) : « Aujourd'hui », « Demain », sinon « Dim. 1 nov. ». */
export function dayLabel(iso: string | Date, now: Date, timeZone?: string): string {
  const w = wallTime(typeof iso === "string" ? new Date(iso) : iso, timeZone);
  const today = { ...wallTime(now, timeZone), hour: 0, minute: 0 };
  const key = keyOf(w);
  if (key === keyOf(today)) return "Aujourd'hui";
  if (key === keyOf(addDays(today, 1))) return "Demain";
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${w.day} ${MONTHS[w.month - 1]}`;
}

/**
 * Le moment montré d'un événement sur la carte : son début, ou maintenant s'il a déjà commencé (en cours, plusieurs
 * jours) : il se range alors dans « Aujourd'hui », pas au jour passé de son début.
 */
export function shownStart(iso: string | Date, now: Date): Date {
  const start = typeof iso === "string" ? new Date(iso) : iso;
  return start.getTime() < now.getTime() ? now : start;
}

export type DateStripDay = { key: string; label: string; count: number };

/**
 * La frise des dates de la carte (maquette R2.8) : un jour par date de début, dans l'ordre, avec le nombre d'événements.
 * Un événement déjà commencé (en cours, plusieurs jours) compte pour aujourd'hui (`shownStart`).
 */
export function dateStrip(
  events: readonly { startsAt: string | Date }[],
  now: Date,
  timeZone?: string,
): DateStripDay[] {
  const days = new Map<string, DateStripDay>();
  const sorted = [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  for (const e of sorted) {
    const at = shownStart(e.startsAt, now);
    const key = dayKey(at, timeZone);
    const day = days.get(key);
    if (day) day.count += 1;
    else days.set(key, { key, label: dayLabel(at, now, timeZone), count: 1 });
  }
  return [...days.values()];
}
