CREATE TYPE "public"."event_admission" AS ENUM('open', 'filtered', 'invite_only');--> statement-breakpoint
CREATE TYPE "public"."event_format" AS ENUM('gathering', 'exhibition', 'cars_and_coffee', 'show', 'open_house', 'night');--> statement-breakpoint
CREATE TYPE "public"."event_outlook" AS ENUM('maintained', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."event_public_access" AS ENUM('free', 'free_reservation', 'paid_orasso', 'paid_external', 'closed');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TABLE "event_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"day_date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_days_event_day_key" UNIQUE("event_id","day_date")
);
--> statement-breakpoint
CREATE TABLE "event_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"vehicle_id" uuid,
	"email" text,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_invitations_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "event_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_zones_event_code_key" UNIQUE("event_id","code")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "events_event_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"plate_salt" "bytea" NOT NULL,
	"structure_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"poster_key" text,
	"format" "event_format" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Europe/Paris' NOT NULL,
	"address_line" text,
	"postal_code" text,
	"city" text,
	"department" text,
	"lat" double precision,
	"lng" double precision,
	"admitted_vehicle_types" text[] NOT NULL,
	"capacity" integer,
	"max_vehicles_per_user" smallint DEFAULT 1 NOT NULL,
	"admission" "event_admission" NOT NULL,
	"criteria" jsonb,
	"public_access" "event_public_access" DEFAULT 'free' NOT NULL,
	"external_ticket_url" text,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"outlook" "event_outlook" DEFAULT 'maintained' NOT NULL,
	"registrations_open_at" timestamp with time zone NOT NULL,
	"preview_hours" smallint DEFAULT 24 NOT NULL,
	"lock_offset_minutes" integer DEFAULT 120 NOT NULL,
	"locked_at" timestamp with time zone,
	"rules_text" text,
	"instructions" text,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_event_no_key" UNIQUE("event_no"),
	CONSTRAINT "events_slug_key" UNIQUE("slug"),
	CONSTRAINT "events_dates_check" CHECK ("events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_capacity_check" CHECK ("events"."capacity" is null or "events"."capacity" > 0),
	CONSTRAINT "events_lock_offset_check" CHECK ("events"."lock_offset_minutes" between 0 and 1440),
	CONSTRAINT "events_max_vehicles_check" CHECK ("events"."max_vehicles_per_user" >= 1)
);
--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_invitations_event_idx" ON "event_invitations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_structure_starts_idx" ON "events" USING btree ("structure_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "events_department_idx" ON "events" USING btree ("department");--> statement-breakpoint
CREATE INDEX "events_lat_lng_idx" ON "events" USING btree ("lat","lng");