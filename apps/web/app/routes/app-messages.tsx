import { Button, Icon } from "@orasso/design-system/web";
import {
  type ContactRequestView,
  type ConversationPage,
  type InboxSummary,
  inboxRowCounts,
  messagingLabels,
} from "@orasso/shared";
import { useState } from "react";
import { useRevalidator } from "react-router";

import { ConversationRow } from "../components/Messaging";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-messages";

// Messages, derrière la bulle (lot R7c2, D38 ; maquette R7.3 `n-msg`) : seulement des conversations (privées, crews,
// organisateurs, réponses à tes stories), jamais une notification. En tête la ligne « Demandes de message · N » (règle de
// contact de R6), puis la liste. Mise à jour en direct par le canal `user:{id}` de la mise en page. Lot R7c2 : remplace la
// Boîte (`/app/boite` redirige ici).
export function meta() {
  return [{ title: "Messages · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const cursor = new URL(request.url).searchParams.get("apres");
  const [page, summary] = await Promise.all([
    apiOrThrow<ConversationPage>(
      request,
      `/me/conversations?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
    api<InboxSummary>(request, "/me/inbox/summary"),
  ]);
  // Compteur **inconnu** ≠ zéro (tour 2) : résumé en panne, on le lit dans les demandes de contact ; sans l'un ni l'autre,
  // `null` : la ligne reste, sans nombre, avec « Réessayer ».
  let messageRequests: number | null = summary.ok ? inboxRowCounts(summary.data).messageRequests : null;
  if (messageRequests === null) {
    const contacts = await api<{ items: ContactRequestView[] }>(request, "/me/contact-requests");
    if (contacts.ok) messageRequests = contacts.data.items.filter((c) => c.direction === "in").length;
  }
  return { page, messageRequests };
}

export default function Messages({ loaderData }: Route.ComponentProps) {
  const { page, messageRequests } = loaderData;
  const [query, setQuery] = useState("");
  const revalidator = useRevalidator();
  const needle = query.trim().toLowerCase();
  const items = needle
    ? page.items.filter((x) =>
        [x.title, x.subtitle ?? "", ...x.participants, x.lastMessage?.preview ?? ""].some((s) =>
          s.toLowerCase().includes(needle),
        ),
      )
    : page.items;
  return (
    <div className="s-narrow s-stack" data-testid="messages">
      <h1 className="s-title">{messagingLabels.messages}</h1>
      {messageRequests === null ? (
        <div className="s-notice" role="alert" data-testid="message-requests-unknown">
          <p>Le nombre de demandes de message n'a pas pu être lu.</p>
          <Button variant="secondary" icon="undo" onClick={() => revalidator.revalidate()} data-testid="messages-retry">
            Réessayer
          </Button>
        </div>
      ) : null}
      {messageRequests === null || messageRequests > 0 ? (
        <a
          className="act-requests"
          href="/app/messages/demandes"
          data-testid="message-requests-row"
          aria-label={
            messageRequests === null
              ? messagingLabels.messageRequests
              : `${messagingLabels.messageRequests}, ${messageRequests} en attente`
          }
        >
          <span className="act-requests__text">
            <strong>
              {messageRequests === null
                ? messagingLabels.messageRequests
                : `${messagingLabels.messageRequests} · ${messageRequests}`}
            </strong>
            <span className="o-t-caption s-muted">De personnes qui ne te suivent pas</span>
          </span>
          <Icon name="next" size={20} />
        </a>
      ) : null}
      {page.items.length > 0 ? (
        <input
          type="search"
          className="s-search"
          placeholder="Chercher une conversation"
          aria-label="Chercher une conversation"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="conversation-search"
        />
      ) : null}
      {page.items.length === 0 ? (
        <p className="s-notice">{messagingLabels.noConversations}</p>
      ) : items.length === 0 ? (
        <p className="s-notice">Aucune conversation ne correspond.</p>
      ) : (
        <ul className="s-convos" data-testid="conversations">
          {items.map((c) => (
            <ConversationRow key={c.id} c={c} />
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <a className="s-pager" href={`/app/messages?apres=${encodeURIComponent(page.nextCursor)}`}>
          {messagingLabels.olderMessages}
        </a>
      )}
    </div>
  );
}
