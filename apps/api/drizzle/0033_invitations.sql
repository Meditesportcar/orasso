ALTER TABLE "event_invitations" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD COLUMN "accepted_application_id" uuid;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "high_grade_priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "high_grade_preview_hours" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "high_grade_min" "grade" DEFAULT 'circuit' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_accepted_application_id_applications_id_fk" FOREIGN KEY ("accepted_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_invitations_user_idx" ON "event_invitations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_event_user_key" ON "event_invitations" USING btree ("event_id","user_id") WHERE "event_invitations"."user_id" is not null and "event_invitations"."status" in ('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_event_email_key" ON "event_invitations" USING btree ("event_id",lower("email")) WHERE "event_invitations"."email" is not null and "event_invitations"."user_id" is null and "event_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "event_invitations_application_key" ON "event_invitations" USING btree ("accepted_application_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_high_grade_preview_check" CHECK ("events"."high_grade_preview_hours" between 0 and 168);