CREATE TABLE "stripe_connect_states" (
	"nonce" text PRIMARY KEY NOT NULL,
	"structure_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_connect_states" ADD CONSTRAINT "stripe_connect_states_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connect_states" ADD CONSTRAINT "stripe_connect_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pro_profiles_siret_key" ON "pro_profiles" USING btree ("siret") WHERE "pro_profiles"."deleted_at" is null and "pro_profiles"."siret" is not null;