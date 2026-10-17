// Notes internes d'une structure sur un participant ou un prestataire (lot 27, ARCHITECTURE-SUITE § 11.4, docs/01).
// Privées : seuls le propriétaire et les co-organisateurs actifs de la structure (2FA de session) les lisent ou les
// écrivent ; jamais la personne, jamais une autre structure, jamais le staff, jamais l'export. On n'écrit que sur une
// personne qui a candidaté à un événement de la structure (pas de fichier sur n'importe qui). Retirée sans être
// effacée (`deleted_at`) ; effacée avec le compte de la personne.
import {
  type NoteCreate,
  type NoteListQuery,
  type NoteUpdate,
  STRUCTURE_NOTES_PER_SUBJECT,
  type StructureNoteView,
} from "@orasso/shared";
import { and, count, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, profiles, structureNotes } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { memberRole, requireStructureReader, requireStructureSpeaker } from "../communication/guards";
import { profilesRepo } from "../profiles/repo";

type NoteRow = typeof structureNotes.$inferSelect;

async function toViews(ex: Executor, rows: NoteRow[], viewerId: string): Promise<StructureNoteView[]> {
  if (!rows.length) return [];
  const peopleIds = [...new Set(rows.flatMap((r) => [r.subjectUserId, ...(r.authorId ? [r.authorId] : [])]))];
  const people = await ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(inArray(profiles.userId, peopleIds));
  const pseudo = new Map(people.map((p) => [p.userId, p.deletedAt ? null : p.pseudo]));
  const eventIds = [...new Set(rows.flatMap((r) => (r.eventId ? [r.eventId] : [])))];
  const titles = eventIds.length
    ? await ex.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds))
    : [];
  const title = new Map(titles.map((t) => [t.id, t.title]));
  return rows.map((r) => ({
    id: r.id,
    subjectUserId: r.subjectUserId,
    subjectPseudo: pseudo.get(r.subjectUserId) ?? "",
    eventId: r.eventId,
    eventTitle: r.eventId ? (title.get(r.eventId) ?? null) : null,
    body: r.body,
    authorPseudo: r.authorId ? (pseudo.get(r.authorId) ?? null) : null,
    mine: r.authorId === viewerId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** La note d'une structure dont la personne est organisatrice ; 404 sinon (aucun contenu, aucun oracle d'identifiant). */
async function ownedNote(v: Viewer, id: string) {
  const [note] = await db
    .select()
    .from(structureNotes)
    .where(and(eq(structureNotes.id, id), isNull(structureNotes.deletedAt)));
  if (!note) throw notFound("Note introuvable");
  const role = await memberRole(db, v.user.id, note.structureId);
  if (role !== "owner" && role !== "co_organizer") throw notFound("Note introuvable");
  await requireStructureSpeaker(v, note.structureId);
  return note;
}

export const notesService = {
  /** `GET /structures/:id/notes?userId=&q=` : les plus récentes d'abord (organisateurs de la structure). */
  async list(v: Viewer, structureId: string, q: NoteListQuery): Promise<{ items: StructureNoteView[] }> {
    const s = await requireStructureReader(v, structureId);
    const rows = await db
      .select({ n: structureNotes })
      .from(structureNotes)
      .innerJoin(profiles, eq(profiles.userId, structureNotes.subjectUserId))
      .where(
        and(
          eq(structureNotes.structureId, s.id),
          isNull(structureNotes.deletedAt),
          q.userId ? eq(structureNotes.subjectUserId, q.userId) : undefined,
          q.q ? ilike(profiles.pseudo, `%${escapeLike(q.q)}%`) : undefined,
        ),
      )
      .orderBy(desc(structureNotes.createdAt), desc(structureNotes.id))
      .limit(q.limit);
    return {
      items: await toViews(
        db,
        rows.map((r) => r.n),
        v.user.id,
      ),
    };
  },

  /** `POST /structures/:id/notes` */
  async create(v: Viewer, structureId: string, input: NoteCreate): Promise<StructureNoteView> {
    const s = await requireStructureSpeaker(v, structureId);
    rateLimit("noteWrite", v.user.id);
    const subject = await profilesRepo.byPseudo(input.pseudo);
    if (!subject || subject.deletedAt) throw notFound("Personne introuvable");
    // Une note ne concerne qu'une personne passée par la structure : une candidature à l'un de ses événements.
    const [known] = await db
      .select({ id: applications.id })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(and(eq(applications.userId, subject.userId), eq(events.structureId, s.id)))
      .limit(1);
    if (!known) throw notFound("Personne introuvable");
    if (input.eventId) {
      const [ev] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.id, input.eventId), eq(events.structureId, s.id)));
      if (!ev) throw notFound("Événement introuvable");
    }
    return withTx(async (tx) => {
      // Plafond par personne tenu face à deux créations simultanées.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notes:${s.id}:${subject.userId}`}))`);
      const [n] = await tx
        .select({ n: count() })
        .from(structureNotes)
        .where(
          and(
            eq(structureNotes.structureId, s.id),
            eq(structureNotes.subjectUserId, subject.userId),
            isNull(structureNotes.deletedAt),
          ),
        );
      if ((n?.n ?? 0) >= STRUCTURE_NOTES_PER_SUBJECT) {
        throw new AppError(429, "rate_limited", `${STRUCTURE_NOTES_PER_SUBJECT} notes au plus par personne.`);
      }
      const [row] = await tx
        .insert(structureNotes)
        .values({
          structureId: s.id,
          subjectUserId: subject.userId,
          eventId: input.eventId ?? null,
          body: input.body,
          authorId: v.user.id,
        })
        .returning();
      if (!row) throw new Error("Note non enregistrée");
      const [view] = await toViews(tx, [row], v.user.id);
      if (!view) throw new Error("Note introuvable");
      return view;
    });
  },

  /** `PATCH /structure-notes/:id` */
  async update(v: Viewer, id: string, input: NoteUpdate): Promise<StructureNoteView> {
    const note = await ownedNote(v, id);
    rateLimit("noteWrite", v.user.id);
    if (!input.body.trim()) throw validation("La note est vide");
    const [row] = await db
      .update(structureNotes)
      .set({ body: input.body })
      .where(and(eq(structureNotes.id, note.id), isNull(structureNotes.deletedAt)))
      .returning();
    if (!row) throw notFound("Note introuvable");
    const [view] = await toViews(db, [row], v.user.id);
    if (!view) throw notFound("Note introuvable");
    return view;
  },

  /** `DELETE /structure-notes/:id` */
  async remove(v: Viewer, id: string): Promise<void> {
    const note = await ownedNote(v, id);
    rateLimit("noteWrite", v.user.id);
    await db
      .update(structureNotes)
      .set({ deletedAt: now() })
      .where(and(eq(structureNotes.id, note.id), isNull(structureNotes.deletedAt)));
  },

  /** Notes de la structure sur ces personnes, pour la fiche de tri (organisateurs seulement : appelée avec `withContact`). */
  async forSubjects(ex: Executor, structureId: string, userIds: string[], viewerId: string) {
    const out = new Map<string, StructureNoteView[]>();
    if (!userIds.length) return out;
    const rows = await ex
      .select()
      .from(structureNotes)
      .where(
        and(
          eq(structureNotes.structureId, structureId),
          inArray(structureNotes.subjectUserId, userIds),
          isNull(structureNotes.deletedAt),
        ),
      )
      .orderBy(desc(structureNotes.createdAt), desc(structureNotes.id));
    for (const view of await toViews(ex, rows, viewerId)) {
      const list = out.get(view.subjectUserId) ?? [];
      list.push(view);
      out.set(view.subjectUserId, list);
    }
    return out;
  },

  /** Compte supprimé (anonymisé) : les notes sur lui disparaissent, celles qu'il a écrites perdent leur auteur. */
  async anonymizeForDeletedAccount(tx: Tx, userId: string): Promise<void> {
    await tx.delete(structureNotes).where(eq(structureNotes.subjectUserId, userId));
    await tx.update(structureNotes).set({ authorId: null }).where(eq(structureNotes.authorId, userId));
  },
};
