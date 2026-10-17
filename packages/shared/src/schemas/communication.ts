import { z } from "zod";

import {
  type AnnouncementAudience,
  type AnnouncementKind,
  announcementAudiences,
  type GroupMessageStatus,
  type MessageSegment,
  messageSegments,
  type TemplateKind,
  templateKinds,
} from "../communication";
import {
  ANNOUNCEMENT_BODY_MAX,
  GROUP_MESSAGE_BODY_MAX,
  GROUP_MESSAGE_SUBJECT_MAX,
  segmentNeedsEvent,
  TEMPLATE_NAME_MAX,
} from "../rules/templates";
import { optionalText } from "./common";

// Communication de l'organisateur (lot 20). Routes : ARCHITECTURE-SUITE § 5.2 et `ARCHITECTURE.md` « État après le
// lot 20 ».

/** `POST /events/:id/announcements` : texte, photo facultative (clé de `POST /me/uploads purpose=announcement`). */
export const announcementCreateSchema = z.object({
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
  imageKey: z.string().min(10).max(200).nullish(),
  /** « Prévenir les inscrits » : notification `event_announcement` aux inscrits actifs. */
  notify: z.boolean().default(false),
  pinned: z.boolean().default(false),
  audience: z.enum(announcementAudiences).default("public"),
});
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;

export const announcementUpdateSchema = z.object({ pinned: z.boolean() });

/** `POST /events/:id/instructions/send` : les consignes (enregistrées en même temps si fournies) partent aux retenus. */
export const instructionsSendSchema = z.object({ instructions: optionalText(2000).optional() });

/** `POST /structures/:id/group-messages` : `clientId` rend l'envoi idempotent (double clic, réseau coupé). */
export const groupMessageCreateSchema = z
  .object({
    clientId: z.uuid(),
    eventId: z.uuid().nullish(),
    segment: z.enum(messageSegments),
    templateId: z.uuid().nullish(),
    subject: optionalText(GROUP_MESSAGE_SUBJECT_MAX),
    body: z.string().trim().min(1).max(GROUP_MESSAGE_BODY_MAX),
  })
  .refine((v) => !segmentNeedsEvent(v.segment) || Boolean(v.eventId), {
    message: "Choisis un événement pour ce segment",
    path: ["eventId"],
  });
export type GroupMessageCreate = z.infer<typeof groupMessageCreateSchema>;

export const groupMessagePreviewQuery = z
  .object({ eventId: z.uuid().optional(), segment: z.enum(messageSegments) })
  .refine((v) => !segmentNeedsEvent(v.segment) || Boolean(v.eventId), {
    message: "Choisis un événement pour ce segment",
    path: ["eventId"],
  });

export const templateCreateSchema = z.object({
  kind: z.enum(templateKinds),
  name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
  subject: optionalText(GROUP_MESSAGE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(GROUP_MESSAGE_BODY_MAX),
});
export type TemplateCreate = z.infer<typeof templateCreateSchema>;
export const templateUpdateSchema = templateCreateSchema.partial();

/** Entrée du fil de l'événement. Toujours au nom de la structure : l'auteur n'est montré qu'à l'organisation. */
export type AnnouncementView = {
  id: string;
  eventId: string;
  kind: AnnouncementKind;
  audience: AnnouncementAudience;
  body: string;
  image: { url: string; width: number | null; height: number | null } | null;
  pinned: boolean;
  publishedAt: string;
  structureName: string;
  /** Organisation seulement : qui l'a écrite (nul pour une entrée automatique ou un compte supprimé). */
  authorPseudo?: string | null;
};

export type AnnouncementPage = { items: AnnouncementView[] };

/** Quota d'envoi aux abonnés (S18) : `resetsAt` = prochaine place libre quand il ne reste rien. */
export type FollowerQuota = { quota: number; used: number; remaining: number; resetsAt: string | null };

export type MessagingQuota = {
  followers: FollowerQuota;
  /** Messages groupés restants aujourd'hui (tous segments). */
  dailyRemaining: number;
};

/** Aperçu avant l'envoi : nombre de destinataires seulement (jamais la liste). */
export type GroupMessagePreview = { recipientsCount: number; quota: MessagingQuota };

export type GroupMessageView = {
  id: string;
  segment: MessageSegment;
  event: { id: string; title: string } | null;
  subject: string | null;
  body: string;
  status: GroupMessageStatus;
  recipientsCount: number;
  sentCount: number;
  /** Destinataires dont le marqueur de lecture couvre le message (« 64 ont lu »). */
  readCount: number;
  authorPseudo: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type GroupMessageCreated = { groupMessageId: string; recipientsCount: number; created: boolean };

export type TemplateView = {
  id: string;
  kind: TemplateKind;
  name: string;
  subject: string | null;
  body: string;
  /** Modèle Orasso : lecture seule, proposé à toutes les structures. */
  orasso: boolean;
  updatedAt: string;
};

/** Discussion du staff (permanente de la structure, ou d'un événement). */
export type StaffConversationState = {
  conversationId: string;
  kind: "structure_staff" | "event_staff";
  title: string;
  event: { id: string; title: string; startsAt: string; endsAt: string } | null;
  /** Plus de nouveaux messages après cette date (J+1 pour un événement). */
  closedAt: string | null;
  /** Plus de lecture après cette date (J+7, organisateurs). */
  readableUntil: string | null;
  open: boolean;
  lastMessageAt: string | null;
  unreadCount: number;
};

/** `GET /structures/:id/inbox/summary` : la Boîte de la casquette Organisateur (consommée par le lot 22). */
export type OrganizerInboxSummary = {
  /** Conversations de participants avec un message non lu. */
  participantMessages: number;
  /** Discussions du staff avec un message non lu. */
  staffDiscussions: number;
  /** Demandes pour devenir staff en attente de réponse (lot 24). */
  staffRequests: number;
};
