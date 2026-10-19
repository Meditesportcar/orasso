// Fil de l'événement et consignes (lot 20, ARCHITECTURE-SUITE § 5.2). Le fil est en lecture seule pour le public (S19 :
// pas de commentaires) ; une entrée `public` se lit sans compte, une entrée `participants` seulement par les retenus
// (véhicules et prestataires) et l'équipe de la structure. Le texte est rendu tel quel par les clients (React échappe :
// aucune balise interprétée). Les changements de statut (Maintenu / Incertain / Annulé) s'y inscrivent seuls.
import { randomUUID } from "node:crypto";
import {
  ANNOUNCEMENTS_PER_DAY,
  type AnnouncementAudience,
  type AnnouncementCreate,
  type AnnouncementView,
  arrivalLabel,
  type EventOutlook,
  shorten,
  statusChangeText,
} from "@orasso/shared";
import { and, count, desc, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  eventAnnouncements,
  events,
  profiles,
  structureBans,
  structureFollows,
  structures,
  uploads,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { arrivalsOf } from "../events/arrivals";
import { type EventRow, eventsRepo } from "../events/repo";
import { canSeeEvent } from "../invitations/access";
import { notificationsService } from "../notifications/service";
import { uploadsService } from "../uploads/service";
import { memberRole, requireEventReader, requireEventSpeaker } from "./guards";

type AnnouncementRow = typeof eventAnnouncements.$inferSelect;

const PAGE = 50;

function serialize(row: AnnouncementRow, structureName: string, authorPseudo?: string | null): AnnouncementView {
  return {
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    audience: row.audience,
    body: row.body,
    image: row.imageKey
      ? { url: storage.url(row.imageKey) ?? "", width: row.imageWidth, height: row.imageHeight }
      : null,
    pinned: row.pinned,
    publishedAt: row.publishedAt.toISOString(),
    structureName,
    ...(authorPseudo !== undefined ? { authorPseudo } : {}),
  };
}

/** Retenus (véhicules et prestataires) : ceux qui reçoivent les consignes et lisent les entrées `participants`. */
async function acceptedUserIds(ex: Tx | typeof db, eventId: string): Promise<string[]> {
  const rows = await ex
    .selectDistinct({ userId: applications.userId })
    .from(applications)
    .where(and(eq(applications.eventId, eventId), eq(applications.status, "accepted")));
  return rows.map((r) => r.userId);
}

/** Ce que la personne peut lire du fil : tout (équipe), `participants` (retenue), ou seulement `public`. */
async function audienceOf(v: Viewer | null, e: EventRow): Promise<"team" | "participant" | "public"> {
  if (!v) return "public";
  if (await memberRole(db, v.user.id, e.structureId)) return "team";
  const [accepted] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.eventId, e.id), eq(applications.userId, v.user.id), eq(applications.status, "accepted")))
    .limit(1);
  return accepted ? "participant" : "public";
}

/**
 * Copie la photo envoyée (clé privée en attente) vers une clé publique, **hors transaction** (relecture du lot 20 :
 * aucune écriture de fichier sous le verrou de l'événement) ; le rattachement (une seule fois, par son auteur) se fait
 * ensuite dans la transaction. Rend `null` si la clé ne convient pas.
 */
async function copyImage(v: Viewer, eventId: string, imageKey: string) {
  const [upload] = await db
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.key, imageKey),
        eq(uploads.userId, v.user.id),
        eq(uploads.purpose, "announcement"),
        isNull(uploads.consumedAt),
      ),
    );
  if (!upload) throw validation("Photo inconnue ou déjà utilisée");
  const data = await storage.get(upload.key);
  if (!data) throw validation("Photo introuvable : renvoie-la");
  const key = `announcements/${eventId}/${randomUUID()}.webp`;
  await storage.put(key, data);
  return { key, privateKey: upload.key, width: upload.width, height: upload.height };
}

