CREATE TABLE "provider_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"custom_type" text,
	"name" text NOT NULL,
	"description" text,
	"phone" text,
	"email" text,
	"website" text,
	"instagram" text,
	"portfolio_url" text,
	"departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"pro_profile_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_profiles_custom_type_check" CHECK ("provider_profiles"."custom_type" is null or char_length("provider_profiles"."custom_type") <= 40)
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "provider_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "accredited_media" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_photos" ADD CONSTRAINT "provider_photos_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_pro_profile_id_pro_profiles_id_fk" FOREIGN KEY ("pro_profile_id") REFERENCES "public"."pro_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_photos_provider_idx" ON "provider_photos" USING btree ("provider_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_profiles_user_key" ON "provider_profiles" USING btree ("user_id") WHERE "provider_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "provider_profiles_pro_idx" ON "provider_profiles" USING btree ("pro_profile_id");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_provider_profile_id_provider_profiles_id_fk" FOREIGN KEY ("provider_profile_id") REFERENCES "public"."provider_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_active_provider_key" ON "applications" USING btree ("event_id","provider_profile_id") WHERE "applications"."status" in ('pending', 'accepted', 'waitlisted', 'offered');--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_provider_kind_check" CHECK ("applications"."kind" <> 'provider' or "applications"."provider_profile_id" is not null);