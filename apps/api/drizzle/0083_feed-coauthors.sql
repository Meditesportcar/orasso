CREATE TYPE "public"."coauthor_kind" AS ENUM('user', 'structure', 'pro', 'provider', 'media');--> statement-breakpoint
CREATE TYPE "public"."coauthor_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TABLE "feed_coauthor_invite_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invited_by" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_post_coauthors" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"coauthor_kind" "coauthor_kind" NOT NULL,
	"coauthor_id" text NOT NULL,
	"status" "coauthor_status" DEFAULT 'pending' NOT NULL,
	"invited_by" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_by" text,
	"responded_at" timestamp with time zone,
	CONSTRAINT "feed_post_coauthors_id_check" CHECK (char_length("feed_post_coauthors"."coauthor_id") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "feed_coauthor_invite_log" ADD CONSTRAINT "feed_coauthor_invite_log_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_coauthors" ADD CONSTRAINT "feed_post_coauthors_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_coauthors" ADD CONSTRAINT "feed_post_coauthors_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_coauthors" ADD CONSTRAINT "feed_post_coauthors_responded_by_user_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_coauthor_invite_log_idx" ON "feed_coauthor_invite_log" USING btree ("invited_by","invited_at");--> statement-breakpoint
CREATE INDEX "feed_post_coauthors_target_idx" ON "feed_post_coauthors" USING btree ("coauthor_kind","coauthor_id","status");--> statement-breakpoint
CREATE INDEX "feed_post_coauthors_invited_by_idx" ON "feed_post_coauthors" USING btree ("invited_by","invited_at");--> statement-breakpoint
CREATE INDEX "feed_post_coauthors_responded_by_idx" ON "feed_post_coauthors" USING btree ("responded_by");
--> statement-breakpoint
-- Défaire les notifications d une invitation par leur publication (compte supprimé, publication supprimée) : index partiel d expression.
CREATE INDEX "notifications_coauthor_post_idx" ON "notifications" USING btree (("data" ->> 'postId')) WHERE "type" like 'coauthor\_%';