export const announcementsService = {
  /** `GET /events/by-slug/:slug/announcements` : fil public (sans compte), enrichi pour les retenus et l'équipe. */
  async listPublic(slug: string, v: Viewer | null): Promise<{ items: AnnouncementView[] }> {
    const [row] = await db
      .select({ e: events, structureName: structures.name })
      .from(events)
      .innerJoin(structures, eq(structures.id, events.structureId))
      .where(eq(events.slug, slug));
    if (!row || row.e.status === "draft") throw notFound("Événement introuvable");
    const audience = await audienceOf(v, row.e);
    // Événement sur invitation : invisible pour qui n'y a ni candidature ni place dans l'équipe (comme sa page).
    if (row.e.admission === "invite_only" && audience !== "team" && !(await canSeeEvent(row.e, v))) {
      throw notFound("Événement introuvable");
    }
    const audiences: AnnouncementAudience[] = audience === "public" ? ["public"] : ["public", "participants"];
    const rows = await db
      .select()
      .from(eventAnnouncements)
      .where(
        and(
          eq(eventAnnouncements.eventId, row.e.id),
          isNull(eventAnnouncements.deletedAt),
          inArray(eventAnnouncements.audience, audiences),
        ),
      )
      .orderBy(
        desc(eventAnnouncements.pinned),
        desc(eventAnnouncements.publishedAt),
        desc(eventAnnouncements.createdAt),
      )
      .limit(PAGE);
    return { items: rows.map((r) => serialize(r, row.structureName)) };
  },

  /** `GET /events/:id/announcements` (organisateurs) : tout le fil, avec l'auteur. */
  async listForOrganizer(v: Viewer, eventId: string): Promise<{ items: AnnouncementView[] }> {
    const { e, s } = await requireEventReader(v, eventId);
    const rows = await db
      .select({ a: eventAnnouncements, pseudo: profiles.pseudo, deletedAt: profiles.deletedAt })
      .from(eventAnnouncements)
      .leftJoin(profiles, eq(profiles.userId, eventAnnouncements.authorId))
      .where(and(eq(eventAnnouncements.eventId, e.id), isNull(eventAnnouncements.deletedAt)))
      .orderBy(
        desc(eventAnnouncements.pinned),
        desc(eventAnnouncements.publishedAt),
        desc(eventAnnouncements.createdAt),
      )
      .limit(PAGE);
    return { items: rows.map((r) => serialize(r.a, s.name, r.deletedAt ? null : (r.pseudo ?? null))) };
  },

  /**
   * `POST /events/:id/announcements` : publie une entrée du fil. « Prévenir » : `event_announcement` (push + Journal,
   * jamais d'e-mail) aux inscrits actifs — aux seuls retenus pour une annonce réservée aux retenus. Une annonce
   * publique arrive aussi au Journal des abonnés (`structure_announcement`, sans push). 20 annonces par jour et par
   * événement, comptées sous le verrou de l'événement.
   */
  async create(v: Viewer, eventId: string, input: AnnouncementCreate): Promise<AnnouncementView> {
    const { e, s } = await requireEventSpeaker(v, eventId);
    if (e.status === "draft") throw conflict("conflict", "Publie l'événement avant d'y écrire une annonce.");
    const image = input.imageKey ? await copyImage(v, e.id, input.imageKey) : null;
    const preview = shorten(input.body, 160);
    try {
      const { row, notified } = await withTx(async (tx, after) => {
        await eventsRepo.lockForUpdate(tx, e.id);
        const [today] = await tx
          .select({ n: count() })
          .from(eventAnnouncements)
          .where(
            and(
              eq(eventAnnouncements.eventId, e.id),
              eq(eventAnnouncements.kind, "announcement"),
              gt(eventAnnouncements.createdAt, new Date(now().getTime() - 86_400_000)),
            ),
          );
        if ((today?.n ?? 0) >= ANNOUNCEMENTS_PER_DAY) {
          throw new AppError(429, "rate_limited", "Trop d'annonces aujourd'hui pour cet événement.");
        }
        if (image && !(await uploadsService.consume(tx, v.user.id, image.privateKey, "announcement"))) {
          throw validation("Photo inconnue ou déjà utilisée");
        }
        const [inserted] = await tx
          .insert(eventAnnouncements)
          .values({
            eventId: e.id,
            authorId: v.user.id,
            kind: "announcement",
            audience: input.audience,
            body: input.body,
            imageKey: image?.key ?? null,
            imageWidth: image?.width ?? null,
            imageHeight: image?.height ?? null,
            pinned: input.pinned,
            notified: input.notify,
            publishedAt: now(),
          })
          .returning();
        if (!inserted) throw new Error("Annonce non enregistrée");
        const notified: string[] = [];
        if (input.notify) {
          const users =
            input.audience === "participants"
              ? await acceptedUserIds(tx, e.id)
              : await eventsRepo.activeApplicantIds(e.id, tx);
          notified.push(...users);
          // Une seule requête pour tous les inscrits (relecture du lot 20 : pas de boucle sous le verrou).
          await notificationsService.notifyMany(tx, users, "event_announcement", {
            title: `${s.name} · ${e.title}`,
            body: preview,
            eventId: e.id,
            eventStartsAt: e.startsAt,
            data: { eventId: e.id, announcementId: inserted.id },
            link: { label: "Voir l'annonce", path: `/e/${e.slug}#fil` },
          });
        }
        after(() => notificationsService.kick());
        return { row: inserted, notified };
      });
      if (image) await storage.remove(image.privateKey).catch(() => undefined);
      // Abonnés (hors bannis, hors déjà prévenus) : une actualité au Journal, sans push, après la validation (hors du
      // verrou de l'événement). Un échec ici ne retire pas l'annonce.
      if (input.audience === "public" && e.admission !== "invite_only") {
        await withTx(async (tx, after) => {
          const followers = await tx
            .select({ userId: structureFollows.userId })
            .from(structureFollows)
            .where(
              and(
                eq(structureFollows.structureId, s.id),
                sql`not exists (select 1 from ${structureBans} b where b.structure_id = ${s.id} and b.user_id = ${structureFollows.userId})`,
                notified.length ? notInArray(structureFollows.userId, notified) : undefined,
              ),
            );
          await notificationsService.notifyMany(
            tx,
            followers.map((f) => f.userId),
            "structure_announcement",
            {
              title: `${s.name} · ${e.title}`,
              body: preview,
              eventId: e.id,
              data: { eventId: e.id, announcementId: row.id },
              link: { label: "Voir l'annonce", path: `/e/${e.slug}#fil` },
            },
          );
          after(() => notificationsService.kick());
        }).catch((error) => console.error("Annonce : actualité des abonnés", error));
      }
      return serialize(row, s.name, v.profile.pseudo);
    } catch (error) {
      // Rien d'enregistré : la copie publique de la photo ne doit pas rester.
      if (image) await storage.remove(image.key).catch(() => undefined);
      throw error;
    }
  },

  /** `PATCH /events/:id/announcements/:aid {pinned}` : épingler ou désépingler (modération par l'organisateur). */
  async setPinned(v: Viewer, eventId: string, id: string, pinned: boolean): Promise<AnnouncementView> {
    const { e, s } = await requireEventSpeaker(v, eventId);
    const [row] = await db
      .update(eventAnnouncements)
      .set({ pinned })
      .where(
        and(eq(eventAnnouncements.id, id), eq(eventAnnouncements.eventId, e.id), isNull(eventAnnouncements.deletedAt)),
      )
      .returning();
    if (!row) throw notFound("Entrée introuvable");
    return serialize(row, s.name);
  },

  /** `DELETE /events/:id/announcements/:aid` : retirée du fil pour tous, photo effacée du stockage. */
  async remove(v: Viewer, eventId: string, id: string) {
    const { e } = await requireEventSpeaker(v, eventId);
    const imageKey = await withTx(async (tx) => {
      const [current] = await tx
        .select({ imageKey: eventAnnouncements.imageKey })
        .from(eventAnnouncements)
        .where(
          and(
            eq(eventAnnouncements.id, id),
            eq(eventAnnouncements.eventId, e.id),
            isNull(eventAnnouncements.deletedAt),
          ),
        )
        .for("update");
      if (!current) throw notFound("Entrée introuvable");
      await tx
        .update(eventAnnouncements)
        .set({ deletedAt: now(), imageKey: null, imageWidth: null, imageHeight: null })
        .where(eq(eventAnnouncements.id, id));
      return current.imageKey;
    });
    if (imageKey) await storage.remove(imageKey).catch(() => undefined);
  },

  /**
   * `POST /events/:id/instructions/send` : enregistre les consignes (si fournies) et les envoie aux retenus
   * (`event_instructions`, push + Journal) ; entrée `instructions` du fil, réservée aux retenus. Les mêmes consignes
   * ne partent pas deux fois (409) : il faut les modifier pour renvoyer.
   */
  async sendInstructions(v: Viewer, eventId: string, instructions: string | null | undefined) {
    const { e, s } = await requireEventSpeaker(v, eventId);
    if (e.status !== "published") throw conflict("conflict", "Événement non publié ou annulé");
    return withTx(async (tx, after) => {
      const locked = await eventsRepo.lockForUpdate(tx, e.id);
      let text = locked.instructions;
      if (instructions !== undefined) {
        await tx.update(events).set({ instructions }).where(eq(events.id, e.id));
        text = instructions;
      }
      if (!text) throw validation("Écris d'abord les consignes.");
      // Lot 47 : les consignes commencent par le créneau d'arrivée des exposants (« Arrivée 18 h 30 – 19 h 15
      // (strict) · Entrée côté capitainerie… »).
      const slot = arrivalsOf(locked).exhibitors;
      if (slot) text = `${[arrivalLabel(slot), slot.note].filter(Boolean).join(" · ")}\n\n${text}`;
      const [last] = await tx
        .select({ body: eventAnnouncements.body })
        .from(eventAnnouncements)
        .where(
          and(
            eq(eventAnnouncements.eventId, e.id),
            eq(eventAnnouncements.kind, "instructions"),
            isNull(eventAnnouncements.deletedAt),
          ),
        )
        .orderBy(desc(eventAnnouncements.publishedAt), desc(eventAnnouncements.createdAt))
        .limit(1);
      if (last?.body === text) throw conflict("conflict", "Ces consignes ont déjà été envoyées.");
      const [entry] = await tx
        .insert(eventAnnouncements)
        .values({
          eventId: e.id,
          authorId: v.user.id,
          kind: "instructions",
          audience: "participants",
          body: text,
          notified: true,
          publishedAt: now(),
        })
        .returning();
      const users = await acceptedUserIds(tx, e.id);
      await notificationsService.notifyMany(tx, users, "event_instructions", {
        title: `Consignes · ${e.title}`,
        body: shorten(text, 200),
        eventId: e.id,
        eventStartsAt: e.startsAt,
        data: { eventId: e.id },
        link: { label: "Ouvrir mes accès", path: "/app/acces" },
      });
      after(() => notificationsService.kick());
      if (!entry) throw new Error("Consignes non enregistrées");
      return { recipientsCount: users.length, entry: serialize(entry, s.name, v.profile.pseudo) };
    });
  },

  /**
   * Entrée automatique du fil quand le statut change (appelée par `EventService` dans sa transaction, après le
   * contrôle « a vraiment changé » sous verrou : une seule entrée par changement).
   */
  async recordStatusChange(tx: Tx, eventId: string, status: EventOutlook | "cancelled", authorId: string | null) {
    await tx.insert(eventAnnouncements).values({
      eventId,
      authorId,
      kind: "status_change",
      audience: "public",
      body: statusChangeText(status),
      publishedAt: now(),
    });
  },
};
