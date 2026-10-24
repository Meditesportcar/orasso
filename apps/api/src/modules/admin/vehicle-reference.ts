// Base véhicules (lot 33, docs/01 « base construite par Orasso, enrichie au fil des Autre ») : marques, modèles et
// générations gérés par l'équipe, file des véhicules « Autre » groupés, rattachement d'un véhicule au référentiel
// (propriétaire prévenu). Une marque créée reçoit son modèle « Autre », un modèle créé sa génération « Autre » :
// le formulaire du garage garde « Autre » à chaque niveau. Suppression refusée tant qu'un véhicule y est rattaché.

import { createHash } from "node:crypto";
import {
  type OtherVehicleGroup,
  proposalKey,
  type ReferenceGeneration,
  type ReferenceMake,
  type ReferenceModel,
  type VehicleProposalAccept,
  type VehicleProposalGroup,
  type VehicleProposalPage,
  vehicleName,
  versionFromTyped,
} from "@orasso/shared";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles, vehicleGenerations, vehicleMakes, vehicleModels, vehiclePhotos, vehicles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { slugify } from "../../lib/slug";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { checkReference } from "../vehicles/service";
import { audit } from "./audit";

const isUnique = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/**
 * Suppression : un véhicule rattaché entre le comptage et la suppression (clé étrangère `restrict`, code 23503) donne un
 * 409 et non une erreur interne.
 */
async function stillUsed<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e.cause ?? e).code === "23503") {
      throw conflict("conflict", "Des véhicules ou des réglages utilisent encore cet élément : rattache-les d'abord.");
    }
    throw error;
  }
}

/** Course entre deux rattachements (unicité 23505, interblocage 40P01) : 409. */
async function concurrent<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    const code = (e.cause ?? e).code;
    if (code === "23505" || code === "40P01") {
      throw conflict("conflict", "Ce groupe vient de changer : recharge la page et recommence.");
    }
    throw error;
  }
}

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

/** File « Modèles proposés » : groupes par page, fiches montrées par groupe (« et N autres fiches »). */
const PROPOSAL_PAGE = 50;
const PROPOSAL_ROWS_SHOWN = 20;

/** Une fiche au nom tapé (lot R4a) : marque « Autre » avec une marque tapée, ou modèle « Autre » avec un modèle tapé. */
const proposedWhere = or(
  and(eq(vehicleMakes.isOther, true), isNotNull(vehicles.proposedMake)),
  and(eq(vehicleModels.isOther, true), isNotNull(vehicles.proposedModel)),
);

/**
 * Ce qu'une clé de groupe permet de filtrer en SQL : le niveau, et la marque connue d'un modèle tapé. Lot R4a, tour 2 :
 * plus de limite globale (2 000) ; le rattachement ne lit et ne verrouille que les fiches de ce niveau et de cette
 * marque, puis garde celles du groupe.
 */
type ProposalScope = { level: "make" } | { level: "model"; makeId: string };

export function proposalScopeOf(key: string): ProposalScope | null {
  const [level, makeId] = key.split(".");
  if (level === "make") return { level: "make" };
  if (level === "model" && makeId && /^[0-9a-f-]{36}$/.test(makeId)) return { level: "model", makeId };
  return null;
}

/**
 * Empreinte d'un groupe : ses fiches (identifiants triés). L'écran l'envoie avec le geste ; si le groupe a changé entre
 * l'affichage et la validation (fiche ajoutée, rattachée ou supprimée), le rattachement répond 409.
 */
export function proposalVersion(ids: readonly string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join(","))
    .digest("hex")
    .slice(0, 32);
}

/** Fiches actives au nom tapé, les plus récentes d'abord ; `lock` : verrouillées pour le rattachement groupé. */
/**
 * Lot R4e : version tirée du modèle tapé quand la fiche est rattachée à la liste (« 207 CC » rattaché à « 207 » → « CC »),
 * la marque et la génération retirées si elles ouvrent le texte. Null sans modèle tapé, ou si le texte ne commence pas
 * par le modèle choisi (on ne devine pas).
 */
