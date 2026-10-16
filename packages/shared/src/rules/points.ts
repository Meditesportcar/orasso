// Points, malus, contestation, saisons, fenêtre du mode staff (ARCHITECTURE.md § 2.5 à 2.7, choix C10 à C14, C23).
// Barème et seuils provisoires : « À revoir avec Damien » (A6), constantes isolées pour changer sans migration.
import { BUSINESS_TIMEZONE } from "../enums";
import { type Grade, grades } from "../grades";
import { GRADE_THRESHOLDS, gradeFor } from "./misc";
import { addDays, DAY, fromWallTime, HOUR, wallTime } from "./time";

/** Barème (choix C11, prototype validé « Points et grade »). */
export const POINTS = {
  participation: 20,
  staff: 20,
  referral: 10,
  malus: -10,
} as const;

/** Parrainages rémunérés au plus par saison et par parrain (S3, lot 15). */
export const REFERRAL_SEASON_CAP = 20;
/** Délai après la création du compte pendant lequel un lien d'ami peut encore être rattaché (§ 1.2). */
export const REFERRAL_WINDOW_MS = 24 * 3_600_000;

export const pointKinds = [
  "participation",
  "staff",
  "referral",
  "malus",
  "malus_reversal",
  "season_carryover",
  "admin_adjustment",
] as const;
export type PointKind = (typeof pointKinds)[number];

export const contestStatuses = ["pending", "accepted", "rejected", "escalated"] as const;
export type ContestStatus = (typeof contestStatuses)[number];

/** Points et malus attribués à J+2 (docs/01 « après l'événement »). */
export const SETTLE_DELAY_MS = 48 * HOUR;
/** Contestation possible 7 jours après l'écriture du malus (choix C12). */
export const CONTEST_WINDOW_MS = 7 * DAY;
/** L'organisateur a 7 jours pour répondre, puis l'administration tranche (choix C28). */
export const CONTEST_RESPONSE_MS = 7 * DAY;

type Timed = { startsAt: Date; endsAt: Date; timezone?: string };

export function settleAt(event: Pick<Timed, "endsAt">): Date {
  return new Date(event.endsAt.getTime() + SETTLE_DELAY_MS);
}

/** « Pointage en attente » : entre la fin de l'événement et le règlement des points (choix C23). */
export function pointsPending(event: { endsAt: Date; settledAt: Date | null }, now: Date): boolean {
  return now >= event.endsAt && event.settledAt === null;
}

/** Ce que rapporte une candidature au règlement de J+2 ; `null` = rien (« Désistement avant la veille · 0 »). */
export function settlementKind(app: {
  status: string;
  withdrawnAfterLock: boolean;
  checkedIn: boolean;
}): "participation" | "malus" | null {
  if (app.status === "accepted") return app.checkedIn ? "participation" : "malus";
  if (app.status === "withdrawn" && app.withdrawnAfterLock) return "malus";
  return null;
}

export function contestDeadline(malusAt: Date): Date {
  return new Date(malusAt.getTime() + CONTEST_WINDOW_MS);
}

export function canContest(malusAt: Date, now: Date): boolean {
  return now <= contestDeadline(malusAt);
}

export function contestEscalatesAt(contestAt: Date): Date {
  return new Date(contestAt.getTime() + CONTEST_RESPONSE_MS);
}

/** Saison = année civile (choix C10), à l'heure de Paris. */
export function seasonYear(date: Date): number {
  return wallTime(date, BUSINESS_TIMEZONE).year;
}

export function seasonDates(year: number): { name: string; startsOn: string; endsOn: string } {
  return { name: `Saison ${year}`, startsOn: `${year}-01-01`, endsOn: `${year}-12-31` };
}

/** Fin de saison : « on descend d'un grade et on continue » — points de départ = seuil du grade inférieur. */
export function carryoverPoints(previousSeasonPoints: number): number {
  const index = grades.indexOf(gradeFor(previousSeasonPoints));
  const lower = grades[Math.max(index - 1, 0)] as Grade;
  return GRADE_THRESHOLDS[lower];
}

/** Prochain grade et son seuil ; `null` au sommet. */
export function nextGrade(points: number): { grade: Grade; threshold: number } | null {
  const index = grades.indexOf(gradeFor(points));
  const next = grades[index + 1];
  return next ? { grade: next, threshold: GRADE_THRESHOLDS[next] } : null;
}

/** Mode staff ouvert à partir de la veille 00:00 (heure de Paris), choix C14. */
export function staffModeOpensAt(event: Timed): Date {
  const tz = event.timezone ?? BUSINESS_TIMEZONE;
  return fromWallTime({ ...addDays(wallTime(event.startsAt, tz), -1), hour: 0, minute: 0 }, tz);
}

/** Mode staff refermé à J+1 (fin + 1 jour). */
export function staffModeClosesAt(event: Pick<Timed, "endsAt">): Date {
  return new Date(event.endsAt.getTime() + DAY);
}

export function isStaffModeOpen(event: Timed, now: Date): boolean {
  return now >= staffModeOpensAt(event) && now < staffModeClosesAt(event);
}

/**
 * Écritures de pointage acceptées par l'API : de la veille jusqu'au règlement de J+2 (le staff rattrape le
 * pointage après coup, docs/01). Le mode staff de l'appli, lui, se ferme à J+1.
 */
export function checkinWritesOpen(event: Timed & { settledAt: Date | null }, now: Date): boolean {
  return now >= staffModeOpensAt(event) && now < settleAt(event) && event.settledAt === null;
}
