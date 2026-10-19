// Créneaux d'arrivée d'un événement (lot 47) : lecture des huit colonnes `arrival_*`, écriture, contrôle par les règles
// partagées (`shared/rules/arrival.ts`).
import {
  type ArrivalSlot,
  type Arrivals,
  arrivalNotSeen,
  arrivalProblems,
  needsArrivalSeen,
  validateArrivals,
} from "@orasso/shared";

import type { events } from "../../db/schema";
import { AppError, validation } from "../../lib/errors";
import type { EventRow } from "./repo";

/** « 18:30:00 » (colonne `time`) → « 18:30 ». */
const hhmm = (v: string | null) => (v ? v.slice(0, 5) : null);

function slot(from: string | null, to: string | null, strict: boolean, note: string | null): ArrivalSlot | null {
  const f = hhmm(from);
  return f ? { from: f, to: hhmm(to), strict, note } : null;
}

export function arrivalsOf(
  e: Pick<
    EventRow,
    | "arrivalExhibitorsFrom"
    | "arrivalExhibitorsTo"
    | "arrivalExhibitorsStrict"
    | "arrivalExhibitorsNote"
    | "arrivalPublicFrom"
    | "arrivalPublicTo"
    | "arrivalPublicStrict"
    | "arrivalPublicNote"
  >,
): Arrivals {
  return {
    exhibitors: slot(
      e.arrivalExhibitorsFrom,
      e.arrivalExhibitorsTo,
      e.arrivalExhibitorsStrict,
      e.arrivalExhibitorsNote,
    ),
    public: slot(e.arrivalPublicFrom, e.arrivalPublicTo, e.arrivalPublicStrict, e.arrivalPublicNote),
  };
}

/** Colonnes à écrire pour des créneaux (`null` = les retirer). */
export function arrivalColumns(a: Arrivals | null): Partial<typeof events.$inferInsert> {
  const ex = a?.exhibitors ?? null;
  const pub = a?.public ?? null;
  return {
    arrivalExhibitorsFrom: ex?.from ?? null,
    arrivalExhibitorsTo: ex?.to ?? null,
    arrivalExhibitorsStrict: ex?.strict ?? false,
    arrivalExhibitorsNote: ex?.note ?? null,
    arrivalPublicFrom: pub?.from ?? null,
    arrivalPublicTo: pub?.to ?? null,
    arrivalPublicStrict: pub?.strict ?? false,
    arrivalPublicNote: pub?.note ?? null,
  };
}

/**
 * Réponse du candidat au créneau des exposants (candidature seule, chef de crew, membre qui confirme) : « J'ai vu »
 * obligatoire quand le créneau existe (400 `arrival_not_seen` sinon), note gardée ; sans créneau, les deux sont ignorés.
 */
export function arrivalAnswer(
  event: EventRow,
  input: { arrivalSeen?: boolean; arrivalNote?: string | null },
  at: Date,
): { arrivalSeenAt: Date | null; arrivalNote: string | null } {
  if (!needsArrivalSeen({ arrivals: arrivalsOf(event) })) return { arrivalSeenAt: null, arrivalNote: null };
  if (input.arrivalSeen !== true) throw new AppError(400, "arrival_not_seen", arrivalNotSeen, { field: "arrivalSeen" });
  return { arrivalSeenAt: at, arrivalNote: input.arrivalNote?.trim() || null };
}

/** 400 si les créneaux ne vont pas avec les dates de l'événement (fin avant début, public avant les exposants…). */
export function assertArrivals(a: Arrivals | null | undefined, startsAt: Date, endsAt: Date, timezone: string) {
  const problem = validateArrivals({ arrivals: a, startsAt, endsAt, timezone });
  if (problem) throw validation(arrivalProblems[problem], { field: "arrivals", reason: problem });
}
