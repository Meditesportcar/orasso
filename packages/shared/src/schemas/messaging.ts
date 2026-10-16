import { z } from "zod";

import type { Grade } from "../grades";
import { acceptedUploadPurposes, type ConversationKind, type MessageKind } from "../messaging";
import { CONTACT_MESSAGE_MAX, MESSAGE_BODY_MAX, MESSAGES_PAGE_SIZE } from "../rules/messaging";
import { pageQuery } from "./common";
import { pseudoSchema } from "./profile";

// Messagerie et Boîte (lot 18). Routes : ARCHITECTURE-SUITE § 3.3.

/** Envoi : un texte **ou** une image (clé rendue par `POST /me/uploads` avec `purpose=message`), avec un `clientId`. */
export const messageSendSchema = z
  .object({
    /** Identifiant choisi par l'appareil : renvoyer le même message (réseau coupé) ne le publie qu'une fois. */
    clientId: z.uuid(),
    body: z.string().trim().min(1).max(MESSAGE_BODY_MAX).optional(),
    imageKey: z.string().min(10).max(200).optional(),
  })
  .refine((v) => Boolean(v.body) !== Boolean(v.imageKey), { message: "Un texte ou une image", path: ["body"] });
export type MessageSend = z.infer<typeof messageSendSchema>;

export const messageReadSchema = z.object({ messageId: z.uuid() });

export const messagesQuery = z.object({
  /** Messages plus anciens que celui-ci (pagination vers le haut). */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MESSAGES_PAGE_SIZE).default(MESSAGES_PAGE_SIZE),
});

export const conversationsQuery = pageQuery;

export const directConversationSchema = z.object({ userId: z.string().min(1).max(64) });

export const contactRequestCreateSchema = z.object({
  pseudo: pseudoSchema,
  /** Texte obligatoire (docs/01 : la demande de contact est un message). */
  message: z.string().trim().min(1).max(CONTACT_MESSAGE_MAX),
});
export type ContactRequestCreate = z.infer<typeof contactRequestCreateSchema>;

export const contactRequestsQuery = z.object({ direction: z.enum(["in", "out"]).optional() });

export const uploadPurposeSchema = z.enum(acceptedUploadPurposes);

/** Une personne dans la messagerie : pseudo et photo, jamais rien d'autre. */
export type MessagePerson = { userId: string; pseudo: string; avatarUrl: string | null };

export type MessageView = {
  id: string;
  conversationId: string;
  kind: MessageKind;
  /** Vide pour un message supprimé ou une image. */
  body: string | null;
  /** Image privée : servie par `GET /conversations/:id/images/:nom` aux seuls participants. */
  image: { url: string; width: number | null; height: number | null } | null;
  /** Vide : compte supprimé (son ancien pseudo n'est jamais réaffiché). */
  sender: MessagePerson | null;
  /** Message écrit au nom de la structure (« <Structure> · par <pseudo> »). */
  asStructure: boolean;
  mine: boolean;
  /** Identifiant de l'appareil : renvoyé à l'expéditeur seulement (rapprochement du message en cours d'envoi). */
  clientId: string | null;
  createdAt: string;
  deleted: boolean;
  /** Lot 32 : retiré par la modération (« Message retiré par la modération ») ; `deleted` est vrai aussi. */
  moderated?: boolean;
  /** « Lu par » : sur les messages de mon côté de la première page seulement. */
  readBy: { userId: string; pseudo: string }[] | null;
};

/** Pourquoi on ne peut plus écrire dans une conversation (lecture toujours possible). */
export type ConversationWriteBlock =
  | "not_friends"
  | "closed"
  | "suspended"
  | "account_deleted"
  | "two_factor"
  | "structure_suspended";

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  /** `structure` : je réponds au nom d'une de mes structures. */
  side: "member" | "structure";
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  /** Pseudos des autres participants (3 au plus). */
  participants: string[];
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  unreadCount: number;
  closedAt: string | null;
};

export type ConversationView = ConversationSummary & {
  canWrite: boolean;
  writeBlocked: ConversationWriteBlock | null;
  structure: { id: string; slug: string; name: string; logoUrl: string | null } | null;
  /** La personne en face (conversation à deux, ou côté structure) : lien vers son profil. */
  otherUser: MessagePerson | null;
};

export type ConversationPage = { items: ConversationSummary[]; nextCursor: string | null };
/** Du plus récent au plus ancien (liste inversée dans l'appli). */
export type MessagePage = { items: MessageView[]; nextCursor: string | null };

export type OpenConversationResult = { id: string; created: boolean };

export type ContactRequestView = {
  id: string;
  direction: "in" | "out";
  message: string;
  createdAt: string;
  person: MessagePerson & { grade: Grade };
};

export type ContactRequestResult = { id: string; pseudo: string };
export type ContactAcceptResult = { conversationId: string };

/** Compteurs des Demandes de la Boîte ; chaque lot ajoute sa clé (crew, invitation à un événement, staff…). */
export type InboxRequestCounts = {
  friend: number;
  contact: number;
  /** Lot 19 : demandes reçues par un chef de crew et invitations reçues ; venues en crew à confirmer. */
  crew: number;
  crewConfirmation: number;
};

/** Pastille de la Boîte : conversations qui ont du non lu, et demandes en attente par sorte. */
export type InboxSummary = { unreadMessages: number; requests: InboxRequestCounts };

export type UploadResult = { key: string; width: number; height: number };