function typedVersion(
  r: {
    v: { proposedModel: string | null };
    model: { isOther: boolean };
  },
  to: {
    make: { name: string } | undefined;
    model: { name: string; isOther: boolean };
    gen: { name: string; isOther: boolean } | undefined;
  },
): string | null {
  if (!r.model.isOther || to.model.isOther) return null;
  return versionFromTyped(r.v.proposedModel, {
    make: to.make?.name,
    model: to.model.name,
    generation: to.gen && !to.gen.isOther ? to.gen.name : null,
  });
}

async function proposalRows(ex: Executor, lock = false, scope?: ProposalScope) {
  const q = ex
    .select({
      v: vehicles,
      make: vehicleMakes,
      model: vehicleModels,
      pseudo: profiles.pseudo,
      departments: profiles.departments,
      deletedAt: profiles.deletedAt,
    })
    .from(vehicles)
    .innerJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
    .innerJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .innerJoin(profiles, eq(profiles.userId, vehicles.ownerId))
    .where(
      and(
        eq(vehicles.status, "active"),
        !scope
          ? proposedWhere
          : scope.level === "make"
            ? and(eq(vehicleMakes.isOther, true), isNotNull(vehicles.proposedMake))
            : and(
                eq(vehicles.makeId, scope.makeId),
                eq(vehicleMakes.isOther, false),
                eq(vehicleModels.isOther, true),
                isNotNull(vehicles.proposedModel),
              ),
      ),
    )
    .orderBy(desc(vehicles.createdAt), asc(vehicles.id));
  return lock ? await q.for("update", { of: vehicles }) : await q;
}

const keyOf = (r: Awaited<ReturnType<typeof proposalRows>>[number]) =>
  proposalKey({
    makeId: r.make.id,
    makeIsOther: r.make.isOther,
    proposedMake: r.make.isOther ? r.v.proposedMake : null,
    proposedModel: r.model.isOther ? r.v.proposedModel : null,
  });

