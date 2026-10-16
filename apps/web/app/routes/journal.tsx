import { Button, Chip } from "@orasso/design-system/web";
import { type NotificationFamily, notificationFamilyLabels, socialLabels } from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { PersonAvatar } from "../components/People";
import { api, apiOrThrow } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import type { Route } from "./+types/journal";

// Journal (lot 17, ARCHITECTURE-SUITE § 2.4) : le fil d'actualité des amis et les notifications, dans un seul fil
// chronologique. 7 jours en arrière, sauf ce qui n'a pas été lu.
export function meta() {
  return [{ title: "Journal · Orasso" }, { name: "robots", content: "noindex" }];
}

type JournalItem = {
  id: string;
  type: string;
  family: NotificationFamily;
  title: string;
  body: string;
  data: { link?: string; screen?: string; actor?: { userId: string; pseudo: string; avatarUrl: string | null } };
  createdAt: string;
  readAt: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const cursor = new URL(request.url).searchParams.get("suite");
  const page = await apiOrThrow<{ items: JournalItem[]; nextCursor: string | null }>(
    request,
    `/me/notifications?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  return page;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "read_all") {
    const res = await api(request, "/me/notifications/read", { method: "POST", json: { all: true } });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    return redirect("/app/journal");
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

const pathOf = (item: JournalItem): string | null => {
  const raw = item.data.link ?? item.data.screen ?? null;
  return raw?.startsWith("/") && !raw.startsWith("//") ? raw : null;
};

export default function Journal({ loaderData, actionData }: Route.ComponentProps) {
  const { items, nextCursor } = loaderData;
  const busy = useNavigation().state !== "idle";
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <div className="s-narrow s-stack" data-testid="journal">
      <div className="s-row s-row--between">
        <h1 className="s-title">{socialLabels.journal}</h1>
        {unread > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="read_all" />
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              {socialLabels.markAllRead}
            </Button>
          </Form>
        )}
      </div>
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="s-notice">{socialLabels.journalEmpty}</p>
      ) : (
        <ul className="s-journal">
          {items.map((item) => {
            const path = pathOf(item);
            const actor = item.data.actor;
            const content = (
              <>
                {actor ? (
                  <PersonAvatar url={actor.avatarUrl} pseudo={actor.pseudo} size={40} />
                ) : (
                  <span className="s-journal__dot" aria-hidden="true" />
                )}
                <div className="s-journal__main">
                  <strong className="s-journal__title">{item.title}</strong>
                  {item.body && <span className="s-journal__body">{item.body}</span>}
                  <span className="o-t-caption s-muted">
                    {formatDay(item.createdAt)} · {formatTime(item.createdAt)} · {notificationFamilyLabels[item.family]}
                  </span>
                </div>
                {!item.readAt && <Chip>Nouveau</Chip>}
              </>
            );
            return (
              <li
                key={item.id}
                className="s-journal__item"
                data-testid="journal-item"
                data-type={item.type}
                data-read={Boolean(item.readAt)}
              >
                {path ? (
                  <a className="s-journal__link" href={path}>
                    {content}
                  </a>
                ) : (
                  <div className="s-journal__link">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor && (
        <Button variant="secondary" icon="next" href={`/app/journal?suite=${encodeURIComponent(nextCursor)}`}>
          Plus ancien
        </Button>
      )}
    </div>
  );
}
