// Garage et certification (lot 31, ARCHITECTURE-SUITE § 14) : liste blanche de marques par catégorie, demandes de
// certification d'un véhicule. Les colonnes ajoutées à `categories`, `vehicles` et `plate_transfer_requests` sont
// déclarées dans `profiles.ts` et `vehicles.ts`.
import { certificationStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { categories } from "./profiles";
import { vehicleMakes, vehicles } from "./vehicles";

export const certificationStatusEnum = pgEnum("certification_status", certificationStatuses);

/** Marques admises dans une catégorie dont `make_mode` vaut `whitelist` (ex. supercar : Ferrari, Lamborghini…). */
export const categoryMakes = pgTable(
  "category_makes",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    makeId: uuid("make_id")
      .notNull()
      .references(() => vehicleMakes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ name: "category_makes_pkey", columns: [t.categoryId, t.makeId] })],
);

/** Demande de certification : validée ou refusée à la main par l'équipe Orasso. */
export const certificationRequests = pgTable(
  "certification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: certificationStatusEnum("status").notNull().default("pending"),
    message: text("message"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    note: text("note"),
    /** Fiche du véhicule au moment de la demande (`CertificationSnapshot`). */
    snapshot: jsonb("snapshot").notNull(),
    ...timestamps,
  },
  (t) => [
    index("certification_requests_vehicle_idx").on(t.vehicleId, t.createdAt),
    index("certification_requests_status_idx").on(t.status, t.createdAt),
    // Une seule demande en cours par véhicule.
    uniqueIndex("certification_requests_pending_key").on(t.vehicleId).where(sql`${t.status} = 'pending'`),
  ],
);
