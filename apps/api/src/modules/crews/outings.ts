// Sorties du crew (lot R5c2, maquette R5.9, décisions de Damien du 26/10) : proposer (le chef toujours ; un membre si le
// réglage du crew le permet), modifier et annuler (auteur ou chef), répondre « Je viens | Peut-être | Non ». Réservées
// aux membres actifs d'un crew non dissous. Ni candidature, ni QR, ni points, ni tampon.
//
// Verrous dans l'ordre du module : la ligne du crew (`FOR UPDATE`), puis la ligne de la sortie.
import {
  CREW_OUTINGS_UPCOMING_MAX,
  type CrewOutingCreate,
  type CrewOutingRsvp,
  type CrewOutingUpdate,
  type CrewOutingView,
  canManageCrewOuting,
  canProposeCrewOuting,
  crewErrors,
  crewOutingDateIssue,
  crewOutingErrors,
} from "@orasso/shared";
import { and, count, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { crewMembers, crewOutingReplies, crewOutings, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { activeMembersOf, crewOutingViews, reachableProfileSql } from "./page";
import { assertWritable, type CrewRow, lockCrew, memberRow } from "./service";

type OutingRow = typeof crewOutings.$inferSelect;

/** Conflit d'écriture concurrente (unicité, interblocage) rendu en 409. */
function concurrency(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  const code = (e.cause ?? e).code;
  if (code === "23505" || code === "40P01") {
    throw conflict("conflict", "Quelqu'un d'autre vient de modifier cette sortie : réessaie.");
  }
  throw error;
}

function dateCheck(startsAt: Date, at: Date) {
  const issue = crewOutingDateIssue(startsAt, at);
  if (issue === "past") throw validation(crewOutingErrors.past, { fields: { startsAt: "past" } });
  if (issue === "too_far") throw validation(crewOutingErrors.tooFar, { fields: { startsAt: "too_far" } });
}

/** Crew verrouillé et ma ligne de membre active (403 sinon : la vitrine du crew reste publique, pas ses sorties). */
async function lockAsMember(tx: Tx, crewId: string, v: Viewer): Promise<{ crew: CrewRow; isLeader: boolean }> {
  const crew = await lockCrew(tx, crewId);
  const me = await memberRow(tx, crew.id, v.user.id);
  if (me?.status !== "active") throw forbidden(crewErrors.membersOnly);
  return { crew, isLeader: me.role === "leader" };
}

/** Sortie du crew verrouillée, encore à venir et non annulée. */
async function lockOuting(tx: Tx, crewId: string, outingId: string, at: Date): Promise<OutingRow> {
  const [row] = await tx
    .select()
    .from(crewOutings)
    .where(and(eq(crewOutings.id, outingId), eq(crewOutings.crewId, crewId)))
    .for("update");
  if (!row) throw notFound(crewOutingErrors.notFound);
  if (row.cancelledAt) throw conflict("conflict", crewOutingErrors.cancelled, { reason: "cancelled" });
  if (row.startsAt.getTime() <= at.getTime()) throw conflict("conflict", crewOutingErrors.over, { reason: "over" });
  return row;
}

/** Membres actifs joignables à prévenir (sauf l'auteur du geste). */
async function recipients(tx: Tx, crewId: string, exceptUserId: string, at: Date, only?: string[]) {
  const rows = await tx
    .select({ userId: crewMembers.userId })
    .from(crewMembers)
    .innerJoin(profiles, eq(profiles.userId, crewMembers.userId))
    .where(
      and(
        eq(crewMembers.crewId, crewId),
        eq(crewMembers.status, "active"),
        ne(crewMembers.userId, exceptUserId),
        reachableProfileSql(at),
        only ? (only.length ? inArray(crewMembers.userId, only) : sql`false`) : undefined,
      ),
    );
  return rows.map((r) => r.userId);
}

const outingLink = (crew: Pick<CrewRow, "slug">) => `/c/${crew.slug}?onglet=sorties`;

export const crewOutingsService = {
  /** Une sortie vue par cette personne (membre actif). */
  async one(v: Viewer, crewId: string, outingId: string): Promise<CrewOutingView> {
    const at = now();
    const me = await memberRow(db, crewId, v.user.id);
    if (me?.status !== "active") throw forbidden(crewErrors.membersOnly);
    const members = await activeMembersOf(crewId, at);
    const [view] = await crewOutingViews(
      crewId,
      members,
      { userId: v.user.id, isLeader: me.role === "leader" },
      at,
      outingId,
    );
    if (!view) throw notFound(crewOutingErrors.notFound);
    return view;
  },

  /** `POST /crews/:id/outings` : la sortie arrive dans les notifications des membres (calmes : préférences, nuit). */
  async create(v: Viewer, crewId: string, input: CrewOutingCreate): Promise<CrewOutingView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    const at = now();
    dateCheck(input.startsAt, at);
    const id = await withTx(async (tx, after) => {
      const { crew, isLeader } = await lockAsMember(tx, crewId, v);
      if (!canProposeCrewOuting({ isLeader, membersCanPropose: crew.membersCanProposeOutings })) {
        throw forbidden(crewOutingErrors.proposeReserved);
      }
      const [upcoming] = await tx
        .select({ n: count() })
        .from(crewOutings)
        .where(and(eq(crewOutings.crewId, crew.id), isNull(crewOutings.cancelledAt), gt(crewOutings.startsAt, at)));
      if ((upcoming?.n ?? 0) >= CREW_OUTINGS_UPCOMING_MAX) {
        throw conflict("conflict", crewOutingErrors.tooMany, { reason: "too_many" });
      }
      const [row] = await tx
        .insert(crewOutings)
        .values({
          crewId: crew.id,
          authorId: v.user.id,
          title: input.title,
          startsAt: input.startsAt,
          place: input.place,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          program: input.program,
        })
        .returning();
      if (!row) throw new Error("Sortie non enregistrée");
      const to = await recipients(tx, crew.id, v.user.id, at);
      await notificationsService.notifyMany(tx, to, "crew_outing_new", {
        title: `Nouvelle sortie · ${crew.name}`,
        body: `${v.profile.pseudo} propose « ${row.title} » : ${formatDateTime(row.startsAt)}, ${row.place}.`,
        data: { crewId: crew.id, outingId: row.id, actor: { userId: v.user.id, pseudo: v.profile.pseudo } },
        link: { label: "Voir la sortie", path: outingLink(crew) },
      });
      after(() => notificationsService.kick());
      return row.id;
    }).catch(concurrency);
    return this.one(v, crewId, id);
  },

  /** `PATCH /crews/:id/outings/:outingId` (auteur ou chef) : seulement une sortie à venir, vers une date à venir. */
  async update(v: Viewer, crewId: string, outingId: string, input: CrewOutingUpdate): Promise<CrewOutingView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    const at = now();
    if (input.startsAt) dateCheck(input.startsAt, at);
    await withTx(async (tx) => {
      const { isLeader } = await lockAsMember(tx, crewId, v);
      const outing = await lockOuting(tx, crewId, outingId, at);
      if (!canManageCrewOuting({ isAuthor: outing.authorId === v.user.id, isLeader })) {
        throw forbidden(crewOutingErrors.manageForbidden);
      }
      await tx
        .update(crewOutings)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.place !== undefined ? { place: input.place } : {}),
          ...(input.lat !== undefined ? { lat: input.lat, lng: input.lng ?? null } : {}),
          ...(input.program !== undefined ? { program: input.program } : {}),
        })
        .where(eq(crewOutings.id, outing.id));
    }).catch(concurrency);
    return this.one(v, crewId, outingId);
  },

  /** `DELETE /crews/:id/outings/:outingId` (auteur ou chef) : annulée ; ceux qui venaient sont prévenus. */
  async cancel(v: Viewer, crewId: string, outingId: string): Promise<void> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    const at = now();
    await withTx(async (tx, after) => {
      const { crew, isLeader } = await lockAsMember(tx, crewId, v);
      const outing = await lockOuting(tx, crewId, outingId, at);
      if (!canManageCrewOuting({ isAuthor: outing.authorId === v.user.id, isLeader })) {
        throw forbidden(crewOutingErrors.manageForbidden);
      }
      await tx.update(crewOutings).set({ cancelledAt: at }).where(eq(crewOutings.id, outing.id));
      const coming = await tx
        .select({ userId: crewOutingReplies.userId })
        .from(crewOutingReplies)
        .where(and(eq(crewOutingReplies.outingId, outing.id), eq(crewOutingReplies.answer, "yes")));
      const to = await recipients(
        tx,
        crew.id,
        v.user.id,
        at,
        coming.map((c) => c.userId),
      );
      await notificationsService.notifyMany(tx, to, "crew_outing_cancelled", {
        title: `Sortie annulée · ${crew.name}`,
        body: `« ${outing.title} » (${formatDateTime(outing.startsAt)}) est annulée.`,
        data: { crewId: crew.id, outingId: outing.id, actor: { userId: v.user.id, pseudo: v.profile.pseudo } },
        link: { label: "Voir le crew", path: `/c/${crew.slug}` },
      });
      after(() => notificationsService.kick());
    }).catch(concurrency);
  },

  /** `PUT /crews/:id/outings/:outingId/rsvp {answer}` : la dernière réponse compte. */
  async rsvp(v: Viewer, crewId: string, outingId: string, answer: CrewOutingRsvp): Promise<CrewOutingView> {
    assertWritable(v);
    rateLimit("crewWrite", v.user.id);
    const at = now();
    await withTx(async (tx) => {
      await lockAsMember(tx, crewId, v);
      const outing = await lockOuting(tx, crewId, outingId, at);
      await tx
        .insert(crewOutingReplies)
        .values({ outingId: outing.id, userId: v.user.id, answer, answeredAt: at })
        .onConflictDoUpdate({
          target: [crewOutingReplies.outingId, crewOutingReplies.userId],
          set: { answer, answeredAt: at },
        });
    }).catch(concurrency);
    return this.one(v, crewId, outingId);
  },
};
