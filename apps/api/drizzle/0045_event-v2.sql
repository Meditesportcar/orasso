ALTER TYPE "public"."upload_purpose" ADD VALUE 'event_poster_photo';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "arrival_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "arrival_note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_exhibitors_from" time;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_exhibitors_to" time;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_exhibitors_strict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_exhibitors_note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_public_from" time;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_public_to" time;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_public_strict" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "arrival_public_note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "poster_photo_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "poster_style" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "poster_title" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "poster_post_key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "poster_story_key" text;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_arrival_note_check" CHECK ("applications"."arrival_note" is null or char_length("applications"."arrival_note") <= 200);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_arrival_notes_check" CHECK (coalesce(char_length("events"."arrival_exhibitors_note"), 0) <= 200 and coalesce(char_length("events"."arrival_public_note"), 0) <= 200);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_poster_title_check" CHECK ("events"."poster_title" is null or char_length("events"."poster_title") <= 34);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_poster_style_check" CHECK ("events"."poster_style" is null or "events"."poster_style" in ('neon', 'swiss', 'retro', 'jdm', 'ticket', 'mag', 'minimal', 'damier'));