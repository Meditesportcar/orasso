// Billetterie : réglages de la plateforme, types de billet, commandes, billets (ARCHITECTURE.md § 1.10, lot 14).
// Le QR d'un billet est signé comme celui d'une inscription (`access_passes`) : l'identifiant du billet prend la place
// de celui du pass dans le message signé (même clé, même événement).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { signingKeys } from "./access";
import { user } from "./auth";
import { bytea, timestamps, tstz } from "./common";
import { events } from "./events";
import { devices } from "./profiles";
import { structures } from "./structures";

export const orderStatuses = ["pending", "paid", "cancelled", "expired", "refunded"] as const;
export const orderStatusEnum = pgEnum("order_status", orderStatuses);

export const ticketStatuses = ["valid", "used", "cancelled"] as const;
export const ticketStatusEnum = pgEnum("ticket_status", ticketStatuses);

/** Réglages modifiables par le super admin (interrupteurs) : clé → valeur JSON. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Type de billet d'un événement : prix 0 = billet gratuit. La V1 en propose un seul par événement. */
export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Entrée"),
    priceCents: integer("price_cents").notNull().default(0),
    /** `null` = sans limite. */
    capacity: integer("capacity"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ticket_types_event_key").on(t.eventId),
    check("ticket_types_price_check", sql`${t.priceCents} >= 0`),
    check("ticket_types_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

/**
 * Commande : gratuite (payée d'office, montant 0) ou payante (session Stripe Checkout sur le compte connecté de
 * l'organisateur). `test_mode` : la clé Stripe de la plateforme était une clé de test (aucun vrai encaissement).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("pending"),
    quantity: smallint("quantity").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    feeCents: integer("fee_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    testMode: boolean("test_mode").notNull().default(false),
    stripeAccountId: text("stripe_account_id"),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    expiresAt: tstz("expires_at"),
    paidAt: tstz("paid_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_stripe_session_key").on(t.stripeSessionId),
    index("orders_event_idx").on(t.eventId, t.status),
    index("orders_user_idx").on(t.userId),
    check("orders_quantity_check", sql`${t.quantity} between 1 and 10`),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    /** Ses 16 octets sont dans la charge utile du QR. */
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    status: ticketStatusEnum("status").notNull().default("valid"),
    kid: smallint("kid")
      .notNull()
      .references(() => signingKeys.kid, { onDelete: "restrict" }),
    signature: bytea("signature").notNull(),
    issuedAt: tstz("issued_at").notNull(),
    usedAt: tstz("used_at"),
    usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
    /** Appareil du staff qui a contrôlé le billet (rôle boutique hors ligne, lot 24). */
    usedByDeviceId: uuid("used_by_device_id").references(() => devices.id, { onDelete: "set null" }),
    cancelledAt: tstz("cancelled_at"),
    ...timestamps,
  },
  (t) => [
    index("tickets_event_idx").on(t.eventId, t.status),
    index("tickets_user_idx").on(t.userId),
    index("tickets_order_idx").on(t.orderId),
  ],
);

/** Jetons `state` du parcours de connexion Stripe : aléatoires, à usage unique, liés au propriétaire (lot 14, relecture). */
export const stripeConnectStates = pgTable("stripe_connect_states", {
  nonce: text("nonce").primaryKey(),
  structureId: uuid("structure_id")
    .notNull()
    .references(() => structures.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: tstz("expires_at").notNull(),
  ...timestamps,
});
