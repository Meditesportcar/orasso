// Terrain du jour J (docs/01 « le jour J », ARCHITECTURE.md § 4.7) : alerte staff prioritaire et main courante.
// Lot 24 : la position de l'alerte (envoyée seulement à l'action, effacée dès que l'alerte est close ou au bout de 24 h)
// et la photo de la main courante (privée, décodée par le serveur, effacée un an après la fin de l'événement).
import {
  distanceFromEntryLabel,
  distanceKm,
  type IncidentView,
  type incidentCreateSchema,
  type StaffAlertView,
  type staffAlertCreateSchema,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { z } from "zod";

import { db } from "../../db/client";
import { events, incidents, profiles, staffAlerts, structureMembers } from "../../db/schema";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { uploadsService } from "../uploads/service";

/** Une position d'alerte non close n'est gardée que ce temps. */
export const ALERT_POSITION_TTL_MS = 24 * 3_600_000;
/** Les photos de la main courante disparaissent un an après la fin de l'événement (comme les discussions du staff). */
export const INCIDENT_PHOTO_TTL_MS = 365 * 86_400_000;

async function fieldEvent(v: Viewer, eventId: string) {
  const event = await eventsRepo.byId(eventId);
  if (event.status !== "published") throw notFound("Événement introuvable");
  const access = await staffService.requireEventStaff(v, event);
  return { event, access };
}

/** Rejeu d'un `clientId` : seulement le sien, sur le même événement (sinon 409, sans rien révéler). */
function mineOrConflict<T extends { eventId: string }>(row: T, eventId: string, ownerId: string | null, v: Viewer): T {
  if (row.eventId !== eventId || ownerId !== v.user.id) throw conflict("conflict", "Identifiant client déjà utilisé");
  return row;
}

const pseudoOf = async (userId: string | null) =>
  userId ? ((await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }))?.pseudo ?? null) : null;

/** Distance (m) d'une position à l'adresse de l'événement ; `null` si l'un des deux manque. */
function distanceToEntry(event: { lat: number | null; lng: number | null }, lat: number | null, lng: number | null) {
  if (lat === null || lng === null || event.lat === null || event.lng === null) return null;
  return Math.round(distanceKm({ lat, lng }, { lat: event.lat, lng: event.lng }) * 1000);
}

/** Position valide seulement si les deux coordonnées sont là. */
const positionOf = (input: { lat?: number | null; lng?: number | null }) =>
  input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : { lat: null, lng: null };

function incidentView(i: typeof incidents.$inferSelect, reporter: string | null): IncidentView {
  return {
    id: i.id,
    reporter,
    occurredAt: i.occurredAt.toISOString(),
    location: i.location,
    lat: i.lat,
    lng: i.lng,
    description: i.description,
    createdAt: i.createdAt.toISOString(),
    hasPhoto: Boolean(i.photoKey),
  };
}

