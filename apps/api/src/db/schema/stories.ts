// Stories (lot R7f1, ARCHITECTURE-R7 § 1.5, décision D38) : une story = un auteur + un public, 24 h, photo (vidéo au lot
// R7g1 : les colonnes sont posées ici). Le fichier est privé (`private/stories/<id>/…`), servi par une route qui vérifie
// l'audience à chaque lecture. Une story n'est `ready` que si sa plaque est traitée (check `stories_plate_check`).
import {
  authorKinds,
  storyAudiences,
  storyLinkTypes,
  storyMediaKinds,
  storyPersonas,
  storyPlateStates,
  storyStatuses,
  storyTagKinds,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { crews } from "./crews";
import { events } from "./events";
import { mediaProfiles } from "./media";
import { proProfiles } from "./pros";
import { providerProfiles } from "./providers";
import { structures } from "./structures";
import { vehicles } from "./vehicles";

export const storyPersonaEnum = pgEnum("story_persona", storyPersonas);
export const storyAudienceEnum = pgEnum("story_audience", storyAudiences);
export const storyMediaEnum = pgEnum("story_media", storyMediaKinds);
export const storyStatusEnum = pgEnum("story_status", storyStatuses);
export const storyPlateEnum = pgEnum("story_plate", storyPlateStates);
export const storyLinkEnum = pgEnum("story_link", storyLinkTypes);
/** Cible d'une identification : une personne, une structure ou un pro (jamais un prestataire ni un média). */
export const storyTagTargetEnum = pgEnum("story_tag_target", storyTagKinds);
/** Auteur d'un mute (lot R9a) : les cinq genres d'auteur (personne, structure, pro, prestataire, média). */
export const storyAuthorKindEnum = pgEnum("story_author_kind", authorKinds);

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    persona: storyPersonaEnum("persona").notNull().default("fan"),
    /** Casquette organisateur : la story se montre sous la structure. */
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "set null" }),
    /** Casquette pro : la story se montre sous la fiche du pro. */
    proId: uuid("pro_id").references(() => proProfiles.id, { onDelete: "set null" }),
    /** Casquette prestataire (lot R9a) : la story se montre sous la page du prestataire, jamais sous le compte. */
    providerId: uuid("provider_id").references(() => providerProfiles.id, { onDelete: "cascade" }),
    /** Casquette média (lot R9a) : la story se montre sous la page du média. */
    mediaId: uuid("media_id").references(() => mediaProfiles.id, { onDelete: "cascade" }),
    audience: storyAudienceEnum("audience").notNull(),
    /** Renseigné si et seulement si `audience = crew`. */
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "cascade" }),
    mediaKind: storyMediaEnum("media_kind").notNull().default("photo"),
    /** Clé **privée** `private/stories/<storyId>/<hex>.webp|.mp4`. */
    storageKey: text("storage_key").notNull(),
    /** Vignette d'une vidéo (lot R7g1). */
    posterKey: text("poster_key"),
    width: smallint("width").notNull().default(1080),
    height: smallint("height").notNull().default(1920),
    durationMs: integer("duration_ms"),
    status: storyStatusEnum("status").notNull().default("ready"),
    /** Photo : décision posée dès que la story est prête, quel que soit le public (crew compris). Vidéo : `not_required`. */
    plateState: storyPlateEnum("plate_state"),
    caption: text("caption"),
    placeLabel: text("place_label"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    /** Autocollant d'événement. */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    linkedType: storyLinkEnum("linked_type"),
    linkedId: text("linked_id"),
    /** « Collaboration commerciale » (lot R7m2) : posé par l'API, jamais par l'auteur. */
    commercialPartnerId: uuid("commercial_partner_id").references(() => proProfiles.id, { onDelete: "set null" }),
    /** Copie « Ajouter à ma story » (lot R7h) : supprimée avec l'originale, même expiration. */
    sharedFromStoryId: uuid("shared_from_story_id").references((): AnyPgColumn => stories.id, {
      onDelete: "cascade",
    }),
    sharedByUserId: text("shared_by_user_id").references(() => user.id, { onDelete: "set null" }),
    viewsCount: integer("views_count").notNull().default(0),
    reactionsCount: integer("reactions_count").notNull().default(0),
    expiresAt: tstz("expires_at").notNull(),
    /** Suppression douce (expiration, auteur, modération) ; les fichiers partent au balayage suivant. */
    deletedAt: tstz("deleted_at"),
    /** Posé quand les fichiers ont été effacés (une story signalée garde les siens jusqu'à la décision). */
    filesRemovedAt: tstz("files_removed_at"),
    ...timestamps,
  },
  (t) => [
    index("stories_author_expires_idx").on(t.authorId, t.expiresAt),
    index("stories_expires_idx").on(t.expiresAt).where(sql`${t.deletedAt} is null`),
    index("stories_public_event_idx").on(t.eventId).where(sql`${t.audience} = 'public'`),
    index("stories_structure_idx").on(t.structureId, t.expiresAt).where(sql`${t.structureId} is not null`),
    index("stories_pro_idx").on(t.proId, t.expiresAt).where(sql`${t.proId} is not null`),
    index("stories_provider_idx").on(t.providerId, t.expiresAt).where(sql`${t.providerId} is not null`),
    index("stories_media_idx").on(t.mediaId, t.expiresAt).where(sql`${t.mediaId} is not null`),
    index("stories_crew_idx").on(t.crewId, t.expiresAt).where(sql`${t.crewId} is not null`),
    index("stories_shared_from_idx").on(t.sharedFromStoryId).where(sql`${t.sharedFromStoryId} is not null`),
    index("stories_sweep_idx").on(t.deletedAt).where(sql`${t.deletedAt} is not null`),
    // Une story de crew a son crew ; les autres n'en ont pas.
    check("stories_crew_check", sql`(${t.audience} = 'crew') = (${t.crewId} is not null)`),
    // Prête = plaque traitée. Structurel : aucune story ne sort sans décision.
    check("stories_plate_check", sql`${t.status} <> 'ready' or ${t.plateState} is not null`),
    // Lot R7g : une vidéo est publiée telle quelle (`not_required`, jamais de décision de plaque) et seule une vidéo
    // porte cette valeur ; une photo porte une vraie décision. Équivalence : dans les deux sens.
    check(
      "stories_plate_media_check",
      sql`(${t.mediaKind} = 'video') = (${t.plateState} is not distinct from 'not_required')`,
    ),
    check("stories_caption_check", sql`${t.caption} is null or char_length(${t.caption}) <= 200`),
    check("stories_place_check", sql`${t.placeLabel} is null or char_length(${t.placeLabel}) <= 80`),
  ],
);

