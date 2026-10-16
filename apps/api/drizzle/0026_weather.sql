CREATE TABLE "event_weather" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"forecast" jsonb NOT NULL,
	"bad_weather" boolean DEFAULT false NOT NULL,
	"suggested_uncertain_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "weather_departments" (
	"department" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"forecast" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_weather" ADD CONSTRAINT "event_weather_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;