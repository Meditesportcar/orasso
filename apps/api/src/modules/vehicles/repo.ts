import { asc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, vehicleGenerations, vehicleMakes, vehicleModels, vehiclePhotos, vehicles } from "../../db/schema";
import type { Executor } from "../../lib/tx";

export type VehicleRow = typeof vehicles.$inferSelect;

export const vehiclesRepo = {
  /** Véhicules avec marque, modèle, génération, photos et catégories. */
  findFull(where: SQL | undefined, ex: Executor = db) {
    return ex.query.vehicles.findMany({
      where,
      with: {
        make: true,
        model: true,
        generation: true,
        photos: { orderBy: [asc(vehiclePhotos.position)] },
        categories: { with: { category: true } },
        pendingTransfer: true,
      },
      orderBy: [asc(vehicles.createdAt)],
    });
  },
  async findFullById(id: string, ex: Executor = db) {
    const [row] = await this.findFull(eq(vehicles.id, id), ex);
    return row;
  },
  findFullByIds(ids: string[], ex: Executor = db) {
    return ids.length ? this.findFull(inArray(vehicles.id, ids), ex) : Promise.resolve([]);
  },
  byId(id: string, ex: Executor = db) {
    return ex.query.vehicles.findFirst({ where: eq(vehicles.id, id) });
  },
  makes() {
    return db.query.vehicleMakes.findMany({ orderBy: [asc(vehicleMakes.isOther), asc(vehicleMakes.name)] });
  },
  models(makeId: string) {
    return db.query.vehicleModels.findMany({
      where: eq(vehicleModels.makeId, makeId),
      orderBy: [asc(vehicleModels.isOther), asc(vehicleModels.name)],
    });
  },
  generations(modelId: string) {
    return db.query.vehicleGenerations.findMany({
      where: eq(vehicleGenerations.modelId, modelId),
      orderBy: [asc(vehicleGenerations.isOther), asc(vehicleGenerations.yearFrom), asc(vehicleGenerations.name)],
    });
  },
  categories() {
    return db.query.categories.findMany({ where: eq(categories.active, true), orderBy: [asc(categories.position)] });
  },
  photos(vehicleId: string, ex: Executor = db) {
    return ex.query.vehiclePhotos.findMany({
      where: eq(vehiclePhotos.vehicleId, vehicleId),
      orderBy: [asc(vehiclePhotos.position)],
    });
  },
};

export type VehicleWithAll = NonNullable<Awaited<ReturnType<typeof vehiclesRepo.findFullById>>>;
