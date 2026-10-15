// Journal d'administration, insert seulement (ARCHITECTURE.md § 1.9).
import { index, inet, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";
import { structures } from "./structures";

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** `structure.verify`, `structure.view_as`, `user.suspend`, `points.adjust`, `participants.export`… */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "set null" }),
    reason: text("reason"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("admin_audit_log_created_idx").on(t.createdAt), index("admin_audit_log_actor_idx").on(t.actorUserId)],
);
