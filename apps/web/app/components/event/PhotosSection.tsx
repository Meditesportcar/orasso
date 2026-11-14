// La section « Photos » de la fiche d'un événement (lot R9g, maquette R9.8 `e-photos`, `photosH`) : les albums publiés des médias accrédités,
// l'album officiel en tête (T43 : dès qu'un album publié existe, même pendant l'événement ; sinon rien). Par album : la mosaïque, le titre
// (jamais tronqué), « <média> · N photos », le tag « Album officiel », « Voir l'album » ; pour l'organisateur de l'événement, « … » (la
// feuille « officiel »). Sans session la section se voit (T34), sans aucune action. Une panne de lecture n'est pas « aucun album » : le message
// et « Réessayer » ; au-delà de la première page (50 albums), « Voir plus d'albums » (le total vient de l'API).
import { Button, Icon } from "@orasso/design-system/web";
import { type AlbumSummary, albumsOrder, eventPhotosLabels as L, showPhotosSection } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import "../../styles/albums.css";
import { AlbumCover } from "../albums/AlbumCover";

/**
 * Une vue de l'album à son ouverture depuis la fiche (R9e : « voir les vues » ne disparaît pas) : une par ouverture, la navigation ne l'annule pas
 * (`keepalive`), un échec est sans suite (la prochaine ouverture réessaie ; le serveur dédoublonne par session et par heure).
 */
