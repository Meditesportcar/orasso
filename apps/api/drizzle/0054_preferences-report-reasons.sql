ALTER TYPE "public"."report_reason" ADD VALUE 'misleading_info';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'cancelled_unannounced';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'unauthorized_place';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'abusive_pricing';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'plate_or_face';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'copyright';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'fake_pro';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'discount_not_applied';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'fake_reviews';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "radius_km" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preferred_formats" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preferences_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_session_id_idx" ON "devices" USING btree ("session_id");--> statement-breakpoint
UPDATE "profiles" SET "radius_km" = NULL WHERE "radius_km" > 200;