/** Chaque écriture et son nombre, la plus fréquente en tête. */
function counted(values: readonly string[]): { text: string; count: number }[] {
  const n = new Map<string, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([text, count]) => ({ text, count }));
}
const mostTyped = (values: readonly (string | null)[]) =>
  counted(values.filter((v): v is string => Boolean(v)))[0]?.text ?? null;

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
    await stillUsed(() =>
      withTx(async (tx) => {
        const make = await makeOrThrow(tx, id);
        const [used] = await tx.select({ n: count() }).from(vehicles).where(eq(vehicles.makeId, id));
        if ((used?.n ?? 0) > 0)
          throw conflict("conflict", "Des véhicules utilisent cette marque : rattache-les d'abord.");
        // Lot 33 (relecture) : marque d'une liste blanche de catégorie ou d'un critère d'événement → refusée.
        const listed = await tx.execute(sql`
        select 1 from category_makes where make_id = ${id}
        union all select 1 from events where jsonb_exists(coalesce(criteria->'makeIds', '[]'::jsonb), ${id})
        limit 1`);
        if (listed.rows.length) {
          throw conflict(
            "conflict",
            "Cette marque figure dans une catégorie ou les critères d'un événement : retire-la d'abord.",
          );
        }
        const models = await tx
          .select({ id: vehicleModels.id })
          .from(vehicleModels)
          .where(eq(vehicleModels.makeId, id));
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
      }),
    );
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
    await stillUsed(() =>
      withTx(async (tx) => {
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
      }),
    );
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
    await stillUsed(() =>
      withTx(async (tx) => {
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
      }),
    );
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
          // Lot R4a : une fiche au nom tapé est dans « Modèles proposés », pas ici.
          isNull(vehicles.proposedMake),
          isNull(vehicles.proposedModel),
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
   * Lot R4a (maquette R4.8b) : `GET /admin/vehicle-reference/proposals`, la file « Modèles proposés ». Les fiches
   * actives dont le modèle (marque connue) ou la marque et le modèle ont été tapés, regroupées par texte normalisé
   * (`proposalKey` : sans accents ni casse, espaces et ponctuation retirés), la plus grosse file en tête, avec les
   * variantes tapées.
   */
  async proposals(v: Viewer, cursor: number | null = null): Promise<VehicleProposalPage> {
    await requirePlatformRole(v, "super_admin");
    const rows = await proposalRows(db);
    const all = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = keyOf(row);
      all.set(key, [...(all.get(key) ?? []), row]);
    }
    // Pages de groupes entiers, la plus grosse file en tête.
    const ordered = [...all.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const from = cursor ?? 0;
    const page = ordered.slice(from, from + PROPOSAL_PAGE);
    const shown = page.flatMap(([, list]) => list.slice(0, PROPOSAL_ROWS_SHOWN));
    const ids = shown.map((r) => r.v.id);
    const photos = ids.length
      ? await db
          .select({ vehicleId: vehiclePhotos.vehicleId, key: vehiclePhotos.storageKey })
          .from(vehiclePhotos)
          .where(inArray(vehiclePhotos.vehicleId, ids))
          .orderBy(asc(vehiclePhotos.position))
      : [];
    const cover = new Map<string, string>();
    for (const p of photos) if (!cover.has(p.vehicleId)) cover.set(p.vehicleId, p.key);
    const item = (r: (typeof rows)[number]) => ({
      id: r.v.id,
      ownerPseudo: r.pseudo,
      vehicleType: r.v.vehicleType,
      typedMake: r.make.isOther ? r.v.proposedMake : null,
      typedModel: r.model.isOther ? r.v.proposedModel : null,
      year: r.v.year,
      department: r.departments[0] ?? null,
      photoUrl: storage.url(cover.get(r.v.id) ?? null),
      createdAt: r.v.createdAt.toISOString(),
    });
    const items: VehicleProposalGroup[] = page.map(([key, list]) => {
      const first = list[0] as (typeof rows)[number];
      const typedMake = list.map((r) => (r.make.isOther ? r.v.proposedMake : null));
      const typedModel = list.map((r) => (r.model.isOther ? r.v.proposedModel : null));
      return {
        key,
        level: first.make.isOther ? "make" : "model",
        make: { id: first.make.id, name: first.make.name, isOther: first.make.isOther },
        makeName: mostTyped(typedMake),
        // Le nom du modèle seul (sans la marque tapée), proposé par « Ajouter à la liste ».
        modelName: mostTyped(typedModel) ?? "",
        variants: counted(list.map((_, i) => [typedMake[i], typedModel[i]].filter(Boolean).join(" ")).filter(Boolean)),
        vehicleType: mostTyped(list.map((r) => r.v.vehicleType)) ?? first.v.vehicleType,
        count: list.length,
        version: proposalVersion(list.map((r) => r.v.id)),
        vehicles: list.slice(0, PROPOSAL_ROWS_SHOWN).map(item),
      };
    });
    return { items, nextCursor: from + PROPOSAL_PAGE < ordered.length ? String(from + PROPOSAL_PAGE) : null };
  },

  /**
   * `POST /admin/vehicle-reference/proposals/:clé/accept` : rattache toutes les fiches du groupe en une transaction, à un
   * modèle existant ou à un modèle (et une marque) créés au besoin. Les noms tapés sont effacés des fiches rattachées ;
   * chaque propriétaire est prévenu (`vehicle_reassigned`) ; une ligne au journal d'administration. Pas d'annulation :
   * une erreur se corrige fiche par fiche (« Rattacher ce véhicule »).
   */
  async acceptProposal(v: Viewer, key: string, input: VehicleProposalAccept) {
    await requirePlatformRole(v, "super_admin");
    // Deux équipiers sur le même groupe, ou une marque créée en même temps : 409, jamais une erreur interne.
    return concurrent(() =>
      withTx(async (tx, after) => {
        const scope = proposalScopeOf(key);
        if (!scope) throw notFound("Ce groupe n'a plus de fiche à rattacher.");
        // Véhicules verrouillés d'abord (ordre du code existant : véhicule, puis le reste).
        const rows = (await proposalRows(tx, true, scope)).filter((r) => keyOf(r) === key);
        if (!rows.length) throw notFound("Ce groupe n'a plus de fiche à rattacher.");
        if (proposalVersion(rows.map((r) => r.v.id)) !== input.version) {
          throw conflict("conflict", "Ce groupe a changé depuis l'affichage : recharge la page et vérifie ses fiches.");
        }
        // Comme `reassign` : jamais son propre véhicule (un autre membre de l'équipe s'en charge).
        if (rows.some((r) => r.v.ownerId === v.user.id)) {
          throw new AppError(
            409,
            "self_action",
            "Ce groupe contient ton propre véhicule : un autre membre de l'équipe doit le rattacher.",
          );
        }
        // Marque : existante, retrouvée par son nom, ou créée (avec son modèle « Autre », comme `createMake`).
        let make = input.makeId
          ? (await tx.select().from(vehicleMakes).where(eq(vehicleMakes.id, input.makeId)))[0]
          : (
              await tx
                .select()
                .from(vehicleMakes)
                .where(eq(vehicleMakes.slug, slugify(input.makeName ?? "")))
            )[0];
        if (input.makeId && !make) throw notFound("Marque introuvable");
        if (!make) {
          [make] = await tx
            .insert(vehicleMakes)
            .values({ name: input.makeName ?? "", slug: slugify(input.makeName ?? ""), country: input.country })
            .returning();
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
        }
        if (make.isOther) throw validation("Choisis une vraie marque : « Autre » n'a pas de modèles.");
        // Modèle : existant, retrouvé par son nom chez cette marque, ou créé (avec sa génération « Autre »).
        const vehicleType = (mostTyped(rows.map((r) => r.v.vehicleType)) ?? "car") as "car" | "moto" | "truck";
        const makeId = make.id;
        let model = input.modelId
          ? (await tx.select().from(vehicleModels).where(eq(vehicleModels.id, input.modelId)))[0]
          : (
              await tx
                .select()
                .from(vehicleModels)
                .where(and(eq(vehicleModels.makeId, makeId), eq(vehicleModels.slug, slugify(input.modelName ?? ""))))
            )[0];
        if (input.modelId && (!model || model.makeId !== makeId)) throw validation("Modèle inconnu pour cette marque");
        if (!model) {
          [model] = await tx
            .insert(vehicleModels)
            .values({ makeId, name: input.modelName ?? "", slug: slugify(input.modelName ?? ""), vehicleType })
            .returning();
          if (!model) throw new Error("Modèle non créé");
          await tx.insert(vehicleGenerations).values({ modelId: model.id, name: "Autre", isOther: true });
          await audit(tx, v, {
            action: "reference.model_create",
            targetType: "vehicle_model",
            targetId: model.id,
            reason: `${make.name} ${model.name}`,
          });
        }
        if (model.isOther) throw validation("Choisis un vrai modèle, pas « Autre ».");
        const modelId = model.id;
        const gen = input.generationId
          ? (await tx.select().from(vehicleGenerations).where(eq(vehicleGenerations.id, input.generationId)))[0]
          : undefined;
        if (input.generationId && (!gen || gen.modelId !== modelId)) {
          throw validation("Génération inconnue pour ce modèle");
        }
        const label = [make.name, model.name, gen && !gen.isOther ? gen.name : null].filter(Boolean).join(" ");
        await tx
          .update(vehicles)
          .set({
            makeId,
            modelId,
            generationId: gen?.id ?? null,
            // Le type suit le modèle choisi.
            vehicleType: model.vehicleType,
            proposedMake: null,
            proposedModel: null,
            // Comme `reassign` : marque ou modèle changés, ce n'est plus la fiche certifiée.
            certifiedLostReason: sql`case when ${vehicles.certifiedAt} is not null then 'modified'::certification_lost_reason else ${vehicles.certifiedLostReason} end`,
            certifiedAt: null,
          })
          .where(
            inArray(
              vehicles.id,
              rows.map((r) => r.v.id),
            ),
          );
        // Lot R4e : la précision tapée après le modèle (« 207 CC » → « CC ») devient la version, si elle est vide. Une
        // écriture par version distincte (un groupe de 2 000 fiches n'en fait que quelques-unes).
        const versions = new Map(rows.map((r) => [r.v.id, r.v.version ?? typedVersion(r, { make, model, gen })]));
        const byVersion = new Map<string, string[]>();
        for (const r of rows) {
          const version = versions.get(r.v.id);
          if (!version || r.v.version) continue;
          const ids = byVersion.get(version) ?? [];
          ids.push(r.v.id);
          byVersion.set(version, ids);
        }
        for (const [version, ids] of byVersion) {
          await tx.update(vehicles).set({ version }).where(inArray(vehicles.id, ids));
        }
        for (const r of rows) {
          const version = versions.get(r.v.id);
          // Un compte anonymisé n'est pas prévenu.
          if (r.deletedAt) continue;
          const typed = [
            r.make.isOther ? r.v.proposedMake : r.make.name,
            r.model.isOther ? r.v.proposedModel : r.model.name,
          ]
            .filter(Boolean)
            .join(" ");
          await notificationsService.notify(tx, r.v.ownerId, "vehicle_reassigned", {
            title: "Ton véhicule est dans la base Orasso",
            body: `L'équipe Orasso a rattaché ta ${typed} à la liste : ${vehicleName({ make: make.name, model: model.name, generation: gen && !gen.isOther ? gen.name : null, version })}.`,
            link: { label: "Voir mon véhicule", path: `/app/garage/${r.v.id}` },
            data: { vehicleId: r.v.id },
          });
        }
        await audit(tx, v, {
          action: "vehicle.proposal_accept",
          targetType: "vehicle_model",
          targetId: modelId,
          reason: `${label} · ${rows.length} fiche${rows.length > 1 ? "s" : ""} (${key})`,
        });
        after(() => notificationsService.kick());
        return { makeId, modelId, label, count: rows.length };
      }),
    );
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
      if (current.ownerId === v.user.id) {
        throw new AppError(409, "self_action", "Action impossible sur ton propre véhicule.");
      }
      const [model] = await tx.select().from(vehicleModels).where(eq(vehicleModels.id, input.modelId));
      if (!model) throw validation("Modèle inconnu");
      // Le type du véhicule suit le modèle choisi (sauf « Autre », qui accepte tous les types).
      const vehicleType = model.isOther ? current.vehicleType : model.vehicleType;
      await checkReference(tx, { vehicleType, ...input });
      const [make] = await tx.select().from(vehicleMakes).where(eq(vehicleMakes.id, input.makeId));
      const gen = input.generationId
        ? (await tx.select().from(vehicleGenerations).where(eq(vehicleGenerations.id, input.generationId)))[0]
        : undefined;
      // Lot R4e : comme `acceptProposal`, la précision tapée après le modèle devient la version, si elle est vide (un nom
      // tapé n'existe qu'avec le modèle « Autre »). Écrite par l'équipe : pas une modification du propriétaire.
      const version =
        current.version ??
        typedVersion({ v: current, model: { isOther: Boolean(current.proposedModel) } }, { make, model, gen });
      await tx
        .update(vehicles)
        .set({
          makeId: input.makeId,
          modelId: input.modelId,
          generationId: input.generationId,
          vehicleType,
          // Lot R4a : un nom tapé ne reste que tant que son niveau est « Autre ».
          proposedMake: make?.isOther ? current.proposedMake : null,
          proposedModel: model.isOther ? current.proposedModel : null,
          // Lot R4e : comme `acceptProposal`, la précision tapée après le modèle devient la version, si elle est vide (un
          // nom tapé n'existe qu'avec le modèle « Autre »).
          ...(current.version ? {} : { version }),
          // Marque ou modèle changés : ce n'est plus la fiche certifiée (relecture).
          ...(current.certifiedAt && (current.makeId !== input.makeId || current.modelId !== input.modelId)
            ? { certifiedAt: null, certifiedLostReason: "modified" as const }
            : {}),
        })
        .where(eq(vehicles.id, vehicleId));
      // Lot R4e, tour 2 : la notification dit la version (composition commune `vehicleName`).
      const label = vehicleName(
        {
          make: make?.isOther ? null : make?.name,
          model: model.isOther ? null : model.name,
          generation: gen?.isOther ? null : gen?.name,
          version,
        },
        { fallback: "" },
      );
      await audit(tx, v, {
        action: "vehicle.reassign",
        targetType: "vehicle",
        targetId: vehicleId,
        reason: label || "Autre",
      });
      const owner = await tx.query.profiles.findFirst({
        where: eq(profiles.userId, current.ownerId),
        columns: { deletedAt: true },
      });
      // Un compte anonymisé n'est pas prévenu.
      if (!owner?.deletedAt)
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
