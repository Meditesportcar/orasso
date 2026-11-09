ALTER TABLE "notifications" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "activity_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_user_group_idx" ON "notifications" USING btree ("user_id","group_key");--> statement-breakpoint
CREATE INDEX "notifications_actor_ids_idx" ON "notifications" USING gin (("data" -> '_actorIds')) WHERE "notifications"."group_key" is not null;