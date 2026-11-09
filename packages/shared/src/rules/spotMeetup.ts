// Rendez-vous au spot (lot R7i, ARCHITECTURE-R7 § 1.6 et § 2.8) : règles pures. Un rendez-vous de dernière minute dure
// 12 h au plus, un seul actif par personne, visible de ses invités seuls (abonnés acceptés de l'auteur, ou membres actifs
// du crew) ; à la fin, le lieu et la liste sont effacés. L'API applique ces règles ; l'appli et le site choisissent les
// durées avec `durationOptions` (l'API ne connaît que `endsAt`).
import { BUSINESS_TIMEZONE } from "../enums";
import type { AudienceRelation, AudienceViewer } from "./audience";
import { addDays, DAY, fromWallTime, HOUR, MINUTE, wallTime } from "./time";

export const spotAudiences = ["followers", "crew"] as const;
export type SpotAudience = (typeof spotAudiences)[number];
export const spotAnswers = ["yes", "maybe"] as const;
export type SpotAnswer = (typeof spotAnswers)[number];

/** Un rendez-vous dure 12 h au plus (de son début à sa fin). */
export const SPOT_MAX_DURATION_MS = 12 * HOUR;
export const SPOT_NOTE_MAX = 140;
export const SPOT_PLACE_MAX = 80;
/** Début : pas plus de 15 minutes dans le passé (heure du téléphone), pas plus de 24 h devant. */
export const SPOT_START_PAST_MS = 15 * MINUTE;
export const SPOT_START_AHEAD_MS = 24 * HOUR;
/** Les rendez-vous terminés restent dans l'onglet Spots du crew (sans lieu) 30 jours, puis sont supprimés. */
export const SPOT_PAST_DAYS = 30;
export const SPOT_PAST_MS = SPOT_PAST_DAYS * DAY;
/** Durée « au choix » : par pas de 30 minutes, de 30 minutes à 12 h. */
export const SPOT_CUSTOM_STEP_MIN = 30;
export const SPOT_CUSTOM_MIN_MIN = 30;
export const SPOT_CUSTOM_MAX_MIN = SPOT_MAX_DURATION_MS / MINUTE;
/** Personnes de la liste « Qui vient ? » montrées d'emblée (le reste : « et N autres »). */
export const SPOT_WHO_PREVIEW = 3;
/** La notification du rendez-vous passe les heures calmes quand il commence dans cette fenêtre. */
export const SPOT_URGENT_WINDOW_MS = 2 * HOUR;

export type SpotDurationId = "1h" | "2h" | "afternoon" | "evening" | "tomorrow";
export type SpotDurationOption = { id: SpotDurationId; label: string; endsAt: Date };

const parisHour = (d: Date) => wallTime(d, BUSINESS_TIMEZONE).hour;

/** 18 h le jour (Paris) de `d`. */
const sixPm = (d: Date) => {
  const w = wallTime(d, BUSINESS_TIMEZONE);
  return fromWallTime({ ...w, hour: 18, minute: 0 }, BUSINESS_TIMEZONE);
};
/** Minuit (début du jour suivant, Paris) qui suit `d`. */
const nextMidnight = (d: Date) => {
  const w = addDays(wallTime(d, BUSINESS_TIMEZONE), 1);
  return fromWallTime({ ...w, hour: 0, minute: 0 }, BUSINESS_TIMEZONE);
};
/** 6 h le lendemain (Paris) du jour de `d`. */
const nextSixAm = (d: Date) => {
  const w = addDays(wallTime(d, BUSINESS_TIMEZONE), 1);
  return fromWallTime({ ...w, hour: 6, minute: 0 }, BUSINESS_TIMEZONE);
};

/**
 * Les durées proposées pour un rendez-vous qui commence à `startsAt` (par défaut maintenant) : « 1 h », « 2 h »,
 * « Cet après-midi » (jusqu'à 18 h, avant 18 h seulement), « Ce soir » (jusqu'à minuit), « Jusqu'à demain 6 h » (à partir
 * de 18 h seulement). Une durée nommée qui dépasserait 12 h, ou qui ferait moins d'une heure, n'est pas proposée ; quand
 * elle tombe à la même heure qu'un « 1 h » ou « 2 h », c'est elle qui reste (le mot dit mieux). Triées par fin. « Une heure
 * au choix » est à part (`customEndsAt`).
 */
