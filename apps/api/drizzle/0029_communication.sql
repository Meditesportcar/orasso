CREATE TYPE "public"."announcement_audience" AS ENUM('public', 'participants');--> statement-breakpoint
CREATE TYPE "public"."announcement_kind" AS ENUM('announcement', 'instructions', 'status_change', 'system');--> statement-breakpoint
CREATE TYPE "public"."group_message_status" AS ENUM('queued', 'sending', 'sent');--> statement-breakpoint
CREATE TYPE "public"."message_segment" AS ENUM('accepted', 'waitlisted', 'pending', 'providers', 'staff', 'followers', 'checked_in');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('message', 'announcement', 'instructions', 'thanks');--> statement-breakpoint
CREATE TABLE "event_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"author_id" text,
	"kind" "announcement_kind" NOT NULL,
	"audience" "announcement_audience" DEFAULT 'public' NOT NULL,
	"body" text NOT NULL,
	"image_key" text,
	"image_width" smallint,
	"image_height" smallint,
	"pinned" boolean DEFAULT false NOT NULL,
	"notified" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_announcements_body_check" CHECK (char_length("event_announcements"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "group_message_recipients" (
	"group_message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_message_recipients_pkey" PRIMARY KEY("group_message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"event_id" uuid,
	"author_id" text,
	"segment" "message_segment" NOT NULL,
	"template_id" uuid,
	"subject" text,
	"body" text NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "group_message_status" DEFAULT 'queued' NOT NULL,
	"recipients_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_messages_structure_client_key" UNIQUE("structure_id","client_id"),
	CONSTRAINT "group_messages_body_check" CHECK (char_length("group_messages"."body") between 1 and 2000),
	CONSTRAINT "group_messages_subject_check" CHECK ("group_messages"."subject" is null or char_length("group_messages"."subject") <= 120)
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid,
	"kind" "template_kind" NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_name_check" CHECK (char_length("message_templates"."name") between 1 and 60),
	CONSTRAINT "message_templates_body_check" CHECK (char_length("message_templates"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "thanks_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_recipients" ADD CONSTRAINT "group_message_recipients_group_message_id_group_messages_id_fk" FOREIGN KEY ("group_message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_recipients" ADD CONSTRAINT "group_message_recipients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_recipients" ADD CONSTRAINT "group_message_recipients_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_message_recipients" ADD CONSTRAINT "group_message_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_announcements_event_published_idx" ON "event_announcements" USING btree ("event_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "group_message_recipients_pending_idx" ON "group_message_recipients" USING btree ("group_message_id") WHERE "group_message_recipients"."sent_at" is null;--> statement-breakpoint
CREATE INDEX "group_messages_structure_created_idx" ON "group_messages" USING btree ("structure_id","created_at");--> statement-breakpoint
CREATE INDEX "message_templates_structure_idx" ON "message_templates" USING btree ("structure_id");