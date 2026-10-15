CREATE TYPE "public"."application_kind" AS ENUM('vehicle', 'provider');--> statement-breakpoint
CREATE TYPE "public"."application_source" AS ENUM('self', 'express', 'invitation', 'crew');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'accepted', 'waitlisted', 'offered', 'refused', 'withdrawn', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transition_actor" AS ENUM('user', 'organizer', 'staff', 'system', 'admin');--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "application_status",
	"to_status" "application_status" NOT NULL,
	"actor" "transition_actor" NOT NULL,
	"actor_user_id" text,
	"reason" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "application_kind" DEFAULT 'vehicle' NOT NULL,
	"vehicle_id" uuid,
	"event_day_id" uuid,
	"status" "application_status" NOT NULL,
	"rules_accepted_at" timestamp with time zone NOT NULL,
	"companions" smallint DEFAULT 0 NOT NULL,
	"message" text,
	"follow_structure" boolean NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"refusal_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"refusal_note" text,
	"refusal_sent" boolean DEFAULT true NOT NULL,
	"waitlist_rank" integer,
	"waitlisted_at" timestamp with time zone,
	"offered_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_after_lock" boolean DEFAULT false NOT NULL,
	"zone_id" uuid,
	"source" "application_source" DEFAULT 'self' NOT NULL,
	"filtering_opinion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_vehicle_kind_check" CHECK ("applications"."kind" <> 'vehicle' or "applications"."vehicle_id" is not null),
	CONSTRAINT "applications_companions_check" CHECK ("applications"."companions" between 0 and 9)
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_day_id_event_days_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_zone_id_event_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."event_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_idx" ON "application_events" USING btree ("application_id","at");--> statement-breakpoint
CREATE INDEX "applications_event_status_idx" ON "applications" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "applications_user_status_idx" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "applications_event_waitlist_idx" ON "applications" USING btree ("event_id","waitlist_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_vehicle_key" ON "applications" USING btree ("event_id","vehicle_id") WHERE "applications"."status" in ('pending', 'accepted', 'waitlisted', 'offered');