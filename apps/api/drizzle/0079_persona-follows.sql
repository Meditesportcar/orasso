CREATE TYPE "public"."page_follow_kind" AS ENUM('user', 'structure', 'pro', 'provider', 'media');--> statement-breakpoint
CREATE TYPE "public"."story_author_kind" AS ENUM('user', 'structure', 'pro', 'provider', 'media');--> statement-breakpoint
CREATE TABLE "page_follows" (
	"follower_kind" "page_follow_kind" NOT NULL,
	"follower_id" text NOT NULL,
	"target_kind" "page_follow_kind" NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_follows_pkey" PRIMARY KEY("follower_kind","follower_id","target_kind","target_id"),
	CONSTRAINT "page_follows_not_self_check" CHECK (not ("page_follows"."follower_kind" = "page_follows"."target_kind" and "page_follows"."follower_id" = "page_follows"."target_id")),
	CONSTRAINT "page_follows_user_target_check" CHECK ("page_follows"."follower_kind" <> 'user' or "page_follows"."target_kind" in ('provider', 'media'))
);
--> statement-breakpoint
ALTER TABLE "story_mutes" ALTER COLUMN "author_kind" SET DATA TYPE "public"."story_author_kind" USING "author_kind"::text::"public"."story_author_kind";--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "media_id" uuid;--> statement-breakpoint
CREATE INDEX "page_follows_target_idx" ON "page_follows" USING btree ("target_kind","target_id");--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_media_id_media_profiles_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_provider_idx" ON "stories" USING btree ("provider_id","expires_at") WHERE "stories"."provider_id" is not null;--> statement-breakpoint
CREATE INDEX "stories_media_idx" ON "stories" USING btree ("media_id","expires_at") WHERE "stories"."media_id" is not null;
--> statement-breakpoint
-- Lot R9a : reprise des stories de casquette prestataire et média. Elles passent de la clé `u:<compte>` aux clés `v:` et `m:` :
-- chacune reçoit le profil non supprimé de son auteur. Sans profil, elle reste sans page (elle n'est plus servie).
-- Rejouable : ne touche que les stories qui n'ont pas encore leur page.
UPDATE "stories" s SET "provider_id" = (
  SELECT p."id" FROM "provider_profiles" p WHERE p."user_id" = s."author_id" AND p."deleted_at" IS NULL LIMIT 1
) WHERE s."persona" = 'provider' AND s."provider_id" IS NULL;--> statement-breakpoint
UPDATE "stories" s SET "media_id" = (
  SELECT m."id" FROM "media_profiles" m WHERE m."user_id" = s."author_id" AND m."deleted_at" IS NULL LIMIT 1
) WHERE s."persona" = 'media' AND s."media_id" IS NULL;
