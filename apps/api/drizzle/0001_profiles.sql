CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('rodage', 'route', 'sport', 'circuit', 'legende');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('user', 'moderator', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"min_vehicle_age" smallint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"expo_push_token" text,
	"name" text,
	"app_version" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_expo_push_token_key" UNIQUE("expo_push_token")
);
--> statement-breakpoint
CREATE TABLE "profile_interests" (
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "profile_interests_pkey" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pseudo" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"avatar_key" text,
	"bio" text,
	"visibility" "profile_visibility" DEFAULT 'public' NOT NULL,
	"departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"radius_km" smallint DEFAULT 50 NOT NULL,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"newsletter_opt_in" boolean DEFAULT false NOT NULL,
	"notification_prefs" jsonb DEFAULT '{"application":true,"event":true,"social":true,"grade":true}'::jsonb NOT NULL,
	"points_season" integer DEFAULT 0 NOT NULL,
	"grade" "grade" DEFAULT 'rodage' NOT NULL,
	"account_qr_secret" "bytea" NOT NULL,
	"invite_token" text NOT NULL,
	"invited_by_user_id" text,
	"suspended_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_interests" ADD CONSTRAINT "profile_interests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_interests" ADD CONSTRAINT "profile_interests_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_pseudo_lower_key" ON "profiles" USING btree (lower("pseudo"));--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_invite_token_key" ON "profiles" USING btree ("invite_token");--> statement-breakpoint
CREATE INDEX "profiles_departments_idx" ON "profiles" USING gin ("departments");