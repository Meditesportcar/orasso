// QR d'inscription et clés de signature (ARCHITECTURE.md § 1.6, § 3.1).
import { passRevokedReasons } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { bytea, timestamps, tstz } from "./common";
import { events } from "./events";

export const passRevokedReasonEnum = pgEnum("pass_revoked_reason", passRevokedReasons);

/** Clés publiques Ed25519 (la clé privée n'est jamais en base : variable d'environnement QR_SIGNING_KEYS). */
export const signingKeys = pgTable("signing_keys", {
  /** 0–255, embarqué sur 1 octet dans le QR. */
  kid: smallint("kid").primaryKey(),
  algorithm: text("algorithm").notNull().default("ed25519"),
  publicKey: bytea("public_key").notNull(),
  activeFrom: tstz("active_from").notNull().defaultNow(),
  retiredAt: tstz("retired_at"),
  /** Clé compromise : exclue de `/keys`, de la synchro et de toute vérification (`pnpm keys:revoke <kid>`). */
  revokedAt: tstz("revoked_at"),
  ...timestamps,
});

/**
 * QR d'inscription : émis à la retenue, jamais régénéré après un scan, révoqué (pas supprimé) au désistement,
 * au refus ou à l'annulation. Une candidature ré-acceptée reçoit un nouveau pass ; l'ancien passe à `replaced`.
 */
export const accessPasses = pgTable(
  "access_passes",
  {
    /** Ses 16 octets sont dans la charge utile du QR. */
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kid: smallint("kid")
      .notNull()
      .references(() => signingKeys.kid, { onDelete: "restrict" }),
    signature: bytea("signature").notNull(),
    issuedAt: tstz("issued_at").notNull(),
    revokedAt: tstz("revoked_at"),
    revokedReason: passRevokedReasonEnum("revoked_reason"),
    ...timestamps,
  },
  (t) => [
    // Un seul pass valide par candidature (les révoqués restent pour l'historique et la liste du staff).
    uniqueIndex("access_passes_valid_application_key").on(t.applicationId).where(sql`${t.revokedAt} is null`),
    index("access_passes_event_idx").on(t.eventId),
    index("access_passes_application_idx").on(t.applicationId),
    check("access_passes_revocation_check", sql`(${t.revokedAt} is null) = (${t.revokedReason} is null)`),
  ],
);
