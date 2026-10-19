// Média et accréditation presse (lot 45, ARCHITECTURE-DA-V2 § 5.1). L'accréditation elle-même est une candidature de
// genre `media` (`applications.media_profile_id`, `applications.media_formats` : colonnes dans `applications.ts`).
import { type MediaFormat, type MediaPlatform, mediaContentKinds } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

export const mediaContentKindEnum = pgEnum("media_content_kind", mediaContentKinds);

/**
 * Profil média (un par compte). `press_card_number` : privé (AS-V6), jamais sérialisé hors du titulaire et de
 * l'administration, effacé à l'anonymisation ; `press_card_verified_at` posé par l'administration. `departments` vide =
 * toute la France.
 */
export const mediaProfiles = pgTable(
  "media_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    formats: text("formats").array().$type<MediaFormat[]>().notNull().default(sql`'{}'::text[]`),
    description: text("description"),
    website: text("website"),
    instagram: text("instagram"),
    youtube: text("youtube"),
    logoKey: text("logo_key"),
    pressCardNumber: text("press_card_number"),
    pressCardVerifiedAt: tstz("press_card_verified_at"),
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_profiles_user_key").on(t.userId).where(sql`${t.deletedAt} is null`),
    check("media_profiles_name_check", sql`char_length(${t.name}) <= 60`),
    check("media_profiles_description_check", sql`${t.description} is null or char_length(${t.description}) <= 800`),
  ],
);

/** Réglages presse d'un événement, posés par l'organisateur. Absents = accréditation fermée. */
export const eventPressSettings = pgTable(
  "event_press_settings",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => events.id, { onDelete: "cascade" }),
    accreditationOpen: boolean("accreditation_open").notNull().default(false),
    quota: smallint("quota"),
    deadline: tstz("deadline"),
    zones: text("zones"),
    instructions: text("instructions"),
    contact: text("contact"),
    ...timestamps,
  },
  (t) => [
    check("event_press_settings_quota_check", sql`${t.quota} is null or ${t.quota} > 0`),
    check("event_press_settings_zones_check", sql`${t.zones} is null or char_length(${t.zones}) <= 500`),
    check(
      "event_press_settings_instructions_check",
      sql`${t.instructions} is null or char_length(${t.instructions}) <= 1000`,
    ),
  ],
);

/**
 * Contenu d'un média lié à un événement (lien ou galerie). Publiable seulement si le média est accrédité (`accepted`)
 * sur l'événement (V6) ; `featured_at` posé par l'organisateur ; `views` = vues depuis la page de l'événement.
 */
export const mediaContents = pgTable(
  "media_contents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaProfileId: uuid("media_profile_id")
      .notNull()
      .references(() => mediaProfiles.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: mediaContentKindEnum("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    platform: text("platform").$type<MediaPlatform>().notNull().default("other"),
    photoKeys: text("photo_keys").array().notNull().default(sql`'{}'::text[]`),
    featuredAt: tstz("featured_at"),
    views: integer("views").notNull().default(0),
    publishedAt: tstz("published_at").notNull().defaultNow(),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("media_contents_event_idx").on(t.eventId, t.featuredAt).where(sql`${t.deletedAt} is null`),
    index("media_contents_profile_idx").on(t.mediaProfileId, t.publishedAt),
    check("media_contents_title_check", sql`char_length(${t.title}) <= 80`),
    check("media_contents_photos_check", sql`cardinality(${t.photoKeys}) <= 30`),
    // Un lien a son adresse, sauf retiré (l'anonymisation l'efface).
    check("media_contents_link_check", sql`${t.kind} <> 'link' or ${t.url} is not null or ${t.deletedAt} is not null`),
  ],
);

/** Événements gardés par un média (« Mon agenda »). */
export const mediaSavedEvents = pgTable(
  "media_saved_events",
  {
    mediaProfileId: uuid("media_profile_id")
      .notNull()
      .references(() => mediaProfiles.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mediaProfileId, t.eventId] }), index("media_saved_events_event_idx").on(t.eventId)],
);
