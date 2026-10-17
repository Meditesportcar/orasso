CREATE TYPE "public"."assistance_close_reason" AS ENUM('organizer', 'admin', 'expired');--> statement-breakpoint
CREATE TYPE "public"."assistance_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."newsletter_pause_reason" AS ENUM('admin', 'errors');--> statement-breakpoint
CREATE TYPE "public"."newsletter_status" AS ENUM('draft', 'scheduled', 'sending', 'paused', 'sent');--> statement-breakpoint
CREATE TABLE "assistance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"requested_by" text,
	"message" text NOT NULL,
	"status" "assistance_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"close_reason" "assistance_close_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"newsletter_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_deliveries_pkey" PRIMARY KEY("newsletter_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"body_md" text NOT NULL,
	"status" "newsletter_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"pause_reason" "newsletter_pause_reason",
	"resume_after" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "assistance_request_id" uuid;--> statement-breakpoint
ALTER TABLE "assistance_requests" ADD CONSTRAINT "assistance_requests_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_requests" ADD CONSTRAINT "assistance_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistance_requests" ADD CONSTRAINT "assistance_requests_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_newsletter_id_newsletters_id_fk" FOREIGN KEY ("newsletter_id") REFERENCES "public"."newsletters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistance_requests_open_key" ON "assistance_requests" USING btree ("structure_id") WHERE "assistance_requests"."status" = 'open';--> statement-breakpoint
CREATE INDEX "assistance_requests_status_idx" ON "assistance_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "newsletters_status_idx" ON "newsletters" USING btree ("status","scheduled_at");--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_assistance_request_id_assistance_requests_id_fk" FOREIGN KEY ("assistance_request_id") REFERENCES "public"."assistance_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_structure_idx" ON "admin_audit_log" USING btree ("structure_id","created_at");