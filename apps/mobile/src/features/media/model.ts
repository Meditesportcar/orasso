// Casquette Média (lot 55) : les règles d'affichage en fonctions pures (testées). Les règles métier (quota, date limite,
// profil complet, accrédité pour publier) sont dans l'API ; ici on ne fait que traduire ses réponses en écrans.
import {
  type ApplicationStatus,
  addDays,
  type EventAccreditationState,
  type EventFormat,
  eventFormatLabels,
  fromWallTime,
  mediaAppLabels as L,
  localDate,
  type MediaAgenda,
  type MediaContentView,
  type MediaEventBrief,
  mediaLabels,
  wallTime,
} from "@orasso/shared";

import type { ExploreEventsQuery } from "@/lib/api/explorer";

// --- Explorer : filtres -----------------------------------------------------------------------------------------------------

export type SearchFilters = {
  /** Code de région (`regions` de `geo.ts`), `""` : toute la France. */
  region: string;
  format: EventFormat | "";
  thisMonth: boolean;
  /** Par défaut vrai : c'est ce que le média cherche d'abord (prototype `s-agenda`). */
  openOnly: boolean;
};

export const defaultSearchFilters: SearchFilters = { region: "", format: "", thisMonth: false, openOnly: true };

/** Maintenant → dernier jour du mois, 23 h 59 (heure de Paris). */
export function monthRange(now: Date): { from: string; to: string } {
  const today = { ...wallTime(now), hour: 0, minute: 0 };
  const firstNext =
    today.month === 12
      ? { ...today, year: today.year + 1, month: 1, day: 1 }
      : { ...today, month: today.month + 1, day: 1 };
  const last = addDays(firstNext, -1);
  return { from: now.toISOString(), to: fromWallTime({ ...last, hour: 23, minute: 59 }).toISOString() };
}

/** Réglages de la recherche → paramètres de l'API (tri par date, toute la France par défaut). */
export function searchQuery(
  q: string,
  filters: SearchFilters,
  now: Date,
  mode: "list" | "map",
  cursor?: string,
): ExploreEventsQuery {
  return {
    q: q.trim() || undefined,
    format: filters.format || undefined,
    region: filters.region || undefined,
    accreditationOpen: filters.openOnly ? "1" : undefined,
    ...(filters.thisMonth ? monthRange(now) : {}),
    sort: "date",
    limit: mode === "map" ? 100 : 20,
    cursor,
  };
}

// --- Explorer : état d'une carte ----------------------------------------------------------------------------------------------

export type CardState = "accredited" | "pending" | "refused" | "request" | "closed";

/** L'état de l'accréditation sur une carte : la mienne d'abord, sinon « Demander » si elle est ouverte. */
export function cardState(accreditation: EventAccreditationState | undefined): CardState {
  const mine = accreditation?.mine ?? null;
  if (mine === "accepted") return "accredited";
  if (mine === "pending") return "pending";
  if (mine === "refused") return "refused";
  return accreditation?.open ? "request" : "closed";
}

export const cardStateLabel: Record<Exclude<CardState, "request" | "closed">, string> = {
  accredited: mediaLabels.accredited,
  pending: mediaLabels.pending,
  refused: mediaLabels.refused,
};

/** « 66 · Canet-en-Roussillon · Rassemblement » puis, quand l'API le donne, « ≈ 3 h de route ». */
export function detailLine(
  e: Pick<MediaEventBrief, "city" | "department" | "format"> & { travelMinutes?: number | null },
): string {
  const parts = [e.department, e.city, eventFormatLabels[e.format]].filter((x): x is string => Boolean(x));
  if (e.travelMinutes !== undefined && e.travelMinutes !== null) {
    parts.push(`≈ ${mediaLabels.travelTime(e.travelMinutes)}`);
  }
  return parts.join(" · ");
}

// --- Mon agenda ----------------------------------------------------------------------------------------------------------------

