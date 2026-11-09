// Le direct : présence par GPS et compteurs « sur place » (lot R7d1, ARCHITECTURE-R7 § 2.3, maquette R7.13 et R7.14).
//
// LA POSITION N'EST JAMAIS GARDÉE. `lat` et `lng` n'existent que dans `validate`, le temps de la comparaison avec la zone
// de l'événement (variable locale, en mémoire) : ni en base (la table n'a pas de colonne de position), ni dans le journal
// d'audit, ni dans les logs (aucun `console` ici n'écrit la demande), ni dans un contexte d'erreur (les erreurs de cette
// route ne portent que le code du refus ; le corps d'une requête n'est jamais envoyé à GlitchTip : voir `lib/sentry.ts`).
// L'API garde « présent, validé à telle heure ». Une validation par compte et par événement.
import {
  type EventLive,
  type HomeLive,
  liveCountsVisible,
  liveDay,
  livePhase,
  localDate,
  myPresenceOf,
  type PresenceInput,
  type PresenceRefusal,
  type PresenceResult,
  type PresenceSummary,
  presenceLabels,
  presenceRefusal,
  staffRoles,
} from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventPresences, eventStaff, events, passportStamps } from "../../db/schema";
import { isSuperAdmin, requireOrganizer, staffAccess } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { canVoteNow } from "../audience-prize/service";
import { daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { assertCanSeeEvent, canSeeEvent } from "../invitations/access";
import { notificationsService } from "../notifications/service";
import { passportService } from "../passport/service";
import { structureById } from "../structures/service";
import { openVotesCount } from "../votes/service";
import { entryOf, holdsVehicleSlot, myProofs, onSiteCount, summaryCounts, ticketOf, vehiclesEntered } from "./repo";

/** Code HTTP de chaque refus : 409 pour l'état (fermé, exposant, déjà présent, lieu sans position), 422 pour la mesure. */
const REFUSAL_STATUS = {
  closed: 409,
  use_qr: 409,
  scan_ticket: 409,
  ticket_required: 409,
  pay_at_entry: 409,
  closed_to_public: 409,
  already_present: 409,
  no_zone: 409,
  gps_imprecise: 422,
  out_of_zone: 422,
} as const satisfies Record<PresenceRefusal, 409 | 422>;

const refusalError = (reason: PresenceRefusal) =>
  new AppError(REFUSAL_STATUS[reason], reason, presenceLabels.errors[reason]);

/**
 * Unicité de la présence (une par compte et par événement) : deux demandes simultanées du même compte, la seconde est
 * refusée comme « déjà présent ». Seule cette contrainte compte : toute autre violation d'unicité reste une erreur.
 */
export function isPresenceUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.cause ?? e;
  return pg.code === "23505" && pg.constraint === "event_presences_event_user_key";
}

/** Tampon « visite » de la personne pour cet événement (posé ou déjà là) : son identifiant, `null` sans tampon. */
async function visitStampId(ex: Executor, eventId: string, userId: string): Promise<string | null> {
  const row = await ex.query.passportStamps.findFirst({
    where: and(
      eq(passportStamps.eventId, eventId),
      eq(passportStamps.userId, userId),
      eq(passportStamps.kind, "visit"),
    ),
    columns: { id: true },
  });
  return row?.id ?? null;
}

/** Événement lisible par la personne (brouillon : introuvable ; privé : réservé à ses ayants droit). */
async function visibleEvent(v: Viewer, eventId: string): Promise<EventRow> {
  const event = await eventsRepo.byId(eventId);
  if (event.status === "draft") throw notFound("Événement introuvable");
  await assertCanSeeEvent(event, v);
  return event;
}

/**
 * `canVote` de la réponse, dans un point de reprise : une erreur de lecture (base, règle du vote) ne défait ni ne bloque
 * une présence déjà écrite. Elle donne `false` et est journalisée **sans la position** (l'erreur seule).
 */
async function canVoteSafely(ex: Executor, event: EventRow, userId: string): Promise<boolean> {
  try {
    return await (ex as Tx).transaction((sp) => canVoteNow(sp, event, userId));
  } catch (error) {
    console.error("Droit de vote non calculé après une présence validée :", error);
    return false;
  }
}

