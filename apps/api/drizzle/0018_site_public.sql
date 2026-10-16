CREATE TYPE "public"."verification_document_kind" AS ENUM('statutes', 'receipt', 'kbis', 'identity', 'other');--> statement-breakpoint
CREATE TABLE "structure_verification_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"kind" "verification_document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "vendor_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "parent_event_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recurrence_rule" jsonb;--> statement-breakpoint
ALTER TABLE "structures" ADD COLUMN "registry_check" jsonb;--> statement-breakpoint
ALTER TABLE "structure_verification_documents" ADD CONSTRAINT "structure_verification_documents_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_verification_documents" ADD CONSTRAINT "structure_verification_documents_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "structure_verification_documents_structure_idx" ON "structure_verification_documents" USING btree ("structure_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_parent_event_id_events_id_fk" FOREIGN KEY ("parent_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;