export const fieldService = {
  /**
   * Alerte : notification immédiate (heures calmes ignorées) à tout le staff présent et aux organisateurs, et WebSocket.
   * Idempotente par `clientId` (file hors ligne de l'appli). La position (facultative, envoyée par l'appli seulement
   * quand le staff touche le bouton) vit sur la ligne de l'alerte et nulle part ailleurs : la notification n'en garde
   * que la distance à l'entrée.
   */
  async alert(v: Viewer, eventId: string, input: z.output<typeof staffAlertCreateSchema>) {
    const { event } = await fieldEvent(v, eventId);
    if (input.clientId) {
      const known = await db.query.staffAlerts.findFirst({ where: eq(staffAlerts.clientId, input.clientId) });
      if (known) return mineOrConflict(known, eventId, known.userId, v);
    }
    const pseudo = await pseudoOf(v.user.id);
    const position = positionOf(input);
    return withTx(async (tx, after) => {
      const [row] = await tx
        .insert(staffAlerts)
        .values({
          eventId,
          userId: v.user.id,
          lat: position.lat,
          lng: position.lng,
          message: input.message,
          clientId: input.clientId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const known = await tx.query.staffAlerts.findFirst({ where: eq(staffAlerts.clientId, input.clientId ?? "") });
        if (!known) throw new Error("Alerte non enregistrée");
        return mineOrConflict(known, eventId, known.userId, v);
      }
      const present = (await staffService.members(event, tx)).filter((m) => m.presence === "present");
      const organizers = await tx
        .select({ userId: structureMembers.userId })
        .from(structureMembers)
        .where(
          and(
            eq(structureMembers.structureId, event.structureId),
            eq(structureMembers.status, "active"),
            inArray(structureMembers.role, ["owner", "co_organizer"]),
          ),
        );
      const recipients = new Set([...present.map((m) => m.userId), ...organizers.map((o) => o.userId)]);
      recipients.delete(v.user.id);
      const distance = distanceFromEntryLabel(distanceToEntry(event, row.lat, row.lng));
      const where = row.lat !== null ? ` (position partagée${distance ? `, ${distance}` : ""})` : "";
      for (const userId of recipients) {
        await notificationsService.notify(tx, userId, "staff_alert", {
          title: `Alerte staff · ${pseudo ?? "staff"}`,
          body: `${row.message ?? "Besoin d'aide"}${where} · ${event.title}`,
          eventId,
          data: { eventId, screen: "alert" },
        });
      }
      const payload = {
        id: row.id,
        userId: v.user.id,
        pseudo,
        lat: row.lat,
        lng: row.lng,
        distanceM: distanceToEntry(event, row.lat, row.lng),
        message: row.message,
      };
      after(() => {
        realtime.publish(`event:${eventId}:live`, "alert", payload);
        realtime.publish(`event:${eventId}:access`, "alert", payload);
        notificationsService.kick();
      });
      return row;
    });
  },

  async alerts(v: Viewer, eventId: string): Promise<StaffAlertView[]> {
    const { event } = await fieldEvent(v, eventId);
    const rows = await db
      .select({ a: staffAlerts, pseudo: profiles.pseudo })
      .from(staffAlerts)
      .leftJoin(profiles, eq(profiles.userId, staffAlerts.userId))
      .where(eq(staffAlerts.eventId, eventId))
      .orderBy(desc(staffAlerts.createdAt));
    return rows.map(({ a, pseudo }) => ({
      id: a.id,
      pseudo,
      lat: a.lat,
      lng: a.lng,
      distanceM: distanceToEntry(event, a.lat, a.lng),
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    }));
  },

  /** Alerte close : la position est effacée au même moment (jamais conservée au-delà de l'alerte). */
  async resolveAlert(v: Viewer, eventId: string, alertId: string) {
    await fieldEvent(v, eventId);
    const [row] = await db
      .update(staffAlerts)
      .set({ resolvedAt: now(), resolvedBy: v.user.id, lat: null, lng: null })
      .where(and(eq(staffAlerts.id, alertId), eq(staffAlerts.eventId, eventId), isNull(staffAlerts.resolvedAt)))
      .returning();
    if (row) realtime.publish(`event:${eventId}:live`, "alert.resolved", { id: alertId });
    return { resolved: Boolean(row) };
  },

  /** Main courante : une ligne par incident, idempotente par `clientId`. */
  async addIncident(v: Viewer, eventId: string, input: z.output<typeof incidentCreateSchema>) {
    await fieldEvent(v, eventId);
    const [row] = await db
      .insert(incidents)
      .values({
        eventId,
        reporterUserId: v.user.id,
        occurredAt: input.occurredAt,
        location: input.location,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        description: input.description,
        clientId: input.clientId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    const incident =
      row ?? (await db.query.incidents.findFirst({ where: eq(incidents.clientId, input.clientId ?? "") }));
    if (!incident) throw new Error("Incident non enregistré");
    if (!row) return mineOrConflict(incident, eventId, incident.reporterUserId, v);
    realtime.publish(`event:${eventId}:live`, "incident", { id: row.id, occurredAt: row.occurredAt });
    return incident;
  },

  async incidents(v: Viewer, eventId: string): Promise<IncidentView[]> {
    await fieldEvent(v, eventId);
    const rows = await db
      .select({ i: incidents, pseudo: profiles.pseudo })
      .from(incidents)
      .leftJoin(profiles, eq(profiles.userId, incidents.reporterUserId))
      .where(eq(incidents.eventId, eventId))
      .orderBy(desc(incidents.occurredAt));
    return rows.map(({ i, pseudo }) => incidentView(i, pseudo));
  },

  /**
   * Photo d'un incident, envoyée après coup (`POST /me/uploads purpose=incident` puis cette route). `incidentRef` est
   * l'identifiant de l'incident ou celui que l'appli a généré (`clientId`). Le rapporteur de l'incident ou l'organisation
   * seulement ; le fichier doit avoir été envoyé par la même personne, pour cet usage, et n'est rattaché qu'une fois.
   * Une photo déjà posée ne se remplace pas (pièce d'assurance) ; rejouer la même clé est sans effet.
   */
  async setIncidentPhoto(v: Viewer, eventId: string, incidentRef: string, photoKey: string): Promise<IncidentView> {
    const { event, access } = await fieldEvent(v, eventId);
    const [row] = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.eventId, eventId),
          or(eq(incidents.id, incidentRef), eq(incidents.clientId, incidentRef)),
        ),
      );
    if (!row) throw notFound("Incident introuvable");
    if (access.actor === "staff" && row.reporterUserId !== v.user.id) {
      throw forbidden("Seul l'auteur de l'incident ou l'organisation y joint une photo");
    }
    if (row.photoKey === photoKey) return incidentView(row, await pseudoOf(row.reporterUserId));
    if (row.photoKey) throw conflict("conflict", "Cet incident a déjà une photo");
    const updated = await withTx(async (tx) => {
      const upload = await uploadsService.consume(tx, v.user.id, photoKey, "incident");
      if (!upload) throw notFound("Photo introuvable : envoie-la d'abord");
      const [u] = await tx
        .update(incidents)
        .set({ photoKey })
        .where(and(eq(incidents.id, row.id), isNull(incidents.photoKey)))
        .returning();
      if (!u) throw conflict("conflict", "Cet incident a déjà une photo");
      return u;
    });
    realtime.publish(`event:${event.id}:live`, "incident", { id: updated.id, occurredAt: updated.occurredAt });
    return incidentView(updated, await pseudoOf(updated.reporterUserId));
  },

  /** `GET /events/:id/incidents/:incidentId/photo` : le staff de l'événement et l'organisation seulement. */
  async incidentPhoto(v: Viewer, eventId: string, incidentId: string): Promise<Buffer> {
    await fieldEvent(v, eventId);
    const [row] = await db
      .select({ key: incidents.photoKey })
      .from(incidents)
      .where(and(eq(incidents.id, incidentId), eq(incidents.eventId, eventId)));
    const data = row?.key ? await storage.get(row.key) : null;
    if (!data) throw notFound("Photo introuvable");
    return data;
  },

  /**
   * Tâche `field.sweep` (chaque heure) : effacement des positions d'alerte restées après leur clôture ou plus vieilles
   * que 24 h, et des photos de main courante un an après la fin de l'événement. Rend les nombres effacés.
   */
  async sweep(): Promise<{ positions: number; photos: number }> {
    const cutoff = new Date(now().getTime() - ALERT_POSITION_TTL_MS);
    const positions = await db
      .update(staffAlerts)
      .set({ lat: null, lng: null })
      .where(
        and(
          or(isNotNull(staffAlerts.lat), isNotNull(staffAlerts.lng)),
          or(isNotNull(staffAlerts.resolvedAt), lt(staffAlerts.createdAt, cutoff)),
        ),
      )
      .returning({ id: staffAlerts.id });
    const photoCutoff = new Date(now().getTime() - INCIDENT_PHOTO_TTL_MS);
    const old = await db
      .select({ id: incidents.id, key: incidents.photoKey })
      .from(incidents)
      .innerJoin(events, eq(events.id, incidents.eventId))
      .where(and(isNotNull(incidents.photoKey), lt(events.endsAt, photoCutoff)));
    for (const o of old) {
      await db.update(incidents).set({ photoKey: null }).where(eq(incidents.id, o.id));
      if (o.key) await storage.remove(o.key).catch(() => undefined);
    }
    return { positions: positions.length, photos: old.length };
  },
};
