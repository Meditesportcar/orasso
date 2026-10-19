CREATE TYPE "public"."stamp_kind" AS ENUM('participation', 'visit', 'staff', 'first_outing', 'tenth_event', 'full_moon', 'audience_prize');--> statement-breakpoint
CREATE TYPE "public"."stamp_shape" AS ENUM('round', 'rect', 'octagon', 'cup');--> statement-breakpoint
ALTER TYPE "public"."point_kind" ADD VALUE 'audience_prize';--> statement-breakpoint
CREATE TABLE "audience_prize_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"votes" integer NOT NULL,
	"winner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_prize_results_event_rank_key" UNIQUE("event_id","rank"),
	CONSTRAINT "audience_prize_results_event_application_key" UNIQUE("event_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "audience_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"voter_user_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_votes_event_voter_key" UNIQUE("event_id","voter_user_id")
);
--> statement-breakpoint
CREATE TABLE "passport_stamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"kind" "stamp_kind" NOT NULL,
	"shape" "stamp_shape" NOT NULL,
	"ink" text NOT NULL,
	"seed" smallint NOT NULL,
	"rare" boolean DEFAULT false NOT NULL,
	"application_id" uuid,
	"ticket_id" uuid,
	"stamped_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passport_stamps_user_event_kind_key" UNIQUE("user_id","event_id","kind"),
	CONSTRAINT "passport_stamps_seed_check" CHECK ("passport_stamps"."seed" between 0 and 9999)
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "audience_prizes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD CONSTRAINT "audience_prize_results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_prize_results" ADD CONSTRAINT "audience_prize_results_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_votes" ADD CONSTRAINT "audience_votes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_votes" ADD CONSTRAINT "audience_votes_voter_user_id_user_id_fk" FOREIGN KEY ("voter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_votes" ADD CONSTRAINT "audience_votes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_votes_event_application_idx" ON "audience_votes" USING btree ("event_id","application_id");--> statement-breakpoint
CREATE INDEX "passport_stamps_user_season_idx" ON "passport_stamps" USING btree ("user_id","season_id","stamped_at");--> statement-breakpoint
CREATE INDEX "passport_stamps_event_idx" ON "passport_stamps" USING btree ("event_id");