import type { MessageKind } from "../messaging";

// Messagerie (lot 18, ARCHITECTURE-SUITE § 3) : règles pures. L'API les applique ; l'appli et le site affichent le
// résultat sans le recalculer.

/** Corps d'un message (docs : 2000 caractères) et d'une demande de contact (500). */
export const MESSAGE_BODY_MAX = 2000;
export const CONTACT_MESSAGE_MAX = 500;
/** Aperçu de la liste des conversations et corps du push. */
export const MESSAGE_PREVIEW_MAX = 80;
export const PUSH_PREVIEW_MAX = 60;
/** Messages par personne et par minute, demandes de contact par personne et par jour (comptés en base). */
export const MESSAGES_PER_MINUTE = 60;
export const CONTACT_REQUESTS_PER_DAY = 10;
/** S12 : au plus un push par conversation et par 5 minutes tant qu'il reste du non lu. */
export const MESSAGE_PUSH_INTERVAL_MS = 5 * 60_000;
/** Taille d'une page de messages ; « lu par » est calculé pour la première page (les plus récents) seulement. */
export const MESSAGES_PAGE_SIZE = 50;
/** Taille maximale d'un message WebSocket reçu du client (abonnements seulement) et cadence d'abonnement. */
export const WS_MAX_FRAME_BYTES = 2048;
export const WS_SUBSCRIBES_PER_MINUTE = 60;

/** Clé unique d'une conversation `direct` : la même quel que soit le sens (`<min>:<max>`). */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Clé unique d'une conversation entre une personne et une structure. */
export function organizerKey(structureId: string, userId: string): string {
  return `structure:${structureId}:${userId}`;
}

/** Texte raccourci sur une limite de mot, avec des points de suspension. */
export function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export const PHOTO_PREVIEW = "📷 Photo";

/** Aperçu d'un message (liste des conversations, push). */
export function messagePreview(
  message: { kind: MessageKind; body: string | null; deleted: boolean },
  max = MESSAGE_PREVIEW_MAX,
): string {
  if (message.deleted) return "Message supprimé";
  if (message.kind === "image") return PHOTO_PREVIEW;
  if (message.kind === "system") return "Information";
  return shorten(message.body ?? "", max);
}

/** Position d'un message dans une conversation : date puis identifiant (deux messages à la même milliseconde). */
export type MessagePosition = { at: Date; id: string };

/** Vrai si `a` est strictement après `b`. */
export function isAfter(a: MessagePosition, b: MessagePosition): boolean {
  const da = a.at.getTime();
  const db = b.at.getTime();
  return da !== db ? da > db : a.id > b.id;
}

/** Le dernier message lu (marqueur de lecture) couvre-t-il ce message ? */
export function isReadBy(marker: MessagePosition | null, message: MessagePosition): boolean {
  return marker !== null && !isAfter(message, marker);
}

/**
 * S12 : faut-il envoyer un push à ce participant pour un nouveau message ? Jamais pendant une mise en sourdine ; sinon
 * oui si aucun push n'est parti, si la personne a lu depuis le dernier push, ou si le dernier a plus de 5 minutes.
 */
export function shouldPushMessage(
  p: { lastPushAt: Date | null; lastReadAt: Date | null; mutedUntil: Date | null },
  now: Date,
): boolean {
  if (p.mutedUntil && p.mutedUntil > now) return false;
  if (!p.lastPushAt) return true;
  if (p.lastReadAt && p.lastReadAt >= p.lastPushAt) return true;
  return now.getTime() - p.lastPushAt.getTime() >= MESSAGE_PUSH_INTERVAL_MS;
}
