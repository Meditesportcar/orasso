// Terrain du jour J (docs/01 « le jour J », ARCHITECTURE.md § 4.7) : alerte staff prioritaire et main courante.
// Écrans au lot 10 (appli) ou 13 ; la photo d'un incident s'ajoutera avec eux (colonne `photo_key` prête).
import type { incidentCreateSchema, staffAlertCreateSchema } from "@orasso/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";

import { db } from "../../db/client";
import { incidents, profiles, staffAlerts, structureMembers } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";

async function fieldEvent(v: Viewer, eventId: string) {
  const event = await eventsRepo.byId(eventId);
  if (event.status !== "published") throw notFound("Événement introuvable");
  await staffService.requireEventStaff(v, event);
  return event;
}

const pseudoOf = async (userId: string | null) =>
  userId ? ((await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }))?.pseudo ?? null) : null;

export const fieldService = {
  /**
   * Alerte : notification immédiate (heures calmes ignorées) à tout le staff présent et aux organisateurs, et WebSocket.
   * Idempotente par `clientId` (file hors ligne de l'appli).
   */
  async alert(v: Viewer, eventId: string, input: z.output<typeof staffAlertCreateSchema>) {
    const event = await fieldEvent(v, eventId);
    if (input.clientId) {
      const known = await db.query.staffAlerts.findFirst({ where: eq(staffAlerts.clientId, input.clientId) });
      if (known) return known;
    }
    const pseudo = await pseudoOf(v.user.id);
    return withTx(async (tx, after) => {
      const [row] = await tx
        .insert(staffAlerts)
        .values({
          eventId,
          userId: v.user.id,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          message: input.message,
          clientId: input.clientId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const known = await tx.query.staffAlerts.findFirst({ where: eq(staffAlerts.clientId, input.clientId ?? "") });
        if (!known) throw new Error("Alerte non enregistrée");
        return known;
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
      const where =
        row.lat !== null && row.lng !== null ? ` (position ${row.lat.toFixed(5)}, ${row.lng.toFixed(5)})` : "";
      for (const userId of recipients) {
        await notificationsService.notify(tx, userId, "staff_alert", {
          title: `Alerte staff · ${pseudo ?? "staff"}`,
          body: `${row.message ?? "Besoin d'aide"}${where} · ${event.title}`,
          eventId,
          data: { eventId, screen: "alert" },
        });
      }
      const payload = { id: row.id, userId: v.user.id, pseudo, lat: row.lat, lng: row.lng, message: row.message };
      after(() => {
        realtime.publish(`event:${eventId}:live`, "alert", payload);
        realtime.publish(`event:${eventId}:access`, "alert", payload);
        notificationsService.kick();
      });
      return row;
    });
  },

  async alerts(v: Viewer, eventId: string) {
    await fieldEvent(v, eventId);
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
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    }));
  },

  async resolveAlert(v: Viewer, eventId: string, alertId: string) {
    await fieldEvent(v, eventId);
    const [row] = await db
      .update(staffAlerts)
      .set({ resolvedAt: now(), resolvedBy: v.user.id })
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
    if (row) realtime.publish(`event:${eventId}:live`, "incident", { id: row.id, occurredAt: row.occurredAt });
    return incident;
  },

  async incidents(v: Viewer, eventId: string) {
    await fieldEvent(v, eventId);
    const rows = await db
      .select({ i: incidents, pseudo: profiles.pseudo })
      .from(incidents)
      .leftJoin(profiles, eq(profiles.userId, incidents.reporterUserId))
      .where(eq(incidents.eventId, eventId))
      .orderBy(desc(incidents.occurredAt));
    return rows.map(({ i, pseudo }) => ({
      id: i.id,
      reporter: pseudo,
      occurredAt: i.occurredAt.toISOString(),
      location: i.location,
      lat: i.lat,
      lng: i.lng,
      description: i.description,
      createdAt: i.createdAt.toISOString(),
    }));
  },
};
