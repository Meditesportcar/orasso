CREATE TYPE "public"."placement_status" AS ENUM('draft', 'active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "external_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsored_daily_seen" (
	"placement_id" uuid NOT NULL,
	"user_hash" text NOT NULL,
	"day" date NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sponsored_daily_seen_pkey" PRIMARY KEY("placement_id","user_hash","day")
);
--> statement-breakpoint
CREATE TABLE "sponsored_daily_stats" (
	"placement_id" uuid NOT NULL,
	"day" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sponsored_daily_stats_pkey" PRIMARY KEY("placement_id","day")
);
--> statement-breakpoint
CREATE TABLE "sponsored_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_key" text,
	"link_url" text NOT NULL,
	"departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"daily_cap" integer,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"status" "placement_status" DEFAULT 'draft' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pro_follows" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_daily_seen" ADD CONSTRAINT "sponsored_daily_seen_placement_id_sponsored_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."sponsored_placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_daily_stats" ADD CONSTRAINT "sponsored_daily_stats_placement_id_sponsored_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."sponsored_placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD CONSTRAINT "sponsored_placements_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsored_daily_seen_day_idx" ON "sponsored_daily_seen" USING btree ("day");--> statement-breakpoint
CREATE INDEX "sponsored_placements_status_idx" ON "sponsored_placements" USING btree ("status","starts_on","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_follows_favorite_key" ON "pro_follows" USING btree ("user_id") WHERE "pro_follows"."favorite";