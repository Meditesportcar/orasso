import type {
  ContactRequestView,
  ConversationPage,
  FollowRequestsPage,
  InboxSummary,
  NotificationFamily,
} from "@orasso/shared";

import { api, apiOrThrow } from "./api.server";
import { inboxSources } from "./inbox-feed";

// Lecture du Journal (lot 17, C5 ; lot R7a1 : l'onglet Le Fil la partage). Un module `.server` : l'import de `api.server`
// ne doit jamais rejoindre le code des routes qui l'exportent.
export type JournalItem = {
  id: string;
  type: string;
  family: NotificationFamily;
  title: string;
  body: string;
  data: {
    link?: string;
    screen?: string;
    actor?: { userId: string; pseudo: string; avatarUrl: string | null };
    /** Lot R6c, tour 2 : les auteurs d'une invitation regroupée (la plus récente d'abord). */
    actors?: { userId: string; pseudo: string }[];
  };
  createdAt: string;
  readAt: string | null;
};

/**
 * `notificationsOnly` (tour 2 du lot R7a1) : l'onglet Le Fil (`/app/fil`) ne montre que les notifications, comme l'appli ;
 * ni messages ni demandes, donc rien d'autre n'est lu.
 */
export async function loadJournal(request: Request, notificationsOnly: boolean) {
  const cursor = new URL(request.url).searchParams.get("suite");
  const [page, summary, conversations, follows, contacts] = await Promise.all([
    apiOrThrow<{ items: JournalItem[]; nextCursor: string | null }>(
      request,
      `/me/notifications?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
    apiOrThrow<InboxSummary>(request, "/me/inbox/summary"),
    // « Tout » réunit messages, demandes et notifications (`sh-inbox`) : les plus récents de chaque sorte, sur la
    // première page seulement (« Plus ancien » ne pagine que les notifications).
    cursor || notificationsOnly ? null : api<ConversationPage>(request, "/me/conversations?limit=10"),
    cursor || notificationsOnly ? null : api<FollowRequestsPage>(request, "/me/follow-requests"),
    cursor || notificationsOnly ? null : api<{ items: ContactRequestView[] }>(request, "/me/contact-requests"),
  ]);
  return { ...page, summary, ...inboxSources(conversations, follows, contacts) };
}
