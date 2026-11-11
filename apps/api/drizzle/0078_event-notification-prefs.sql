CREATE TABLE "event_notification_prefs" (
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"news" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_notification_prefs_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "notification_prefs" SET DEFAULT '{"application":true,"event":true,"social":true,"grade":true,"eventNews":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "event_news_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_notification_prefs" ADD CONSTRAINT "event_notification_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notification_prefs" ADD CONSTRAINT "event_notification_prefs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;