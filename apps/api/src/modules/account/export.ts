// Export des données personnelles (lot 35c, D20) : tout ce que le compte a saisi ou produit, en un fichier JSON lisible,
// pour le titulaire seulement. Jamais de secret (mot de passe, secret du QR de compte, clés d'accès) ni de donnée d'un
// autre compte (messages, coordonnées des autres). Les photos ne sont pas incluses : leurs adresses suffisent.
import { desc, eq } from "drizzle-orm";

import { db } from "../../db/client";
import {
  applications,
  events,
  pointEntries,
  profiles,
  seasons,
  structureMembers,
  structures,
  tickets,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";

export type AccountExport = {
  exportedAt: string;
  account: { id: string; email: string; createdAt: string };
  profile: Record<string, unknown>;
  vehicles: Record<string, unknown>[];
  applications: Record<string, unknown>[];
  tickets: Record<string, unknown>[];
  points: { season: string; kind: string; points: number; event: string | null; note: string | null; at: string }[];
  structures: { name: string; role: string; status: string }[];
};

export const accountExportService = {
  /** `GET /me/export` : limité à 5 par heure (chaque export relit tout le compte). */
  async build(v: Viewer): Promise<AccountExport> {
    rateLimit("accountExport", v.user.id);
    const userId = v.user.id;
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));

    const vehicleRows = await db
      .select({ v: vehicles, make: vehicleMakes.name, model: vehicleModels.name })
      .from(vehicles)
      .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
      .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .where(eq(vehicles.ownerId, userId))
      .orderBy(vehicles.createdAt);
    const photos = await db
      .select({ vehicleId: vehiclePhotos.vehicleId, key: vehiclePhotos.storageKey })
      .from(vehiclePhotos)
      .innerJoin(vehicles, eq(vehicles.id, vehiclePhotos.vehicleId))
      .where(eq(vehicles.ownerId, userId))
      .orderBy(vehiclePhotos.position);

    const applicationRows = await db
      .select({ a: applications, title: events.title, startsAt: events.startsAt })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.createdAt));

    const ticketRows = await db
      .select({ t: tickets, title: events.title, startsAt: events.startsAt })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(eq(tickets.userId, userId))
      .orderBy(desc(tickets.issuedAt));

    const pointRows = await db
      .select({ e: pointEntries, season: seasons.name, title: events.title })
      .from(pointEntries)
      .innerJoin(seasons, eq(seasons.id, pointEntries.seasonId))
      .leftJoin(events, eq(events.id, pointEntries.eventId))
      .where(eq(pointEntries.userId, userId))
      .orderBy(desc(pointEntries.createdAt));

    const memberRows = await db
      .select({ name: structures.name, role: structureMembers.role, status: structureMembers.status })
      .from(structureMembers)
      .innerJoin(structures, eq(structures.id, structureMembers.structureId))
      .where(eq(structureMembers.userId, userId));

    return {
      exportedAt: now().toISOString(),
      account: { id: userId, email: v.user.email, createdAt: v.user.createdAt.toISOString() },
      profile: p
        ? {
            pseudo: p.pseudo,
            firstName: p.firstName,
            lastName: p.lastName,
            phone: p.phone,
            bio: p.bio,
            avatarUrl: storage.url(p.avatarKey),
            visibility: p.visibility,
            departments: p.departments,
            radiusKm: p.radiusKm,
            newsletterOptIn: p.newsletterOptIn,
            notificationPrefs: p.notificationPrefs,
            mutedTypes: p.mutedTypes,
            grade: p.grade,
            pointsSeason: p.pointsSeason,
            createdAt: p.createdAt.toISOString(),
          }
        : {},
      vehicles: vehicleRows.map(({ v: row, make, model }) => ({
        id: row.id,
        make,
        model,
        vehicleType: row.vehicleType,
        year: row.year,
        color: row.color,
        engine: row.engine,
        powerHp: row.powerHp,
        weightKg: row.weightKg,
        plate: row.plate,
        unregistered: row.unregistered,
        status: row.status,
        statusNote: row.statusNote,
        description: row.description,
        preparation: row.preparation,
        certifiedAt: row.certifiedAt?.toISOString() ?? null,
        photos: photos.filter((x) => x.vehicleId === row.id).map((x) => storage.url(x.key)),
        createdAt: row.createdAt.toISOString(),
      })),
      applications: applicationRows.map(({ a, title, startsAt }) => ({
        id: a.id,
        event: title,
        eventStartsAt: startsAt.toISOString(),
        kind: a.kind,
        vehicleId: a.vehicleId,
        status: a.status,
        companions: a.companions,
        message: a.message,
        withdrawnAt: a.withdrawnAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
      tickets: ticketRows.map(({ t, title, startsAt }) => ({
        id: t.id,
        event: title,
        eventStartsAt: startsAt.toISOString(),
        status: t.status,
        issuedAt: t.issuedAt.toISOString(),
        usedAt: t.usedAt?.toISOString() ?? null,
      })),
      points: pointRows.map(({ e, season, title }) => ({
        season,
        kind: e.kind,
        points: e.points,
        event: title,
        note: e.note,
        at: e.createdAt.toISOString(),
      })),
      structures: memberRows,
    };
  },
};
