CREATE TYPE "public"."follow_status" AS ENUM('accepted', 'pending');--> statement-breakpoint
ALTER TABLE "user_follows" ADD COLUMN "status" "follow_status" DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_follows" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "user_follows_followed_status_idx" ON "user_follows" USING btree ("followed_id","status");--> statement-breakpoint
CREATE INDEX "user_follows_follower_status_idx" ON "user_follows" USING btree ("follower_id","status");--> statement-breakpoint
-- Lot R6b (D37, Damien le 27/10 : « on fait comme sur Instagram, on abandonne ami »). Données, une seule fois.
-- 1. Les abonnements existants (lot R4c, vers des comptes publics) sont acceptés depuis leur création. Un compte devenu
--    privé depuis ne donne pas pour autant tout son profil à ceux qui le suivaient : sans amitié acceptée entre eux,
--    l'abonnement redevient une demande que la personne accepte ou refuse.
UPDATE "user_follows" uf SET "accepted_at" = uf."created_at" WHERE uf."accepted_at" IS NULL;--> statement-breakpoint
UPDATE "user_follows" uf SET "status" = 'pending', "accepted_at" = NULL
FROM "profiles" p
WHERE p."user_id" = uf."followed_id" AND p."visibility" = 'private'
  AND NOT EXISTS (
    SELECT 1 FROM "friendships" f
    WHERE f."status" = 'accepted'
      AND least(f."requester_id", f."addressee_id") = least(uf."follower_id", uf."followed_id")
      AND greatest(f."requester_id", f."addressee_id") = greatest(uf."follower_id", uf."followed_id")
  );--> statement-breakpoint
-- 2. Chaque amitié acceptée devient deux abonnements acceptés (un abonnement qui existe déjà est accepté, sa date
--    d'origine gardée).
INSERT INTO "user_follows" ("follower_id", "followed_id", "status", "created_at", "accepted_at")
SELECT f."requester_id", f."addressee_id", 'accepted'::"follow_status", f."created_at", coalesce(f."responded_at", f."created_at")
FROM "friendships" f WHERE f."status" = 'accepted'
UNION ALL
SELECT f."addressee_id", f."requester_id", 'accepted'::"follow_status", f."created_at", coalesce(f."responded_at", f."created_at")
FROM "friendships" f WHERE f."status" = 'accepted'
ON CONFLICT ("follower_id", "followed_id") DO UPDATE
  SET "status" = 'accepted', "accepted_at" = coalesce("user_follows"."accepted_at", excluded."accepted_at");--> statement-breakpoint
-- 3. Chaque demande d'ami en attente devient une demande d'abonnement de son auteur vers sa cible ; vers un compte
--    public, elle est acceptée (un compte public n'a pas de demande en attente, comme un compte qui passe public).
--    Refusées : rien. Un abonnement qui existe déjà reste tel quel.
INSERT INTO "user_follows" ("follower_id", "followed_id", "status", "created_at", "accepted_at")
SELECT f."requester_id", f."addressee_id",
  CASE WHEN p."visibility" = 'public' THEN 'accepted'::"follow_status" ELSE 'pending'::"follow_status" END,
  f."created_at",
  CASE WHEN p."visibility" = 'public' THEN f."created_at" ELSE NULL END
FROM "friendships" f
JOIN "profiles" p ON p."user_id" = f."addressee_id"
WHERE f."status" = 'pending'
ON CONFLICT ("follower_id", "followed_id") DO NOTHING;
