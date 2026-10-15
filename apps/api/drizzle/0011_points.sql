CREATE TYPE "public"."contest_status" AS ENUM('pending', 'accepted', 'rejected', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."point_kind" AS ENUM('participation', 'staff', 'referral', 'malus', 'malus_reversal', 'season_carryover', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "malus_contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_entry_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"application_id" uuid,
	"message" text NOT NULL,
	"status" "contest_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"organizer_note" text,
	"escalated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "malus_contests_point_entry_key" UNIQUE("point_entry_id")
);
--> statement-breakpoint
CREATE TABLE "point_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" "point_kind" NOT NULL,
	"points" integer NOT NULL,
	"event_id" uuid,
	"application_id" uuid,
	"created_by" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_starts_on_key" UNIQUE("starts_on")
);
--> statement-breakpoint
ALTER TABLE "malus_contests" ADD CONSTRAINT "malus_contests_point_entry_id_point_entries_id_fk" FOREIGN KEY ("point_entry_id") REFERENCES "public"."point_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malus_contests" ADD CONSTRAINT "malus_contests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malus_contests" ADD CONSTRAINT "malus_contests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malus_contests" ADD CONSTRAINT "malus_contests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malus_contests" ADD CONSTRAINT "malus_contests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "malus_contests_event_idx" ON "malus_contests" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "malus_contests_status_idx" ON "malus_contests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "point_entries_user_season_idx" ON "point_entries" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_application_kind_key" ON "point_entries" USING btree ("application_id","kind") WHERE "point_entries"."application_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_staff_key" ON "point_entries" USING btree ("event_id","user_id") WHERE "point_entries"."kind" = 'staff';--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_carryover_key" ON "point_entries" USING btree ("user_id","season_id") WHERE "point_entries"."kind" = 'season_carryover';