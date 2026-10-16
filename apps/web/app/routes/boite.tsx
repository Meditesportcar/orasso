import { type ConversationPage, type InboxSummary, messagingLabels } from "@orasso/shared";
import { ConversationRow, InboxSegments } from "../components/Messaging";
import { apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/boite";

// Boîte (lot 18, docs/02) : ce qu'on m'écrit. Segment Messages : amis, organisateurs (et, côté structure, les
// personnes qui écrivent à mes structures). Mise à jour en direct par le canal `user:{id}`.
export function meta() {
  return [{ title: "Boîte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("apres");
  const [page, summary] = await Promise.all([
    apiOrThrow<ConversationPage>(
      request,
      `/me/conversations?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
    apiOrThrow<InboxSummary>(request, "/me/inbox/summary"),
  ]);
  return { page, summary };
}

export default function Boite({ loaderData }: Route.ComponentProps) {
  const { page, summary } = loaderData;
  // Mise à jour en direct : le canal `user:{id}` de la mise en page recharge cette liste.
  const requests = Object.values(summary.requests).reduce((a, b) => a + b, 0);
  return (
    <div className="s-narrow s-stack" data-testid="boite">
      <h1 className="s-title">{messagingLabels.inbox}</h1>
      <InboxSegments active="messages" messages={summary.unreadMessages} requests={requests} />
      {page.items.length === 0 ? (
        <p className="s-notice">{messagingLabels.noConversations}</p>
      ) : (
        <ul className="s-convos" data-testid="conversations">
          {page.items.map((c) => (
            <ConversationRow key={c.id} c={c} />
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <a className="s-pager" href={`/app/boite?apres=${encodeURIComponent(page.nextCursor)}`}>
          {messagingLabels.olderMessages}
        </a>
      )}
    </div>
  );
}
