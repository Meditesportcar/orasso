ALTER TYPE "public"."conversation_kind" ADD VALUE 'media';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_media_id_media_profiles_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_media_idx" ON "conversations" USING btree ("media_id") WHERE "conversations"."media_id" is not null;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_media_check" CHECK (("conversations"."kind"::text = 'media') = ("conversations"."media_id" is not null));