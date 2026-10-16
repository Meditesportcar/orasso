// Référentiel véhicules, garage, photos, catégories, transferts de plaque (ARCHITECTURE.md § 1.3).
import { certificationLostReasons, plateTransferStatuses, vehicleStatuses, vehicleTypes } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { categories } from "./profiles";

export const vehicleTypeEnum = pgEnum("vehicle_type", vehicleTypes);
export const vehicleStatusEnum = pgEnum("vehicle_status", vehicleStatuses);
export const plateTransferStatusEnum = pgEnum("plate_transfer_status", plateTransferStatuses);
export const certificationLostReasonEnum = pgEnum("certification_lost_reason", certificationLostReasons);

/** Référentiel enrichi par l'équipe Orasso seulement ; « Autre » à chaque niveau, aucune saisie libre. */
export const vehicleMakes = pgTable("vehicle_makes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique("vehicle_makes_slug_key"),
  /** Pays de la marque (ISO 3166-1 alpha-2). */
  country: text("country"),
  isOther: boolean("is_other").notNull().default(false),
  ...timestamps,
});

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => vehicleMakes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    isOther: boolean("is_other").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("vehicle_models_make_slug_key").on(t.makeId, t.slug)],
);

export const vehicleGenerations = pgTable(
  "vehicle_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => vehicleModels.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    yearFrom: smallint("year_from"),
    yearTo: smallint("year_to"),
    isOther: boolean("is_other").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("vehicle_generations_model_name_key").on(t.modelId, t.name)],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => vehicleMakes.id),
    modelId: uuid("model_id")
      .notNull()
      .references(() => vehicleModels.id),
    generationId: uuid("generation_id").references(() => vehicleGenerations.id),
    year: smallint("year"),
    color: text("color"),
    engine: text("engine"),
    powerHp: smallint("power_hp"),
    weightKg: integer("weight_kg"),
    /** Telle que saisie ; jamais exposée hors propriétaire et organisateur. */
    plate: text("plate"),
    plateNormalized: text("plate_normalized"),
    unregistered: boolean("unregistered").notNull().default(false),
    status: vehicleStatusEnum("status").notNull().default("active"),
    /** Motif du passage en archive (vendu, souvenir, accidenté), facultatif. */
    statusNote: text("status_note"),
    description: text("description"),
    preparation: text("preparation"),
    /** Certification validée par l'équipe Orasso (lot 31) ; perdue à la modification de la fiche ou par inactivité. */
    certifiedAt: tstz("certified_at"),
    certifiedLostReason: certificationLostReasonEnum("certified_lost_reason"),
    /** Plaque saisie mais déjà portée par un autre compte : demande de transfert en cours (lot 31, S36). */
    pendingTransferId: uuid("pending_transfer_id").references((): AnyPgColumn => plateTransferRequests.id, {
      onDelete: "set null",
    }),
    archivedAt: tstz("archived_at"),
    ...timestamps,
  },
  (t) => [
    index("vehicles_owner_id_idx").on(t.ownerId),
    index("vehicles_model_id_idx").on(t.modelId),
    // Plaque unique parmi les véhicules actifs (docs/01).
    uniqueIndex("vehicles_active_plate_key")
      .on(t.plateNormalized)
      .where(sql`${t.status} = 'active' and ${t.plateNormalized} is not null`),
    check("vehicles_power_hp_check", sql`${t.powerHp} is null or ${t.powerHp} between 1 and 2500`),
    check("vehicles_weight_kg_check", sql`${t.weightKg} is null or ${t.weightKg} between 50 and 40000`),
  ],
);

export const vehiclePhotos = pgTable(
  "vehicle_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    storageKey: text("storage_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    ...timestamps,
  },
  (t) => [
    // Contrainte rendue différable dans la migration (réordonnancement en une transaction).
    unique("vehicle_photos_vehicle_position_key").on(t.vehicleId, t.position),
    check("vehicle_photos_position_check", sql`${t.position} between 1 and 8`),
  ],
);

export const vehicleCategories = pgTable(
  "vehicle_categories",
  {
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ name: "vehicle_categories_pkey", columns: [t.vehicleId, t.categoryId] })],
);

/**
 * Créée quand une plaque déjà active est saisie : le véhicule du demandeur est créé sans plaque normalisée
 * (`vehicles.pending_transfer_id`) ; l'ancien propriétaire confirme ou refuse, sinon l'équipe Orasso arbitre
 * après 7 jours (lot 31, S36).
 */
export const plateTransferRequests = pgTable(
  "plate_transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plateNormalized: text("plate_normalized").notNull(),
    fromVehicleId: uuid("from_vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: plateTransferStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    /** Note de l'équipe Orasso à la décision. */
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("plate_transfer_requests_plate_idx").on(t.plateNormalized),
    index("plate_transfer_requests_status_idx").on(t.status, t.createdAt),
    // Une seule demande ouverte par plaque et par demandeur, même si deux envois partent en même temps.
    uniqueIndex("plate_transfer_requests_open_key")
      .on(t.plateNormalized, t.toUserId)
      .where(sql`${t.status} in ('pending', 'arbitrated')`),
  ],
);
