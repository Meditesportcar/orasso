ALTER TABLE "vehicles" ADD COLUMN "proposed_make" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "proposed_model" text;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_proposed_make_check" CHECK ("vehicles"."proposed_make" is null or char_length("vehicles"."proposed_make") between 2 and 40);--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_proposed_model_check" CHECK ("vehicles"."proposed_model" is null or char_length("vehicles"."proposed_model") between 2 and 40);