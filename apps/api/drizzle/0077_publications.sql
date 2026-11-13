CREATE TYPE "public"."feed_event_role" AS ENUM('organizer', 'on_site', 'attendee');--> statement-breakpoint
CREATE TYPE "public"."feed_mention_source" AS ENUM('attach', 'caption', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."feed_mention_target" AS ENUM('user', 'structure', 'pro', 'provider', 'media', 'event');--> statement-breakpoint
CREATE TYPE "public"."important_reason" AS ENUM('schedule', 'access', 'safety', 'weather', 'other');--> statement-breakpoint
CREATE TABLE "feed_post_mentions" (
	"post_id" uuid NOT NULL,
	"target_kind" "feed_mention_target" NOT NULL,
	"target_id" text NOT NULL,
	"source" "feed_mention_source" NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_mentions_pkey" PRIMARY KEY("post_id","target_kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "feed_posts" DROP CONSTRAINT "feed_posts_caption_check";--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "persona" "story_persona" DEFAULT 'fan' NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "structure_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "pro_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "event_role" "feed_event_role";--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "place_label" text;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "important_reason" "important_reason";--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "important_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "comments_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD COLUMN "comments_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_post_mentions" ADD CONSTRAINT "feed_post_mentions_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_mentions" ADD CONSTRAINT "feed_post_mentions_hidden_by_user_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_post_mentions_target_idx" ON "feed_post_mentions" USING btree ("target_kind","target_id","created_at" DESC NULLS LAST) WHERE "feed_post_mentions"."hidden_at" is null;--> statement-breakpoint
CREATE INDEX "feed_post_mentions_hidden_by_idx" ON "feed_post_mentions" USING btree ("hidden_by");--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_media_id_media_profiles_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_posts_structure_idx" ON "feed_posts" USING btree ("structure_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_pro_idx" ON "feed_posts" USING btree ("pro_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_provider_idx" ON "feed_posts" USING btree ("provider_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_media_idx" ON "feed_posts" USING btree ("media_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_event_role_idx" ON "feed_posts" USING btree ("event_id","event_role","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "feed_posts_pinned_key" ON "feed_posts" USING btree ("event_id") WHERE "feed_posts"."pinned_at" is not null and "feed_posts"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_comments_check" CHECK ("feed_posts"."comments_count" >= 0);--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_place_label_check" CHECK ("feed_posts"."place_label" is null or char_length("feed_posts"."place_label") <= 80);--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_persona_check" CHECK (("feed_posts"."persona" = 'fan' and "feed_posts"."structure_id" is null and "feed_posts"."pro_id" is null and "feed_posts"."provider_id" is null and "feed_posts"."media_id" is null)
        or ("feed_posts"."persona" = 'organizer' and "feed_posts"."structure_id" is not null and "feed_posts"."pro_id" is null and "feed_posts"."provider_id" is null and "feed_posts"."media_id" is null)
        or ("feed_posts"."persona" = 'pro' and "feed_posts"."pro_id" is not null and "feed_posts"."structure_id" is null and "feed_posts"."provider_id" is null and "feed_posts"."media_id" is null)
        or ("feed_posts"."persona" = 'provider' and "feed_posts"."provider_id" is not null and "feed_posts"."structure_id" is null and "feed_posts"."pro_id" is null and "feed_posts"."media_id" is null)
        or ("feed_posts"."persona" = 'media' and "feed_posts"."media_id" is not null and "feed_posts"."structure_id" is null and "feed_posts"."pro_id" is null and "feed_posts"."provider_id" is null));--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_caption_check" CHECK ("feed_posts"."caption" is null or char_length("feed_posts"."caption") <= case when "feed_posts"."persona" = 'fan' then 500 else 2000 end);