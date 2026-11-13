// Albums des médias rattachés à un événement (vague R9, lot R9e, ARCHITECTURE-R8 § 1.10). Un album est publié par un média
// accrédité (`applications.kind = 'media'`, `accepted`) à l'événement ; ses photos ne deviennent jamais des publications.
// Le floutage de plaque est **proposé** photo par photo (D28) : l'état de chaque photo est gardé (`plate_state`,
// `plate_rects`) pour qu'un repartage en story ou une reprise au journal puisse flouter la copie ; ces champs ne sont
// jamais servis à un autre que le média (liste blanche des vues).
import { albumPlateStates, albumStatuses } from "@orasso/shared";
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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { mediaContents, mediaProfiles } from "./media";

export const albumStatusEnum = pgEnum("album_status", albumStatuses);
export const albumPlateStateEnum = pgEnum("album_plate_state", albumPlateStates);

/** Cadre de plaque, en fractions de la photo (même forme que `PlateRect`). */
export type StoredPlateRect = { x: number; y: number; w: number; h: number; angle?: number };

/**
 * Un album : un brouillon (`draft`, un par événement et par média, purgé après 7 jours) ou publié. `title` nul = « Les photos du
 * <événement> » (servi par l'API). `official_at` : l'album officiel de l'événement (posé par l'organisateur, lot R9g ; un seul
 * par événement). `photos_count` est tenu à jour sous le verrou de l'album. `legacy_media_content_id` : la galerie reprise.
 */
export const eventAlbums = pgTable(
  "event_albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    mediaProfileId: uuid("media_profile_id")
      .notNull()
      .references(() => mediaProfiles.id, { onDelete: "cascade" }),
    /** Le titulaire du profil média au moment de la création : jamais servi (liste blanche). */
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    allowSave: boolean("allow_save").notNull().default(false),
    officialAt: tstz("official_at"),
    photosCount: integer("photos_count").notNull().default(0),
    /** Vues depuis la page de l'événement (reprises des galeries d'avant : le média les voit toujours). */
    views: integer("views").notNull().default(0),
    status: albumStatusEnum("status").notNull().default("draft"),
    publishedAt: tstz("published_at"),
    deletedAt: tstz("deleted_at"),
    legacyMediaContentId: uuid("legacy_media_content_id").references(() => mediaContents.id, { onDelete: "set null" }),
    clientId: uuid("client_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("event_albums_official_key").on(t.eventId).where(sql`${t.officialAt} is not null`),
    uniqueIndex("event_albums_legacy_key").on(t.legacyMediaContentId),
    uniqueIndex("event_albums_client_key").on(t.mediaProfileId, t.clientId),
    index("event_albums_event_idx")
      .on(t.eventId, t.publishedAt)
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index("event_albums_media_idx").on(t.mediaProfileId, t.publishedAt),
    // Un brouillon par événement et par média (le même média ne cumule pas deux brouillons sur un événement).
    uniqueIndex("event_albums_draft_key")
      .on(t.eventId, t.mediaProfileId)
      .where(sql`${t.status} = 'draft' and ${t.deletedAt} is null`),
    check("event_albums_title_check", sql`${t.title} is null or char_length(${t.title}) <= 80`),
    check("event_albums_published_check", sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
  ],
);

/**
 * Une photo d'album. `width` et `height` sont nuls pour une photo reprise d'une ancienne galerie (dimensions inconnues). La
 * clé reprise reste sous son dossier d'origine (`media-contents/…`, publique) ; les photos neuves sont sous
 * `private/albums/<albumId>/…`. Aucun plafond ici : les 200 photos se tiennent dans le service, sous le verrou de l'album.
 */
export const eventAlbumPhotos = pgTable(
  "event_album_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    albumId: uuid("album_id")
      .notNull()
      .references(() => eventAlbums.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique("event_album_photos_storage_key_key"),
    width: integer("width"),
    height: integer("height"),
    position: smallint("position").notNull(),
    plateState: albumPlateStateEnum("plate_state").notNull(),
    plateRects: jsonb("plate_rects").$type<StoredPlateRect[]>(),
    clientId: uuid("client_id"),
    /**
     * La clé de l'**original** (`media-contents/<uuid>.webp`, publique) d'une photo copiée sous une clé privée quand une galerie est publiée par
     * l'ancien chemin (APK en ligne). C'est la preuve **durable** que cet original ne doit plus être servi par `/api/files`, même si son
     * effacement a échoué : elle survit à la suppression de l'album, de la photo (la ligne est gardée avec `deleted_at`) et du compte.
     */
    legacySourceKey: text("legacy_source_key"),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    unique("event_album_photos_legacy_source_key_key").on(t.legacySourceKey),
    uniqueIndex("event_album_photos_position_key").on(t.albumId, t.position).where(sql`${t.deletedAt} is null`),
    uniqueIndex("event_album_photos_client_key").on(t.albumId, t.clientId),
    index("event_album_photos_album_idx").on(t.albumId),
    // Floutée ou gardée telle quelle : les cadres sont conservés ; aucune plaque ou photo reprise : pas de cadre.
    check(
      "event_album_photos_rects_check",
      sql`(${t.plateState} in ('blurred', 'kept')) = (${t.plateRects} is not null)`,
    ),
  ],
);
