// La section « Publications » de la fiche d'un événement sur le site (maquette R8.5 `ficheH`), mêmes mots, mêmes règles et mêmes
// états que l'appli : le journal de l'événement (les publications de l'organisateur rattachées à la fiche, l'épinglée en tête),
// les deux vues de la brique de R8b2, puis la ligne « Mentions · N ». Sans publication : rien (l'organisateur voit l'invitation
// « Publier pour cet événement »). **Sans session** : le journal en lecture (ni flamme active, ni commentaires, ni menu, vignettes
// sans lien) et pas de « Mentions ». Les droits viennent de l'API ; la page n'en décide pas.
import { Button, Icon } from "@orasso/design-system/web";
import {
  type FeedPostView,
  journalSection,
  eventJournalLabels as L,
  type PublicationsViewMode,
  pinGesture,
  showMentionsRow,
  viewMode,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import "../../styles/event-journal.css";
import { apiFetch } from "../../lib/api.client";
import { PostMenu } from "../publications/PostMenu";
import { PublicationsGrid } from "../publications/PublicationsGrid";
import { PublicationsOneByOne } from "../publications/PublicationsOneByOne";
import { ViewToggle } from "../publications/ViewToggle";
import { viewChoiceKey } from "../publications/viewChoice";
import { PublicJournalList } from "./PublicJournalList";
import { useJournal } from "./useJournal";

/** Le choix d'affichage est celui de la liste d'un profil (même clé, retenu par compte, dans le navigateur). */
function useViewMode(userId: string | null): [PublicationsViewMode, (mode: PublicationsViewMode) => void] {
  const [mode, setMode] = useState<PublicationsViewMode>("grid");
  useEffect(() => {
    if (!userId) return;
    try {
      setMode(viewMode(window.localStorage.getItem(viewChoiceKey(userId))));
    } catch {
      /* navigation privée : la grille */
    }
  }, [userId]);
  return [
    mode,
    (next) => {
      setMode(next);
      if (!userId) return;
      try {
        window.localStorage.setItem(viewChoiceKey(userId), next);
      } catch {
        /* rien à retenir */
      }
    },
  ];
}

export function EventJournal({
  eventId,
  eventSlug,
  structureId,
  structureName,
  count,
  mentions,
  hiddenMentions,
  manager,
  signedIn,
  userId,
  initial,
  anchorFil = false,
}: {
  eventId: string;
  eventSlug: string;
  structureId: string;
  structureName: string;
  /** `publications.count` de la fiche (le journal). */
  count: number | undefined;
  /** `mentions.count` de la fiche (absent sans session). */
  mentions: number | undefined;
  /** Responsable seulement : mentions masquées (la ligne reste pour les retrouver). */
  hiddenMentions?: number;
  /** Je suis responsable de la structure de l'événement : menus et invitation. */
  manager: boolean;
  signedIn: boolean;
  userId: string | null;
  /** La première page, lue par le chargeur (rendu serveur). */
  initial: { items: FeedPostView[]; nextCursor: string | null };
  /** L'ancien fil est caché : l'ancre `#fil` des anciens liens (notifications, espace Communication) mène ici. */
  anchorFil?: boolean;
}) {
  const list = useJournal(eventId, initial);
  const [mode, setMode] = useViewMode(userId);
  const [menu, setMenu] = useState<FeedPostView | null>(null);
  const isManager = manager && signedIn;
  const kind = journalSection({ count: list.items.length > 0 ? list.items.length : count, manager: isManager });
  const mentionsRow = showMentionsRow({ signedIn, count: mentions, hidden: hiddenMentions });
  if (kind === "none" && !mentionsRow) return null;

  const journal = signedIn ? (isManager ? { onMenu: setMenu } : {}) : { readOnly: true };
  const publishHref = `/app/fil/publier?structure=${encodeURIComponent(structureId)}&evenement=${encodeURIComponent(eventId)}`;

  async function togglePin(post: FeedPostView): Promise<string | null> {
    const res = await apiFetch(`/events/${encodeURIComponent(eventId)}/feed-posts/${encodeURIComponent(post.id)}/pin`, {
      method: pinGesture(post.pinned) === "pin" ? "PUT" : "DELETE",
    });
    if (!res.ok) return res.error.message || L.actionError;
    await list.reload();
    return null;
  }

  return (
    <section
      className="s-section evj"
      id={anchorFil ? "fil" : "publications"}
      aria-labelledby="evj-title"
      data-testid="event-journal"
    >
      {kind !== "none" ? (
        <>
          <h2 className="s-h2" id="evj-title" data-testid="journal-title">
            {L.title}
          </h2>
          <p className="s-muted evj__intro" data-testid="journal-intro">
            {L.intro(structureName, isManager)}
          </p>
        </>
      ) : null}

      {list.items.length > 0 ? (
        <div className="evj__list">
          {signedIn ? (
            <div className="evj__head">
              <ViewToggle value={mode} onChange={setMode} />
            </div>
          ) : null}
          {signedIn && mode === "one" ? (
            <PublicationsOneByOne posts={list.items} journal={journal} />
          ) : signedIn ? (
            <PublicationsGrid posts={list.items} journal={journal} />
          ) : (
            <PublicJournalList posts={list.items} />
          )}
          {list.error ? (
            <p className="s-notice" role="alert" data-testid="journal-error">
              {L.error}{" "}
              <button type="button" className="s-link" onClick={() => void list.retry()}>
                {L.retry}
              </button>
            </p>
          ) : null}
          {list.nextCursor && !list.error ? (
            <Button
              variant="secondary"
              icon="down"
              loading={list.loadingMore}
              onClick={() => void list.more()}
              data-testid="journal-more"
            >
              {L.more}
            </Button>
          ) : null}
        </div>
      ) : null}

      {kind === "invite" && list.items.length === 0 ? (
        <div className="s-card evj__invite" data-testid="journal-invite">
          <Icon name="camera" size={28} />
          <strong>{L.inviteTitle}</strong>
          <p className="s-muted">{L.inviteText}</p>
          <Button variant="secondary" icon="camera" href={publishHref} data-testid="journal-publish">
            {L.publishFor}
          </Button>
        </div>
      ) : null}

      {mentionsRow ? (
        <a
          className="evj__mentions"
          href={`/app/e/${encodeURIComponent(eventSlug)}/mentions`}
          data-testid="event-mentions-row"
        >
          <Icon name="profile" size={20} />
          <span>
            <strong>{L.mentionsRow(mentions ?? 0)}</strong>
            <small>{L.mentionsHint}</small>
          </span>
          <Icon name="next" size={16} />
        </a>
      ) : null}

      <PostMenu
        post={menu}
        canDelete={false}
        pin={menu ? { pinned: menu.pinned, onToggle: () => togglePin(menu) } : undefined}
        onClose={() => setMenu(null)}
      />
    </section>
  );
}
