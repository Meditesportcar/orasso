CREATE TYPE "public"."provider_power" AS ENUM('none', 'a16', 'a32', 'generator_ok');--> statement-breakpoint
CREATE TABLE "event_needs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"trade" text NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"power" "provider_power" DEFAULT 'none' NOT NULL,
	"water" boolean DEFAULT false NOT NULL,
	"frontage_m" smallint,
	"install_at" timestamp with time zone,
	"notes" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_needs_quantity_check" CHECK ("event_needs"."quantity" between 1 and 9),
	CONSTRAINT "event_needs_frontage_check" CHECK ("event_needs"."frontage_m" is null or "event_needs"."frontage_m" between 1 and 30),
	CONSTRAINT "event_needs_notes_check" CHECK ("event_needs"."notes" is null or char_length("event_needs"."notes") <= 300)
);
--> statement-breakpoint
CREATE TABLE "provider_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_profile_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"author_id" text,
	"rating" smallint NOT NULL,
	"comment" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_reviews_rating_check" CHECK ("provider_reviews"."rating" between 1 and 5),
	CONSTRAINT "provider_reviews_comment_check" CHECK ("provider_reviews"."comment" is null or char_length("provider_reviews"."comment") <= 300)
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "need_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "spot_label" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "spot_note" text;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "trades" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "team_size" smallint;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "menu" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "power_need" "provider_power";--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "frontage_m" smallint;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "water_need" boolean;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "radius_km" smallint DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_needs" ADD CONSTRAINT "event_needs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_provider_profile_id_provider_profiles_id_fk" FOREIGN KEY ("provider_profile_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reviews" ADD CONSTRAINT "provider_reviews_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_needs_event_idx" ON "event_needs" USING btree ("event_id","position");--> statement-breakpoint
CREATE INDEX "event_needs_trade_idx" ON "event_needs" USING btree ("trade");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_reviews_application_key" ON "provider_reviews" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "provider_reviews_provider_idx" ON "provider_reviews" USING btree ("provider_profile_id","created_at");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_need_id_event_needs_id_fk" FOREIGN KEY ("need_id") REFERENCES "public"."event_needs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_need_idx" ON "applications" USING btree ("need_id") WHERE "applications"."need_id" is not null;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_spot_label_check" CHECK ("applications"."spot_label" is null or char_length("applications"."spot_label") <= 12);--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_spot_note_check" CHECK ("applications"."spot_note" is null or char_length("applications"."spot_note") <= 200);--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_tagline_check" CHECK ("provider_profiles"."tagline" is null or char_length("provider_profiles"."tagline") <= 80);--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_team_size_check" CHECK ("provider_profiles"."team_size" is null or "provider_profiles"."team_size" between 1 and 50);--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_frontage_check" CHECK ("provider_profiles"."frontage_m" is null or "provider_profiles"."frontage_m" between 1 and 30);--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_radius_check" CHECK ("provider_profiles"."radius_km" between 5 and 500);