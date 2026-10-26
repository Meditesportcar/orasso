CREATE TYPE "public"."crew_outing_rsvp" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "crew_outing_rsvps" (
	"outing_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"answer" "crew_outing_rsvp" NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_outing_rsvps_pkey" PRIMARY KEY("outing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crew_outings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crew_id" uuid NOT NULL,
	"author_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"program" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_outings_title_check" CHECK (char_length("crew_outings"."title") between 3 and 40),
	CONSTRAINT "crew_outings_place_check" CHECK (char_length("crew_outings"."place") between 3 and 120),
	CONSTRAINT "crew_outings_program_check" CHECK ("crew_outings"."program" is null or char_length("crew_outings"."program") <= 500),
	CONSTRAINT "crew_outings_point_check" CHECK (("crew_outings"."lat" is null) = ("crew_outings"."lng" is null))
);
--> statement-breakpoint
ALTER TABLE "crews" ADD COLUMN "banner_key" text;--> statement-breakpoint
ALTER TABLE "crews" ADD COLUMN "banner_plate_cleared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crews" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "crews" ADD COLUMN "members_can_propose_outings" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "crew_outing_rsvps" ADD CONSTRAINT "crew_outing_rsvps_outing_id_crew_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."crew_outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_outing_rsvps" ADD CONSTRAINT "crew_outing_rsvps_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_outings" ADD CONSTRAINT "crew_outings_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_outings" ADD CONSTRAINT "crew_outings_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crew_outing_rsvps_user_idx" ON "crew_outing_rsvps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crew_outings_crew_starts_idx" ON "crew_outings" USING btree ("crew_id","starts_at") WHERE "crew_outings"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "crew_outings_author_idx" ON "crew_outings" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_instagram_check" CHECK ("crews"."instagram" is null or "crews"."instagram" ~ '^[A-Za-z0-9_.]{1,30}$');