export const presenceService = {
  /**
   * `POST /events/:id/presence` : « Je suis sur place ». Dans l'ordre : limite de débit (5 essais en 10 minutes par
   * compte, refus compris), événement lisible, puis les refus de `presenceRefusal`. Validée : la ligne (sans position), le
   * tampon « visite » (celui d'un billet accepté, avec le billet de la personne s'il existe), la notification
   * `presence_validated` au Journal, et un signal « quelque chose a changé » sur `event:{id}:live`.
   */
  async validate(v: Viewer, eventId: string, input: PresenceInput): Promise<PresenceResult> {
    rateLimit("presence", v.user.id);
    const event = await visibleEvent(v, eventId);
    const point = { lat: input.lat, lng: input.lng };
    const accuracyM = input.accuracyM ?? null;
    try {
      return await withTx(async (tx, after) => {
        const t = now();
        const entry = await entryOf(tx, event, v.user.id, t);
        const refusal = presenceRefusal({
          event: { ...event, days: await daysRepo.list(eventId, tx) },
          now: t,
          holdsVehicleSlot: await holdsVehicleSlot(tx, eventId, v.user.id),
          access: entry.access,
          ticket: entry.ticket,
          alreadyPresent: Boolean(
            await tx.query.eventPresences.findFirst({
              where: and(eq(eventPresences.eventId, eventId), eq(eventPresences.userId, v.user.id)),
              columns: { id: true },
            }),
          ),
          point,
          accuracyM,
        });
        if (refusal === "ticket_required" && entry.full) {
          throw new AppError(REFUSAL_STATUS[refusal], refusal, presenceLabels.ticketRequiredFull);
        }
        if (refusal) throw refusalError(refusal);
        const ticketId = await ticketOf(tx, eventId, v.user.id);
        // Aucune position dans cette ligne : le lieu (événement), la personne, le billet, l'heure.
        const [row] = await tx
          .insert(eventPresences)
          .values({ eventId, userId: v.user.id, kind: "gps", ticketId, validatedAt: t })
          .returning({ validatedAt: eventPresences.validatedAt });
        if (!row) throw new Error("Présence non enregistrée");
        // Le tampon ne fait jamais échouer la validation (comme pour un billet accepté) ; null = non posé.
        const fresh = await passportService.safely(tx, "présence", (sp) =>
          passportService.stamp(sp, v.user.id, event, "visit", { ticketId, at: t }),
        );
        await notificationsService.notify(tx, v.user.id, "presence_validated", {
          title: presenceLabels.notificationTitle,
          body: presenceLabels.notificationBody(event.title),
          eventId,
          data: { eventId },
          link: { label: "Voir l'événement", path: `/e/${event.slug}` },
        });
        const stampId = await visitStampId(tx, eventId, v.user.id);
        // La règle effective du vote : la présence est écrite, restent la fenêtre et les deux véhicules pointés.
        // Protégé : un échec de cette lecture ne défait jamais une présence validée (faux, erreur sans la position).
        const canVote = await canVoteSafely(tx, event, v.user.id);
        // Le tampon tombe à l'écran (comme au contrôle d'un billet), seulement s'il vient d'être posé.
        if (fresh) after(() => passportService.publish(v.user.id, fresh));
        after(() => presenceService.announce(eventId));
        after(() => notificationsService.kick());
        return { validatedAt: row.validatedAt.toISOString(), stampId, canVote };
      });
    } catch (error) {
      if (isPresenceUniqueViolation(error)) throw refusalError("already_present");
      throw error;
    }
  },

  /** Signal « quelque chose a changé » pour l'organisation (canal `event:{id}:live`) : le nombre sur place, rien d'autre. */
  async announce(eventId: string) {
    realtime.publish(`event:${eventId}:live`, "presence.changed", { onSiteCount: await onSiteCount(db, eventId) });
  },

  /**
   * `GET /events/:id/presences/summary` : la statistique de l'organisateur et du staff (lecture). Des nombres, jamais une
   * liste, jamais un nom. Lisible par le propriétaire et les co-organisateurs de la structure et le super admin en
   * assistance (aussi après la fin : c'est le bilan de l'organisateur), et par le staff **affecté à cet événement**
   * (ligne `event_staff`) tant qu'il n'est pas fini. Même règle que le classement de R7-0.
   */
  async summary(v: Viewer, eventId: string): Promise<PresenceSummary> {
    const event = await eventsRepo.byId(eventId);
    const access = await staffAccess(v, event.structureId, [...staffRoles], event.id);
    if (!access) throw new AppError(403, "forbidden", "Réservé à l'organisation et au staff de l'événement");
    // Un super admin en assistance qui est aussi staff de la structure : la règle du super admin passe d'abord (aussi
    // après la fin, c'est le bilan de l'organisateur) ; son passage est tracé comme celui d'un super admin.
    if (access.actor === "staff" && isSuperAdmin(v)) await requireOrganizer(v, event.structureId);
    else if (access.actor === "staff") {
      const assigned = await db.query.eventStaff.findFirst({
        where: and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, v.user.id)),
        columns: { id: true },
      });
      if (!assigned || now() >= event.endsAt) {
        throw new AppError(403, "forbidden", "Réservé à l'organisation et au staff de l'événement");
      }
    }
    return summaryCounts(db, eventId);
  },

  /**
   * Le bloc `live` de la fiche. Hors de l'événement, ni retenues ni présents (règle des absents) ; la fiche ne fait
   * aucune requête de comptage tant que l'événement ne tourne pas.
   */
  async liveOf(e: EventRow, viewerId: string | null, ex: Executor = db): Promise<EventLive> {
    const t = now();
    const phase = livePhase(e, t);
    const days = await daysRepo.list(e.id, ex);
    const { dayIndex, dayCount } = liveDay({ days }, t);
    const running = phase === "running" && e.status === "published";
    const [onSite, accepted, entered, proofs] = await Promise.all([
      running ? onSiteCount(ex, e.id) : Promise.resolve(0),
      running ? eventsRepo.statusCounts(e.id, ex).then((c) => c.accepted) : Promise.resolve(0),
      running ? vehiclesEntered(ex, e.id) : Promise.resolve(null),
      viewerId ? myProofs(ex, e.id, viewerId) : Promise.resolve(null),
    ]);
    const counts = liveCountsVisible(phase, e.status, { onSiteCount: onSite, acceptedCount: accepted });
    return {
      phase,
      dayIndex,
      dayCount,
      ...counts,
      myPresence: proofs ? myPresenceOf(proofs) : null,
      votesOpen: entered ? await openVotesCount(ex, e) : 0,
      organizerStoryAvailable: false,
    };
  },

  /**
   * Le widget `live` de l'Accueil : l'événement en cours (du début à la fin) où j'ai une place (candidature retenue,
   * billet) ou une présence. Plusieurs : le dernier commencé. `null` sinon.
   */
  async homeLive(v: Viewer): Promise<HomeLive | null> {
    const t = now();
    const rows = await db.execute<{ id: string; retained: boolean }>(sql`select e.id,
        exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${v.user.id}
          and a.kind = 'vehicle' and a.status = 'accepted') as retained
      from events e
      where e.status = 'published' and e.starts_at <= ${t} and e.ends_at > ${t}
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${v.user.id}
              and a.kind = 'vehicle' and a.status = 'accepted')
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${v.user.id}
              and k.status <> 'cancelled')
          or exists (select 1 from event_presences g where g.event_id = e.id and g.user_id = ${v.user.id}))
      order by e.starts_at desc, e.ends_at asc`);
    // Droits ACTUELS : un événement privé dont l'invitation de la personne a été révoquée n'apparaît plus, même si elle
    // y a un billet ou une présence ; on prend le premier de la liste que la personne a encore le droit de voir (le filtre des droits passe avant toute limite :
    // la liste n'est pas tronquée, elle ne compte que les événements en cours où la personne a une place).
    let hit: { id: string; retained: boolean } | undefined;
    let e: EventRow | undefined;
    for (const candidate of rows.rows) {
      const row = await db.query.events.findFirst({ where: eq(events.id, candidate.id) });
      if (row && (await canSeeEvent(row, v))) {
        hit = candidate;
        e = row;
        break;
      }
    }
    if (!hit || !e) return null;
    const [structure, days, onSite, entered, voted] = await Promise.all([
      structureById(e.structureId),
      daysRepo.list(e.id),
      onSiteCount(db, e.id),
      vehiclesEntered(db, e.id),
      db.execute<{ n: number }>(
        sql`select count(*)::int as n from audience_votes where event_id = ${e.id} and voter_user_id = ${v.user.id}`,
      ),
    ]);
    const { dayIndex, dayCount } = liveDay({ days }, t);
    // Le programme du jour : les horaires du jour en cours (ou de l'événement s'il tient en un jour), et les consignes aux
    // retenus seulement ; rien d'inventé.
    const today = days.length >= 2 ? (days[dayIndex - 1] ?? null) : null;
    return {
      event: {
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        city: e.city,
        posterUrl: storage.url(e.posterPostKey ?? e.posterKey),
        structure: { name: structure.name, logoUrl: storage.url(structure.logoKey) },
      },
      dayIndex,
      dayCount,
      // Publié et en cours (la requête l'impose) : le nombre sur place est visible.
      onSiteCount: onSite,
      votes: { open: await openVotesCount(db, e), voted: Number(voted.rows[0]?.n ?? 0) },
      programToday: {
        dayDate: today?.dayDate ?? localDate(e.startsAt),
        startsAt: (today?.startsAt ?? e.startsAt).toISOString(),
        endsAt: (today?.endsAt ?? e.endsAt).toISOString(),
        instructions: hit.retained ? e.instructions : null,
      },
      organizerStory: null,
    };
  },
};