/** Identification (≤ 10 par story). `removed_at` : retrait par l'identifié ; la story reste, le tag disparaît. */
export const storyTags = pgTable(
  "story_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    targetKind: storyTagTargetEnum("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    removedAt: tstz("removed_at"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("story_tags_target_key").on(t.storyId, t.targetKind, t.targetId),
    index("story_tags_target_idx").on(t.targetKind, t.targetId),
  ],
);

/** Vue d'un membre : lue par l'auteur seul (nombre, et liste pour soi). */
export const storyViews = pgTable(
  "story_views",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    viewerId: text("viewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "story_views_pkey", columns: [t.storyId, t.viewerId] }),
    index("story_views_viewer_idx").on(t.viewerId),
  ],
);

/** La flamme. */
export const storyReactions = pgTable(
  "story_reactions",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "story_reactions_pkey", columns: [t.storyId, t.userId] })],
);

/**
 * « Ne plus voir ses stories » : mute personnel, invisible pour l'auteur, ce n'est pas un blocage. Porte sur la barre ;
 * l'auteur est une personne, une structure, un pro, un prestataire ou un média (clé `u:|s:|p:|v:|m:`).
 */
export const storyMutes = pgTable(
  "story_mutes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorKind: storyAuthorKindEnum("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "story_mutes_pkey", columns: [t.userId, t.authorKind, t.authorId] })],
);
