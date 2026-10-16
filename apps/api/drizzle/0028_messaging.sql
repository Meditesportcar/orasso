CREATE TYPE "public"."contact_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('direct', 'organizer', 'crew', 'structure_staff', 'event_staff');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'image', 'system');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."upload_purpose" AS ENUM('message', 'crew_logo', 'incident', 'report', 'provider_photo', 'announcement');--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"message" text NOT NULL,
	"status" "contact_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_requests_pair_key" UNIQUE("from_user_id","to_user_id"),
	CONSTRAINT "contact_requests_not_self_check" CHECK ("contact_requests"."from_user_id" <> "contact_requests"."to_user_id"),
	CONSTRAINT "contact_requests_message_check" CHECK (char_length("contact_requests"."message") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "participant_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_message_id" uuid,
	"last_read_message_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"last_push_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_pkey" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"direct_key" text,
	"structure_id" uuid,
	"event_id" uuid,
	"crew_id" uuid,
	"created_by" text,
	"closed_at" timestamp with time zone,
	"readable_until" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"messages_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_direct_key_key" UNIQUE("direct_key"),
	CONSTRAINT "conversations_preview_check" CHECK (char_length("conversations"."last_message_preview") <= 80)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text,
	"image_key" text,
	"image_width" smallint,
	"image_height" smallint,
	"client_id" uuid,
	"as_structure" boolean DEFAULT false NOT NULL,
	"group_message_id" uuid,
	"deleted_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_conversation_client_key" UNIQUE("conversation_id","client_id"),
	CONSTRAINT "messages_body_check" CHECK ("messages"."body" is null or char_length("messages"."body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" "upload_purpose" NOT NULL,
	"width" smallint NOT NULL,
	"height" smallint NOT NULL,
	"bytes" integer NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_requests_to_status_idx" ON "contact_requests" USING btree ("to_user_id","status");--> statement-breakpoint
CREATE INDEX "contact_requests_from_created_idx" ON "contact_requests" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id") WHERE "conversation_participants"."left_at" is null;--> statement-breakpoint
CREATE INDEX "conversations_structure_idx" ON "conversations" USING btree ("structure_id") WHERE "conversations"."structure_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_sender_created_idx" ON "messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_image_key_key" ON "messages" USING btree ("image_key") WHERE "messages"."image_key" is not null;--> statement-breakpoint
CREATE INDEX "uploads_user_pending_idx" ON "uploads" USING btree ("user_id","created_at") WHERE "uploads"."consumed_at" is null;