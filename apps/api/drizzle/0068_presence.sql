CREATE TYPE "public"."presence_kind" AS ENUM('gps');--> statement-breakpoint
CREATE TABLE "event_presences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "presence_kind" DEFAULT 'gps' NOT NULL,
	"ticket_id" uuid,
	"validated_at" timestamp with time zone NOT NULL,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_presences_event_user_key" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "presence_radius_m" integer;--> statement-breakpoint
ALTER TABLE "event_presences" ADD CONSTRAINT "event_presences_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_presences" ADD CONSTRAINT "event_presences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_presences" ADD CONSTRAINT "event_presences_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_presence_radius_check" CHECK ("events"."presence_radius_m" is null or "events"."presence_radius_m" between 50 and 2000);