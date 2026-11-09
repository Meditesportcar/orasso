// Partenariats pro ↔ passionné (lot R7m1, ARCHITECTURE-R7 § 1.7, décision D38) : un pro vérifié propose, le passionné
// accepte ou refuse, chacun met fin quand il veut. Un seul partenariat en attente ou actif par couple. Aucune colonne
// d'argent : Orasso ne touche à aucun paiement entre eux.
import { PARTNERSHIP_MESSAGE_MAX, partnershipStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { proProfiles } from "./pros";
import { vehicles } from "./vehicles";

export const partnershipStatusEnum = pgEnum("partnership_status", partnershipStatuses);

export const partnerships = pgTable(
  "partnerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Véhicule concerné (facultatif) : « Partenaire : … » sur sa carte. Le véhicule supprimé laisse le partenariat. */
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: partnershipStatusEnum("status").notNull().default("pending"),
    proposedAt: tstz("proposed_at").notNull().defaultNow(),
    respondedAt: tstz("responded_at"),
    endedAt: tstz("ended_at"),
    endedBy: text("ended_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    // Un seul partenariat en attente ou actif par couple (pro, passionné).
    uniqueIndex("partnerships_open_key").on(t.proId, t.userId).where(sql`${t.status} in ('pending', 'active')`),
    index("partnerships_user_status_idx").on(t.userId, t.status),
    index("partnerships_pro_status_idx").on(t.proId, t.status),
    index("partnerships_vehicle_idx").on(t.vehicleId),
    check(
      "partnerships_message_check",
      sql`char_length(${t.message}) between 1 and ${sql.raw(String(PARTNERSHIP_MESSAGE_MAX))}`,
    ),
  ],
);
