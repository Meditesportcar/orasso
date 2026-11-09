CREATE TYPE "public"."story_audience" AS ENUM('followers', 'crew', 'public');--> statement-breakpoint
CREATE TYPE "public"."story_link" AS ENUM('event', 'vehicle', 'feed_post', 'memory', 'vote_result');--> statement-breakpoint
CREATE TYPE "public"."story_media" AS ENUM('photo', 'video');--> statement-breakpoint
CREATE TYPE "public"."story_persona" AS ENUM('fan', 'organizer', 'pro', 'provider', 'media');--> statement-breakpoint
CREATE TYPE "public"."story_plate" AS ENUM('blurred', 'none_confirmed', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."story_tag_target" AS ENUM('user', 'structure', 'pro');--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'story';--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'story_video';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'story';--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"persona" "story_persona" DEFAULT 'fan' NOT NULL,
	"structure_id" uuid,
	"pro_id" uuid,
	"audience" "story_audience" NOT NULL,
	"crew_id" uuid,
	"media_kind" "story_media" DEFAULT 'photo' NOT NULL,
	"storage_key" text NOT NULL,
	"poster_key" text,
	"width" smallint DEFAULT 1080 NOT NULL,
	"height" smallint DEFAULT 1920 NOT NULL,
	"duration_ms" integer,
	"status" "story_status" DEFAULT 'ready' NOT NULL,
	"plate_state" "story_plate",
	"caption" text,
	"place_label" text,
	"vehicle_id" uuid,
	"event_id" uuid,
	"linked_type" "story_link",
	"linked_id" text,
	"commercial_partner_id" uuid,
	"shared_from_story_id" uuid,
	"shared_by_user_id" text,
	"views_count" integer DEFAULT 0 NOT NULL,
	"reactions_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"files_removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stories_crew_check" CHECK (("stories"."audience" = 'crew') = ("stories"."crew_id" is not null)),
	CONSTRAINT "stories_plate_check" CHECK ("stories"."status" <> 'ready' or "stories"."plate_state" is not null),
	CONSTRAINT "stories_plate_photo_check" CHECK ("stories"."media_kind" = 'video' or "stories"."plate_state" is distinct from 'not_required'),
	CONSTRAINT "stories_caption_check" CHECK ("stories"."caption" is null or char_length("stories"."caption") <= 200),
	CONSTRAINT "stories_place_check" CHECK ("stories"."place_label" is null or char_length("stories"."place_label") <= 80)
);
--> statement-breakpoint
CREATE TABLE "story_mutes" (
	"user_id" text NOT NULL,
	"author_kind" "story_tag_target" NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_mutes_pkey" PRIMARY KEY("user_id","author_kind","author_id")
);
--> statement-breakpoint
CREATE TABLE "story_reactions" (
	"story_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_reactions_pkey" PRIMARY KEY("story_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "story_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"target_kind" "story_tag_target" NOT NULL,
	"target_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_tags_target_key" UNIQUE("story_id","target_kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "story_views" (
	"story_id" uuid NOT NULL,
	"viewer_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_pkey" PRIMARY KEY("story_id","viewer_id")
);
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD COLUMN "story_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "story_id" uuid;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_commercial_partner_id_pro_profiles_id_fk" FOREIGN KEY ("commercial_partner_id") REFERENCES "public"."pro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_shared_from_story_id_stories_id_fk" FOREIGN KEY ("shared_from_story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_shared_by_user_id_user_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_mutes" ADD CONSTRAINT "story_mutes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_user_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_author_expires_idx" ON "stories" USING btree ("author_id","expires_at");--> statement-breakpoint
CREATE INDEX "stories_expires_idx" ON "stories" USING btree ("expires_at") WHERE "stories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stories_public_event_idx" ON "stories" USING btree ("event_id") WHERE "stories"."audience" = 'public';--> statement-breakpoint
CREATE INDEX "stories_structure_idx" ON "stories" USING btree ("structure_id","expires_at") WHERE "stories"."structure_id" is not null;--> statement-breakpoint
CREATE INDEX "stories_pro_idx" ON "stories" USING btree ("pro_id","expires_at") WHERE "stories"."pro_id" is not null;--> statement-breakpoint
CREATE INDEX "stories_crew_idx" ON "stories" USING btree ("crew_id","expires_at") WHERE "stories"."crew_id" is not null;--> statement-breakpoint
CREATE INDEX "stories_shared_from_idx" ON "stories" USING btree ("shared_from_story_id") WHERE "stories"."shared_from_story_id" is not null;--> statement-breakpoint
CREATE INDEX "stories_sweep_idx" ON "stories" USING btree ("deleted_at") WHERE "stories"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "story_tags_target_idx" ON "story_tags" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "story_views_viewer_idx" ON "story_views" USING btree ("viewer_id");--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;