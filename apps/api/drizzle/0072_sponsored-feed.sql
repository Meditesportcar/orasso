CREATE TYPE "public"."advertiser_kind" AS ENUM('pro', 'external');--> statement-breakpoint
ALTER TABLE "sponsored_placements" ALTER COLUMN "pro_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_daily_seen" ADD COLUMN "surface" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_daily_stats" ADD COLUMN "surface" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD COLUMN "advertiser_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "sponsored_placements" SET "advertiser_name" = "pro_profiles"."name" FROM "pro_profiles" WHERE "pro_profiles"."id" = "sponsored_placements"."pro_profile_id";--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD COLUMN "advertiser_kind" "advertiser_kind" DEFAULT 'pro' NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD COLUMN "surfaces" text[] DEFAULT '{home}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD COLUMN "disclosure" text;--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD COLUMN "external_url_domain" text;--> statement-breakpoint
ALTER TABLE "sponsored_daily_seen" DROP CONSTRAINT "sponsored_daily_seen_pkey";
--> statement-breakpoint
ALTER TABLE "sponsored_daily_seen" ADD CONSTRAINT "sponsored_daily_seen_pkey" PRIMARY KEY("placement_id","user_hash","day","surface");--> statement-breakpoint
ALTER TABLE "sponsored_daily_stats" DROP CONSTRAINT "sponsored_daily_stats_pkey";
--> statement-breakpoint
ALTER TABLE "sponsored_daily_stats" ADD CONSTRAINT "sponsored_daily_stats_pkey" PRIMARY KEY("placement_id","day","surface");--> statement-breakpoint
ALTER TABLE "sponsored_placements" ADD CONSTRAINT "sponsored_placements_advertiser_check" CHECK (("sponsored_placements"."advertiser_kind" = 'external' and "sponsored_placements"."pro_profile_id" is null) or ("sponsored_placements"."advertiser_kind" = 'pro' and "sponsored_placements"."pro_profile_id" is not null));