export function durationOptions(now: Date, startsAt: Date = now): SpotDurationOption[] {
  const start = startsAt.getTime();
  const limit = start + SPOT_MAX_DURATION_MS;
  const named: SpotDurationOption[] = [];
  if (parisHour(startsAt) < 18) named.push({ id: "afternoon", label: "Cet après-midi", endsAt: sixPm(startsAt) });
  named.push({ id: "evening", label: "Ce soir", endsAt: nextMidnight(startsAt) });
  if (parisHour(startsAt) >= 18)
    named.push({ id: "tomorrow", label: "Jusqu'à demain 6 h", endsAt: nextSixAm(startsAt) });
  const keptNamed = named.filter((o) => o.endsAt.getTime() - start >= HOUR && o.endsAt.getTime() <= limit);
  const twins = new Set(keptNamed.map((o) => o.endsAt.getTime()));
  const plain = (
    [
      { id: "1h", label: "1 h", endsAt: new Date(start + HOUR) },
      { id: "2h", label: "2 h", endsAt: new Date(start + 2 * HOUR) },
    ] as SpotDurationOption[]
  ).filter((o) => !twins.has(o.endsAt.getTime()));
  return [...plain, ...keptNamed].sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
}

/** La durée choisie d'emblée : « Ce soir » à partir de 17 h (si elle est proposée), « 2 h » sinon (ou la première). */
export function defaultDuration(options: readonly SpotDurationOption[], now: Date): SpotDurationOption | null {
  const evening = options.find((o) => o.id === "evening");
  if (parisHour(now) >= 17 && evening) return evening;
  return options.find((o) => o.id === "2h") ?? evening ?? options[0] ?? null;
}

/** « Une heure au choix » : la fin pour une durée en minutes (par pas de 30, de 30 min à 12 h : bornée). */
export function customEndsAt(startsAt: Date, minutes: number): Date {
  const m = Math.min(SPOT_CUSTOM_MAX_MIN, Math.max(SPOT_CUSTOM_MIN_MIN, Math.round(minutes)));
  return new Date(startsAt.getTime() + m * MINUTE);
}

/** « 21 h », « 21 h 30 » (heure de Paris). */
export function spotTimeLabel(d: Date): string {
  const w = wallTime(d, BUSINESS_TIMEZONE);
  return w.minute === 0 ? `${w.hour} h` : `${w.hour} h ${String(w.minute).padStart(2, "0")}`;
}

export type SpotStartOption = { id: string; label: string; startsAt: Date };

/** Heures de début proposées : « Maintenant », puis les quatre prochains quarts d'heure ronds (:00 ou :30), à 10 min près. */
export function startOptions(now: Date, count = 4): SpotStartOption[] {
  const out: SpotStartOption[] = [{ id: "now", label: "Maintenant", startsAt: now }];
  const step = SPOT_CUSTOM_STEP_MIN * MINUTE;
  let t = Math.ceil((now.getTime() + 10 * MINUTE) / step) * step;
  for (let i = 0; i < count; i++, t += step) {
    const d = new Date(t);
    out.push({ id: String(t), label: spotTimeLabel(d), startsAt: d });
  }
  return out;
}

/** Début au choix : ramené entre « maintenant » et 24 h devant, par pas de 30 minutes. */
export function clampStart(startsAt: Date, now: Date): Date {
  const step = SPOT_CUSTOM_STEP_MIN * MINUTE;
  const t = Math.min(now.getTime() + SPOT_START_AHEAD_MS, Math.max(now.getTime(), startsAt.getTime()));
  return new Date(Math.min(now.getTime() + SPOT_START_AHEAD_MS, Math.ceil(t / step) * step));
}

export type SpotTimesError = "ends_before_start" | "too_long" | "start_in_past" | "start_too_far" | "already_over";

/** Les heures d'un rendez-vous sont-elles permises ? (`null` : oui.) La fin vient après le début, 12 h au plus. */
export function validateSpotTimes(startsAt: Date, endsAt: Date, now: Date): SpotTimesError | null {
  if (endsAt.getTime() <= startsAt.getTime()) return "ends_before_start";
  if (endsAt.getTime() - startsAt.getTime() > SPOT_MAX_DURATION_MS) return "too_long";
  if (startsAt.getTime() < now.getTime() - SPOT_START_PAST_MS) return "start_in_past";
  if (startsAt.getTime() > now.getTime() + SPOT_START_AHEAD_MS) return "start_too_far";
  if (endsAt.getTime() <= now.getTime()) return "already_over";
  return null;
}

export type SpotMeetupFacts = {
  authorId: string;
  audience: SpotAudience;
  crewId: string | null;
  /** Auteur ni supprimé, ni banni, ni suspendu. */
  authorActive: boolean;
};

/**
 * Le regard est-il invité (ou l'auteur) ? L'auteur toujours ; sinon l'auteur doit être en règle, et — « Mes abonnés » —
 * le regard le suit (demande acceptée, même si l'auteur est public : un rendez-vous est une invitation) ou — « Mon crew »
 * — il est membre actif de ce crew. Jamais « tout le monde », jamais sans session.
 */
