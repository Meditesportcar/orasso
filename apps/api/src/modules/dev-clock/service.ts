// Horloge simulée (lot 34a, développement seulement) : avancer le temps d'Orasso, revenir à l'heure réelle, et lancer tout
// de suite ce qui devrait se passer (tâches planifiées devenues échues, balayages de rattrapage). Les routes
// (`/dev/clock`, super admin) et le script `pnpm dev:clock` appellent ce même service.
//
// Idempotence : rien ici n'écrit de règle métier. Les tâches et les balayages sont ceux de la production ; ils
// revérifient l'état en base (`settled_at`, `locked_at`, lignes de points uniques) et ne règlent jamais deux fois.
import {
  type ClockAdvanceInput,
  type ClockAdvanceResult,
  type ClockEventRow,
  type ClockMilestone,
  type ClockStatus,
  clockMilestones,
  milestoneAt,
  parseDurationMs,
} from "@orasso/shared";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { devClock, events } from "../../db/schema";
import { handlers } from "../../jobs";
import type { JobName } from "../../lib/deps";
import { currentOffsetMs, OFFSET_POLL_MS, realNowMs, setCachedOffset } from "../../lib/dev-clock";
import { conflict, notFound, validation } from "../../lib/errors";
import { applicationsService } from "../applications/service";

/** Avance maximale d'un coup : dix ans (au-delà, une faute de frappe). */
const MAX_ADVANCE_MS = 3650 * 86_400_000;

/**
 * Balayages lancés après chaque avance (les mêmes gestionnaires que les tâches périodiques de la production). Exclus :
 * `weather.refresh` (appelle des fournisseurs sur Internet), `season.rollover` (le 1er janvier seulement, déjà rattrapé
 * par `points.sweep`), `security.purge-known-logins` et `uploads.purge` (purges sans rapport avec le temps des parcours).
 */
export const DEV_CLOCK_SWEEPS: JobName[] = [
  "notifications.deliver",
  "waitlist.sweep",
  "staff.remind",
  "points.sweep",
  "crew.confirm-sweep",
  "messaging.group-sweep",
  "messaging.staff-chats-sweep",
  "field.sweep",
  "plate-transfer.escalate",
  "certification.sweep",
  "event.report-sweep",
  "structure.badge-sweep",
  "moderation.purge",
  "home.purge",
];

/** Tâches planifiées qu'une avance ne libère jamais (réseau, ou périodiques déjà couvertes par les balayages). */
const NEVER_RELEASED: JobName[] = [
  "weather.refresh",
  "season.rollover",
  "security.purge-known-logins",
  "uploads.purge",
];

export type SweepRunner = (name: JobName) => Promise<unknown>;

/** Lance un gestionnaire de tâche tel que pg-boss le ferait (sans charge utile : ce sont des balayages). */
export const runSweep: SweepRunner = (name) => handlers[name]({});

function status(offsetMs: number, updatedAt: Date | null): ClockStatus {
  const real = realNowMs();
  return {
    enabled: true,
    offsetMs,
    now: new Date(real + offsetMs).toISOString(),
    realNow: new Date(real).toISOString(),
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tâches pg-boss en attente dont l'échéance (heure simulée) est passée : à exécuter maintenant, une seule fois. */
async function releaseDueJobs(target: Date): Promise<number> {
  const table = await db.execute<{ ok: string | null }>(sql`select to_regclass('pgboss.job') as ok`);
  if (!table.rows[0]?.ok) return 0; // pg-boss n'a jamais démarré sur cette base (tests, scripts seuls).
  const names = sql.join(
    NEVER_RELEASED.map((n) => sql`${n}`),
    sql`, `,
  );
  const released = await db.execute(sql`
    update pgboss.job set start_after = now()
    where state = 'created' and start_after > now() and start_after <= ${target}
      and name not in (${names})
    returning id`);
  return released.rows.length;
}

/** Verrouillages dont l'échéance est passée : la tâche `event.lock` peut manquer (événement créé hors pg-boss). */
async function lockDueEvents(): Promise<void> {
  // Le délai de verrouillage varie par événement : on filtre en SQL sur la même formule que `lockAt`.
  const due = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.status, "published"),
        isNull(events.lockedAt),
        sql`${events.startsAt} - make_interval(mins => ${events.lockOffsetMinutes}) <= ${new Date(
          realNowMs() + currentOffsetMs(),
        )}`,
      ),
    );
  for (const e of due) await applicationsService.lockEvent(e.id);
}

async function eventFor(input: { eventId?: string; slug?: string }) {
  const [e] = await db
    .select()
    .from(events)
    .where(input.eventId ? eq(events.id, input.eventId) : eq(events.slug, input.slug ?? ""));
  if (!e) throw notFound("Événement introuvable");
  return e;
}