function countView(albumId: string) {
  void fetch(`/api/media-contents/${albumId}/view`, {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

export function PhotosSection({
  albums,
  manager,
  countViews,
  failed = false,
  total,
  nextCursor = null,
  moreUrl,
}: {
  albums: readonly AlbumSummary[];
  manager: boolean;
  /** Compter une vue à l'ouverture d'un album : seulement avec une session, et depuis la fiche (jamais depuis la gestion de l'événement). */
  countViews: boolean;
  /** La lecture de la liste a échoué (autre chose qu'une absence) : le message et « Réessayer », pas une section vide. */
  failed?: boolean;
  /** Le nombre d'albums visibles au total (la première page n'en porte que 50). */
  total?: number;
  nextCursor?: string | null;
  /** La route de la liste (sans curseur) : « Voir plus d'albums » y lit la page suivante. */
  moreUrl?: string;
}) {
  const revalidator = useRevalidator();
  // Les pages suivantes : jetées quand la première page est relue (le chargeur rend une nouvelle liste).
  const [more, setMore] = useState<{ items: AlbumSummary[]; cursor: string | null } | null>(null);
  const [moreFailed, setMoreFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la liste relue repart de la première page.
  // Génération de la liste : une page suivante partie avant une actualisation est ignorée (jamais d'album retiré réinjecté).
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setMore(null);
    setMoreFailed(false);
    setLoadingMore(false);
  }, [albums]);
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = new Set<string>();
  const list = albumsOrder([...albums, ...(more?.items ?? [])]).filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  const cursor = more ? more.cursor : nextCursor;
  if (failed && list.length === 0) {
    return (
      <section className="s-section" id="photos" data-testid="event-photos" aria-labelledby="photos-title">
        <h2 className="s-h2 alb-sec__head" id="photos-title">
          <Icon name="camera" size={18} />
          <span>{L.title}</span>
        </h2>
        <p className="s-error" role="alert" data-testid="event-photos-error">
          {L.loadFailed}
        </p>
        <Button
          variant="secondary"
          icon="undo"
          type="button"
          onClick={() => revalidator.revalidate()}
          data-testid="event-photos-retry"
        >
          {L.retry}
        </Button>
      </section>
    );
  }
  if (!showPhotosSection(list)) return null;

  async function loadMore() {
    if (!cursor || !moreUrl || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const started = generation.current;
    const res = await fetch(
      `${moreUrl}${moreUrl.includes("?") ? "&" : "?"}limit=50&cursor=${encodeURIComponent(cursor)}`,
      {
        credentials: "same-origin",
      },
    ).catch(() => null);
    const page = res?.ok
      ? ((await res.json().catch(() => null)) as { items: AlbumSummary[]; nextCursor: string | null } | null)
      : null;
    if (started !== generation.current) return;
    if (page) setMore((m) => ({ items: [...(m?.items ?? []), ...page.items], cursor: page.nextCursor }));
    else setMoreFailed(true);
    setLoadingMore(false);
  }

  async function toggle(a: AlbumSummary) {
    setError(null);
    const res = await fetch(`/api/events/${a.event.id}/albums/${a.id}/official`, {
      method: a.official ? "DELETE" : "PUT",
      credentials: "same-origin",
    }).catch(() => null);
    if (res?.ok) {
      setMenu(null);
      setNotice(a.official ? L.officialRemoved : L.officialDone(a.media.name));
      revalidator.revalidate();
    } else {
      setError(L.officialFailed);
    }
  }

  return (
    <section className="s-section" id="photos" data-testid="event-photos" aria-labelledby="photos-title">
      <h2 className="s-h2 alb-sec__head" id="photos-title">
        <Icon name="camera" size={18} />
        <span>{L.title}</span>
        <span className="o-t-caption s-muted" data-testid="event-photos-count">
          {L.albumsCount(Math.max(total ?? 0, list.length))}
        </span>
      </h2>
      <ul className="alb-list">
        {list.map((a) => (
          <li key={a.id} className="alb-card" data-testid="event-photos-album">
            <div className="alb-card__head">
              <AlbumCover photos={a.cover} label={a.title} className="alb-cover--small" testId="event-photos-cover" />
              <div className="alb-card__text">
                <strong className="o-never-truncate" data-testid="event-photos-album-title">
                  {a.title}
                </strong>
                <span className="o-t-caption s-muted">{L.mediaLine(a.media.name, a.photosCount)}</span>
                {a.official && (
                  <span className="alb-tag alb-tag--accent o-t-caption" data-testid="event-photos-official">
                    {L.officialAlbum}
                  </span>
                )}
              </div>
              {manager && (
                <button
                  type="button"
                  className="alb-more"
                  aria-label={L.albumMenu}
                  aria-expanded={menu === a.id}
                  onClick={() => setMenu(menu === a.id ? null : a.id)}
                  data-testid="event-photos-more"
                >
                  <Icon name="more" size={20} />
                </button>
              )}
            </div>
            {manager && menu === a.id && (
              <div className="alb-card__menu" data-testid="event-photos-menu">
                <Button
                  variant="secondary"
                  icon="star"
                  type="button"
                  onClick={() => void toggle(a)}
                  data-testid="event-photos-official-toggle"
                >
                  {a.official ? L.removeOfficial : L.makeOfficial}
                </Button>
                <span className="o-t-caption s-muted">{a.official ? L.removeOfficialHint : L.makeOfficialHint}</span>
              </div>
            )}
            <Button
              variant="secondary"
              icon="next"
              href={`/albums/${a.id}`}
              onClick={countViews ? () => countView(a.id) : undefined}
              data-testid="event-photos-open"
            >
              {L.seeAlbum}
            </Button>
          </li>
        ))}
      </ul>
      {cursor && moreUrl && (
        <Button
          variant="secondary"
          icon="down"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMore()}
          data-testid="event-photos-more-albums"
        >
          {L.moreAlbums}
        </Button>
      )}
      {moreFailed && (
        <p className="s-error" role="alert" data-testid="event-photos-more-error">
          {L.loadFailed}{" "}
          <button type="button" className="s-link" onClick={() => void loadMore()}>
            {L.retry}
          </button>
        </p>
      )}
      {notice && (
        <p className="s-muted" role="status" data-testid="event-photos-notice">
          {notice}
        </p>
      )}
      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      <p className="o-t-caption s-muted">{L.footnote}</p>
    </section>
  );
}
