// Les actions de l'organisateur sur une photo d'album, dans la visionneuse du site (lot R9g, maquette R9.8 `ossheetH`) : « Reprendre dans le
// journal de l'événement » (légende, « Ce que verront les autres », « Publier » ; le crédit du média est conservé) et « Choisir cet album
// comme « officiel » » / « Retirer « officiel » ». Les appels partent du navigateur vers l'API (même origine, cookie de session) ; les
// refus de l'API (déjà reprise, ancienne galerie…) s'affichent dans la fenêtre.
import { Button } from "@orasso/design-system/web";
import {
  type AlbumView,
  eventPhotosLabels as L,
  repostCaptionDefault,
  repostRefusal,
  repostWindowOpen,
} from "@orasso/shared";
import { useState } from "react";
import { useRevalidator } from "react-router";

import "../../styles/albums.css";

type Failure = { error?: { code?: string; message?: string } };

export function OrganizerActions({ album, photo }: { album: AlbumView; photo: { key: string; url: string } }) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [caption, setCaption] = useState(repostCaptionDefault(album.media.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const base = `/api/events/${album.event.id}/albums/${album.id}`;

  async function failure(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as Failure | null;
    return repostRefusal(body?.error?.code) ?? body?.error?.message ?? fallback;
  }

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`${base}/photos/${photo.key}/repost`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caption: caption.trim() || null }),
    }).catch(() => null);
    if (res?.ok) {
      const post = (await res.json()) as { author: { name: string } };
      setDone(L.repostDone(post.author.name, album.media.name));
      setOpen(false);
    } else {
      setError(await failure(res, L.repostFailed));
    }
    setBusy(false);
  }

  async function official() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`${base}/official`, {
      method: album.official ? "DELETE" : "PUT",
      credentials: "same-origin",
    }).catch(() => null);
    if (res?.ok) revalidator.revalidate();
    else setError(await failure(res, L.officialFailed));
    setBusy(false);
  }

  // Contenu frais : la reprise n'est proposée que 30 jours après la publication de l'album (l'API refuse au-delà).
  const repostOpen = repostWindowOpen(album.publishedAt, new Date());

  return (
    <div className="alb-org" data-testid="album-organizer-actions">
      {repostOpen && (
        <>
          <Button
            variant="secondary"
            icon="send"
            type="button"
            onClick={() => {
              setOpen(!open);
              setDone(null);
            }}
            aria-expanded={open}
            data-testid="album-repost-open"
          >
            {L.repostAction}
          </Button>
          <span className="o-t-caption s-muted">{L.repostHint(album.media.name)}</span>
          {open && (
            <div className="alb-repost" data-testid="album-repost-form">
              <label className="o-t-label" htmlFor="album-repost-caption">
                {L.repostCaption}
              </label>
              <textarea
                id="album-repost-caption"
                className="s-input"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2000}
                rows={2}
                data-testid="album-repost-caption"
              />
              <span className="o-t-caption s-muted">{L.repostCaptionHint}</span>
              <p className="o-t-caption s-muted">{L.repostWhatOthersSee}</p>
              <div className="alb-repost__preview">
                <img src={photo.url} alt="" />
                <span className="credit-overlay o-t-caption">{L.creditOnPhoto(album.media.name)}</span>
              </div>
              <span className="o-t-caption s-muted">{L.repostedFoot}</span>
              <Button
                icon="send"
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                data-testid="album-repost-publish"
              >
                {busy ? L.repostPublishing : L.repostPublish}
              </Button>
            </div>
          )}
        </>
      )}
      <Button
        variant="secondary"
        icon="star"
        type="button"
        disabled={busy}
        onClick={() => void official()}
        data-testid="album-official-toggle"
      >
        {album.official ? L.removeOfficial : L.makeOfficial}
      </Button>
      <span className="o-t-caption s-muted">{album.official ? L.removeOfficialHint : L.makeOfficialHint}</span>
      {done && (
        <p role="status" data-testid="album-repost-done">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="s-error" data-testid="album-organizer-error">
          {error}
        </p>
      )}
    </div>
  );
}
