CREATE TYPE "public"."partnership_status" AS ENUM('pending', 'active', 'declined', 'ended');--> statement-breakpoint
CREATE TABLE "partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"vehicle_id" uuid,
	"message" text NOT NULL,
	"status" "partnership_status" DEFAULT 'pending' NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partnerships_message_check" CHECK (char_length("partnerships"."message") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_ended_by_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partnerships_open_key" ON "partnerships" USING btree ("pro_id","user_id") WHERE "partnerships"."status" in ('pending', 'active');--> statement-breakpoint
CREATE INDEX "partnerships_user_status_idx" ON "partnerships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "partnerships_pro_status_idx" ON "partnerships" USING btree ("pro_id","status");--> statement-breakpoint
CREATE INDEX "partnerships_vehicle_idx" ON "partnerships" USING btree ("vehicle_id");