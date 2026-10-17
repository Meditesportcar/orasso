CREATE TYPE "public"."ticket_scan_result" AS ENUM('accepted', 'already', 'refused', 'rejected');--> statement-breakpoint
CREATE TABLE "ticket_scans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"device_id" uuid,
	"staff_user_id" text,
	"ticket_id" uuid,
	"local_decision" text NOT NULL,
	"reason" text,
	"scanned_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"server_result" "ticket_scan_result" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"device_id" uuid,
	"staff_user_id" text,
	"delta" smallint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_entries_delta_check" CHECK ("visitor_entries"."delta" in (-10, -1, 1, 10))
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "shop_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "used_by_device_id" uuid;--> statement-breakpoint
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_scans" ADD CONSTRAINT "ticket_scans_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_entries" ADD CONSTRAINT "visitor_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_entries" ADD CONSTRAINT "visitor_entries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_entries" ADD CONSTRAINT "visitor_entries_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_scans_event_idx" ON "ticket_scans" USING btree ("event_id","received_at");--> statement-breakpoint
CREATE INDEX "ticket_scans_ticket_idx" ON "ticket_scans" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "visitor_entries_event_idx" ON "visitor_entries" USING btree ("event_id","at");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_used_by_device_id_devices_id_fk" FOREIGN KEY ("used_by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;