export const devClockService = {
  async status(): Promise<ClockStatus> {
    const [row] = await db.select().from(devClock).where(eq(devClock.id, 1));
    const offsetMs = Math.max(0, Number(row?.offsetMs ?? 0));
    return status(offsetMs, row?.updatedAt ?? null);
  },

  /** Événements publiés récents ou à venir, avec leurs jalons (page `/admin/horloge`). */
  async events(): Promise<ClockEventRow[]> {
    const since = new Date(realNowMs() + currentOffsetMs() - 30 * 86_400_000);
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.status, "published"), gte(events.endsAt, since)))
      .orderBy(asc(events.startsAt))
      .limit(60);
    return rows.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      milestones: clockMilestones.map((milestone) => ({ milestone, at: milestoneAt(e, milestone).toISOString() })),
    }));
  },

  /**
   * Avance l'horloge (jamais de recul : 409). `by` ajoute une durée, `to` vise un instant, `milestone` un jalon de
   * `eventId` (ou `slug`, pour le script). `waitForPeers` : le script attend que l'API ait relu le nouveau décalage avant
   * de libérer les tâches, pour qu'elles s'exécutent à la bonne heure.
   */
  async advance(
    input: ClockAdvanceInput & { slug?: string },
    opts: { updatedBy: string; waitForPeers?: boolean; run?: SweepRunner },
  ): Promise<ClockAdvanceResult & { target: string }> {
    let milestoneEvent: Awaited<ReturnType<typeof eventFor>> | null = null;
    if (input.milestone) milestoneEvent = await eventFor({ eventId: input.eventId, slug: input.slug });
    const by = input.by === undefined ? null : parseDurationMs(input.by);
    if (input.by !== undefined && by === null) throw validation("Durée illisible : écris par exemple 2h, 1d ou 1d4h.");

    const { newOffset, target, updatedAt } = await db.transaction(async (tx) => {
      await tx.execute(sql`insert into dev_clock (id, offset_ms) values (1, 0) on conflict (id) do nothing`);
      const [row] = await tx.select().from(devClock).where(eq(devClock.id, 1)).for("update");
      const real = realNowMs();
      const simulatedNow = real + Number(row?.offsetMs ?? 0);
      let at: number;
      if (by !== null) at = simulatedNow + by;
      else if (input.to) at = Date.parse(input.to);
      else if (input.milestone && milestoneEvent)
        at = milestoneAt(milestoneEvent, input.milestone as ClockMilestone).getTime();
      else throw validation("Indique une durée (by), un instant (to) ou un jalon (milestone).");
      if (!(at > simulatedNow)) {
        throw conflict(
          "conflict",
          "On ne peut pas reculer l'horloge : cet instant est déjà passé pour Orasso. Utilise la remise à zéro pour revenir à l'heure réelle.",
          { now: new Date(simulatedNow).toISOString(), target: new Date(at).toISOString() },
        );
      }
      if (at - simulatedNow > MAX_ADVANCE_MS) throw validation("Avance trop grande (dix ans au plus).");
      const offset = at - real;
      const [saved] = await tx
        .update(devClock)
        .set({ offsetMs: offset, updatedAt: new Date(), updatedBy: opts.updatedBy })
        .where(eq(devClock.id, 1))
        .returning();
      return { newOffset: offset, target: new Date(at), updatedAt: saved?.updatedAt ?? new Date() };
    });
    setCachedOffset(newOffset);

    if (opts.waitForPeers) await sleep(OFFSET_POLL_MS + 500);
    const releasedJobs = await releaseDueJobs(target);
    const sweeps: ClockAdvanceResult["sweeps"] = [];
    try {
      await lockDueEvents();
      sweeps.push({ name: "event.lock", ok: true });
    } catch (error) {
      sweeps.push({ name: "event.lock", ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    for (const name of DEV_CLOCK_SWEEPS) {
      try {
        await (opts.run ?? runSweep)(name);
        sweeps.push({ name, ok: true });
      } catch (error) {
        sweeps.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { ...status(newOffset, updatedAt), releasedJobs, sweeps, target: target.toISOString() };
  },

  /** Retour à l'heure réelle (décalage nul). Les points déjà réglés et les tâches déjà exécutées ne sont pas défaits. */
  async reset(opts: { updatedBy: string }): Promise<ClockStatus> {
    const [row] = await db
      .insert(devClock)
      .values({ id: 1, offsetMs: 0, updatedBy: opts.updatedBy })
      .onConflictDoUpdate({
        target: devClock.id,
        set: { offsetMs: 0, updatedAt: new Date(), updatedBy: opts.updatedBy },
      })
      .returning();
    setCachedOffset(0);
    return status(0, row?.updatedAt ?? null);
  },
};
