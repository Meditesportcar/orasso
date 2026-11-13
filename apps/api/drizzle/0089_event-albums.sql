CREATE TYPE "public"."album_plate_state" AS ENUM('blurred', 'kept', 'none', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."album_status" AS ENUM('draft', 'published');--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'album_photo';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'album_photo';--> statement-breakpoint
CREATE TABLE "event_album_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"position" smallint NOT NULL,
	"plate_state" "album_plate_state" NOT NULL,
	"plate_rects" jsonb,
	"client_id" uuid,
	"legacy_source_key" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_album_photos_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "event_album_photos_legacy_source_key_key" UNIQUE("legacy_source_key"),
	CONSTRAINT "event_album_photos_rects_check" CHECK (("event_album_photos"."plate_state" in ('blurred', 'kept')) = ("event_album_photos"."plate_rects" is not null))
);
--> statement-breakpoint
CREATE TABLE "event_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"media_profile_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"title" text,
	"allow_save" boolean DEFAULT false NOT NULL,
	"official_at" timestamp with time zone,
	"photos_count" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"status" "album_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"legacy_media_content_id" uuid,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_albums_title_check" CHECK ("event_albums"."title" is null or char_length("event_albums"."title") <= 80),
	CONSTRAINT "event_albums_published_check" CHECK ("event_albums"."status" <> 'published' or "event_albums"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "legacy_file_blocks" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_album_photos" ADD CONSTRAINT "event_album_photos_album_id_event_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."event_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_albums" ADD CONSTRAINT "event_albums_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_albums" ADD CONSTRAINT "event_albums_media_profile_id_media_profiles_id_fk" FOREIGN KEY ("media_profile_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_albums" ADD CONSTRAINT "event_albums_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_albums" ADD CONSTRAINT "event_albums_legacy_media_content_id_media_contents_id_fk" FOREIGN KEY ("legacy_media_content_id") REFERENCES "public"."media_contents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_album_photos_position_key" ON "event_album_photos" USING btree ("album_id","position") WHERE "event_album_photos"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_album_photos_client_key" ON "event_album_photos" USING btree ("album_id","client_id");--> statement-breakpoint
CREATE INDEX "event_album_photos_album_idx" ON "event_album_photos" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_albums_official_key" ON "event_albums" USING btree ("event_id") WHERE "event_albums"."official_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_albums_legacy_key" ON "event_albums" USING btree ("legacy_media_content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_albums_client_key" ON "event_albums" USING btree ("media_profile_id","client_id");--> statement-breakpoint
CREATE INDEX "event_albums_event_idx" ON "event_albums" USING btree ("event_id","published_at") WHERE "event_albums"."status" = 'published' and "event_albums"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "event_albums_media_idx" ON "event_albums" USING btree ("media_profile_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_albums_draft_key" ON "event_albums" USING btree ("event_id","media_profile_id") WHERE "event_albums"."status" = 'draft' and "event_albums"."deleted_at" is null;
--> statement-breakpoint
-- Reprise des galeries d'avant (SQL écrit à la main, idempotent) : voir modules/albums/reprise.ts.
INSERT INTO "event_albums" ("id", "event_id", "media_profile_id", "author_id", "title", "allow_save", "official_at", "photos_count", "views", "status", "published_at", "legacy_media_content_id", "created_at", "updated_at")
SELECT mc."id", mc."event_id", mc."media_profile_id", mp."user_id", mc."title", false,
  CASE WHEN mc."featured_at" IS NOT NULL AND mc."id" = (
    SELECT f."id" FROM "media_contents" f
    WHERE f."event_id" = mc."event_id" AND f."kind" = 'gallery' AND f."deleted_at" IS NULL AND f."featured_at" IS NOT NULL
    ORDER BY f."featured_at" DESC, f."id" DESC LIMIT 1)
  THEN mc."featured_at" ELSE NULL END,
  cardinality(mc."photo_keys"), mc."views", 'published', mc."published_at", mc."id", mc."created_at", mc."updated_at"
FROM "media_contents" mc
JOIN "media_profiles" mp ON mp."id" = mc."media_profile_id"
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "event_album_photos" ("album_id", "storage_key", "position", "plate_state", "created_at", "updated_at")
SELECT a."id", k."key", (k."ord" - 1)::smallint, 'unknown', mc."created_at", mc."updated_at"
FROM "event_albums" a
JOIN "media_contents" mc ON mc."id" = a."legacy_media_content_id"
CROSS JOIN LATERAL unnest(mc."photo_keys") WITH ORDINALITY AS k("key", "ord")
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "event_albums" a SET "photos_count" = (SELECT count(*)::int FROM "event_album_photos" p WHERE p."album_id" = a."id" AND p."deleted_at" IS NULL)
WHERE a."legacy_media_content_id" IN (SELECT mc."id" FROM "media_contents" mc WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL);--> statement-breakpoint
UPDATE "media_contents" mc SET "deleted_at" = now()
WHERE mc."kind" = 'gallery' AND mc."deleted_at" IS NULL
  AND EXISTS (SELECT 1 FROM "event_albums" a WHERE a."legacy_media_content_id" = mc."id");
