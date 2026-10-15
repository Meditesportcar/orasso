CREATE TYPE "public"."checkin_method" AS ENUM('scan', 'manual', 'plate', 'express');--> statement-breakpoint
CREATE TYPE "public"."local_scan_decision" AS ENUM('ok', 'already', 'refused', 'override', 'unknown_pass');--> statement-breakpoint
CREATE TYPE "public"."scan_server_result" AS ENUM('accepted', 'duplicate_same_device', 'duplicate_other_device', 'rejected', 'unknown');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"method" "checkin_method" NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"device_id" uuid,
	"staff_user_id" text,
	"zone_id" uuid,
	"source_scan_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_application_key" UNIQUE("application_id")
);
--> statement-breakpoint
CREATE TABLE "express_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"user_id" text,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "express_invites_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"device_id" uuid,
	"staff_user_id" text,
	"pass_id" uuid,
	"application_id" uuid,
	"raw_payload" text,
	"local_decision" "local_scan_decision" NOT NULL,
	"local_reason" text,
	"zone_code" text,
	"scanned_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"server_result" "scan_server_result" NOT NULL,
	"duplicate_of_scan_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_zone_id_event_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."event_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_source_scan_id_scan_events_id_fk" FOREIGN KEY ("source_scan_id") REFERENCES "public"."scan_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "express_invites" ADD CONSTRAINT "express_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "express_invites" ADD CONSTRAINT "express_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "express_invites" ADD CONSTRAINT "express_invites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "express_invites" ADD CONSTRAINT "express_invites_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_pass_id_access_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."access_passes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_duplicate_of_scan_id_scan_events_id_fk" FOREIGN KEY ("duplicate_of_scan_id") REFERENCES "public"."scan_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_event_idx" ON "checkins" USING btree ("event_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "express_invites_event_idx" ON "express_invites" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "scan_events_event_received_idx" ON "scan_events" USING btree ("event_id","received_at");--> statement-breakpoint
CREATE INDEX "scan_events_event_pass_idx" ON "scan_events" USING btree ("event_id","pass_id");--> statement-breakpoint
CREATE INDEX "scan_events_application_idx" ON "scan_events" USING btree ("application_id");