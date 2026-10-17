// Administration (lot 33, ARCHITECTURE-SUITE § 16) : demandes d'aide du mode assistance (S41) et newsletter.
// Les réglages restent dans `platform_settings` (lot 14, clé → valeur JSON) ; le lien de désinscription est signé
// (HMAC de l'identifiant du compte) : aucune colonne de jeton.
import { assistanceCloseReasons, assistanceStatuses, newsletterStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { structures } from "./structures";

export const assistanceStatusEnum = pgEnum("assistance_status", assistanceStatuses);
export const assistanceCloseReasonEnum = pgEnum("assistance_close_reason", assistanceCloseReasons);
export const newsletterStatusEnum = pgEnum("newsletter_status", newsletterStatuses);

/**
 * Demande d'aide d'une structure : tant qu'elle est ouverte (7 jours au plus), un super admin peut écrire dans
 * l'espace de la structure ; chaque écriture porte l'identifiant de la demande au journal d'administration.
 */
export const assistanceRequests = pgTable(
  "assistance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: assistanceStatusEnum("status").notNull().default("open"),
    closedAt: tstz("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    closeReason: assistanceCloseReasonEnum("close_reason"),
    ...timestamps,
  },
  (t) => [
    // Une seule demande ouverte par structure.
    uniqueIndex("assistance_requests_open_key").on(t.structureId).where(sql`${t.status} = 'open'`),
    index("assistance_requests_status_idx").on(t.status, t.createdAt),
  ],
);

export const newsletters = pgTable(
  "newsletters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subject: text("subject").notNull(),
    bodyMd: text("body_md").notNull(),
    status: newsletterStatusEnum("status").notNull().default("draft"),
    scheduledAt: tstz("scheduled_at"),
    sentAt: tstz("sent_at"),
    recipientsCount: integer("recipients_count").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("newsletters_status_idx").on(t.status, t.scheduledAt)],
);

/**
 * Un destinataire d'une newsletter : réservé avant l'envoi (une seule fois par personne, clé primaire), `sent_at` posé
 * après. Un second déclenchement de l'envoi ne renvoie jamais à une personne déjà servie.
 */
export const newsletterDeliveries = pgTable(
  "newsletter_deliveries",
  {
    newsletterId: uuid("newsletter_id")
      .notNull()
      .references(() => newsletters.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sentAt: tstz("sent_at"),
    ...timestamps,
  },
  (t) => [primaryKey({ name: "newsletter_deliveries_pkey", columns: [t.newsletterId, t.userId] })],
);
