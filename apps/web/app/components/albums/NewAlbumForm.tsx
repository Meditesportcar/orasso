// « Nouvel album » sur le site (lot R9e, mêmes trois étapes que l'appli) : 1. l'événement (seulement ceux où le média est accrédité ; une
// accréditation en attente est grisée), 2. les photos (le floutage est **proposé, jamais imposé** : le site ne détecte pas les plaques, le média
// pose lui-même un cadre sur la photo (`PlateFrame`) ; les photos à cadre attendent **une décision pour le lot** « Flouter et ajouter » |
// « Envoyer telle quelle ») ; envoi une photo à la fois (`sendAlbumPhotos`, la logique de l'appli : reprise après coupure, `clientId`), 3. les
// détails et « Publier l'album ». Quitter en cours : le brouillon reste (« Reprendre l'album »).
import { Button, Icon } from "@orasso/design-system/web";
import {
  type AlbumCardView,
  type AlbumItem,
  type AlbumPhotoView,
  type AlbumView,
  albumTitle,
  canReopen,
  createRemovalQueue,
  DEFAULT_PLATE_FRAME,
  decideAll,
  decidedCounts,
  isPhotoLocked,
  albumLabels as L,
  type MediaAccreditationView,
  PICK_PER_OPEN,
  type PlateRect,
  pickLimit,
  platedCount,
  reconcile,
  remaining,
  reopenDecisions,
  sendAlbumPhotos,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import "../../styles/albums.css";
import "../../styles/garage.css";
import { AlbumCardBody } from "../fil/AlbumCard";
import { PlateFrame } from "../PlateFrame";

type Choice = { id: string; title: string; startsAt: string; state: "accredited" | "pending" };
type Local = AlbumItem & { file: File; preview: string; marking: boolean };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });

function choicesOf(list: readonly MediaAccreditationView[]): Choice[] {
  const pick = (status: MediaAccreditationView["status"], state: Choice["state"]) =>
    list
      .filter((a) => a.status === status)
      .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt))
      .map((a) => ({ id: a.event.id, title: a.event.title, startsAt: a.event.startsAt, state }));
  return [...pick("accepted", "accredited"), ...pick("pending", "pending")];
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new Error(body?.error?.message ?? "Une erreur est survenue. Réessaie.");
  return body as T;
}

const call = (path: string, init: RequestInit = {}) =>
  fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** La file persistante des envois à supprimer, rangée sous le compte connecté (jamais les envois de A dans la liste de B). */
function removalStore(accountId: string) {
  const key = `orasso.album-removals.${accountId}`;
  return {
    read: async () => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "[]") as { id: string; key: string }[];
      } catch {
        return [];
      }
    },
    write: async (list: { id: string; key: string }[]) => {
      try {
        if (list.length === 0) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(list));
      } catch {
        // Stockage refusé (navigation privée) : la file reste celle de cette page.
      }
    },
  };
}

