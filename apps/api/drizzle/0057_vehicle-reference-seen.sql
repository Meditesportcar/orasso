CREATE TABLE "vehicle_reference_seen" (
	"key" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
