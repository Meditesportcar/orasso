CREATE TYPE "public"."feed_post_tag" AS ENUM('offer');--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "tag" "feed_post_tag";--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "offer_starts_on" date;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "offer_ends_on" date;--> statement-breakpoint
CREATE INDEX "feed_posts_offer_idx" ON "feed_posts" USING btree ("pro_id","offer_ends_on") WHERE "feed_posts"."tag" = 'offer' and "feed_posts"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_tag_check" CHECK (("feed_posts"."tag" is null and "feed_posts"."title" is null and "feed_posts"."offer_starts_on" is null and "feed_posts"."offer_ends_on" is null)
        or ("feed_posts"."tag" = 'offer' and "feed_posts"."persona" = 'pro' and "feed_posts"."title" is not null and char_length("feed_posts"."title") between 2 and 80 and "feed_posts"."offer_ends_on" is not null));--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_offer_days_check" CHECK ("feed_posts"."offer_starts_on" is null or "feed_posts"."offer_ends_on" is null or "feed_posts"."offer_starts_on" <= "feed_posts"."offer_ends_on");