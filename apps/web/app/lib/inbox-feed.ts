// Segment « Tout » de la Boîte du site (lot C5, relectures C4a et C4b reprises au lot C7) : messages, demandes et
// notifications dans un seul fil du plus récent au plus ancien, et une source en échec dite indisponible (avec
// « Réessayer ») au lieu d'une liste vide qui cacherait des messages ou des demandes.
import type { ContactRequestView, ConversationSummary, FollowRequestsPage } from "@orasso/shared";

/** Le résultat d'un appel à l'API (forme de `api()`), ou `null` quand la source n'est pas lue (pages suivantes). */
type Source<T> = { ok: true; data: T } | { ok: false } | null;

/** Date fictive qui range les demandes d'abonnement avant tout le reste (jamais affichée). */
export const FOLLOW_REQUEST_AT = "9999-12-31T23:59:59.999Z";

export type InboxRequest = { id: string; at: string; pseudo: string; text: string };

export function inboxSources(
  conversations: Source<{ items: ConversationSummary[] }>,
  follows: Source<FollowRequestsPage>,
  contacts: Source<{ items: ContactRequestView[] }>,
) {
  const requests: InboxRequest[] = [
    // Lot R6b : une demande d'abonnement n'a pas de date dans la liste ; elle attend une réponse, donc en tête du fil.
    ...(follows?.ok ? follows.data.items : []).map((r) => ({
      id: `follow-${r.userId}`,
      at: FOLLOW_REQUEST_AT,
      pseudo: r.pseudo,
      text: "demande à te suivre",
    })),
    ...(contacts?.ok ? contacts.data.items : [])
      .filter((r) => r.direction === "in")
      .map((r) => ({ id: `contact-${r.id}`, at: r.createdAt, pseudo: r.person.pseudo, text: "veut te contacter" })),
  ];
  return {
    conversations: conversations?.ok ? conversations.data.items : [],
    requests,
    unavailable: {
      messages: conversations !== null && !conversations.ok,
      requests: (follows !== null && !follows.ok) || (contacts !== null && !contacts.ok),
    },
  };
}

/** Les trois sortes réunies et triées du plus récent au plus ancien (`at` en ISO). */
export function byRecent<T extends { at: string }>(...lists: T[][]): T[] {
  return lists.flat().sort((a, b) => b.at.localeCompare(a.at));
}
