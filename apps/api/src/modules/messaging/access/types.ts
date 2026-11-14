// Règles d'accès d'une sorte de conversation (ARCHITECTURE-SUITE § 3.2). Une sorte = un fichier `access/<kind>.ts`
// qui exporte un objet `KindRules` enregistré dans `access/index.ts` (lots 19 et 20 : `crew`, `structure_staff`,
// `event_staff` ajoutent chacun leur fichier et une ligne d'enregistrement).
import type { ConversationKind, ConversationView, ConversationWriteBlock, MessagePerson } from "@orasso/shared";

import type { conversationParticipants, conversations } from "../../../db/schema";
import type { Executor } from "../../../lib/tx";

export type ConversationRow = typeof conversations.$inferSelect;
export type ParticipantRow = typeof conversationParticipants.$inferSelect;

/** Côté d'une personne : participant ordinaire, ou organisateur qui répond au nom de la structure. */
export type Side = "member" | "structure";

/** Quelqu'un qui peut lire la conversation maintenant. */
export type Reader = { userId: string; side: Side };

export type Description = {
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  /** Pseudos des autres (3 au plus). */
  participants: string[];
  otherUser: MessagePerson | null;
  structure: { id: string; slug: string; name: string; logoUrl: string | null } | null;
  /** Lot R9i : la page d'un média d'une conversation `media` ; absent des autres sortes. */
  page?: ConversationView["page"];
};

/** Lot R9i : ce que le lecteur voit à la place de toute autre personne (sa clé d'auteur, le nom et le logo de la page). */
export type Mask = { userId: string; pseudo: string; avatarKey: string | null };

export type KindRules = {
  kind: ConversationKind;
  /**
   * Qui peut lire la conversation **maintenant** (droits recalculés à chaque appel : membre retiré d'une structure,
   * compte supprimé…). Le service s'en sert pour l'accès, les destinataires des push et la diffusion WebSocket.
   */
  readers(ex: Executor, conversation: ConversationRow): Promise<Reader[]>;
  /** Raison propre à la sorte d'empêcher l'écriture (en plus de la fermeture et de la suspension, communes). */
  writeBlock(ex: Executor, conversation: ConversationRow, viewer: Reader): Promise<ConversationWriteBlock | null>;
  /** Titre, sous-titre, avatar et personnes affichées pour ce lecteur. */
  describe(ex: Executor, conversation: ConversationRow, viewer: Reader): Promise<Description>;
  /**
   * Lot R9i : sorte à identité masquée. Pour ce lecteur, tout auteur, lecteur ou participant qui n'est pas lui est servi
   * sous ce masque (jamais le compte réel) ; `null` : ce lecteur voit les vrais comptes. Absent : aucune sorte d'avant.
   */
  mask?(ex: Executor, conversation: ConversationRow, viewer: Reader): Promise<Mask | null>;
  /** Conversations lisibles sans ligne de participant (organisateurs d'une structure). */
  extraConversationIds?(ex: Executor, userId: string): Promise<string[]>;
};
