ALTER TYPE "public"."checkin_method" ADD VALUE 'drive';--> statement-breakpoint
ALTER TABLE "access_passes" ADD COLUMN "otp_secret" "bytea";