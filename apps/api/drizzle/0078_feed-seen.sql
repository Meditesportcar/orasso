CREATE TABLE "feed_seen" (
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"interacted_at" timestamp with time zone,
	CONSTRAINT "feed_seen_pkey" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
ALTER TABLE "feed_seen" ADD CONSTRAINT "feed_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_seen_user_seen_idx" ON "feed_seen" USING btree ("user_id","seen_at");--> statement-breakpoint
CREATE INDEX "feed_post_reactions_created_idx" ON "feed_post_reactions" USING btree ("created_at");