/** Lundi de la semaine d'un instant, date locale de Paris `AAAA-MM-JJ` (comme l'API). */
export function weekStartOf(instant: Date): string {
  const day = new Date(`${localDate(instant)}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

export type WeekDay = { date: string; letter: string; day: number; covered: boolean };

/** La bande des sept jours de la semaine en cours : ceux où un événement du média a lieu sont marqués. */
export function weekStrip(now: Date, agenda: MediaAgenda | null): WeekDay[] {
  const start = weekStartOf(now);
  const first = new Date(`${start}T00:00:00Z`);
  const covered = new Set<string>();
  for (const week of agenda?.weeks ?? []) {
    for (const item of week.items) {
      // Un événement sur plusieurs jours marque chacun de ses jours dans la semaine.
      const from = localDate(new Date(item.event.startsAt));
      const to = localDate(new Date(item.event.endsAt));
      for (let i = 0; i < 7; i++) {
        const d = new Date(first.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        if (d >= from && d <= to) covered.add(d);
      }
    }
  }
  return L.weekDays.map((letter, i) => {
    const d = new Date(first.getTime() + i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    return { date, letter, day: d.getUTCDate(), covered: covered.has(date) };
  });
}

export type AgendaItem = MediaAgenda["weeks"][number]["items"][number];

/** « Cette semaine » (et ce qui a déjà commencé) puis « Plus tard ». */
export function splitAgenda(agenda: MediaAgenda | null, now: Date): { thisWeek: AgendaItem[]; later: AgendaItem[] } {
  const current = weekStartOf(now);
  const thisWeek: AgendaItem[] = [];
  const later: AgendaItem[] = [];
  for (const week of agenda?.weeks ?? []) (week.weekStart <= current ? thisWeek : later).push(...week.items);
  return { thisWeek, later };
}

/** État d'une ligne de l'agenda : l'accréditation si elle existe, sinon gardé (avec « Demander » si c'est ouvert). */
export function agendaState(item: AgendaItem): CardState {
  return cardState({ open: item.accreditationOpen, mine: item.accreditation?.status ?? null });
}

// --- Presse ----------------------------------------------------------------------------------------------------------------------

/** Jours avant l'événement (heure de Paris), `0` le jour même. */
export function daysUntil(startsAt: string, now: Date): number {
  const a = new Date(`${localDate(now)}T00:00:00Z`).getTime();
  const b = new Date(`${localDate(new Date(startsAt))}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const ACTIVE_STATUSES: readonly ApplicationStatus[] = ["pending", "accepted"];
export const isActiveAccreditation = (status: ApplicationStatus) => ACTIVE_STATUSES.includes(status);

// --- Contenus ----------------------------------------------------------------------------------------------------------------------

export function totalViews(contents: readonly Pick<MediaContentView, "views">[]): number {
  return contents.reduce((sum, c) => sum + c.views, 0);
}

export type ContentGroup = {
  event: MediaContentView["event"];
  contents: MediaContentView[];
  /** Le contenu mis en avant sur la page de l'événement (l'API garde le premier, `featuredAt`). */
  featured: MediaContentView[];
};

/** Contenus rangés par événement, dans l'ordre reçu (l'API les envoie du plus récent événement au plus ancien). */
export function groupByEvent(contents: readonly MediaContentView[]): ContentGroup[] {
  const groups: ContentGroup[] = [];
  for (const c of contents) {
    let group = groups.find((g) => g.event.id === c.event.id);
    if (!group) {
      group = { event: c.event, contents: [], featured: [] };
      groups.push(group);
    }
    group.contents.push(c);
    if (c.featured) group.featured.push(c);
  }
  return groups;
}

/** Le nom d'hôte d'une adresse (« sudcars.fr »), sans « www. » ; l'adresse telle quelle si elle est illisible. */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  return m?.[1] ? m[1].replace(/^www\./i, "") : url;
}

/** Ligne de détail d'un contenu : « sudcars.fr · 610 vues », « YouTube · 460 vues », « 24 photos · 1 240 vues ». */
export function contentCaption(c: MediaContentView): string {
  const views = L.viewsCount(c.views);
  if (c.kind === "gallery") return `${L.galleryStats(c.photos.length)} · ${views}`;
  const where = c.platform === "youtube" ? "YouTube" : c.platform === "instagram" ? "Instagram" : hostOf(c.url ?? "");
  return `${where} · ${views}`;
}

/** Adresse saisie → adresse en https (« sudcars.fr/article » devient « https://sudcars.fr/article »). */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Plateforme devinée d'après l'adresse (le média peut la corriger). */
export function guessPlatform(url: string): "youtube" | "instagram" | "website" | "other" {
  const host = hostOf(url).toLowerCase();
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("instagram.com")) return "instagram";
  return host ? "website" : "other";
}
