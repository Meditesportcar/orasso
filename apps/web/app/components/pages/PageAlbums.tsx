// L'onglet « Albums » de la page d'un média, sur le site (lot R9h partie 2, T54 ; lot R9e de l'appli, maquette R9.5 `ALBS`) : les albums
// (vignette, titre jamais tronqué, événement, « N photos »), « Voir plus » au curseur, puis « Liens » (les contenus d'avant, `children`).
// Propriétaire : « Nouvel album » en tête (le seul bouton principal de l'onglet), ses brouillons y sont (« Brouillon ») ; vide : « Pas encore
// d'album. ». Visiteur : les albums publiés seulement, et rien du tout tant qu'il n'y en a pas (la section « Liens » reste). Après l'échec
// d'une page, « Réessayer » relit la suite, jamais une liste fusionnée à moitié.
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  type AlbumSummary,
  type AlbumsList,
  albumLabels,
  type MediaContentView,
  type MediaPage,
  mediaAppLabels as ML,
  pagesLabels,
} from "@orasso/shared";
import { type ReactNode, useEffect, useState } from "react";

import "../../styles/albums.css";
import { apiFetch } from "../../lib/api.client";

const ALBUMS_PAGE = 20;

export function PageAlbums({
  mediaId,
  owner,
  first,
  counts,
  children,
}: {
  mediaId: string;
  /** Le propriétaire lit ses albums (brouillons compris : `/me/albums`) ; un visiteur, les albums publiés. */
  owner: boolean;
  /** La première page, lue par le serveur ; `null` : la lecture a échoué. */
  first: AlbumsList | null;
  counts: Pick<MediaPage, "albumsCount" | "photosCount">;
  /** La section « Liens » (propre à l'écran). */
  children?: ReactNode;
}) {
  const [items, setItems] = useState<AlbumSummary[]>(first?.items ?? []);
  const [next, setNext] = useState<string | null>(first?.nextCursor ?? null);
  const [failed, setFailed] = useState(first === null);
  const [busy, setBusy] = useState(false);
  const base = owner ? "/me/albums" : `/media/${encodeURIComponent(mediaId)}/albums`;
  async function more() {
    setBusy(true);
    const res = await apiFetch<AlbumsList>(
      `${base}?limit=${ALBUMS_PAGE}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
    );
    setBusy(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems((list) => [...list, ...res.data.items.filter((a) => !list.some((x) => x.id === a.id))]);
    setNext(res.data.nextCursor);
  }
  const albums = counts.albumsCount ?? items.length;
  const photos = counts.photosCount ?? items.reduce((n, a) => n + a.photosCount, 0);
  return (
    <div className="s-stack" data-testid="page-albums">
      {owner ? (
        <div>
          <Button variant="primary" icon="add" href="/app/media/albums/nouveau" data-testid="page-album-new">
            {albumLabels.newAlbum}
          </Button>
        </div>
      ) : null}
      {items.length > 0 || failed || owner ? (
        <section className="s-stack" aria-labelledby="m-albums" data-testid="media-public-albums">
          <h2 id="m-albums" className="s-h2">
            {albumLabels.albums}
          </h2>
          <p className="o-t-caption s-muted" data-testid="media-public-albums-count">
            {pagesLabels.albumsLine(albums, photos)}
          </p>
          {items.length === 0 && !failed ? (
            <p className="o-t-body s-muted" data-testid="page-albums-empty">
              {albumLabels.empty}
            </p>
          ) : null}
          <ul className="alb-list">
            {items.map((a) => (
              <li key={a.id}>
                <a className="alb-row" href={`/albums/${a.id}`} data-testid="media-public-album">
                  <span className="alb-row__thumb">
                    {a.cover[0] ? <img src={a.cover[0].url} alt="" loading="lazy" decoding="async" /> : null}
                  </span>
                  <span className="alb-row__text">
                    <strong className="o-never-truncate">{a.title}</strong>
                    <span className="o-t-caption s-muted">
                      {a.event.title} · {albumLabels.photosCount(a.photosCount)}
                    </span>
                    {a.status === "draft" ? (
                      <span>
                        <Chip>{albumLabels.draft}</Chip>
                      </span>
                    ) : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {failed && (
            <Plate className="s-stack s-stack--tight" role="alert" data-testid="media-public-albums-error">
              <strong>{albumLabels.loadFailed}</strong>
              <div>
                <Button icon="undo" disabled={busy} onClick={() => void more()} data-testid="media-public-albums-retry">
                  {albumLabels.retry}
                </Button>
              </div>
            </Plate>
          )}
          {next !== null && !failed && (
            <div>
              <Button
                variant="secondary"
                icon="down"
                disabled={busy}
                onClick={() => void more()}
                data-testid="media-public-albums-more"
              >
                {albumLabels.loadMore}
              </Button>
            </div>
          )}
        </section>
      ) : null}
      {children}
    </div>
  );
}

type LinksPage = { items: MediaContentView[]; nextCursor: string | null };

/** « Liens » du propriétaire dans sa Page : les liens publiés (lus dans le navigateur, « Voir la suite » au curseur) et la porte vers leur gestion. */
export function PageOwnLinks({ mediaId }: { mediaId: string }) {
  const [items, setItems] = useState<MediaContentView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load(cursor: string | null) {
    setBusy(true);
    const res = await apiFetch<LinksPage>(
      `/media/${encodeURIComponent(mediaId)}/contents?kind=link&limit=${ALBUMS_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    setBusy(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems((list) => [...list, ...res.data.items.filter((c) => !list.some((x) => x.id === c.id))]);
    setNext(res.data.nextCursor);
  }
  // Lecture à l'ouverture de l'onglet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule lecture par média
  useEffect(() => {
    void load(null);
  }, [mediaId]);
  return (
    <section className="s-stack" aria-labelledby="m-own-links" data-testid="page-links">
      <h2 id="m-own-links" className="s-h2">
        {albumLabels.links}
        {items.length > 0 ? ` · ${items.length}${next ? "+" : ""}` : ""}
      </h2>
      {items.map((c) => (
        <article key={c.id} className="s-card s-stack s-stack--tight" data-testid="page-link">
          <div className="o-t-label s-label">
            {ML.kindOf(c)} · <a href={`/e/${c.event.slug}`}>{c.event.title}</a>
          </div>
          <h3 className="s-h2 o-never-truncate">
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.title}
              </a>
            ) : (
              c.title
            )}
          </h3>
        </article>
      ))}
      {failed && (
        <Plate className="s-stack s-stack--tight" role="alert" data-testid="page-links-error">
          <strong>{ML.contentsErrorTitle}</strong>
          <div>
            <Button icon="undo" disabled={busy} onClick={() => void load(next)} data-testid="page-links-retry">
              {ML.contentsRetry}
            </Button>
          </div>
        </Plate>
      )}
      {next && !failed && (
        <div>
          <Button variant="secondary" icon="down" disabled={busy} onClick={() => void load(next)}>
            {ML.exploreMore}
          </Button>
        </div>
      )}
      <div>
        <Button variant="secondary" icon="edit" href="/app/media?onglet=contenus" data-testid="page-links-manage">
          {pagesLabels.gestMedia}
        </Button>
      </div>
    </section>
  );
}
