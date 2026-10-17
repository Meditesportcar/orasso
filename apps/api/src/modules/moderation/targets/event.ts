// Cibles liées à un événement : l'événement lui-même (propriétaire de la structure ; retrait = annulation, super
// administrateur seulement), un avis (auteur ; retrait = avis masqué), une annonce du fil (auteur ; retrait = annonce
// supprimée). Visibilité : celle de la page publique de l'événement.
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../../db/client";
import { eventAnnouncements, events, reviews, structureMembers } from "../../../db/schema";
import { now } from "../../../lib/deps";
import { notFound } from "../../../lib/errors";
import { storage } from "../../../lib/storage";
import { announcementsService } from "../../communication/announcements";
import { eventsRepo } from "../../events/repo";
import { eventsService } from "../../events/service";
import { profilesRepo } from "../../profiles/repo";
import { goneView, type TargetRules, UUID_RE } from "./types";

async function eventRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  return db.query.events.findFirst({ where: eq(events.id, id) });
}

/** Propriétaire actif de la structure qui organise l'événement. */
async function structureOwner(structureId: string): Promise<string | null> {
  const owner = await db.query.structureMembers.findFirst({
    where: and(
      eq(structureMembers.structureId, structureId),
      eq(structureMembers.role, "owner"),
      eq(structureMembers.status, "active"),
    ),
    columns: { userId: true },
  });
  return owner?.userId ?? null;
}

export const eventTarget: TargetRules = {
  type: "event",
  async resolve(v, targetId) {
    const e = await eventRow(targetId);
    if (!e) throw notFound("Événement introuvable");
    await eventsService.getPublic(e.slug, v);
    return { ownerId: await structureOwner(e.structureId) };
  },
  async view(report) {
    const e = await eventRow(report.targetId);
    if (!e) return goneView("Événement supprimé");
    return {
      title: e.title,
      text: e.description,
      imageUrl: storage.url(e.posterKey),
      link: `/e/${e.slug}`,
      gone: false,
      removed: e.status === "cancelled",
    };
  },
  // Annulation par le service des événements (candidatures, billets, notifications), dans la transaction de la
  // décision (relecture : atomique) ; idempotente si l'événement est déjà annulé.
  async remove(tx, v, report, after) {
    const e = await eventsRepo.lockForUpdate(tx, report.targetId).catch(() => null);
    if (!e || e.status === "cancelled") return [];
    await eventsService.cancelInTx(tx, after, e.id, v.user.id, "orasso");
    return [];
  },
};

async function reviewRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(reviews).where(eq(reviews.id, id));
  return row;
}

export const reviewTarget: TargetRules = {
  type: "review",
  async resolve(v, targetId) {
    const r = await reviewRow(targetId);
    if (!r || r.hiddenAt) throw notFound("Avis introuvable");
    const e = await eventRow(r.eventId);
    if (!e) throw notFound("Avis introuvable");
    await eventsService.getPublic(e.slug, v);
    return { ownerId: r.userId };
  },
  async view(report) {
    const r = await reviewRow(report.targetId);
    if (!r) return goneView("Avis supprimé");
    const e = await eventRow(r.eventId);
    const author = await profilesRepo.byUserId(r.userId);
    return {
      title: `Avis de ${author && !author.deletedAt ? author.pseudo : "Compte supprimé"} · ${"★".repeat(r.rating)}`,
      text: r.comment,
      imageUrl: null,
      link: e ? `/e/${e.slug}` : null,
      gone: false,
      removed: Boolean(r.hiddenAt),
    };
  },
  async remove(tx, _v, report) {
    await tx
      .update(reviews)
      .set({ hiddenAt: now() })
      .where(and(eq(reviews.id, report.targetId), isNull(reviews.hiddenAt)));
    return [];
  },
};

async function announcementRow(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.id, id));
  return row;
}

export const announcementTarget: TargetRules = {
  type: "announcement",
  async resolve(v, targetId) {
    const a = await announcementRow(targetId);
    if (!a || a.deletedAt) throw notFound("Annonce introuvable");
    const e = await eventRow(a.eventId);
    if (!e) throw notFound("Annonce introuvable");
    // Visible du signaleur : présente dans le fil tel qu'il le lit (entrées réservées aux retenus comprises).
    const feed = await announcementsService.listPublic(e.slug, v);
    if (!feed.items.some((i) => i.id === a.id)) throw notFound("Annonce introuvable");
    return { ownerId: a.authorId ?? (await structureOwner(e.structureId)) };
  },
  async view(report) {
    const a = await announcementRow(report.targetId);
    if (!a) return goneView("Annonce supprimée");
    const e = await eventRow(a.eventId);
    return {
      title: e ? `Annonce · ${e.title}` : "Annonce",
      text: a.body,
      imageUrl: storage.url(a.imageKey),
      link: e ? `/e/${e.slug}` : null,
      gone: false,
      removed: Boolean(a.deletedAt),
    };
  },
  async remove(tx, _v, report) {
    const [a] = await tx
      .select()
      .from(eventAnnouncements)
      .where(and(eq(eventAnnouncements.id, report.targetId), isNull(eventAnnouncements.deletedAt)))
      .for("update");
    if (!a) return [];
    await tx
      .update(eventAnnouncements)
      .set({ deletedAt: now(), imageKey: null, imageWidth: null, imageHeight: null })
      .where(eq(eventAnnouncements.id, a.id));
    return a.imageKey ? [a.imageKey] : [];
  },
};
