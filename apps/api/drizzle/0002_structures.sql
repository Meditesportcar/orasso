CREATE TYPE "public"."follow_source" AS ENUM('application', 'invite_link', 'manual');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('invited', 'requested', 'active', 'removed');--> statement-breakpoint
CREATE TYPE "public"."structure_kind" AS ENUM('association', 'club', 'circuit', 'company', 'collectivity');--> statement-breakpoint
CREATE TYPE "public"."structure_role" AS ENUM('owner', 'co_organizer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."structure_verification" AS ENUM('unverified', 'pending', 'verified', 'suspended');--> statement-breakpoint
CREATE TABLE "structure_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structure_bans_structure_user_key" UNIQUE("structure_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "structure_follows" (
	"structure_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source" "follow_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structure_follows_pkey" PRIMARY KEY("structure_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "structure_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "structure_role" NOT NULL,
	"staff_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"can_decide" boolean DEFAULT false NOT NULL,
	"status" "member_status" NOT NULL,
	"invited_by" text,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structure_members_structure_user_key" UNIQUE("structure_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "structure_kind" NOT NULL,
	"name" text NOT NULL,
	"logo_key" text,
	"description" text,
	"address_line" text,
	"postal_code" text,
	"city" text,
	"department" text,
	"lat" double precision,
	"lng" double precision,
	"departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"website" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"siret" text,
	"rna" text,
	"verification" "structure_verification" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"badge_expires_at" timestamp with time zone,
	"invite_token" text NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"stripe_account_id" text,
	"follower_message_quota" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "structures_slug_key" UNIQUE("slug"),
	CONSTRAINT "structures_invite_token_key" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "structure_bans" ADD CONSTRAINT "structure_bans_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_bans" ADD CONSTRAINT "structure_bans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_bans" ADD CONSTRAINT "structure_bans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_follows" ADD CONSTRAINT "structure_follows_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_follows" ADD CONSTRAINT "structure_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_members" ADD CONSTRAINT "structure_members_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_members" ADD CONSTRAINT "structure_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_members" ADD CONSTRAINT "structure_members_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structures" ADD CONSTRAINT "structures_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "structure_follows_user_id_idx" ON "structure_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "structure_members_user_id_idx" ON "structure_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structure_members_one_active_owner" ON "structure_members" USING btree ("structure_id") WHERE "structure_members"."role" = 'owner' and "structure_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "structures_department_idx" ON "structures" USING btree ("department");