// Base véhicules (lot 33, docs/01 « base construite par Orasso, enrichie au fil des Autre ») : marques, modèles et
// générations gérés par l'équipe, file des véhicules « Autre » groupés, rattachement d'un véhicule au référentiel
// (propriétaire prévenu). Une marque créée reçoit son modèle « Autre », un modèle créé sa génération « Autre » :
// le formulaire du garage garde « Autre » à chaque niveau. Suppression refusée tant qu'un véhicule y est rattaché.
import type { OtherVehicleGroup, ReferenceGeneration, ReferenceMake, ReferenceModel } from "@orasso/shared";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, vehicleGenerations, vehicleMakes, vehicleModels, vehiclePhotos, vehicles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { slugify } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { checkReference } from "../vehicles/service";
import { audit } from "./audit";

const isUnique = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

async function uniqueOr<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isUnique(error)) throw conflict("conflict", message);
    throw error;
  }
}

async function usage(column: typeof vehicles.makeId | typeof vehicles.modelId | typeof vehicles.generationId) {
  const rows = await db
    .select({ id: column, n: count() })
    .from(vehicles)
    .where(sql`${column} is not null`)
    .groupBy(column);
  return new Map(rows.map((r) => [r.id as string, r.n]));
}

async function makeOrThrow(tx: Tx, id: string) {
  const [m] = await tx.select().from(vehicleMakes).where(eq(vehicleMakes.id, id)).for("update");
  if (!m) throw notFound("Marque introuvable");
  if (m.isOther) throw validation("« Autre » ne se modifie pas.");
  return m;
}

async function modelOrThrow(tx: Tx, id: string) {
  const [m] = await tx.select().from(vehicleModels).where(eq(vehicleModels.id, id)).for("update");
  if (!m) throw notFound("Modèle introuvable");
  if (m.isOther) throw validation("« Autre » ne se modifie pas.");
  return m;
}

async function generationOrThrow(tx: Tx, id: string) {
  const [g] = await tx.select().from(vehicleGenerations).where(eq(vehicleGenerations.id, id)).for("update");
  if (!g) throw notFound("Génération introuvable");
  if (g.isOther) throw validation("« Autre » ne se modifie pas.");
  return g;
}

