CREATE TYPE "public"."contest_state" AS ENUM('none', 'pending', 'upheld', 'lifted');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('insult', 'scam', 'shocking', 'fake_profile', 'harassment', 'spam', 'dangerous_driving', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewing', 'resolved_action', 'resolved_no_action', 'dismissed_abusive');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('profile', 'vehicle', 'photo', 'message', 'event', 'review', 'crew', 'pro', 'provider', 'announcement');--> statement-breakpoint
CREATE TYPE "public"."sanction_kind" AS ENUM('warning', 'suspension_7d', 'suspension_30d', 'ban');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" text NOT NULL,
	"target_owner_id" text,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"screenshot_key" text,
	"context" jsonb,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"handled_by" text,
	"handled_at" timestamp with time zone,
	"sanction_id" uuid,
	"retain_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_details_check" CHECK ("reports"."details" is null or char_length("reports"."details") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "sanction_kind" NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text,
	"report_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"issued_by" text,
	"auto" boolean DEFAULT false NOT NULL,
	"contest_status" "contest_state" DEFAULT 'none' NOT NULL,
	"contest_message" text,
	"contested_at" timestamp with time zone,
	"contest_decided_by" text,
	"contest_decided_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctions_note_check" CHECK ("sanctions"."note" is null or char_length("sanctions"."note") <= 1000),
	CONSTRAINT "sanctions_contest_message_check" CHECK ("sanctions"."contest_message" is null or char_length("sanctions"."contest_message") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_owner_id_user_id_fk" FOREIGN KEY ("target_owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_contest_decided_by_user_id_fk" FOREIGN KEY ("contest_decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_lifted_by_user_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_target_key" ON "reports" USING btree ("reporter_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_owner_created_idx" ON "reports" USING btree ("target_owner_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_created_idx" ON "reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_retain_idx" ON "reports" USING btree ("retain_until") WHERE "reports"."retain_until" is not null;--> statement-breakpoint
CREATE INDEX "sanctions_user_idx" ON "sanctions" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "sanctions_contest_idx" ON "sanctions" USING btree ("contest_status") WHERE "sanctions"."contest_status" = 'pending';