CREATE TYPE "public"."album_tag_removed_reason" AS ENUM('not_mine', 'withdraw', 'tagger');--> statement-breakpoint
CREATE TYPE "public"."album_tag_target" AS ENUM('vehicle', 'user');--> statement-breakpoint
CREATE TYPE "public"."album_tagger" AS ENUM('media', 'organizer', 'owner');--> statement-breakpoint
CREATE TABLE "album_photo_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"target_kind" "album_tag_target" NOT NULL,
	"vehicle_id" uuid,
	"user_id" text NOT NULL,
	"tagged_by" text NOT NULL,
	"tagged_as" "album_tagger" NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" text,
	"removed_reason" "album_tag_removed_reason",
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_photo_tags_vehicle_key" UNIQUE("photo_id","vehicle_id"),
	CONSTRAINT "album_photo_tags_target_check" CHECK (("album_photo_tags"."target_kind" = 'vehicle') = ("album_photo_tags"."vehicle_id" is not null)),
	CONSTRAINT "album_photo_tags_removed_check" CHECK (("album_photo_tags"."removed_at" is null) = ("album_photo_tags"."removed_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "source_album_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "album_photo_tags" ADD CONSTRAINT "album_photo_tags_photo_id_event_album_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."event_album_photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photo_tags" ADD CONSTRAINT "album_photo_tags_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photo_tags" ADD CONSTRAINT "album_photo_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photo_tags" ADD CONSTRAINT "album_photo_tags_tagged_by_user_id_fk" FOREIGN KEY ("tagged_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photo_tags" ADD CONSTRAINT "album_photo_tags_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "album_photo_tags_user_key" ON "album_photo_tags" USING btree ("photo_id","user_id") WHERE "album_photo_tags"."target_kind" = 'user';--> statement-breakpoint
CREATE INDEX "album_photo_tags_user_idx" ON "album_photo_tags" USING btree ("user_id","removed_at");--> statement-breakpoint
CREATE INDEX "album_photo_tags_photo_idx" ON "album_photo_tags" USING btree ("photo_id");--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_source_album_photo_id_event_album_photos_id_fk" FOREIGN KEY ("source_album_photo_id") REFERENCES "public"."event_album_photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_source_album_photo_idx" ON "stories" USING btree ("source_album_photo_id") WHERE "stories"."source_album_photo_id" is not null;