// Règles pures de la modération (lot 32, ARCHITECTURE-SUITE § 15.2) : suspension automatique et protections contre les
// meutes (S39, S40), durée des sanctions, contestation, conservation d'un an.
import type { ContestState, SanctionKind } from "../moderation";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const MODERATION = {
  /** S40 : signaleurs distincts sur le même compte dans la fenêtre → suspension de 7 jours automatique. */
  autoSuspendThreshold: 3,
  autoSuspendWindowMs: 24 * HOUR,
  /** S39 : un compte de moins de 7 jours ne compte pas (« comptes créés depuis peu »). */
  minReporterAgeMs: 7 * DAY,
  /** S39 : un signaleur dont 2 signalements ont été rejetés comme abusifs ne compte plus. */
  abusiveReportsLimit: 2,
  /** Signalements par personne sur 24 heures glissantes. */
  dailyReportLimit: 10,
  /** Contestation possible tant que la sanction court, puis 30 jours après sa fin. */
  contestWindowMs: 30 * DAY,
  detailsMax: 1000,
  contestMax: 1000,
  noteMax: 1000,
  /** Messages copiés de part et d'autre du message signalé (AS5). */
  contextAround: 5,
} as const;

/** Fin de suspension d'un bannissement (`profiles.suspended_until`) : date fixe et lisible (pas `infinity`, illisible en JS). */
export const BAN_UNTIL = new Date("9999-12-31T00:00:00.000Z");

/** Le modérateur ne prononce que la suspension de 7 jours (docs/01 : « il peut suspendre un compte »). */
export const moderatorSanctionKinds: readonly SanctionKind[] = ["suspension_7d"];

export type ReporterFacts = { accountCreatedAt: Date; dismissedAbusive: number };

/** S39 : ce signaleur compte-t-il pour la suspension automatique ? (son signalement est enregistré dans tous les cas) */
export function countsForAutoSuspension(reporter: ReporterFacts, now: Date): boolean {
  if (now.getTime() - reporter.accountCreatedAt.getTime() < MODERATION.minReporterAgeMs) return false;
  return reporter.dismissedAbusive < MODERATION.abusiveReportsLimit;
}

/** S40 : assez de signaleurs distincts (déjà filtrés par S39) pour suspendre ? */
export function shouldAutoSuspend(distinctReporters: number): boolean {
  return distinctReporters >= MODERATION.autoSuspendThreshold;
}

/** Fin de la sanction : un avertissement finit aussitôt, un bannissement jamais (`null`). */
export function sanctionEnds(kind: SanctionKind, now: Date): Date | null {
  switch (kind) {
    case "warning":
      return new Date(now);
    case "suspension_7d":
      return new Date(now.getTime() + 7 * DAY);
    case "suspension_30d":
      return new Date(now.getTime() + 30 * DAY);
    case "ban":
      return null;
  }
}

export type SanctionFacts = {
  kind: SanctionKind;
  startsAt: Date;
  endsAt: Date | null;
  liftedAt: Date | null;
  contestStatus: ContestState;
};

/** La sanction empêche-t-elle d'écrire en ce moment ? (un avertissement, jamais) */
export function isSanctionActive(s: SanctionFacts, now: Date): boolean {
  if (s.liftedAt || s.kind === "warning") return false;
  return s.endsAt === null || s.endsAt > now;
}

/** Contestation unique, tant que la sanction court ou moins de 30 jours après sa fin (docs/01, § 15.2). */
export function canContestSanction(s: SanctionFacts, now: Date): boolean {
  if (s.liftedAt || s.contestStatus !== "none") return false;
  if (s.endsAt === null) return true;
  return now.getTime() <= s.endsAt.getTime() + MODERATION.contestWindowMs;
}

/** Conservation : un an après la décision (docs/01), puis suppression par `moderation.purge`. */
export function retainUntil(handledAt: Date): Date {
  const d = new Date(handledAt);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}
