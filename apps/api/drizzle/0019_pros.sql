CREATE TABLE "pro_daily_stats" (
	"pro_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"routes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pro_daily_stats_pkey" PRIMARY KEY("pro_id","day")
);
--> statement-breakpoint
CREATE TABLE "pro_discount_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"grade" "grade" NOT NULL,
	"percent" smallint NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_discounts" (
	"pro_id" uuid NOT NULL,
	"grade" "grade" NOT NULL,
	"percent" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_discounts_pkey" PRIMARY KEY("pro_id","grade"),
	CONSTRAINT "pro_discounts_percent_check" CHECK ("pro_discounts"."percent" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "pro_follows" (
	"pro_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_follows_pkey" PRIMARY KEY("pro_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pro_partner_links" (
	"pro_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_partner_links_pkey" PRIMARY KEY("pro_id","structure_id")
);
--> statement-breakpoint
CREATE TABLE "pro_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pro_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"logo_key" text,
	"description" text,
	"activities" text[] DEFAULT '{}'::text[] NOT NULL,
	"address_line" text,
	"postal_code" text,
	"city" text,
	"department" text,
	"lat" double precision,
	"lng" double precision,
	"intervention_departments" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone" text,
	"email" text,
	"website" text,
	"socials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"siret" text,
	"registry_check" jsonb,
	"verified_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pro_profiles_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "pro_daily_stats" ADD CONSTRAINT "pro_daily_stats_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_discount_uses" ADD CONSTRAINT "pro_discount_uses_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_discounts" ADD CONSTRAINT "pro_discounts_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_follows" ADD CONSTRAINT "pro_follows_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_follows" ADD CONSTRAINT "pro_follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_partner_links" ADD CONSTRAINT "pro_partner_links_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_partner_links" ADD CONSTRAINT "pro_partner_links_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_photos" ADD CONSTRAINT "pro_photos_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_posts" ADD CONSTRAINT "pro_posts_pro_id_pro_profiles_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pro_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_profiles" ADD CONSTRAINT "pro_profiles_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pro_discount_uses_pro_idx" ON "pro_discount_uses" USING btree ("pro_id","used_at");--> statement-breakpoint
CREATE INDEX "pro_follows_user_idx" ON "pro_follows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pro_partner_links_structure_idx" ON "pro_partner_links" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "pro_photos_pro_idx" ON "pro_photos" USING btree ("pro_id","position");--> statement-breakpoint
CREATE INDEX "pro_posts_pro_idx" ON "pro_posts" USING btree ("pro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pro_profiles_owner_key" ON "pro_profiles" USING btree ("owner_user_id") WHERE "pro_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pro_profiles_department_idx" ON "pro_profiles" USING btree ("department");--> statement-breakpoint
CREATE INDEX "pro_profiles_published_idx" ON "pro_profiles" USING btree ("published_at");