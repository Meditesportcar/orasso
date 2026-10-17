CREATE TYPE "public"."structure_suspension" AS ENUM('badge_expired', 'moderation');--> statement-breakpoint
CREATE TABLE "event_reports" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"refreshed_at" timestamp with time zone,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_contact_views" (
	"application_id" uuid NOT NULL,
	"viewer_id" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participant_contact_views_pkey" PRIMARY KEY("application_id","viewer_id","day")
);
--> statement-breakpoint
CREATE TABLE "participant_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"row_count" integer NOT NULL,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"subject_user_id" text NOT NULL,
	"event_id" uuid,
	"body" text NOT NULL,
	"author_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structure_notes_body_check" CHECK (char_length("structure_notes"."body") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "group_messages" ADD COLUMN "thanks" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "structures" ADD COLUMN "suspended_reason" "structure_suspension";--> statement-breakpoint
ALTER TABLE "structures" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "structures" ADD COLUMN "badge_reminded_at" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_reports" ADD CONSTRAINT "event_reports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_contact_views" ADD CONSTRAINT "participant_contact_views_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_contact_views" ADD CONSTRAINT "participant_contact_views_viewer_id_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_exports" ADD CONSTRAINT "participant_exports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_exports" ADD CONSTRAINT "participant_exports_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_exports" ADD CONSTRAINT "participant_exports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_notes" ADD CONSTRAINT "structure_notes_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_notes" ADD CONSTRAINT "structure_notes_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_notes" ADD CONSTRAINT "structure_notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_notes" ADD CONSTRAINT "structure_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_exports_event_idx" ON "participant_exports" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "structure_notes_subject_idx" ON "structure_notes" USING btree ("structure_id","subject_user_id") WHERE "structure_notes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "structure_notes_structure_created_idx" ON "structure_notes" USING btree ("structure_id","created_at");