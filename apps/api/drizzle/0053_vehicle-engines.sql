CREATE TYPE "public"."vehicle_drivetrain" AS ENUM('rwd', 'fwd', 'awd');--> statement-breakpoint
CREATE TABLE "vehicle_engines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"power_hp" integer,
	"weight_kg" integer,
	"drivetrain" "vehicle_drivetrain",
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_engines_generation_name_key" UNIQUE("generation_id","name")
);
--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vehicle_engines_generation_id_idx" ON "vehicle_engines" USING btree ("generation_id");