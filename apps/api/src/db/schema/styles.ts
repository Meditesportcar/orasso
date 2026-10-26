// Styles des véhicules (lot R5a, maquettes R5.2 et R5.3) : styles proposés par les membres, et clés du catalogue de
// départ déjà arrivées (un style supprimé ou modifié par l'admin ne revient jamais).
import { categoryProposalStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { categories } from "./profiles";
import { vehicles, vehicleTypeEnum } from "./vehicles";

export const categoryProposalStatusEnum = pgEnum("category_proposal_status", categoryProposalStatuses);

/**
 * « Il manque un style ? Propose-le » : le nom tapé (nettoyé) et sa clé normalisée (`styleKey` : sans accents, casse
 * ni ponctuation), le type de véhicule, l'auteur et, s'il l'a donné, son véhicule (le style y est posé s'il est retenu
 * et si les règles l'acceptent). Une proposition en attente par auteur, clé et type.
 */
export const categoryProposals = pgTable(
  "category_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    key: text("key").notNull(),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    status: categoryProposalStatusEnum("status").notNull().default("pending"),
    /** Style retenu (ajouté ou rattaché). */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    ...timestamps,
  },
  (t) => [
    index("category_proposals_status_key_idx").on(t.status, t.key),
    index("category_proposals_author_idx").on(t.authorId, t.createdAt),
    uniqueIndex("category_proposals_pending_key")
      .on(t.authorId, t.key, t.vehicleType)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Clés (slugs) du catalogue de départ des styles déjà arrivées par la synchronisation (`syncStyleCatalog`) : une clé
 * vue n'est plus jamais réinsérée ni réécrite, si bien qu'un style renommé, mis en pause ou déplacé par l'admin le reste.
 */
export const categoryCatalogSeen = pgTable("category_catalog_seen", {
  slug: text("slug").primaryKey(),
  seenAt: tstz("seen_at").notNull().defaultNow(),
});
