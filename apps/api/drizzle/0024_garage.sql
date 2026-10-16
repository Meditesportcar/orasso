CREATE TYPE "public"."certification_status" AS ENUM('pending', 'accepted', 'refused');--> statement-breakpoint
CREATE TYPE "public"."category_make_mode" AS ENUM('any', 'whitelist');--> statement-breakpoint
CREATE TYPE "public"."certification_lost_reason" AS ENUM('modified', 'inactive');--> statement-breakpoint
CREATE TABLE "category_makes" (
	"category_id" uuid NOT NULL,
	"make_id" uuid NOT NULL,
	CONSTRAINT "category_makes_pkey" PRIMARY KEY("category_id","make_id")
);
--> statement-breakpoint
CREATE TABLE "certification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "certification_status" DEFAULT 'pending' NOT NULL,
	"message" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "allowed_vehicle_types" text[];--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "allowed_countries" text[];--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "make_mode" "category_make_mode" DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "plate_transfer_requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plate_transfer_requests" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "certified_lost_reason" "certification_lost_reason";--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "pending_transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "category_makes" ADD CONSTRAINT "category_makes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_makes" ADD CONSTRAINT "category_makes_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_requests" ADD CONSTRAINT "certification_requests_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_requests" ADD CONSTRAINT "certification_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_requests" ADD CONSTRAINT "certification_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certification_requests_vehicle_idx" ON "certification_requests" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE INDEX "certification_requests_status_idx" ON "certification_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "certification_requests_pending_key" ON "certification_requests" USING btree ("vehicle_id") WHERE "certification_requests"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_pending_transfer_id_plate_transfer_requests_id_fk" FOREIGN KEY ("pending_transfer_id") REFERENCES "public"."plate_transfer_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plate_transfer_requests_status_idx" ON "plate_transfer_requests" USING btree ("status","created_at");--> statement-breakpoint
-- Demandes `pending` héritées de l'ancien comportement (409 plate_taken sans véhicule créé) : aucune n'a de véhicule en attente, on les clôt.
UPDATE "plate_transfer_requests" SET "status" = 'refused', "decided_at" = now(), "note" = 'Clôturée à la mise à jour du garage (lot 31)' WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "plate_transfer_requests_open_key" ON "plate_transfer_requests" USING btree ("plate_normalized","to_user_id") WHERE "plate_transfer_requests"."status" in ('pending', 'arbitrated');