export function meetupVisibleTo(viewer: AudienceViewer, meetup: SpotMeetupFacts, rel: AudienceRelation): boolean {
  if (!viewer?.active) return false;
  if (viewer.id === meetup.authorId) return true;
  if (!meetup.authorActive) return false;
  if (meetup.audience === "followers") return rel.followAccepted;
  return meetup.crewId !== null && rel.crewMemberActive(meetup.crewId);
}

export type SpotPhase = "upcoming" | "live" | "ended";

/** Où en est le rendez-vous : pas commencé, en cours, fini (le lieu n'est plus servi une fois fini). */
export function meetupPhase(m: { startsAt: Date; endsAt: Date }, now: Date): SpotPhase {
  if (now.getTime() >= m.endsAt.getTime()) return "ended";
  return now.getTime() >= m.startsAt.getTime() ? "live" : "upcoming";
}

/** Actif : ni annulé, ni effacé, pas encore fini. C'est lui qui compte pour « un seul actif par personne ». */
export function meetupActive(m: { endsAt: Date; cancelledAt: Date | null; purgedAt: Date | null }, now: Date): boolean {
  return m.cancelledAt === null && m.purgedAt === null && now.getTime() < m.endsAt.getTime();
}

/** « jusqu'à minuit », « jusqu'à 12 h », « jusqu'à demain 6 h » (heure de Paris). */
export function spotUntilLabel(startsAt: Date, endsAt: Date): string {
  const w = wallTime(endsAt, BUSINESS_TIMEZONE);
  const s = wallTime(startsAt, BUSINESS_TIMEZONE);
  if (w.hour === 0 && w.minute === 0) return "jusqu'à minuit";
  const nextDay = w.year !== s.year || w.month !== s.month || w.day !== s.day;
  return `jusqu'à ${nextDay ? "demain " : ""}${spotTimeLabel(endsAt)}`;
}

/** « à minuit », « à 12 h », « demain à 6 h » : le moment où le rendez-vous disparaît (heure de Paris). */
export function spotEndLabel(startsAt: Date, endsAt: Date): string {
  const w = wallTime(endsAt, BUSINESS_TIMEZONE);
  const s = wallTime(startsAt, BUSINESS_TIMEZONE);
  if (w.hour === 0 && w.minute === 0) return "à minuit";
  const nextDay = w.year !== s.year || w.month !== s.month || w.day !== s.day;
  return `${nextDay ? "demain " : ""}à ${spotTimeLabel(endsAt)}`;
}

/** « maintenant » (déjà commencé), « à 21 h » ou « demain à 9 h » (heure de Paris). */
export function spotStartLabel(startsAt: Date, now: Date): string {
  if (startsAt.getTime() <= now.getTime()) return "maintenant";
  const w = wallTime(startsAt, BUSINESS_TIMEZONE);
  const n = wallTime(now, BUSINESS_TIMEZONE);
  const tomorrow = w.day !== n.day || w.month !== n.month || w.year !== n.year;
  return `${tomorrow ? "demain " : ""}à ${spotTimeLabel(startsAt)}`;
}

/**
 * L'épingle et le point envoyé (lot R7i, tour 2) : l'épingle montrée est toujours le point qui sera envoyé. Quand la carte se
 * recentre ailleurs que sur ce point (« Autour de moi » : la position de l'appareil ne sert qu'à centrer la carte, elle n'est
 * jamais envoyée), le point est effacé et l'épingle masquée jusqu'à une nouvelle sélection ; « Lancer » attend. Recentrée sur
 * le point lui-même (adresse trouvée), rien ne change.
 */
export type SpotPoint = { lat: number; lng: number };
export function afterRecentre(
  point: SpotPoint | null,
  center: SpotPoint,
  explicit: boolean,
): { point: SpotPoint | null; pinHidden: boolean } {
  if (point && Math.abs(point.lat - center.lat) < 1e-6 && Math.abs(point.lng - center.lng) < 1e-6) {
    return { point, pinHidden: false };
  }
  if (point || explicit) return { point: null, pinHidden: true };
  return { point: null, pinHidden: false };
}

/**
 * Fini pour l'appareil : la phase reçue le dit, ou l'heure d'Orasso a atteint `endsAt`. Décidé localement, sans réseau : lieu,
 * mot, « Qui vient ? » et réponses sont masqués à cet instant, une fiche restée ouverte ou passée hors ligne comprise.
 */
export function spotEnded(meetup: { phase: SpotPhase; endsAt: string }, atMs: number): boolean {
  return meetup.phase === "ended" || atMs >= Date.parse(meetup.endsAt);
}
