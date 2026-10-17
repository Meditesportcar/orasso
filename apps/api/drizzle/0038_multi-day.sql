CREATE TYPE "public"."day_access" AS ENUM('whole', 'per_day', 'both');--> statement-breakpoint
ALTER TABLE "applications" DROP CONSTRAINT "applications_event_day_id_event_days_id_fk";
--> statement-breakpoint
DROP INDEX "applications_active_vehicle_key";--> statement-breakpoint
ALTER TABLE "event_days" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "day_access" "day_access" DEFAULT 'whole' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_event_day_id_event_days_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_event_day_idx" ON "applications" USING btree ("event_day_id") WHERE "applications"."event_day_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_vehicle_key" ON "applications" USING btree ("event_id","vehicle_id",coalesce("event_day_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "applications"."status" not in ('refused', 'withdrawn', 'expired', 'cancelled');--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_dates_check" CHECK ("event_days"."ends_at" > "event_days"."starts_at");--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_capacity_check" CHECK ("event_days"."capacity" is null or "event_days"."capacity" > 0);