export const vehicleReferenceService = {
  /** `GET /admin/vehicle-reference/makes` : marques et nombre de véhicules rattachés. */
  async makes(v: Viewer): Promise<ReferenceMake[]> {
    await requirePlatformRole(v, "super_admin");
    const n = await usage(vehicles.makeId);
    const rows = await db.query.vehicleMakes.findMany({ orderBy: [asc(vehicleMakes.isOther), asc(vehicleMakes.name)] });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      country: m.country,
      isOther: m.isOther,
      vehicles: n.get(m.id) ?? 0,
    }));
  },

  /** `GET /admin/vehicle-reference/makes/:id/models` */
  async models(v: Viewer, makeId: string): Promise<ReferenceModel[]> {
    await requirePlatformRole(v, "super_admin");
    const n = await usage(vehicles.modelId);
    const rows = await db.query.vehicleModels.findMany({
      where: eq(vehicleModels.makeId, makeId),
      orderBy: [asc(vehicleModels.isOther), asc(vehicleModels.name)],
    });
    return rows.map((m) => ({
      id: m.id,
      makeId: m.makeId,
      name: m.name,
      vehicleType: m.vehicleType,
      isOther: m.isOther,
      vehicles: n.get(m.id) ?? 0,
    }));
  },

  /** `GET /admin/vehicle-reference/models/:id/generations` */
  async generations(v: Viewer, modelId: string): Promise<ReferenceGeneration[]> {
    await requirePlatformRole(v, "super_admin");
    const n = await usage(vehicles.generationId);
    const rows = await db.query.vehicleGenerations.findMany({
      where: eq(vehicleGenerations.modelId, modelId),
      orderBy: [asc(vehicleGenerations.isOther), asc(vehicleGenerations.yearFrom), asc(vehicleGenerations.name)],
    });
    return rows.map((g) => ({
      id: g.id,
      modelId: g.modelId,
      name: g.name,
      yearFrom: g.yearFrom,
      yearTo: g.yearTo,
      isOther: g.isOther,
      vehicles: n.get(g.id) ?? 0,
    }));
  },

  async createMake(v: Viewer, input: { name: string; country: string | null }) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const [make] = await uniqueOr(
        () =>
          tx
            .insert(vehicleMakes)
            .values({ name: input.name, slug: slugify(input.name), country: input.country })
            .returning(),
        "Cette marque existe déjà.",
      );
      if (!make) throw new Error("Marque non créée");
      const [other] = await tx
        .insert(vehicleModels)
        .values({ makeId: make.id, name: "Autre", slug: "autre", vehicleType: "car", isOther: true })
        .returning();
      if (other) await tx.insert(vehicleGenerations).values({ modelId: other.id, name: "Autre", isOther: true });
      await audit(tx, v, {
        action: "reference.make_create",
        targetType: "vehicle_make",
        targetId: make.id,
        reason: make.name,
      });
      return make;
    });
  },

  async updateMake(v: Viewer, id: string, input: { name?: string; country?: string | null }) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      await makeOrThrow(tx, id);
      const [make] = await uniqueOr(
        () =>
          tx
            .update(vehicleMakes)
            .set({
              ...(input.name ? { name: input.name, slug: slugify(input.name) } : {}),
              ...(input.country !== undefined ? { country: input.country } : {}),
            })
            .where(eq(vehicleMakes.id, id))
            .returning(),
        "Cette marque existe déjà.",
      );
      await audit(tx, v, {
        action: "reference.make_update",
        targetType: "vehicle_make",
        targetId: id,
        reason: make?.name,
      });
      return make;
    });
  },

  async deleteMake(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx) => {
      const make = await makeOrThrow(tx, id);
      const [used] = await tx.select({ n: count() }).from(vehicles).where(eq(vehicles.makeId, id));
      if ((used?.n ?? 0) > 0)
        throw conflict("conflict", "Des véhicules utilisent cette marque : rattache-les d'abord.");
      const models = await tx.select({ id: vehicleModels.id }).from(vehicleModels).where(eq(vehicleModels.makeId, id));
      if (models.length) {
        await tx.delete(vehicleGenerations).where(
          inArray(
            vehicleGenerations.modelId,
            models.map((m) => m.id),
          ),
        );
        await tx.delete(vehicleModels).where(eq(vehicleModels.makeId, id));
      }
      await tx.delete(vehicleMakes).where(eq(vehicleMakes.id, id));
      await audit(tx, v, {
        action: "reference.make_delete",
        targetType: "vehicle_make",
        targetId: id,
        reason: make.name,
      });
    });
  },

  async createModel(v: Viewer, input: { makeId: string; name: string; vehicleType: "car" | "moto" | "truck" }) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const [make] = await tx.select().from(vehicleMakes).where(eq(vehicleMakes.id, input.makeId));
      if (!make) throw notFound("Marque introuvable");
      if (make.isOther) throw validation("Crée d'abord la marque : « Autre » n'a pas de modèles.");
      const [model] = await uniqueOr(
        () =>
          tx
            .insert(vehicleModels)
            .values({ makeId: make.id, name: input.name, slug: slugify(input.name), vehicleType: input.vehicleType })
            .returning(),
        "Ce modèle existe déjà pour cette marque.",
      );
      if (!model) throw new Error("Modèle non créé");
      await tx.insert(vehicleGenerations).values({ modelId: model.id, name: "Autre", isOther: true });
      await audit(tx, v, {
        action: "reference.model_create",
        targetType: "vehicle_model",
        targetId: model.id,
        reason: `${make.name} ${model.name}`,
      });
      return model;
    });
  },

  async updateModel(v: Viewer, id: string, input: { name?: string; vehicleType?: "car" | "moto" | "truck" }) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      await modelOrThrow(tx, id);
      const [model] = await uniqueOr(
        () =>
          tx
            .update(vehicleModels)
            .set({
              ...(input.name ? { name: input.name, slug: slugify(input.name) } : {}),
              ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
            })
            .where(eq(vehicleModels.id, id))
            .returning(),
        "Ce modèle existe déjà pour cette marque.",
      );
      await audit(tx, v, {
        action: "reference.model_update",
        targetType: "vehicle_model",
        targetId: id,
        reason: model?.name,
      });
      return model;
    });
  },

  async deleteModel(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx) => {
      const model = await modelOrThrow(tx, id);
      const [used] = await tx.select({ n: count() }).from(vehicles).where(eq(vehicles.modelId, id));
      if ((used?.n ?? 0) > 0) throw conflict("conflict", "Des véhicules utilisent ce modèle : rattache-les d'abord.");
      await tx.delete(vehicleGenerations).where(eq(vehicleGenerations.modelId, id));
      await tx.delete(vehicleModels).where(eq(vehicleModels.id, id));
      await audit(tx, v, {
        action: "reference.model_delete",
        targetType: "vehicle_model",
        targetId: id,
        reason: model.name,
      });
    });
  },

  async createGeneration(
    v: Viewer,
    input: { modelId: string; name: string; yearFrom: number | null; yearTo: number | null },
  ) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const [model] = await tx.select().from(vehicleModels).where(eq(vehicleModels.id, input.modelId));
      if (!model) throw notFound("Modèle introuvable");
      if (model.isOther) throw validation("Crée d'abord le modèle : « Autre » n'a pas de générations.");
      const [gen] = await uniqueOr(
        () => tx.insert(vehicleGenerations).values(input).returning(),
        "Cette génération existe déjà pour ce modèle.",
      );
      if (!gen) throw new Error("Génération non créée");
      await audit(tx, v, {
        action: "reference.generation_create",
        targetType: "vehicle_generation",
        targetId: gen.id,
        reason: `${model.name} ${gen.name}`,
      });
      return gen;
    });
  },

  async updateGeneration(
    v: Viewer,
    id: string,
    input: { name?: string; yearFrom?: number | null; yearTo?: number | null },
  ) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx) => {
      const current = await generationOrThrow(tx, id);
      const yearFrom = input.yearFrom !== undefined ? input.yearFrom : current.yearFrom;
      const yearTo = input.yearTo !== undefined ? input.yearTo : current.yearTo;
      if (yearFrom !== null && yearTo !== null && yearTo < yearFrom) {
        throw validation("L'année de fin précède l'année de début");
      }
      const [gen] = await uniqueOr(
        () =>
          tx
            .update(vehicleGenerations)
            .set({ ...(input.name ? { name: input.name } : {}), yearFrom, yearTo })
            .where(eq(vehicleGenerations.id, id))
            .returning(),
        "Cette génération existe déjà pour ce modèle.",
      );
      await audit(tx, v, {
        action: "reference.generation_update",
        targetType: "vehicle_generation",
        targetId: id,
        reason: gen?.name,
      });
      return gen;
    });
  },

  async deleteGeneration(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx) => {
      const gen = await generationOrThrow(tx, id);
      const [used] = await tx.select({ n: count() }).from(vehicles).where(eq(vehicles.generationId, id));
      if ((used?.n ?? 0) > 0) {
        throw conflict("conflict", "Des véhicules utilisent cette génération : rattache-les d'abord.");
      }
      await tx.delete(vehicleGenerations).where(eq(vehicleGenerations.id, id));
      await audit(tx, v, {
        action: "reference.generation_delete",
        targetType: "vehicle_generation",
        targetId: id,
        reason: gen.name,
      });
    });
  },

  /**
   * `GET /admin/vehicle-reference/others` : véhicules actifs ou archivés dont la marque, le modèle ou la génération est
   * « Autre », groupés par ce qui est connu (marque inconnue ; modèle inconnu d'une marque ; génération inconnue d'un
   * modèle). Description, motorisation, année et première photo aident à reconnaître le véhicule.
   */
  async others(v: Viewer): Promise<OtherVehicleGroup[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select({
        v: vehicles,
        make: vehicleMakes,
        model: vehicleModels,
        gen: vehicleGenerations,
        pseudo: profiles.pseudo,
      })
      .from(vehicles)
      .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
      .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
      .leftJoin(vehicleGenerations, eq(vehicleGenerations.id, vehicles.generationId))
      .innerJoin(profiles, eq(profiles.userId, vehicles.ownerId))
      .where(
        and(
          eq(vehicles.status, "active"),
          or(eq(vehicleMakes.isOther, true), eq(vehicleModels.isOther, true), eq(vehicleGenerations.isOther, true)),
        ),
      )
      .orderBy(desc(vehicles.createdAt))
      .limit(500);
    const ids = rows.map((r) => r.v.id);
    const photos = ids.length
      ? await db
          .select({
            vehicleId: vehiclePhotos.vehicleId,
            key: vehiclePhotos.storageKey,
            position: vehiclePhotos.position,
          })
          .from(vehiclePhotos)
          .where(inArray(vehiclePhotos.vehicleId, ids))
          .orderBy(asc(vehiclePhotos.position))
      : [];
    const cover = new Map<string, string>();
    for (const p of photos) if (!cover.has(p.vehicleId)) cover.set(p.vehicleId, p.key);
    const groups = new Map<string, OtherVehicleGroup>();
    for (const r of rows) {
      const level: OtherVehicleGroup["level"] = r.make.isOther ? "make" : r.model.isOther ? "model" : "generation";
      const key = level === "make" ? "make" : level === "model" ? `model:${r.make.id}` : `generation:${r.model.id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          level,
          make: { id: r.make.id, name: r.make.name, isOther: r.make.isOther },
          model: { id: r.model.id, name: r.model.name, isOther: r.model.isOther },
          vehicles: [],
        };
        groups.set(key, g);
      }
      const photo = cover.get(r.v.id);
      g.vehicles.push({
        id: r.v.id,
        ownerPseudo: r.pseudo,
        vehicleType: r.v.vehicleType,
        year: r.v.year,
        engine: r.v.engine,
        description: r.v.description,
        photoUrl: storage.url(photo ?? null),
        generation: r.gen ? { id: r.gen.id, name: r.gen.name, isOther: r.gen.isOther } : null,
        createdAt: r.v.createdAt.toISOString(),
      });
    }
    return [...groups.values()].sort((a, b) => b.vehicles.length - a.vehicles.length);
  },

  /**
   * `POST /admin/vehicles/:id/reassign {makeId, modelId, generationId}` : rattache un véhicule au référentiel (cohérence
   * marque → modèle → génération et type vérifiée). Le véhicule garde tout le reste (photos, candidatures, historique).
   * Propriétaire prévenu (`vehicle_reassigned`).
   */
  async reassign(
    v: Viewer,
    vehicleId: string,
    input: { makeId: string; modelId: string; generationId: string | null },
  ) {
    await requirePlatformRole(v, "super_admin");
    return withTx(async (tx, after) => {
      const [current] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
      if (!current) throw notFound("Véhicule introuvable");
      const [model] = await tx.select().from(vehicleModels).where(eq(vehicleModels.id, input.modelId));
      if (!model) throw validation("Modèle inconnu");
      // Le type du véhicule suit le modèle choisi (sauf « Autre », qui accepte tous les types).
      const vehicleType = model.isOther ? current.vehicleType : model.vehicleType;
      await checkReference(tx, { vehicleType, ...input });
      const [make] = await tx.select().from(vehicleMakes).where(eq(vehicleMakes.id, input.makeId));
      const gen = input.generationId
        ? (await tx.select().from(vehicleGenerations).where(eq(vehicleGenerations.id, input.generationId)))[0]
        : undefined;
      await tx
        .update(vehicles)
        .set({ makeId: input.makeId, modelId: input.modelId, generationId: input.generationId, vehicleType })
        .where(eq(vehicles.id, vehicleId));
      const label = [
        make?.isOther ? null : make?.name,
        model.isOther ? null : model.name,
        gen?.isOther ? null : gen?.name,
      ]
        .filter(Boolean)
        .join(" ");
      await audit(tx, v, {
        action: "vehicle.reassign",
        targetType: "vehicle",
        targetId: vehicleId,
        reason: label || "Autre",
      });
      await notificationsService.notify(tx, current.ownerId, "vehicle_reassigned", {
        title: "Ton véhicule est dans la base Orasso",
        body: `L'équipe Orasso a rattaché ton véhicule au référentiel : ${label || "Autre"}.`,
        link: { label: "Voir mon véhicule", path: `/app/garage/${vehicleId}` },
        data: { vehicleId },
      });
      after(() => notificationsService.kick());
      return { id: vehicleId, label };
    });
  },
};
