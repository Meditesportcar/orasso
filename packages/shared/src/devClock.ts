// Horloge simulée (lot 34a) : constantes, durées et jalons communs à l'API, au site et à l'appli. Développement seulement.
import { z } from "zod";

import { reportRefreshAt } from "./rules/afterEvent";
import { lockAt } from "./rules/lock";
import { settleAt } from "./rules/points";
import { DAY, HOUR, MINUTE } from "./rules/time";

/** En-tête de réponse de l'API (millisecondes) : présent seulement quand l'horloge simulée est active. */
export const CLOCK_OFFSET_HEADER = "x-orasso-clock-offset";

export const clockMilestones = ["h-2", "start", "end", "j+2", "j+8"] as const;
export type ClockMilestone = (typeof clockMilestones)[number];

type MilestoneEvent = { startsAt: Date; endsAt: Date; lockOffsetMinutes: number };

/** Instant d'un jalon d'un événement : verrouillage, début, fin, règlement des points (J+2), bilan (J+8). */
export function milestoneAt(event: MilestoneEvent, milestone: ClockMilestone): Date {
  switch (milestone) {
    case "h-2":
      return lockAt(event);
    case "start":
      return event.startsAt;
    case "end":
      return event.endsAt;
    case "j+2":
      return settleAt(event);
    case "j+8":
      return reportRefreshAt(event);
  }
}

const UNITS: Record<string, number> = { m: MINUTE, min: MINUTE, h: HOUR, j: DAY, d: DAY };

/**
 * Durée écrite à la main : « 2h », « 1d », « 1j4h », « 30m », « +2h ». `null` si le texte n'est pas une durée
 * positive (zéro compris).
 */
export function parseDurationMs(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/^\+/, "").replaceAll(" ", "");
  if (!s) return null;
  let total = 0;
  let rest = s;
  while (rest) {
    const m = /^(\d+)(min|m|h|j|d)/.exec(rest);
    if (!m) return null;
    total += Number(m[1]) * (UNITS[m[2] as string] as number);
    rest = rest.slice(m[0].length);
  }
  return total > 0 ? total : null;
}

/** « +2 j 4 h » : décalage affiché dans le bandeau. Chaîne vide pour un décalage nul. */
export function formatClockOffset(ms: number): string {
  if (!(ms >= MINUTE)) return "";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const parts: string[] = [];
  if (days) parts.push(`${days} j`);
  if (hours) parts.push(`${hours} h`);
  // Les minutes ne s'affichent que sous le jour, pour garder un bandeau court.
  if (minutes && !days) parts.push(`${minutes} min`);
  return `+${parts.join(" ")}`;
}

export const clockAdvanceInput = z
  .object({
    /** Durée à ajouter : « 2h », « 1d »… */
    by: z.string().max(40).optional(),
    /** Instant visé (ISO 8601 avec fuseau). */
    to: z.iso.datetime({ offset: true }).optional(),
    /** Jalon d'un événement : avec `eventId`. */
    eventId: z.uuid().optional(),
    milestone: z.enum(clockMilestones).optional(),
  })
  .refine((v) => [v.by !== undefined, v.to !== undefined, v.milestone !== undefined].filter(Boolean).length === 1, {
    message: "Un seul de : by, to, milestone",
  })
  .refine((v) => (v.milestone === undefined) === (v.eventId === undefined), {
    message: "milestone et eventId vont ensemble",
  });
export type ClockAdvanceInput = z.infer<typeof clockAdvanceInput>;

export type ClockStatus = {
  enabled: true;
  /** Décalage en millisecondes (jamais négatif). */
  offsetMs: number;
  /** Heure simulée et heure système, en ISO. */
  now: string;
  realNow: string;
  updatedAt: string | null;
};

export type ClockSweepResult = { name: string; ok: boolean; error?: string };

export type ClockAdvanceResult = ClockStatus & {
  /** Tâches pg-boss planifiées dans l'avenir simulé, rendues exécutables tout de suite. */
  releasedJobs: number;
  sweeps: ClockSweepResult[];
};

export type ClockEventRow = {
  id: string;
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  milestones: { milestone: ClockMilestone; at: string }[];
};
