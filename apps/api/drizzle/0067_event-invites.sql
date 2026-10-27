CREATE TABLE "event_peer_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_peer_invitations_not_self_check" CHECK ("event_peer_invitations"."inviter_id" <> "event_peer_invitations"."invitee_id"),
	CONSTRAINT "event_peer_invitations_note_check" CHECK ("event_peer_invitations"."note" is null or char_length("event_peer_invitations"."note") <= 140)
);
--> statement-breakpoint
CREATE TABLE "invitation_mutes" (
	"user_id" text NOT NULL,
	"muted_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_mutes_pkey" PRIMARY KEY("user_id","muted_user_id"),
	CONSTRAINT "invitation_mutes_not_self_check" CHECK ("invitation_mutes"."user_id" <> "invitation_mutes"."muted_user_id")
);
--> statement-breakpoint
ALTER TABLE "crew_members" ADD COLUMN "invite_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_peer_invitations" ADD CONSTRAINT "event_peer_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_peer_invitations" ADD CONSTRAINT "event_peer_invitations_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_peer_invitations" ADD CONSTRAINT "event_peer_invitations_invitee_id_user_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_mutes" ADD CONSTRAINT "invitation_mutes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_mutes" ADD CONSTRAINT "invitation_mutes_muted_user_id_user_id_fk" FOREIGN KEY ("muted_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_peer_invitations_key" ON "event_peer_invitations" USING btree ("event_id","invitee_id","inviter_id");--> statement-breakpoint
CREATE INDEX "event_peer_invitations_invitee_idx" ON "event_peer_invitations" USING btree ("invitee_id","event_id");--> statement-breakpoint
CREATE INDEX "event_peer_invitations_inviter_created_idx" ON "event_peer_invitations" USING btree ("inviter_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_mutes_muted_idx" ON "invitation_mutes" USING btree ("muted_user_id");