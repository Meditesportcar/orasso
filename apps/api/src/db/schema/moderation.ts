// Modération (lot 32, ARCHITECTURE-SUITE § 15.1) : signalements et sanctions. Conservés un an après la décision, puis
// supprimés par la tâche `moderation.purge` (sauf bannissement ou contestation en cours).
import {
  contestStates,
  type ReportContextMessage,
  reportReasons,
  reportStatuses,
  reportTargets,
  sanctionKinds,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const reportTargetEnum = pgEnum("report_target", reportTargets);
export const reportReasonEnum = pgEnum("report_reason", reportReasons);
export const reportStatusEnum = pgEnum("report_status", reportStatuses);
export const sanctionKindEnum = pgEnum("sanction_kind", sanctionKinds);
export const contestStateEnum = pgEnum("contest_state", contestStates);

/**
 * Une sanction (échelle de docs/01). `ends_at` null = bannissement ; un avertissement finit à `starts_at`.
 * `issued_by` null = suspension automatique (`auto`). `profiles.suspended_until` = fin de la sanction active la plus
 * longue (recalculée à chaque décision, `BAN_UNTIL` pour un bannissement).
 */
export const sanctions = pgTable(
  "sanctions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: sanctionKindEnum("kind").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    reportIds: uuid("report_ids").array().notNull().default(sql`'{}'::uuid[]`),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at"),
    issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }),
    auto: boolean("auto").notNull().default(false),
    contestStatus: contestStateEnum("contest_status").notNull().default("none"),
    contestMessage: text("contest_message"),
    contestedAt: tstz("contested_at"),
    contestDecidedBy: text("contest_decided_by").references(() => user.id, { onDelete: "set null" }),
    contestDecidedAt: tstz("contest_decided_at"),
    liftedAt: tstz("lifted_at"),
    liftedBy: text("lifted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("sanctions_user_idx").on(t.userId, t.startsAt),
    index("sanctions_contest_idx").on(t.contestStatus).where(sql`${t.contestStatus} = 'pending'`),
    check("sanctions_note_check", sql`${t.note} is null or char_length(${t.note}) <= 1000`),
    check(
      "sanctions_contest_message_check",
      sql`${t.contestMessage} is null or char_length(${t.contestMessage}) <= 1000`,
    ),
  ],
);

/**
 * Un signalement. Un seul par personne et par contenu (`reports_reporter_target_key`) : un signalement compté par
 * personne (docs/01). `target_owner_id` : propriétaire du contenu, résolu à la création (registre `targets/`).
 * `context` : pour un message, copie du message et de ses 5 voisins avant et après (AS5).
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetOwnerId: text("target_owner_id").references(() => user.id, { onDelete: "set null" }),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    screenshotKey: text("screenshot_key"),
    context: jsonb("context").$type<ReportContextMessage[]>(),
    status: reportStatusEnum("status").notNull().default("pending"),
    handledBy: text("handled_by").references(() => user.id, { onDelete: "set null" }),
    handledAt: tstz("handled_at"),
    sanctionId: uuid("sanction_id").references(() => sanctions.id, { onDelete: "set null" }),
    retainUntil: tstz("retain_until"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reports_reporter_target_key").on(t.reporterId, t.targetType, t.targetId),
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_owner_created_idx").on(t.targetOwnerId, t.createdAt),
    index("reports_reporter_created_idx").on(t.reporterId, t.createdAt),
    index("reports_retain_idx").on(t.retainUntil).where(sql`${t.retainUntil} is not null`),
    check("reports_details_check", sql`${t.details} is null or char_length(${t.details}) <= 1000`),
  ],
);
