CREATE TYPE "public"."spot_audience" AS ENUM('followers', 'crew');--> statement-breakpoint
CREATE TYPE "public"."spot_rsvp" AS ENUM('yes', 'maybe');--> statement-breakpoint
CREATE TABLE "spot_meetup_replies" (
	"meetup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"answer" "spot_rsvp" NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spot_meetup_replies_pkey" PRIMARY KEY("meetup_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "spot_meetups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"audience" "spot_audience" NOT NULL,
	"crew_id" uuid,
	"place_label" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text,
	"cancelled_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"came_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spot_meetups_times_check" CHECK ("spot_meetups"."ends_at" > "spot_meetups"."starts_at" and "spot_meetups"."ends_at" <= "spot_meetups"."starts_at" + interval '12 hours'),
	CONSTRAINT "spot_meetups_crew_check" CHECK (("spot_meetups"."audience" = 'crew') = ("spot_meetups"."crew_id" is not null)),
	CONSTRAINT "spot_meetups_place_check" CHECK (char_length("spot_meetups"."place_label") <= 80),
	CONSTRAINT "spot_meetups_note_check" CHECK ("spot_meetups"."note" is null or char_length("spot_meetups"."note") <= 140)
);
--> statement-breakpoint
ALTER TABLE "spot_meetup_replies" ADD CONSTRAINT "spot_meetup_replies_meetup_id_spot_meetups_id_fk" FOREIGN KEY ("meetup_id") REFERENCES "public"."spot_meetups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_meetup_replies" ADD CONSTRAINT "spot_meetup_replies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_meetups" ADD CONSTRAINT "spot_meetups_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spot_meetups" ADD CONSTRAINT "spot_meetups_crew_id_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spot_meetup_replies_user_idx" ON "spot_meetup_replies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spot_meetups_one_active_key" ON "spot_meetups" USING btree ("author_id") WHERE "spot_meetups"."cancelled_at" is null and "spot_meetups"."purged_at" is null;--> statement-breakpoint
CREATE INDEX "spot_meetups_ends_idx" ON "spot_meetups" USING btree ("ends_at") WHERE "spot_meetups"."purged_at" is null;--> statement-breakpoint
CREATE INDEX "spot_meetups_crew_idx" ON "spot_meetups" USING btree ("crew_id","ends_at" DESC NULLS LAST) WHERE "spot_meetups"."crew_id" is not null;--> statement-breakpoint
CREATE INDEX "spot_meetups_author_idx" ON "spot_meetups" USING btree ("author_id","created_at" DESC NULLS LAST);