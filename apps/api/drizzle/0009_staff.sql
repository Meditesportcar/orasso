CREATE TYPE "public"."staff_presence" AS ENUM('unknown', 'present', 'absent');--> statement-breakpoint
CREATE TABLE "event_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"roles" text[],
	"can_decide" boolean,
	"presence" "staff_presence" DEFAULT 'unknown' NOT NULL,
	"presence_updated_at" timestamp with time zone,
	"last_reminded_at" timestamp with time zone,
	"reminder_count" smallint DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_staff_event_user_key" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_staff_user_idx" ON "event_staff" USING btree ("user_id");