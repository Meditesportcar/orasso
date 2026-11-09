CREATE TYPE "public"."vote_candidate_mode" AS ENUM('all', 'origins', 'zone', 'hand');--> statement-breakpoint
CREATE TYPE "public"."vote_candidate_source" AS ENUM('rule', 'hand', 'scan');--> statement-breakpoint
CREATE TYPE "public"."vote_kind" AS ENUM('all_categories', 'theme');--> statement-breakpoint
CREATE TYPE "public"."vote_open_mode" AS ENUM('first_entry', 'at', 'manual');--> statement-breakpoint
ALTER TYPE "public"."point_kind" ADD VALUE 'vote_podium';--> statement-breakpoint
CREATE TABLE "event_vote_candidates" (
	"vote_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"source" "vote_candidate_source" DEFAULT 'hand' NOT NULL,
	"added_by" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_vote_candidates_vote_application_key" UNIQUE("vote_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "event_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "vote_kind" NOT NULL,
	"candidate_mode" "vote_candidate_mode" DEFAULT 'all' NOT NULL,
	"candidate_filter" jsonb,
	"open_mode" "vote_open_mode" DEFAULT 'first_entry' NOT NULL,
	"opens_at" timestamp with time zone,
	"duration_minutes" integer,
	"opened_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"rare_stamp" boolean DEFAULT false NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_votes_title_check" CHECK (char_length("event_votes"."title") between 1 and 60),
	CONSTRAINT "event_votes_duration_check" CHECK ("event_votes"."duration_minutes" is null or "event_votes"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_trophies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"vote_id" uuid,
	"event_id" uuid,
	"event_title" text NOT NULL,
	"vote_title" text NOT NULL,
	"rank" smallint NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vehicle_trophies_vote_vehicle_key" UNIQUE("vote_id","vehicle_id"),
	CONSTRAINT "vehicle_trophies_rank_check" CHECK ("vehicle_trophies"."rank" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "audience_prize_results" DROP CONSTRAINT "audience_prize_results_event_rank_key";--> statement-breakpoint
ALTER TABLE "audience_prize_results" DROP CONSTRAINT "audience_prize_results_event_application_key";--> statement-breakpoint
ALTER TABLE "audience_votes" DROP CONSTRAINT "audience_votes_event_voter_key";--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD COLUMN "vote_id" uuid;--> statement-breakpoint
ALTER TABLE "audience_votes" ADD COLUMN "vote_id" uuid;--> statement-breakpoint
ALTER TABLE "event_vote_candidates" ADD CONSTRAINT "event_vote_candidates_vote_id_event_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."event_votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_vote_candidates" ADD CONSTRAINT "event_vote_candidates_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_vote_candidates" ADD CONSTRAINT "event_vote_candidates_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_votes" ADD CONSTRAINT "event_votes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_votes" ADD CONSTRAINT "event_votes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_trophies" ADD CONSTRAINT "vehicle_trophies_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_trophies" ADD CONSTRAINT "vehicle_trophies_vote_id_event_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."event_votes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_trophies" ADD CONSTRAINT "vehicle_trophies_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_votes_event_position_idx" ON "event_votes" USING btree ("event_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "event_votes_all_categories_key" ON "event_votes" USING btree ("event_id") WHERE "event_votes"."kind" = 'all_categories';--> statement-breakpoint
CREATE INDEX "vehicle_trophies_vehicle_idx" ON "vehicle_trophies" USING btree ("vehicle_id","awarded_at");--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD CONSTRAINT "audience_prize_results_vote_id_event_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."event_votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_votes" ADD CONSTRAINT "audience_votes_vote_id_event_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."event_votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_prize_results_event_idx" ON "audience_prize_results" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "audience_votes_vote_application_idx" ON "audience_votes" USING btree ("vote_id","application_id");--> statement-breakpoint
-- Reprise des données du prix du public (lot R7l1, D38) : idempotente, rejouable sans doublon.
-- 1. Un vote « Toutes catégories » par événement non annulé (et par événement annulé qui aurait déjà des voix ou des résultats,
--    pour que tout se rattache). Ouvert au premier pointage, fermé à la fin de l'événement (comme le prix du public d'avant).
INSERT INTO "event_votes" ("event_id", "title", "kind", "candidate_mode", "open_mode", "rare_stamp", "position", "opened_at", "closes_at", "closed_at")
SELECT e."id", 'Toutes catégories', 'all_categories', 'all', 'first_entry', true, 0,
  (SELECT min(c."checked_in_at") FROM "checkins" c JOIN "applications" a ON a."id" = c."application_id"
    WHERE c."event_id" = e."id" AND a."kind" = 'vehicle'),
  e."ends_at",
  CASE WHEN e."ends_at" <= now() THEN e."ends_at" WHEN e."status" = 'cancelled' THEN now() END
FROM "events" e
WHERE (e."status" <> 'cancelled'
    OR EXISTS (SELECT 1 FROM "audience_votes" av WHERE av."event_id" = e."id")
    OR EXISTS (SELECT 1 FROM "audience_prize_results" r WHERE r."event_id" = e."id"))
  AND NOT EXISTS (SELECT 1 FROM "event_votes" v WHERE v."event_id" = e."id" AND v."kind" = 'all_categories');--> statement-breakpoint
-- 2. Les voix et les résultats d'avant appartiennent à ce vote.
UPDATE "audience_votes" av SET "vote_id" = v."id"
FROM "event_votes" v WHERE v."event_id" = av."event_id" AND v."kind" = 'all_categories' AND av."vote_id" IS NULL;--> statement-breakpoint
UPDATE "audience_prize_results" r SET "vote_id" = v."id"
FROM "event_votes" v WHERE v."event_id" = r."event_id" AND v."kind" = 'all_categories' AND r."vote_id" IS NULL;--> statement-breakpoint
-- 3. Le gagnant d'un prix déjà décerné a son trophée (le compteur de la voiture le comptait déjà).
INSERT INTO "vehicle_trophies" ("vehicle_id", "vote_id", "event_id", "event_title", "vote_title", "rank", "awarded_at")
SELECT a."vehicle_id", v."id", e."id", e."title", v."title", 1, r."created_at"
FROM "audience_prize_results" r
JOIN "applications" a ON a."id" = r."application_id"
JOIN "event_votes" v ON v."id" = r."vote_id"
JOIN "events" e ON e."id" = r."event_id"
WHERE r."winner" AND a."vehicle_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- 4. Tout est rattaché : les colonnes deviennent obligatoires.
ALTER TABLE "audience_votes" ALTER COLUMN "vote_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_prize_results" ALTER COLUMN "vote_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD CONSTRAINT "audience_prize_results_vote_rank_key" UNIQUE("vote_id","rank");--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD CONSTRAINT "audience_prize_results_vote_application_key" UNIQUE("vote_id","application_id");--> statement-breakpoint
ALTER TABLE "audience_votes" ADD CONSTRAINT "audience_votes_vote_voter_key" UNIQUE("vote_id","voter_user_id");