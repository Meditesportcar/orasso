ALTER TYPE "public"."report_reason" ADD VALUE 'misleading_info';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'cancelled_unannounced';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'unauthorized_place';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'abusive_pricing';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'plate_or_face';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'copyright';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'fake_pro';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'discount_not_applied';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'fake_reviews';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preferred_formats" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preferences_seen_at" timestamp with time zone;