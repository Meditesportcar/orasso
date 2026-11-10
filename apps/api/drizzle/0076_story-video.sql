ALTER TYPE "public"."upload_purpose" ADD VALUE 'story_poster';--> statement-breakpoint
ALTER TABLE "stories" DROP CONSTRAINT "stories_plate_photo_check";--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_plate_media_check" CHECK (("stories"."media_kind" = 'video') = ("stories"."plate_state" is not distinct from 'not_required'));