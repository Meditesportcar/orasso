CREATE TYPE "public"."crew_member_status" AS ENUM('invited', 'requested', 'active', 'left', 'removed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."crew_role" AS ENUM('leader', 'member');--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'awaiting_member';--> statement-breakpoint
CREATE TABLE "crew_members" (
	"crew_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "crew_role" DEFAULT 'member' NOT NULL,
	"status" "crew_member_status" NOT NULL,
	"message" text,
	"invited_by" text,
	"responded_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_members_pkey" PRIMARY KEY("crew_id","user_id"),
	CONSTRAINT "crew_members_message_check" CHECK ("crew_members"."message" is null or char_length("crew_members"."message") <= 300)
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_key" text,
	"description" text,
	"department" text NOT NULL,
	"created_by" text NOT NULL,
	"members_count" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crews_slug_key" UNIQUE("slug"),
	CONSTRAINT "crews_name_check" CHECK (char_length("crews"."name") between 3 and 40),
	CONSTRAINT "crews_description_check" CHECK ("crews"."description" is null or char_length("crews"."description") <= 500)
);
--> statement-breakpoint
DROP INDEX "applications_active_vehicle_key";--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "rules_accepted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "crew_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "crew_application_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "member_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_members_one_leader_key" ON "crew_members" USING btree ("crew_id") WHERE "crew_members"."role" = 'leader' and "crew_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "crew_members_user_status_idx" ON "crew_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "crew_members_crew_status_idx" ON "crew_members" USING btree ("crew_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crews_name_lower_key" ON "crews" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "crews_department_idx" ON "crews" USING btree ("department") WHERE "crews"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_crew_idx" ON "applications" USING btree ("crew_id","event_id") WHERE "applications"."crew_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_vehicle_key" ON "applications" USING btree ("event_id","vehicle_id") WHERE "applications"."status" not in ('refused', 'withdrawn', 'expired', 'cancelled');--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_rules_check" CHECK ("applications"."rules_accepted_at" is not null or "applications"."crew_application_id" is not null);