// La section « Photos » de la fiche d'un événement (lot R9g, maquette R9.8 `e-photos`, `photosH`) : les albums publiés des médias accrédités,
// l'album officiel en tête (T43 : dès qu'un album publié existe, même pendant l'événement ; sinon rien). Par album : la mosaïque, le titre
// (jamais tronqué), « <média> · N photos », le tag « Album officiel », « Voir l'album » ; pour l'organisateur de l'événement, « … » (la
// feuille « officiel »). Sans session la section se voit (T34), sans aucune action.
import { Button, Icon } from "@orasso/design-system/web";
import { type AlbumSummary, albumsOrder, eventPhotosLabels as L, showPhotosSection } from "@orasso/shared";
import { useState } from "react";
import { useRevalidator } from "react-router";

import "../../styles/albums.css";
import { AlbumCover } from "../albums/AlbumCover";

export function PhotosSection({ albums, manager }: { albums: readonly AlbumSummary[]; manager: boolean }) {
  const revalidator = useRevalidator();
  const [menu, setMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = albumsOrder(albums);
  if (!showPhotosSection(list)) return null;

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
          {L.albumsCount(list.length)}
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
            <Button variant="secondary" icon="next" href={`/albums/${a.id}`} data-testid="event-photos-open">
              {L.seeAlbum}
            </Button>
          </li>
        ))}
      </ul>
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
