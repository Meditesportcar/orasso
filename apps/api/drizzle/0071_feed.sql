CREATE TYPE "public"."feed_aspect" AS ENUM('portrait_4_5', 'square', 'landscape');--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'feed_post' BEFORE 'story';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'feed_post' BEFORE 'story';--> statement-breakpoint
CREATE TABLE "feed_post_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" smallint NOT NULL,
	"plate_blurred" boolean DEFAULT false NOT NULL,
	"no_plate_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_photos_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "feed_post_photos_position_check" CHECK ("feed_post_photos"."position" between 0 and 5),
	CONSTRAINT "feed_post_photos_plate_check" CHECK ("feed_post_photos"."plate_blurred" or "feed_post_photos"."no_plate_confirmed")
);
--> statement-breakpoint
CREATE TABLE "feed_post_reactions" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_post_reactions_pkey" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feed_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"caption" text,
	"vehicle_id" uuid,
	"event_id" uuid,
	"commercial_partner_id" uuid,
	"aspect" "feed_aspect" DEFAULT 'portrait_4_5' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"reactions_count" integer DEFAULT 0 NOT NULL,
	"client_id" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_posts_caption_check" CHECK ("feed_posts"."caption" is null or char_length("feed_posts"."caption") <= 500),
	CONSTRAINT "feed_posts_reactions_check" CHECK ("feed_posts"."reactions_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "feed_less_kinds" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "official" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_post_photos" ADD CONSTRAINT "feed_post_photos_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_post_reactions" ADD CONSTRAINT "feed_post_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_commercial_partner_id_pro_profiles_id_fk" FOREIGN KEY ("commercial_partner_id") REFERENCES "public"."pro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_post_photos_position_key" ON "feed_post_photos" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "feed_post_reactions_user_idx" ON "feed_post_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feed_posts_created_idx" ON "feed_posts" USING btree ("created_at" DESC NULLS LAST) WHERE "feed_posts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "feed_posts_author_idx" ON "feed_posts" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_department_idx" ON "feed_posts" USING btree ("department","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_posts_vehicle_idx" ON "feed_posts" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "feed_posts_event_idx" ON "feed_posts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feed_posts_deleted_by_idx" ON "feed_posts" USING btree ("deleted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_posts_client_key" ON "feed_posts" USING btree ("author_id","client_id") WHERE "feed_posts"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "vehicles_created_at_idx" ON "vehicles" USING btree ("created_at" DESC NULLS LAST);