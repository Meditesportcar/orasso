import { Button, Chip } from "@orasso/design-system/web";
import { eventInviteLabels, notificationFamilyLabels, socialLabels } from "@orasso/shared";
import { useLocation } from "react-router";

import { formatDay, formatTime } from "../lib/format";
import type { JournalItem } from "../lib/journal.server";
import { InviteMenu } from "./EventInvite";
import { PersonAvatar } from "./People";

// Le Journal des notifications (lot 17, ARCHITECTURE-SUITE § 2.4), rendu par l'onglet Le Fil (`/app/fil`) en attendant le
// lot R7e2. Lot R7c2 : la Boîte a disparu, sa page (`routes/journal.tsx`) aussi ; les notifications vivent dans l'Activité
// (`/app/activite`), ce composant n'est plus que la coquille du Fil (mêmes lignes qu'avant, sans les segments).

const pathOf = (item: JournalItem): string | null => {
  const raw = item.data.link ?? item.data.screen ?? null;
  return raw?.startsWith("/") && !raw.startsWith("//") ? raw : null;
};

/** Une notification du fil (lien vers son écran quand elle en a un). */
function JournalRow({ item }: { item: JournalItem }) {
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
        {item.body && (
          // Une invitation : la date et le lieu, puis chaque mot sur sa ligne (« Kenji_66 : « … » »).
          <span className={`s-journal__body${item.type === "event_invited" ? " s-prewrap" : ""}`}>{item.body}</span>
        )}
        <span className="o-t-caption s-muted">
          {formatDay(item.createdAt)} · {formatTime(item.createdAt)} · {notificationFamilyLabels[item.family]}
        </span>
      </div>
      {!item.readAt && <Chip>Nouveau</Chip>}
    </>
  );
  // Lot R6c (R6.6) : une invitation à un événement garde son titre et son corps ; « Voir la fiche » et « ⋯ » dessous
  // (un lien ne peut pas contenir le menu).
  if (item.type === "event_invited") {
    return (
      <li className="s-journal__item" data-testid="journal-item" data-type={item.type} data-read={Boolean(item.readAt)}>
        <div className="s-journal__link">{content}</div>
        <div className="ri-notif-acts">
          {path && (
            <Button variant="secondary" icon="next" href={path} data-testid="notif-invite-open">
              {eventInviteLabels.seeEvent}
            </Button>
          )}
          {actor && (
            <InviteMenu inviters={item.data.actors?.length ? item.data.actors : [actor]} testId="notif-invite-more" />
          )}
        </div>
      </li>
    );
  }
  return (
    <li className="s-journal__item" data-testid="journal-item" data-type={item.type} data-read={Boolean(item.readAt)}>
      {path ? (
        <a className="s-journal__link" href={path}>
          {content}
        </a>
      ) : (
        <div className="s-journal__link">{content}</div>
      )}
    </li>
  );
}

export type JournalData = {
  items: JournalItem[];
  nextCursor: string | null;
};

export function JournalView({
  loaderData,
  actionData,
  title,
}: {
  loaderData: JournalData;
  actionData?: { error?: string | null; notice?: string | null } | undefined;
  title: string;
}) {
  const { items, nextCursor } = loaderData;
  const here = useLocation().pathname;
  return (
    <div className="s-narrow s-stack" data-testid="journal">
      <h1 className="s-title">{title}</h1>
      <div className="s-row s-row--between">
        <h2 className="s-h2">{socialLabels.journal}</h2>
      </div>
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {actionData?.notice && (
        <p className="s-notice s-notice--ok" role="status" data-testid="journal-notice">
          {actionData.notice}
        </p>
      )}
      {items.length === 0 ? (
        <p className="s-notice">{socialLabels.journalEmpty}</p>
      ) : (
        <ul className="s-journal" data-testid="inbox-all">
          {items.map((item) => (
            <JournalRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button variant="secondary" icon="next" href={`${here}?suite=${encodeURIComponent(nextCursor)}`}>
          Plus ancien
        </Button>
      )}
    </div>
  );
}
