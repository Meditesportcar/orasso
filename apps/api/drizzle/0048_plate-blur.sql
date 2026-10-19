ALTER TABLE "vehicle_photos" ADD COLUMN "plate_rects" jsonb;--> statement-breakpoint
ALTER TABLE "vehicle_photos" ADD COLUMN "plate_blurred" boolean DEFAULT false NOT NULL;