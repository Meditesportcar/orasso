ALTER TYPE "public"."report_target" ADD VALUE 'feed_comment';--> statement-breakpoint
CREATE TABLE "feed_comment_mentions" (
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_comment_mentions_pkey" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_post_comment_reactions" (
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_comment_reactions_pkey" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"persona" "story_persona" DEFAULT 'fan' NOT NULL,
	"structure_id" uuid,
	"pro_id" uuid,
	"provider_id" uuid,
	"media_id" uuid,
	"parent_id" uuid,
	"reply_to_id" uuid,
	"text" text NOT NULL,
	"reactions_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"client_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_comments_text_check" CHECK (char_length("feed_post_comments"."text") between 1 and 300),
	CONSTRAINT "feed_post_comments_counts_check" CHECK ("feed_post_comments"."reactions_count" >= 0 and "feed_post_comments"."replies_count" >= 0),
	CONSTRAINT "feed_post_comments_persona_check" CHECK (("feed_post_comments"."persona" = 'fan' and "feed_post_comments"."structure_id" is null and "feed_post_comments"."pro_id" is null and "feed_post_comments"."provider_id" is null and "feed_post_comments"."media_id" is null)
        or ("feed_post_comments"."persona" = 'organizer' and "feed_post_comments"."structure_id" is not null and "feed_post_comments"."pro_id" is null and "feed_post_comments"."provider_id" is null and "feed_post_comments"."media_id" is null)
        or ("feed_post_comments"."persona" = 'pro' and "feed_post_comments"."pro_id" is not null and "feed_post_comments"."structure_id" is null and "feed_post_comments"."provider_id" is null and "feed_post_comments"."media_id" is null)
        or ("feed_post_comments"."persona" = 'provider' and "feed_post_comments"."provider_id" is not null and "feed_post_comments"."structure_id" is null and "feed_post_comments"."pro_id" is null and "feed_post_comments"."media_id" is null)
        or ("feed_post_comments"."persona" = 'media' and "feed_post_comments"."media_id" is not null and "feed_post_comments"."structure_id" is null and "feed_post_comments"."pro_id" is null and "feed_post_comments"."provider_id" is null))
);
--> statement-breakpoint
ALTER TABLE "feed_comment_mentions" ADD CONSTRAINT "feed_comment_mentions_comment_id_feed_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."feed_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_comment_mentions" ADD CONSTRAINT "feed_comment_mentions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comment_reactions" ADD CONSTRAINT "feed_post_comment_reactions_comment_id_feed_post_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."feed_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comment_reactions" ADD CONSTRAINT "feed_post_comment_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_media_id_media_profiles_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_parent_id_feed_post_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."feed_post_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_reply_to_id_feed_post_comments_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."feed_post_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_comment_mentions_user_idx" ON "feed_comment_mentions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_post_comment_reactions_user_idx" ON "feed_post_comment_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_post_comments_top_idx" ON "feed_post_comments" USING btree ("post_id","created_at","id") WHERE "feed_post_comments"."parent_id" is null and "feed_post_comments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "feed_post_comments_replies_idx" ON "feed_post_comments" USING btree ("parent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "feed_post_comments_reply_to_idx" ON "feed_post_comments" USING btree ("reply_to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_post_comments_client_key" ON "feed_post_comments" USING btree ("author_id","client_id");--> statement-breakpoint
CREATE INDEX "feed_post_comments_deleted_by_idx" ON "feed_post_comments" USING btree ("deleted_by");