/** Suppression d'un envoi : un fichier déjà parti (404) est une suppression réussie. */
async function removeUpload(upload: { id: string }): Promise<void> {
  const res = await fetch(`/api/me/uploads/${encodeURIComponent(upload.id)}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok && res.status !== 404) throw new Error(`Suppression refusée (${res.status})`);
}

export function NewAlbumForm({
  accountId,
  mediaName,
  accreditations,
  draftEvents,
  resume,
}: {
  /** Le compte connecté : la file des envois à supprimer lui appartient. */
  accountId: string;
  mediaName: string;
  accreditations: MediaAccreditationView[];
  /** Événements qui ont déjà un brouillon (« Reprendre l'album »). */
  draftEvents: string[];
  /** Un brouillon repris par son adresse (`?album=`) : on retombe sur l'étape des photos. */
  resume: AlbumView | null;
}) {
  const choices = useMemo(() => choicesOf(accreditations), [accreditations]);
  const firstAvailable = choices.find((c) => c.state === "accredited")?.id ?? null;
  const [step, setStep] = useState<1 | 2 | 3>(resume ? 2 : 1);
  const [chosen, setChosen] = useState<string | null>(resume?.event.id ?? firstAvailable);
  const [album, setAlbum] = useState<AlbumView | null>(resume);
  // Photos déjà dans l'album avant cette séance (brouillon créé ou repris) : figées à l'arrivée, celles de la séance sont dans `items`.
  const [basePhotos, setBasePhotos] = useState<AlbumPhotoView[]>(resume?.photos ?? []);
  const base = basePhotos.length;
  const [items, setItems] = useState<Local[]>([]);
  const latest = useRef<Local[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState(
    resume && resume.title !== albumTitle(null, resume.event.title) ? resume.title : "",
  );
  const [allowSave, setAllowSave] = useState(resume?.allowSave ?? false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);
  const queue = useMemo(
    () =>
      createRemovalQueue({
        remove: removeUpload,
        store: removalStore(accountId),
        // Une panne réseau (fetch rejeté) arrête la série ; un refus de l'API laisse l'envoi dans la liste sans bloquer les suivants.
        stops: (e) => e instanceof TypeError,
      }),
    [accountId],
  );
  // Le montage remet « arrêté » à faux : le mode strict de React démonte puis remonte aussitôt (en développement), sans cela un envoi serait
  // « interrompu » dès le départ.
  useEffect(() => {
    stopped.current = false;
    // Les suppressions restées en échec (hors ligne) sont rejouées à l'ouverture.
    void queue.replay();
    return () => {
      stopped.current = true;
      for (const i of latest.current) URL.revokeObjectURL(i.preview);
    };
  }, [queue]);

  const update = (fn: (list: Local[]) => Local[]) => {
    latest.current = fn(latest.current);
    setItems(latest.current);
  };
  const patch = (clientId: string, p: Partial<Local>) =>
    update((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...p } : i)));

  async function createDraft() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const a = await json<AlbumView>(
        await call("/me/albums", { method: "POST", body: JSON.stringify({ eventId: chosen, title: null }) }),
      );
      setAlbum(a);
      setBasePhotos(a.photos);
      setAllowSave(a.allowSave);
      setTitle(a.title === albumTitle(null, a.event.title) ? "" : a.title);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pick(files: FileList | null) {
    if (!files) return;
    const room = Math.min(pickLimit(base + latest.current.length, 0), PICK_PER_OPEN);
    // Le plafond coupe la sélection : on le dit (30 photos par ouverture, 200 par album).
    setNotice(files.length > room ? L.pickCut(room, files.length) : null);
    const fresh: Local[] = [...files].slice(0, room).map((file) => ({
      clientId: uuid(),
      uri: URL.createObjectURL(file),
      preview: "",
      file,
      width: 0,
      height: 0,
      rects: [],
      // Le site ne détecte pas les plaques : la photo est « regardée » d'emblée, un cadre posé à la main la marque.
      detected: true,
      marking: false,
    }));
    for (const i of fresh) i.preview = i.uri;
    update((list) => [...list, ...fresh]);
  }

  /**
   * Retire une photo de la séance. Pas encore ajoutée : son envoi est retiré (file). Ajoutée : `DELETE /me/albums/:id/photos/:photoId`. Ajout
   * demandé sans réponse : on la retrouve dans l'album par son `clientId` (aucune photo fantôme). Une erreur laisse la photo en place.
   */
  async function removeItem(clientId: string) {
    const gone = latest.current.find((i) => i.clientId === clientId);
    if (!gone) return;
    setError(null);
    try {
      if (album && gone.attempted && !gone.photoId) {
        const view = await json<AlbumView>(await call(`/albums/${album.id}`));
        const [found] = reconcile([gone], view.photos);
        if (found?.photoId)
          await json(await call(`/me/albums/${album.id}/photos/${found.photoId}`, { method: "DELETE" }));
      } else if (album && gone.photoId) {
        await json(await call(`/me/albums/${album.id}/photos/${gone.photoId}`, { method: "DELETE" }));
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (gone.upload) queue.retire({ id: gone.upload.id, key: gone.upload.key });
    URL.revokeObjectURL(gone.preview);
    update((list) => list.filter((i) => i.clientId !== clientId));
    void queue.release();
  }

  /** Retire une photo du brouillon repris (d'avant cette séance). */
  async function removeBase(photoId: string) {
    if (!album) return;
    setError(null);
    try {
      await json(await call(`/me/albums/${album.id}/photos/${photoId}`, { method: "DELETE" }));
      setBasePhotos((list) => list.filter((p) => p.id !== photoId));
      setAlbum(await json<AlbumView>(await call(`/albums/${album.id}`)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function send(): Promise<boolean> {
    if (!album) return false;
    setBusy(true);
    setError(null);
    try {
      await sendAlbumPhotos(latest.current, {
        upload: async (item, rects) => {
          const local = latest.current.find((i) => i.clientId === item.clientId);
          const form = new FormData();
          form.set("purpose", "album_photo");
          if (rects?.length) form.set("plateRects", JSON.stringify(rects));
          form.set("file", (local as Local).file);
          const res = await fetch("/api/me/uploads", { method: "POST", body: form, credentials: "same-origin" });
          const body = await json<{ id: string; key: string }>(res);
          return { id: body.id, key: body.key };
        },
        add: async (item, body) =>
          json<{ id: string; url: string }>(
            await call(`/me/albums/${album.id}/photos`, { method: "POST", body: JSON.stringify(body) }),
          ),
        retire: (u) => queue.retire(u),
        release: () => queue.release(),
        onProgress: (current, total) => setProgress({ current, total }),
        onItem: (id, p) => patch(id, p as Partial<Local>),
        stopped: () => stopped.current,
      });
      setProgress(null);
      return true;
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      // Ce qui a été retiré pendant l'envoi est supprimé sans bloquer la suite (la liste persistante garde ce qui échoue).
      void queue.release();
    }
  }

  async function toDetails() {
    if (!album) return;
    if (remaining(latest.current).length > 0 && !(await send())) return;
    try {
      setAlbum(await json<AlbumView>(await call(`/albums/${album.id}`)));
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publish() {
    if (!album) return;
    setBusy(true);
    setError(null);
    try {
      await json(
        await call(`/me/albums/${album.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: title.trim(), allowSave }),
        }),
      );
      const done = await json<AlbumView>(await call(`/me/albums/${album.id}/publish`, { method: "POST" }));
      window.location.assign(`/albums/${done.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const plated = platedCount(items);
  const needsDecision = plated > 0;
  const ready = base + items.length;
  const counts = decidedCounts(items);
  const decided = counts.blurred + counts.kept;
  // Les plaques floutées de l'album, comptées par le serveur (brouillon repris compris), relues avant l'étape des détails.
  const blurred = album?.blurredCount ?? 0;
  const summary = [
    counts.blurred > 0 ? L.blurredTitle(counts.blurred) : null,
    counts.kept > 0 ? L.keptTitle(counts.kept) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const preview: AlbumCardView | null = album
    ? {
        id: album.id,
        title: albumTitle(title, album.event.title),
        photosCount: album.photosCount,
        author: {
          key: album.media.key,
          kind: "media",
          name: mediaName,
          avatarUrl: album.media.logoUrl,
          verified: album.media.verified,
          pseudo: mediaName,
          grade: null,
          official: false,
        },
        attach: { event: { ...album.event, city: null }, role: "on_site", phase: "after", presenceValidated: false },
        cover: album.cover,
        official: false,
      }
    : null;

  return (
    <div className="s-stack" data-testid="album-flow">
      <div className="alb-steps" data-testid="album-steps" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} data-on={n <= step} />
        ))}
      </div>
      <p className="o-t-caption s-muted" data-testid="album-step-label">
        {L.step(step)}
      </p>

      {step === 1 && (
        <div className="s-stack">
          <div className="o-t-label">{L.chooseEvent}</div>
          {choices.length === 0 ? (
            <p role="status" data-testid="album-no-event">
              {L.noEvent} {L.noEventHint}
            </p>
          ) : (
            <fieldset className="alb-options" aria-label={L.chooseEvent}>
              {choices.map((c) => (
                <label
                  key={c.id}
                  className="alb-option"
                  aria-disabled={c.state === "pending"}
                  data-selected={chosen === c.id}
                >
                  <input
                    type="radio"
                    name="album-event"
                    value={c.id}
                    checked={chosen === c.id}
                    disabled={c.state === "pending"}
                    onChange={() => setChosen(c.id)}
                    data-testid={c.state === "pending" ? "album-event-pending" : "album-event"}
                  />
                  <Icon name={c.state === "pending" ? "wait" : "camera"} size={20} />
                  <span>
                    <strong>{c.title}</strong>
                    <br />
                    <span className="o-t-caption s-muted">{L.eventOption(day(c.startsAt), c.state)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="o-t-caption s-muted" data-testid="album-events-note">
            {L.eventsNote}
          </p>
          {error && (
            <p role="alert" className="s-error">
              {error}
            </p>
          )}
          <Button
            icon="next"
            disabled={busy || !chosen || !choices.some((c) => c.state === "accredited")}
            onClick={() => void createDraft()}
            data-testid="album-step1-continue"
          >
            {chosen && draftEvents.includes(chosen) ? L.resume : L.continue}
          </Button>
        </div>
      )}

      {step === 2 && album && (
        <div className="s-stack">
          <div className="alb-count" data-testid="album-count">
            <span className="alb-count__n">{ready}</span>
            <span>
              <strong>{L.photosReady}</strong>
              <br />
              <span className="o-t-caption s-muted">{L.compressedNote}</span>
            </span>
          </div>
          <label className="s-stack s-stack--tight">
            <span className="o-t-label">{L.add}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => {
                pick(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
              data-testid="album-pick"
            />
          </label>

          {notice && (
            <p role="status" className="o-t-caption" data-testid="album-pick-notice">
              {notice}
            </p>
          )}
          {(plated > 0 || decided > 0) && (
            <div className="alb-plates" data-testid="album-plates">
              <strong>{plated > 0 ? L.plateFound(plated) : summary}</strong>
              <span className="o-t-caption s-muted">
                {plated > 0
                  ? L.plateHint(plated)
                  : counts.blurred > 0 && counts.kept === 0
                    ? L.blurredHint
                    : counts.kept > 0 && counts.blurred === 0
                      ? L.keptHint
                      : `${L.blurredHint} ${L.keptHint}`}
              </span>
              {plated > 0 && (
                <div className="s-row">
                  <Button
                    variant="secondary"
                    icon="plate"
                    onClick={() => update((list) => decideAll(list, "blurred"))}
                    data-testid="album-blur"
                  >
                    {L.blurAndAdd}
                  </Button>
                  <Button
                    variant="secondary"
                    icon="upload"
                    onClick={() => update((list) => decideAll(list, "kept"))}
                    data-testid="album-keep"
                  >
                    {L.sendAsIs}
                  </Button>
                </div>
              )}
              {decided > 0 && plated > 0 && summary && <span className="o-t-caption s-muted">{summary}</span>}
              {canReopen(items) && (
                <div>
                  <Button
                    variant="secondary"
                    icon="undo"
                    disabled={busy}
                    onClick={() => update((list) => reopenDecisions(list))}
                    data-testid="album-change"
                  >
                    {L.change}
                  </Button>
                </div>
              )}
            </div>
          )}

          <ul className="alb-tiles" data-testid="album-grid">
            {basePhotos.map((p) => (
              <li key={p.id} className="s-stack s-stack--tight">
                <div className="alb-item">
                  <div className="alb-tile" data-testid="album-tile-base">
                    <img src={p.url} alt="" />
                  </div>
                  <div className="alb-item__actions">
                    <Button
                      variant="secondary"
                      type="button"
                      icon="trash"
                      disabled={busy}
                      onClick={() => void removeBase(p.id)}
                      aria-label={L.photoRemove}
                      data-testid="album-remove-base"
                    />
                  </div>
                </div>
              </li>
            ))}
            {items.map((i) => {
              const locked = isPhotoLocked(i);
              return (
                <li key={i.clientId} className="s-stack s-stack--tight">
                  <div className="alb-item">
                    <div className="alb-tile" data-testid="album-tile">
                      {/* Ajoutée : la version du serveur (floutée si « Flouter »), jamais l'original local. */}
                      <img src={i.photoId && i.serverUrl ? i.serverUrl : i.preview} alt="" />
                    </div>
                    <div className="alb-item__actions">
                      {!locked && (
                        <Button
                          variant="secondary"
                          type="button"
                          icon="plate"
                          disabled={busy}
                          onClick={() =>
                            i.marking
                              ? patch(i.clientId, { marking: false })
                              : patch(i.clientId, {
                                  marking: true,
                                  edited: true,
                                  rects: i.rects.length ? i.rects : [DEFAULT_PLATE_FRAME],
                                })
                          }
                          data-testid="album-mark"
                        >
                          {i.rects.length > 0 ? L.frameSet : L.framePlace}
                        </Button>
                      )}
                      {locked && (
                        <span className="o-t-caption s-muted" data-testid="album-decision-frozen">
                          {L.decisionFrozen}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        type="button"
                        icon="trash"
                        disabled={busy}
                        onClick={() => void removeItem(i.clientId)}
                        aria-label={L.photoRemove}
                        data-testid="album-remove"
                      />
                    </div>
                  </div>
                  {i.marking && !locked && (
                    <div className="s-stack s-stack--tight">
                      <PlateFrame
                        key={i.clientId}
                        src={i.preview}
                        alt={L.chosenPhoto}
                        name={`plate-${i.clientId}`}
                        initial={i.rects}
                        onChange={(rects: PlateRect[]) => patch(i.clientId, { rects, edited: true })}
                        testId="album-plate-editor"
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        icon="close"
                        onClick={() => patch(i.clientId, { rects: [], marking: false, edited: true })}
                        data-testid="album-unmark"
                      >
                        {L.frameRemove}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {progress && (
            <p role="status" data-testid="album-progress">
              {L.sendProgress(progress.current, progress.total)}
            </p>
          )}
          {error && (
            <p role="alert" className="s-error" data-testid="album-send-error">
              {error}
            </p>
          )}
          {needsDecision && <p data-testid="album-needs-decision">{L.plateDecision}</p>}
          <Button
            icon={error ? "undo" : "next"}
            disabled={busy || ready === 0 || needsDecision}
            onClick={() => void toDetails()}
            data-testid="album-step2-continue"
          >
            {error && remaining(items).length > 0 ? L.resumeSend : L.continue}
          </Button>
        </div>
      )}

      {step === 3 && album && preview && (
        <div className="s-stack">
          <label className="s-stack s-stack--tight">
            <span className="o-t-label">{L.titleField}</span>
            <input
              value={title}
              maxLength={80}
              placeholder={L.defaultTitle(album.event.title)}
              onChange={(e) => setTitle(e.target.value)}
              className="s-input"
              data-testid="album-title"
            />
            <span className="o-t-caption s-muted">{L.titleHelp}</span>
          </label>
          <div className="alb-lines">
            <div className="alb-line" data-testid="album-line-credit">
              <span>
                {L.credit} · « {L.creditLine(mediaName)} »
              </span>
              <span className="o-t-caption s-muted">{L.automatic}</span>
            </div>
            <div className="alb-line" data-testid="album-line-event">
              <span>
                {L.attachedTo} · {album.event.title}
              </span>
              <span className="o-t-caption s-muted">{L.fixed}</span>
            </div>
            <button type="button" className="alb-line" onClick={() => setStep(2)} data-testid="album-line-photos">
              <span>{L.photosAndPlates(album.photosCount, blurred)}</span>
              <span className="o-t-caption">{L.modify}</span>
            </button>
          </div>
          <label className="alb-option" data-selected={allowSave}>
            <input
              type="checkbox"
              checked={allowSave}
              onChange={(e) => setAllowSave(e.target.checked)}
              data-testid="album-allow-save"
            />
            <Icon name="upload" size={20} />
            <span>
              <strong>{L.allowSave}</strong>
              <br />
              <span className="o-t-caption s-muted">{allowSave ? L.allowSaveOn : L.allowSaveOff}</span>
            </span>
          </label>
          <section className="s-stack s-stack--tight" data-testid="album-preview">
            <div className="o-t-label">{L.whatOthersSee}</div>
            <div className="s-card s-stack s-stack--tight">
              <strong>{mediaName}</strong>
              <span className="o-t-caption s-muted">{L.mediaTag}</span>
              <AlbumCardBody album={preview} />
            </div>
          </section>
          {error && (
            <p role="alert" className="s-error" data-testid="album-publish-error">
              {error}
            </p>
          )}
          <Button icon="send" disabled={busy} onClick={() => void publish()} data-testid="album-publish">
            {L.publish}
          </Button>
        </div>
      )}
    </div>
  );
}
