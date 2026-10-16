// Droits de la communication (lot 20). Parler au nom d'une structure (annonce, consignes, message groupé, modèles) :
// propriétaire ou co-organisateur **actif**, structure ni supprimée ni suspendue, double authentification prouvée par
// la session. Le super admin n'y a pas accès (même règle que le côté structure de la messagerie, lot 18 : Orasso ne
// parle pas à la place d'un organisateur).
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "../../db/client";
import { structureMembers, structures } from "../../db/schema";
import { AppError, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { actorOf, twoFactorOk } from "../messaging/core";

export type StructureRow = typeof structures.$inferSelect;

const twoFactorError = () =>
  new AppError(403, "two_factor_required", "Double authentification obligatoire pour cet espace");

/** Rôle actif d'une personne dans une structure non supprimée (ou rien). */
export async function memberRole(ex: Executor, userId: string, structureId: string) {
  const [row] = await ex
    .select({ role: structureMembers.role })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.userId, userId),
        eq(structureMembers.status, "active"),
        isNull(structures.deletedAt),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

/** Organisateur qui parle au nom de la structure ; rend la structure. 403 sinon (aucun contenu). */
export async function requireStructureSpeaker(v: Viewer, structureId: string): Promise<StructureRow> {
  const role = await memberRole(db, v.user.id, structureId);
  if (role !== "owner" && role !== "co_organizer") throw forbidden("Réservé aux organisateurs de la structure");
  if (!twoFactorOk(actorOf(v).secondFactor)) throw twoFactorError();
  if (actorOf(v).suspended) throw forbidden("Ton compte est suspendu : lecture seule.");
  const [s] = await db.select().from(structures).where(eq(structures.id, structureId));
  if (!s || s.deletedAt) throw notFound("Structure introuvable");
  if (s.verification === "suspended") throw forbidden("Cette structure est suspendue.");
  return s;
}

/** Lecture de l'espace communication (historique, modèles) : mêmes droits, structure suspendue lisible. */
export async function requireStructureReader(v: Viewer, structureId: string): Promise<StructureRow> {
  const role = await memberRole(db, v.user.id, structureId);
  if (role !== "owner" && role !== "co_organizer") throw forbidden("Réservé aux organisateurs de la structure");
  if (!twoFactorOk(actorOf(v).secondFactor)) throw twoFactorError();
  const [s] = await db.select().from(structures).where(eq(structures.id, structureId));
  if (!s || s.deletedAt) throw notFound("Structure introuvable");
  return s;
}

/** Événement d'une structure que la personne peut faire parler ; 404 pour un événement inconnu. */
export async function requireEventSpeaker(v: Viewer, eventId: string): Promise<{ e: EventRow; s: StructureRow }> {
  const e = await eventsRepo.byId(eventId);
  const s = await requireStructureSpeaker(v, e.structureId);
  return { e, s };
}

export async function requireEventReader(v: Viewer, eventId: string): Promise<{ e: EventRow; s: StructureRow }> {
  const e = await eventsRepo.byId(eventId);
  const s = await requireStructureReader(v, e.structureId);
  return { e, s };
}

/**
 * Photo d'annonce (`POST /me/uploads purpose=announcement`) : seulement un organisateur qui peut publier (une structure
 * active non suspendue, double authentification), pour que la route ne serve pas d'hébergement d'images.
 */
export async function requireAnnouncementUploader(v: Viewer): Promise<void> {
  const rows = await db
    .select({ id: structures.id })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.userId, v.user.id),
        eq(structureMembers.status, "active"),
        inArray(structureMembers.role, ["owner", "co_organizer"]),
        isNull(structures.deletedAt),
        ne(structures.verification, "suspended"),
      ),
    );
  if (!rows.length) throw forbidden("Réservé aux organisateurs");
  if (!twoFactorOk(actorOf(v).secondFactor)) throw twoFactorError();
}
