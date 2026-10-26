CREATE TYPE "public"."crew_post_kind" AS ENUM('photo', 'text', 'poll');--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'crew_post';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'crew_post';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'crew_comment';--> statement-breakpoint
CREATE TABLE "crew_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_poll_options_label_check" CHECK (char_length("crew_poll_options"."label") between 1 and 60),
	CONSTRAINT "crew_poll_options_position_check" CHECK ("crew_poll_options"."position" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "crew_poll_votes" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"option_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_poll_votes_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crew_polls" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"ends_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_polls_question_check" CHECK (char_length("crew_polls"."question") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "crew_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"text" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_post_comments_text_check" CHECK (char_length("crew_post_comments"."text") between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "crew_post_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_post_photos_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "crew_post_photos_position_check" CHECK ("crew_post_photos"."position" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "crew_post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_post_reactions_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crew_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"kind" "crew_post_kind" NOT NULL,
	"text" text,
	"vehicle_id" uuid,
	"event_id" uuid,
	"client_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_posts_text_check" CHECK ("crew_posts"."text" is null or char_length("crew_posts"."text") <= 500)
);
--> statement-breakpoint
ALTER TABLE "crew_poll_options" ADD CONSTRAINT "crew_poll_options_post_id_crew_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_poll_votes" ADD CONSTRAINT "crew_poll_votes_post_id_crew_polls_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_polls"("post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_poll_votes" ADD CONSTRAINT "crew_poll_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_poll_votes" ADD CONSTRAINT "crew_poll_votes_option_id_crew_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."crew_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_polls" ADD CONSTRAINT "crew_polls_post_id_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_polls" ADD CONSTRAINT "crew_polls_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_comments" ADD CONSTRAINT "crew_post_comments_post_id_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_comments" ADD CONSTRAINT "crew_post_comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_comments" ADD CONSTRAINT "crew_post_comments_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_photos" ADD CONSTRAINT "crew_post_photos_post_id_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_reactions" ADD CONSTRAINT "crew_post_reactions_post_id_crew_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."crew_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_post_reactions" ADD CONSTRAINT "crew_post_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_posts" ADD CONSTRAINT "crew_posts_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_posts" ADD CONSTRAINT "crew_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_posts" ADD CONSTRAINT "crew_posts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_posts" ADD CONSTRAINT "crew_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_posts" ADD CONSTRAINT "crew_posts_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_poll_options_position_key" ON "crew_poll_options" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "crew_poll_votes_option_idx" ON "crew_poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "crew_poll_votes_user_idx" ON "crew_poll_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crew_post_comments_post_idx" ON "crew_post_comments" USING btree ("post_id","created_at","id");--> statement-breakpoint
CREATE INDEX "crew_post_comments_author_idx" ON "crew_post_comments" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_post_photos_position_key" ON "crew_post_photos" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "crew_post_reactions_user_idx" ON "crew_post_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crew_posts_feed_idx" ON "crew_posts" USING btree ("crew_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "crew_posts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "crew_posts_author_idx" ON "crew_posts" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_posts_client_key" ON "crew_posts" USING btree ("author_id","client_id") WHERE "crew_posts"."client_id" is not null;