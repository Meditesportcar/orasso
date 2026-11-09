import { messagingLabels } from "../labels/messaging.fr";
import type { ConversationSummary } from "../schemas/messaging";

/**
 * L'étiquette d'une conversation de la liste des Messages (lot R7c2) : « Organisateur » pour un organisateur d'un événement
 * où tu vas, « Crew », « Staff », « Réponse à ta story » ; rien pour une conversation privée. Côté structure (je réponds au
 * nom de la mienne), l'autre personne est un participant, pas un organisateur : pas d'étiquette. Appli et site.
 */
export function conversationTag(c: Pick<ConversationSummary, "kind" | "side">): string | null {
  if (c.side === "structure") return null;
  if (c.kind === "organizer") return messagingLabels.tagOrganizer;
  if (c.kind === "crew") return messagingLabels.tagCrew;
  if (c.kind === "structure_staff" || c.kind === "event_staff") return messagingLabels.tagStaff;
  if (c.kind === "story_reply") return messagingLabels.tagStoryReply;
  return null;
}
