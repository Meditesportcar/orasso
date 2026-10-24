// Segment « Tout » de la Boîte du site (lot C5, relectures C4a et C4b reprises au lot C7) : messages, demandes et
// notifications dans un seul fil du plus récent au plus ancien, et une source en échec dite indisponible (avec
// « Réessayer ») au lieu d'une liste vide qui cacherait des messages ou des demandes.
import type { ContactRequestView, ConversationSummary, FriendRequestView } from "@orasso/shared";

/** Le résultat d'un appel à l'API (forme de `api()`), ou `null` quand la source n'est pas lue (pages suivantes). */
type Source<T> = { ok: true; data: T } | { ok: false } | null;

export type InboxRequest = { id: string; at: string; pseudo: string; text: string };

export function inboxSources(
  conversations: Source<{ items: ConversationSummary[] }>,
  friends: Source<{ items: FriendRequestView[] }>,
  contacts: Source<{ items: ContactRequestView[] }>,
) {
  const requests: InboxRequest[] = [
    ...(friends?.ok ? friends.data.items : []).map((r) => ({
      id: `friend-${r.id}`,
      at: r.createdAt,
      pseudo: r.person.pseudo,
      text: "veut devenir ton ami",
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
      requests: (friends !== null && !friends.ok) || (contacts !== null && !contacts.ok),
    },
  };
}

/** Les trois sortes réunies et triées du plus récent au plus ancien (`at` en ISO). */
export function byRecent<T extends { at: string }>(...lists: T[][]): T[] {
  return lists.flat().sort((a, b) => b.at.localeCompare(a.at));
}
