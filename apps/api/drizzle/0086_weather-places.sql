CREATE TABLE "profile_weather_places" (
	"user_id" text NOT NULL,
	"slot" smallint NOT NULL,
	"label" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_weather_places_pkey" PRIMARY KEY("user_id","slot"),
	CONSTRAINT "profile_weather_places_slot_check" CHECK ("profile_weather_places"."slot" in (0, 1)),
	CONSTRAINT "profile_weather_places_label_check" CHECK (char_length("profile_weather_places"."label") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "weather_places_cache" (
	"cell" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"forecast" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_weather_places" ADD CONSTRAINT "profile_weather_places_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;