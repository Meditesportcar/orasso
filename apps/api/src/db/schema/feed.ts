// Le Fil (lot R7e1, décision D38, ARCHITECTURE-R7 § 1.4) : publications des membres (photos en 4:5 par défaut, 1:1 et
// paysage acceptés), flamme. Une publication est visible de tout membre connecté (compte public) ou des abonnés acceptés
// (compte privé) ; jamais d'un crew. Les photos portent une décision de plaque vraie (floutée, ou « aucune plaque
// visible » confirmée) et sont stockées sous une clé privée `private/feed/<postId>/<hex>.webp` (servie par `GET /feed-posts/:id/photos/:nom`, jamais par `/api/files`).
import {
  feedAspects,
  feedEventRoles,
  feedPostTags,
  importantReasons,
  mentionSources,
  mentionTargetKinds,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
import { mediaProfiles } from "./media";
import { proProfiles } from "./pros";
import { providerProfiles } from "./providers";
import { storyPersonaEnum } from "./stories";
import { structures } from "./structures";
import { vehicles } from "./vehicles";

export const feedAspectEnum = pgEnum("feed_aspect", feedAspects);
/** Rôle d'un rattachement à un événement : déduit des droits à la création, jamais reçu du client (R8a1). */
export const feedEventRoleEnum = pgEnum("feed_event_role", feedEventRoles);
export const importantReasonEnum = pgEnum("important_reason", importantReasons);
/** Étiquette d'une publication (R9c, migration 0087) : « Offre » (fiche pro). */
export const feedPostTagEnum = pgEnum("feed_post_tag", feedPostTags);
export const feedMentionTargetEnum = pgEnum("feed_mention_target", mentionTargetKinds);
export const feedMentionSourceEnum = pgEnum("feed_mention_source", mentionSources);

/**
 * Une publication. Suppression douce (`deleted_at`, `deleted_by` : l'auteur ou la modération) ; ses photos sont effacées
 * tout de suite (lignes et fichiers). `department` : celui de l'auteur à la publication (« Autour de moi »).
 * `commercial_partner_id` : posé par R7m2 (« Collaboration commerciale »), jamais par l'auteur.
 * Vague R8 (lot R8a1, migration 0077) : `persona` + exactement une des quatre colonnes de page (`structure_id`, `pro_id`,
 * `provider_id`, `media_id`) ; `author_id` reste la **personne** qui a publié (trace, jamais servie pour une page).
 * `event_role` : déduit des droits à la création (jamais reçu) ; sans `event_id` (FK `set null`), pas de rattachement à la
 * lecture. `place_label` : lieu libre, ignoré quand l'événement est posé. `pinned_at` (R8a2), `important_*` (« Info
 * importante »), `comments_*` (R8k1).
 */
export const feedPosts = pgTable(
  "feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    caption: text("caption"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    commercialPartnerId: uuid("commercial_partner_id").references(() => proProfiles.id, { onDelete: "set null" }),
    persona: storyPersonaEnum("persona").notNull().default("fan"),
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "cascade" }),
    proId: uuid("pro_id").references(() => proProfiles.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providerProfiles.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => mediaProfiles.id, { onDelete: "cascade" }),
    eventRole: feedEventRoleEnum("event_role"),
    placeLabel: text("place_label"),
    pinnedAt: tstz("pinned_at"),
    importantReason: importantReasonEnum("important_reason"),
    importantSentAt: tstz("important_sent_at"),
    commentsCount: integer("comments_count").notNull().default(0),
    commentsOff: boolean("comments_off").notNull().default(false),
    /** Annonce d'origine d'une publication reprise par `scripts/announcements-to-posts.ts` (R8d, 0081) : rejouable, et la façade retrouve la reprise. */
    legacyAnnouncementId: uuid("legacy_announcement_id"),
    /**
     * Étiquette « Offre » (R9c) : `tag`, `title` (2 à 80 caractères) et les jours de l'offre (`AAAA-MM-JJ`, jours civils de Paris ; début
     * facultatif, fin obligatoire). Fiche pro seulement ; tous nuls sans étiquette (CHECK de la base).
     */
    tag: feedPostTagEnum("tag"),
    title: text("title"),
    offerStartsOn: date("offer_starts_on", { mode: "string" }),
    offerEndsOn: date("offer_ends_on", { mode: "string" }),
    aspect: feedAspectEnum("aspect").notNull().default("portrait_4_5"),
    /** Département de l'auteur à la publication ; chaîne vide si l'auteur n'en a pas choisi. */
    department: text("department").notNull().default(""),
    reactionsCount: integer("reactions_count").notNull().default(0),
    /** Identifiant tiré par l'appareil : un nouvel essai après une réponse perdue rend la même publication. */
    clientId: uuid("client_id"),
    deletedAt: tstz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("feed_posts_created_idx").on(t.createdAt.desc()).where(sql`${t.deletedAt} is null`),
    index("feed_posts_author_idx").on(t.authorId, t.createdAt.desc()),
    index("feed_posts_department_idx").on(t.department, t.createdAt.desc()),
    // Tour 2 : clés étrangères lues à la suppression d'un véhicule, d'un événement ou d'un compte (set null).
    index("feed_posts_vehicle_idx").on(t.vehicleId),
    index("feed_posts_event_idx").on(t.eventId),
    index("feed_posts_deleted_by_idx").on(t.deletedBy),
    uniqueIndex("feed_posts_client_key").on(t.authorId, t.clientId).where(sql`${t.clientId} is not null`),
    // Vague R8 : 500 pour un passionné, 2 000 pour une casquette.
    check(
      "feed_posts_caption_check",
      sql`${t.caption} is null or char_length(${t.caption}) <= case when ${t.persona} = 'fan' then 500 else 2000 end`,
    ),
    // R9c : une étiquette « Offre » exige la casquette pro, un titre de 2 à 80 caractères et un jour de fin ; sans étiquette, ni titre ni jours.
    check(
      "feed_posts_tag_check",
      sql`(${t.tag} is null and ${t.title} is null and ${t.offerStartsOn} is null and ${t.offerEndsOn} is null)
        or (${t.tag} = 'offer' and ${t.persona} = 'pro' and ${t.title} is not null and char_length(${t.title}) between 2 and 80 and ${t.offerEndsOn} is not null)`,
    ),
    check(
      "feed_posts_offer_days_check",
      sql`${t.offerStartsOn} is null or ${t.offerEndsOn} is null or ${t.offerStartsOn} <= ${t.offerEndsOn}`,
    ),
    index("feed_posts_offer_idx").on(t.proId, t.offerEndsOn).where(sql`${t.tag} = 'offer' and ${t.deletedAt} is null`),
    check("feed_posts_reactions_check", sql`${t.reactionsCount} >= 0`),
    check("feed_posts_comments_check", sql`${t.commentsCount} >= 0`),
    check("feed_posts_place_label_check", sql`${t.placeLabel} is null or char_length(${t.placeLabel}) <= 80`),
    // Exactement la colonne de la casquette, aucune pour `fan`.
    check(
      "feed_posts_persona_check",
      sql`(${t.persona} = 'fan' and ${t.structureId} is null and ${t.proId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'organizer' and ${t.structureId} is not null and ${t.proId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'pro' and ${t.proId} is not null and ${t.structureId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'provider' and ${t.providerId} is not null and ${t.structureId} is null and ${t.proId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'media' and ${t.mediaId} is not null and ${t.structureId} is null and ${t.proId} is null and ${t.providerId} is null)`,
    ),
    index("feed_posts_structure_idx").on(t.structureId, t.createdAt.desc()),
    index("feed_posts_pro_idx").on(t.proId, t.createdAt.desc()),
    index("feed_posts_provider_idx").on(t.providerId, t.createdAt.desc()),
    index("feed_posts_media_idx").on(t.mediaId, t.createdAt.desc()),
    index("feed_posts_event_role_idx").on(t.eventId, t.eventRole, t.createdAt.desc()),
    // Une seule publication épinglée par fiche d'événement (R8a2).
    uniqueIndex("feed_posts_legacy_announcement_key").on(t.legacyAnnouncementId),
    uniqueIndex("feed_posts_pinned_key").on(t.eventId).where(sql`${t.pinnedAt} is not null and ${t.deletedAt} is null`),
  ],
);

