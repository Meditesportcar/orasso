CREATE TYPE "public"."category_family" AS ENUM('epoque', 'genre', 'preparation', 'pratique', 'pays');--> statement-breakpoint
CREATE TYPE "public"."category_proposal_status" AS ENUM('pending', 'accepted', 'merged', 'declined');--> statement-breakpoint
CREATE TABLE "category_catalog_seen" (
	"slug" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" text NOT NULL,
	"vehicle_id" uuid,
	"label" text NOT NULL,
	"key" text NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"status" "category_proposal_status" DEFAULT 'pending' NOT NULL,
	"category_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "family" "category_family" DEFAULT 'genre' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "icon" text DEFAULT 'star' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "label_m" text;--> statement-breakpoint
ALTER TABLE "category_proposals" ADD CONSTRAINT "category_proposals_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_proposals" ADD CONSTRAINT "category_proposals_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_proposals" ADD CONSTRAINT "category_proposals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_proposals_status_key_idx" ON "category_proposals" USING btree ("status","key");--> statement-breakpoint
CREATE INDEX "category_proposals_author_idx" ON "category_proposals" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "category_proposals_pending_key" ON "category_proposals" USING btree ("author_id","key","vehicle_type") WHERE "category_proposals"."status" = 'pending';