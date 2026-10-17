// Événements sur plusieurs jours (lot 26, ARCHITECTURE-SUITE § 10) : lecture des jours, places prises par jour,
// places libres, sérialisation. Les règles sont pures (`@orasso/shared` `rules/eventDays.ts`) ; ici, seulement la base.
//
// Un événement sans jour (ou avec un seul) est un événement d'un jour : `freeFor` rend alors exactement
// `capacité − retenues − offres`, comme avant le lot 26.
import {
  type ApplicationStatus,
  type DayChoiceError,
  type DayTaken,
  type EventDay,
  checkDayChoice,
  freePlaces,
  isMultiDay,
} from "@orasso/shared";
import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventDays } from "../../db/schema";
import { AppError, conflict, validation } from "../../lib/errors";
import type { Executor } from "../../lib/tx";
import type { EventRow } from "./repo";

export type DayRow = typeof eventDays.$inferSelect;

const ACTIVE: ApplicationStatus[] = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];

const dayChoiceMessages: Record<DayChoiceError, string> = {
  day_required: "Choisis le jour de ta venue",
  day_not_allowed: "Cet événement se réserve pour tout l'événement, pas pour un jour",
  unknown_day: "Jour inconnu pour cet événement",
};

export const daysRepo = {
  /** Jours d'un événement, dans l'ordre (vide = événement d'un jour). */
  list(eventId: string, ex: Executor = db): Promise<DayRow[]> {
    return ex.query.eventDays.findMany({ where: eq(eventDays.eventId, eventId), orderBy: [asc(eventDays.dayDate)] });
  },

  /** Jours de plusieurs événements (liste, Accès) : identifiant → jour. */
  async byIds(ids: (string | null)[], ex: Executor = db): Promise<Map<string, DayRow>> {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (!wanted.length) return new Map();
    const rows = await ex.query.eventDays.findMany({ where: inArray(eventDays.id, wanted) });
    return new Map(rows.map((d) => [d.id, d]));
  },

  /**
   * Places prises par les véhicules (prestataires jamais comptés, lot 21), regroupées par jour de candidature.
   * `statuses` : retenues et offres en cours par défaut (une offre réserve sa place).
   */
  async taken(
    eventId: string,
    ex: Executor = db,
    statuses: ApplicationStatus[] = ["accepted", "offered"],
  ): Promise<DayTaken[]> {
    const rows = await ex
      .select({ eventDayId: applications.eventDayId, n: count() })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, eventId),
          eq(applications.kind, "vehicle"),
          inArray(applications.status, statuses),
        ),
      )
      .groupBy(applications.eventDayId);
    return rows.map((r) => ({ eventDayId: r.eventDayId, n: r.n }));
  },

  /** Places libres pour `target` (un jour, ou `null` = tout l'événement) ; `null` = sans limite. */
  async freeFor(
    ex: Executor,
    event: Pick<EventRow, "id" | "capacity">,
    target: string | null,
    opts: { days?: DayRow[]; statuses?: ApplicationStatus[] } = {},
  ): Promise<number | null> {
    const days = opts.days ?? (await this.list(event.id, ex));
    return freePlaces(event, days, await this.taken(event.id, ex, opts.statuses), target);
  },

  /**
   * Places restantes affichées d'un événement sur plusieurs jours (carte, page, compteurs) : le meilleur jour (il reste
   * de la place tant qu'un jour en a) ; `null` = sans limite un jour au moins. Événement d'un jour : `undefined`
   * (l'appelant garde son calcul d'avant le lot 26).
   */
  remainingOf(
    event: Pick<EventRow, "capacity">,
    days: Pick<DayRow, "id" | "capacity">[],
    taken: DayTaken[],
  ): number | null | undefined {
    if (!isMultiDay(days)) return undefined;
    let best = 0;
    for (const d of days) {
      const free = freePlaces(event, days, taken, d.id);
      if (free === null) return null;
      best = Math.max(best, free);
    }
    return best;
  },

  /** Jours et places prises de plusieurs événements en deux requêtes (Explorer). */
  async manyMultiDay(
    eventIds: string[],
    ex: Executor = db,
  ): Promise<Map<string, { days: DayRow[]; taken: DayTaken[] }>> {
    const out = new Map<string, { days: DayRow[]; taken: DayTaken[] }>();
    if (!eventIds.length) return out;
    const rows = await ex.query.eventDays.findMany({
      where: inArray(eventDays.eventId, eventIds),
      orderBy: [asc(eventDays.dayDate)],
    });
    const byEvent = new Map<string, DayRow[]>();
    for (const d of rows) byEvent.set(d.eventId, [...(byEvent.get(d.eventId) ?? []), d]);
    const multi = [...byEvent].filter(([, days]) => isMultiDay(days)).map(([id]) => id);
    if (!multi.length) return out;
    const taken = await ex
      .select({ eventId: applications.eventId, eventDayId: applications.eventDayId, n: count() })
      .from(applications)
      .where(
        and(
          inArray(applications.eventId, multi),
          eq(applications.kind, "vehicle"),
          inArray(applications.status, ["accepted", "offered"]),
        ),
      )
      .groupBy(applications.eventId, applications.eventDayId);
    for (const id of multi) {
      out.set(id, {
        days: byEvent.get(id) ?? [],
        taken: taken.filter((t) => t.eventId === id).map((t) => ({ eventDayId: t.eventDayId, n: t.n })),
      });
    }
    return out;
  },

  /** Jours publics avec les places restantes (vide pour un événement d'un jour). */
  async serialize(event: Pick<EventRow, "id" | "capacity">, ex: Executor = db): Promise<EventDay[]> {
    const days = await this.list(event.id, ex);
    if (!isMultiDay(days)) return [];
    const taken = await this.taken(event.id, ex);
    return days.map((d) => ({
      id: d.id,
      date: d.dayDate,
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt.toISOString(),
      capacity: d.capacity,
      remaining: (() => {
        const free = freePlaces(event, days, taken, d.id);
        return free === null ? null : Math.max(0, free);
      })(),
    }));
  },

  /**
   * Choix du jour d'une nouvelle candidature (candidature, crew, invitation) selon le mode d'accès : `null` pour un
   * événement d'un jour ou « tout l'événement ». Lève une erreur de validation sinon.
   */
  async checkChoice(
    ex: Executor,
    event: Pick<EventRow, "id" | "dayAccess">,
    eventDayId: string | null | undefined,
  ): Promise<{ dayId: string | null; days: DayRow[] }> {
    const days = await this.list(event.id, ex);
    const error = checkDayChoice(event.dayAccess, days, eventDayId);
    if (error) throw validation(dayChoiceMessages[error], { field: "eventDayId", reason: error });
    return { dayId: eventDayId ?? null, days };
  },

  /**
   * Un véhicule n'a qu'une candidature active par jour, et jamais à la fois « tout l'événement » et un jour (§ 10).
   * L'index unique couvre le même jour ; ce contrôle, sous le verrou de l'événement, couvre le mélange.
   */
  async assertVehiclesFree(
    ex: Executor,
    eventId: string,
    vehicleIds: string[],
    dayId: string | null,
    message = "Ce véhicule a déjà une candidature pour cet événement",
  ): Promise<void> {
    if (!vehicleIds.length) return;
    const existing = await ex
      .select({ vehicleId: applications.vehicleId, eventDayId: applications.eventDayId })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, eventId),
          inArray(applications.vehicleId, vehicleIds),
          inArray(applications.status, ACTIVE),
        ),
      );
    const clash = existing.some((a) => a.eventDayId === null || dayId === null || a.eventDayId === dayId);
    if (clash) throw conflict("conflict", message);
  },
};

/** Erreur « jour en cours d'usage » (PUT des jours). */
export const dayInUse = (date: string) =>
  new AppError(409, "day_in_use", `Le ${date} a des candidatures : ce jour ne peut plus être retiré`, { date });