/** Photos d'une publication : 1 à 6, dans l'ordre. Clé privée ; une décision de plaque vraie sur chacune. */
export const feedPostPhotos = pgTable(
  "feed_post_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique("feed_post_photos_storage_key_key"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: smallint("position").notNull(),
    plateBlurred: boolean("plate_blurred").notNull().default(false),
    noPlateConfirmed: boolean("no_plate_confirmed").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("feed_post_photos_position_key").on(t.postId, t.position),
    check("feed_post_photos_position_check", sql`${t.position} between 0 and 5`),
    check("feed_post_photos_plate_check", sql`${t.plateBlurred} or ${t.noPlateConfirmed}`),
  ],
);

/** La flamme : une par personne et par publication. */
export const feedPostReactions = pgTable(
  "feed_post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId], name: "feed_post_reactions_pkey" }),
    index("feed_post_reactions_user_idx").on(t.userId),
    // R8c1 : flammes des 7 derniers jours (popularité, rail « Ça plaît en ce moment »).
    index("feed_post_reactions_created_idx").on(t.createdAt),
  ],
);

/**
 * Mentions d'une publication (R8a1 pose la table, R8a2 y écrit) : une publication citée sur la fiche d'un événement, la page
 * d'une structure, d'un pro, d'un prestataire, d'un média ou d'une personne. `hidden_at` : « Masquer de la fiche » (ne vaut
 * que pour cette cible ; la publication reste chez son auteur). `target_id` : un UUID, ou l'identifiant d'un compte.
 */
export const feedPostMentions = pgTable(
  "feed_post_mentions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    targetKind: feedMentionTargetEnum("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    source: feedMentionSourceEnum("source").notNull(),
    hiddenAt: tstz("hidden_at"),
    hiddenBy: text("hidden_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.targetKind, t.targetId], name: "feed_post_mentions_pkey" }),
    index("feed_post_mentions_target_idx")
      .on(t.targetKind, t.targetId, t.createdAt.desc())
      .where(sql`${t.hiddenAt} is null`),
    index("feed_post_mentions_hidden_by_idx").on(t.hiddenBy),
  ],
);
