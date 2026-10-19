CREATE TYPE "public"."media_content_kind" AS ENUM('link', 'gallery');--> statement-breakpoint
ALTER TYPE "public"."application_kind" ADD VALUE 'media';--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'media_logo';--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'media_content';--> statement-breakpoint
CREATE TABLE "event_press_settings" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"accreditation_open" boolean DEFAULT false NOT NULL,
	"quota" smallint,
	"deadline" timestamp with time zone,
	"zones" text,
	"instructions" text,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_press_settings_quota_check" CHECK ("event_press_settings"."quota" is null or "event_press_settings"."quota" > 0),
	CONSTRAINT "event_press_settings_zones_check" CHECK ("event_press_settings"."zones" is null or char_length("event_press_settings"."zones") <= 500),
	CONSTRAINT "event_press_settings_instructions_check" CHECK ("event_press_settings"."instructions" is null or char_length("event_press_settings"."instructions") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "media_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_profile_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" "media_content_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"platform" text DEFAULT 'other' NOT NULL,
	"photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"featured_at" timestamp with time zone,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_contents_title_check" CHECK (char_length("media_contents"."title") <= 80),
	CONSTRAINT "media_contents_photos_check" CHECK (cardinality("media_contents"."photo_keys") <= 30),
	CONSTRAINT "media_contents_link_check" CHECK ("media_contents"."kind" <> 'link' or "media_contents"."url" is not null)
);
--> statement-breakpoint
CREATE TABLE "media_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"formats" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text,
	"website" text,
	"instagram" text,
	"youtube" text,
	"logo_key" text,
	"press_card_number" text,
	"press_card_verified_at" timestamp with time zone,
	"departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_profiles_name_check" CHECK (char_length("media_profiles"."name") <= 60),
	CONSTRAINT "media_profiles_description_check" CHECK ("media_profiles"."description" is null or char_length("media_profiles"."description") <= 800)
);
--> statement-breakpoint
CREATE TABLE "media_saved_events" (
	"media_profile_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_saved_events_media_profile_id_event_id_pk" PRIMARY KEY("media_profile_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "media_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "media_formats" text[];--> statement-breakpoint
ALTER TABLE "event_press_settings" ADD CONSTRAINT "event_press_settings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_contents" ADD CONSTRAINT "media_contents_media_profile_id_media_profiles_id_fk" FOREIGN KEY ("media_profile_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_contents" ADD CONSTRAINT "media_contents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_profiles" ADD CONSTRAINT "media_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_saved_events" ADD CONSTRAINT "media_saved_events_media_profile_id_media_profiles_id_fk" FOREIGN KEY ("media_profile_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_saved_events" ADD CONSTRAINT "media_saved_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_contents_event_idx" ON "media_contents" USING btree ("event_id","featured_at") WHERE "media_contents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_contents_profile_idx" ON "media_contents" USING btree ("media_profile_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_profiles_user_key" ON "media_profiles" USING btree ("user_id") WHERE "media_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "media_saved_events_event_idx" ON "media_saved_events" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_media_profile_id_media_profiles_id_fk" FOREIGN KEY ("media_profile_id") REFERENCES "public"."media_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_media_key" ON "applications" USING btree ("event_id","media_profile_id") WHERE "applications"."status" in ('pending', 'accepted', 'waitlisted', 'offered');--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_media_kind_check" CHECK ("applications"."kind" in ('vehicle', 'provider') or "applications"."media_profile_id" is not null);