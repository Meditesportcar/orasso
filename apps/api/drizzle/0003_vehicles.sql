CREATE TYPE "public"."plate_transfer_status" AS ENUM('pending', 'accepted', 'refused', 'arbitrated');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('active', 'sold', 'keepsake', 'wrecked');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'moto', 'truck');--> statement-breakpoint
CREATE TABLE "plate_transfer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_normalized" text NOT NULL,
	"from_vehicle_id" uuid NOT NULL,
	"to_user_id" text NOT NULL,
	"status" "plate_transfer_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_categories" (
	"vehicle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY("vehicle_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"year_from" smallint,
	"year_to" smallint,
	"is_other" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_generations_model_name_key" UNIQUE("model_id","name")
);
--> statement-breakpoint
CREATE TABLE "vehicle_makes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"is_other" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_makes_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"is_other" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_models_make_slug_key" UNIQUE("make_id","slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_photos_vehicle_position_key" UNIQUE("vehicle_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "vehicle_photos_position_check" CHECK ("vehicle_photos"."position" between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"make_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"generation_id" uuid,
	"year" smallint,
	"color" text,
	"engine" text,
	"power_hp" smallint,
	"weight_kg" integer,
	"plate" text,
	"plate_normalized" text,
	"unregistered" boolean DEFAULT false NOT NULL,
	"status" "vehicle_status" DEFAULT 'active' NOT NULL,
	"description" text,
	"preparation" text,
	"certified_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_power_hp_check" CHECK ("vehicles"."power_hp" is null or "vehicles"."power_hp" between 1 and 2500),
	CONSTRAINT "vehicles_weight_kg_check" CHECK ("vehicles"."weight_kg" is null or "vehicles"."weight_kg" between 50 and 40000)
);
--> statement-breakpoint
ALTER TABLE "plate_transfer_requests" ADD CONSTRAINT "plate_transfer_requests_from_vehicle_id_vehicles_id_fk" FOREIGN KEY ("from_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_transfer_requests" ADD CONSTRAINT "plate_transfer_requests_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_transfer_requests" ADD CONSTRAINT "plate_transfer_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_categories" ADD CONSTRAINT "vehicle_categories_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_categories" ADD CONSTRAINT "vehicle_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plate_transfer_requests_plate_idx" ON "plate_transfer_requests" USING btree ("plate_normalized");--> statement-breakpoint
CREATE INDEX "vehicles_owner_id_idx" ON "vehicles" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vehicles_model_id_idx" ON "vehicles" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_active_plate_key" ON "vehicles" USING btree ("plate_normalized") WHERE "vehicles"."status" = 'active' and "vehicles"."plate_normalized" is not null;