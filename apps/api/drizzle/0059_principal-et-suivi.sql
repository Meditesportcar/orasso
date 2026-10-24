CREATE TABLE "user_follows" (
	"follower_id" text NOT NULL,
	"followed_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_follows_pkey" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "user_follows_not_self_check" CHECK ("user_follows"."follower_id" <> "user_follows"."followed_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "main_vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_followed_id_user_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_follows_followed_idx" ON "user_follows" USING btree ("followed_id","created_at");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_main_vehicle_id_vehicles_id_fk" FOREIGN KEY ("main_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;