// Les publications d'une structure vues **sans session** (point T4, lot R8g), rendues côté serveur depuis la liste blanche de
// l'API (`PublicPostView`) : la photo, la date et le lieu, la légende, « Info importante » le cas échéant. Ni flamme, ni
// commentaires, ni menu. Un visiteur peut lire la suite : « Voir plus » charge la page suivante dans le navigateur.

import { Button } from "@orasso/design-system/web";
import {
  appendUnique,
  aspectOfPhotos,
  feedPublishLabels as FP,
  importantReasonLabels,
  publicationsLabels as PL,
  type PublicPostsPage,
  type PublicPostView,
  tileMeta,
} from "@orasso/shared";
import { useState } from "react";

import "../../styles/fil.css";
import "../../styles/pages.css";
import { apiFetch } from "../../lib/api.client";
import { FeedPhotos } from "../fil/Cards";

export function PublicPublications({
  authorKey,
  name,
  first,
}: {
  authorKey: string;
  name: string;
  /** La première page, lue par le serveur. `null` : la lecture n'a pas abouti. */
  first: PublicPostsPage | null;
}) {
  const [items, setItems] = useState<PublicPostView[]>(first?.items ?? []);
  const [next, setNext] = useState<string | null>(first?.nextCursor ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!first)
    return (
      <div className="pub-state" role="alert" data-testid="load-error">
        <p className="o-t-body">{PL.error}</p>
      </div>
    );
  if (items.length === 0)
    return (
      <div className="pub-state" data-testid="publications-empty">
        <strong>{PL.emptyOtherTitle}</strong>
        <p className="o-t-caption">{PL.emptyOtherText(name)}</p>
      </div>
    );
  const now = new Date();
  async function more() {
    if (!next) return;
    setBusy(true);
    setFailed(false);
    const res = await apiFetch<PublicPostsPage>(
      `/authors/${encodeURIComponent(authorKey)}/feed-posts?cursor=${encodeURIComponent(next)}`,
    );
    setBusy(false);
    if (!res.ok) return setFailed(true);
    setItems((list) => appendUnique(list, res.data.items));
    setNext(res.data.nextCursor);
  }
  return (
    <div className="pg-public" data-testid="public-publications">
      {items.map((post) => {
        const meta = tileMeta(post, now);
        return (
          <article key={post.id} className="pg-public__card" data-testid="public-publication">
            {post.photos.length > 0 ? (
              <FeedPhotos
                post={{
                  photos: post.photos,
                  aspect: aspectOfPhotos(post.photos),
                  author: { pseudo: post.author.name } as never,
                }}
              />
            ) : null}
            <div className="pg-public__body">
              {post.important ? (
                <span className="o-t-label pg-public__tag">
                  {FP.important} · {importantReasonLabels[post.important.reason]}
                </span>
              ) : null}
              <b>{PL.tileLabel(meta.date, meta.place)}</b>
              {post.caption ? <p className="s-prewrap">{post.caption}</p> : null}
            </div>
          </article>
        );
      })}
      {failed ? (
        <p className="s-error" role="alert">
          {PL.error}
        </p>
      ) : null}
      {next ? (
        <Button
          variant="secondary"
          icon="down"
          disabled={busy}
          onClick={() => void more()}
          data-testid="publications-more"
        >
          {PL.more}
        </Button>
      ) : null}
    </div>
  );
}
