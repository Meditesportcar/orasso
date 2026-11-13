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
  AlbumSendStopped,
  type AlbumView,
  albumTitle,
  canReopen,
  DEFAULT_PLATE_FRAME,
  decideAll,
  decidedCounts,
  isPhotoLocked,
  albumLabels as L,
  type MediaAccreditationView,
  PICK_PER_OPEN,
  type PlateRect,
  pickLimit,
  pickNotice,
  platedCount,
  type RemovalTarget,
  remaining,
  removeAlbumPhoto,
  reopenDecisions,
  sendAlbumPhotos,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import "../../styles/albums.css";
import "../../styles/garage.css";
import { listenSession } from "../../lib/sessionChannel";
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

/** Une réponse de l'API qui refuse (son statut est gardé pour les messages et les tests). */
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) throw new HttpStatusError(res.status, body?.error?.message ?? "Une erreur est survenue. Réessaie.");
  return body as T;
}

const call = (path: string, init: RequestInit = {}) =>
  fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });

const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Une réponse 204 n'a pas de corps : `json()` la lit comme vide. */
const noBody = (res: Response) =>
  res.status === 204 ? new Response("null", { status: 200, headers: { "content-type": "application/json" } }) : res;

/** Le navigateur a-t-il du réseau ? (« Retirer » en demande : hors ligne, il est désactivé avec son message.) */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function NewAlbumForm({
  accountId,
  mediaName,
  accreditations,
  draftEvents,
  resume,
}: {
  /** Le compte connecté : si un autre compte se connecte (autre onglet), le formulaire est mort. */
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
  // Photos déjà dans l'album avant cette séance (brouillon créé ou repris) : l'état du serveur, rien d'autre ; celles de la séance sont dans `items`.
  const [basePhotos, setBasePhotos] = useState<AlbumPhotoView[]>(resume?.photos ?? []);
  const base = basePhotos.length;
  const [items, setItems] = useState<Local[]>([]);
  const latest = useRef<Local[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState(
    resume && resume.title !== albumTitle(null, resume.event.title) ? resume.title : "",
  );
  const [allowSave, setAllowSave] = useState(resume?.allowSave ?? false);
  const [busyState, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);
  const online = useOnline();
  // Retrait en cours (clé de la photo) et dernier échec de retrait (clé + message) : la photo reste visible, « Réessayer ».
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<{ key: string; message: string } | null>(null);

  // **Formulaire mort au changement de compte** (un autre onglet connecte un autre compte) : jusqu'au rechargement, toutes les actions sont
  // désactivées, aucune requête ne part, aucune réponse en vol n'est appliquée. Une garde unique (`alive()`), avant chaque requête et avant
  // chaque application de réponse.
  const deadRef = useRef(false);
  const [dead, setDead] = useState(false);
  useEffect(
    () =>
      listenSession((announced) => {
        if (announced !== accountId) {
          deadRef.current = true;
          setDead(true);
        }
      }),
    [accountId],
  );
  const alive = () => !deadRef.current;
  // Une seule opération à la fois (envoi, retrait, création, transition) : tant qu'elle dure, tout est désactivé ; un second appui ne lance rien.
  const turn = useRef(false);
  const takeTurn = () => {
    if (turn.current || !alive()) return false;
    turn.current = true;
    return true;
  };
  const endTurn = () => {
    turn.current = false;
  };
  const busy = busyState || dead;

  // Les envois non utilisés (photo retirée avant l'ajout, cadres changés) : suppression au mieux, un essai, sans persistance (le serveur purge à 24 h).
  const cleanups = useRef<Promise<unknown>[]>([]);
  const retireUpload = (u: { id: string }) => {
    cleanups.current.push(
      fetch(`/api/me/uploads/${encodeURIComponent(u.id)}`, { method: "DELETE", credentials: "same-origin" }).then(
        undefined,
        () => undefined,
      ),
    );
  };
  const settleCleanups = async () => {
    await Promise.all(cleanups.current.splice(0));
  };

  // Le montage remet « arrêté » à faux : le mode strict de React démonte puis remonte aussitôt (en développement), sans cela un envoi serait
  // « interrompu » dès le départ.
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
      for (const i of latest.current) URL.revokeObjectURL(i.preview);
    };
  }, []);

  const update = (fn: (list: Local[]) => Local[]) => {
    latest.current = fn(latest.current);
    setItems(latest.current);
  };
  const patch = (clientId: string, p: Partial<Local>) =>
    update((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...p } : i)));
  // L'envoi fige tout : pendant qu'il tourne, ni les cadres, ni la décision, ni le bloc ne changent (l'état aussi, pas seulement les boutons).
  const frozen = useRef(false);
  const mutate = (fn: (list: Local[]) => Local[]) => {
    if (!frozen.current && alive()) update(fn);
  };
  const patchFrame = (clientId: string, p: Partial<Local>) =>
    mutate((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...p } : i)));

  async function createDraft() {
    if (!chosen || !takeTurn()) return;
    setBusy(true);
    setError(null);
    try {
      const a = await json<AlbumView>(
        await call("/me/albums", { method: "POST", body: JSON.stringify({ eventId: chosen, title: null }) }),
      );
      if (!alive()) return;
      setAlbum(a);
      setBasePhotos(a.photos);
      setAllowSave(a.allowSave);
      setTitle(a.title === albumTitle(null, a.event.title) ? "" : a.title);
      setStep(2);
    } catch (e) {
      if (alive()) setError((e as Error).message);
    } finally {
      endTurn();
      setBusy(false);
    }
  }

  function pick(files: FileList | null) {
    if (!files || !alive()) return;
    const room = Math.min(pickLimit(base + latest.current.length, 0), PICK_PER_OPEN);
    // Le plafond coupe la sélection : on le dit (30 photos par ouverture, 200 par album).
    setNotice(pickNotice(room, files.length));
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
   * **Le seul chemin de retrait d'une photo ajoutée** (séance, photo en vol, brouillon repris) : une opération serveur synchrone, qui demande du
   * réseau. La photo reste visible (« Retrait… ») jusqu'au 204 ; un échec la laisse en place avec son message et « Réessayer ». Vrai au 204.
   */
  async function removeServer(target: RemovalTarget): Promise<boolean> {
    const key = target.clientId ?? target.photoId ?? "";
    if (!album || !online || frozen.current || !takeTurn()) return false;
    setBusy(true);
    setRemoving(key);
    setRemoveError(null);
    try {
      await removeAlbumPhoto(target, {
        cancelByClient: async (id) => {
          await json(await call(`/me/albums/${album.id}/photos/by-client/${id}`, { method: "DELETE" }).then(noBody));
        },
        deleteByPhoto: async (id) => {
          await json(await call(`/me/albums/${album.id}/photos/${id}`, { method: "DELETE" }).then(noBody));
        },
      });
      return alive();
    } catch (e) {
      if (alive()) setRemoveError({ key, message: (e as Error).message });
      return false;
    } finally {
      setRemoving(null);
      endTurn();
      setBusy(false);
    }
  }

  /** Retire une photo de la séance : pas encore ajoutée, elle part de l'écran tout de suite ; sinon retrait serveur, puis elle part. */
  async function removeItem(clientId: string) {
    const gone = latest.current.find((i) => i.clientId === clientId);
    if (!gone || frozen.current || !alive()) return;
    if (gone.attempted || gone.photoId) {
      if (!(await removeServer({ clientId: gone.clientId, photoId: gone.photoId }))) return;
    }
    // L'envoi resté sans ajout (réponse perdue avant validation) n'est plus utile : suppression au mieux, un essai (le serveur purge à 24 h).
    if (gone.upload) retireUpload(gone.upload);
    URL.revokeObjectURL(gone.preview);
    update((list) => list.filter((i) => i.clientId !== clientId));
  }

  /** Retire une photo du brouillon repris (d'avant cette séance) : le même chemin. */
  async function removeBase(photo: AlbumPhotoView) {
    if (!(await removeServer({ clientId: photo.clientId, photoId: photo.id }))) return;
    setBasePhotos((list) => list.filter((p) => p.id !== photo.id));
  }

  /** « Réessayer » après un retrait refusé : le même chemin, pour la même photo. */
  function retryRemove(key: string) {
    const inSession = latest.current.find((i) => i.clientId === key);
    if (inSession) return void removeItem(inSession.clientId);
    const photo = basePhotos.find((p) => (p.clientId ?? p.id) === key);
    if (photo) void removeBase(photo);
  }

  async function send(): Promise<boolean> {
    if (!album) return false;
    setBusy(true);
    frozen.current = true;
    setError(null);
    try {
      await sendAlbumPhotos(latest.current, {
        upload: async (item, rects) => {
          if (!alive()) throw new AlbumSendStopped();
          const local = latest.current.find((i) => i.clientId === item.clientId);
          const form = new FormData();
          form.set("purpose", "album_photo");
          if (rects?.length) form.set("plateRects", JSON.stringify(rects));
          form.set("file", (local as Local).file);
          const res = await fetch("/api/me/uploads", { method: "POST", body: form, credentials: "same-origin" });
          const body = await json<{ id: string; key: string }>(res);
          if (!alive()) throw new AlbumSendStopped();
          return { id: body.id, key: body.key };
        },
        add: async (_item, body) => {
          if (!alive()) throw new AlbumSendStopped();
          const added = await json<{ id: string; url: string }>(
            await call(`/me/albums/${album.id}/photos`, { method: "POST", body: JSON.stringify(body) }),
          );
          if (!alive()) throw new AlbumSendStopped();
          return added;
        },
        retire: retireUpload,
        release: settleCleanups,
        onProgress: (current, total) => setProgress({ current, total }),
        onItem: (id, p) => {
          if (alive()) patch(id, p as Partial<Local>);
        },
        stopped: () => stopped.current || !alive(),
      });
      setProgress(null);
      return true;
    } catch (e) {
      setProgress(null);
      if (!(e instanceof AlbumSendStopped)) setError((e as Error).message);
      return false;
    } finally {
      frozen.current = false;
      setBusy(false);
    }
  }

  async function toDetails() {
    if (!album || !takeTurn()) return;
    try {
      if (remaining(latest.current).length > 0 && !(await send())) return;
      const fresh = await json<AlbumView>(await call(`/albums/${album.id}`));
      if (!alive()) return;
      setAlbum(fresh);
      setStep(3);
    } catch (e) {
      if (alive()) setError((e as Error).message);
    } finally {
      endTurn();
      setBusy(false);
    }
  }

  async function publish() {
    if (!album || !takeTurn()) return;
    setBusy(true);
    setError(null);
    try {
      await json(
        await call(`/me/albums/${album.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: title.trim(), allowSave }),
        }),
      );
      if (!alive()) return;
      const done = await json<AlbumView>(await call(`/me/albums/${album.id}/publish`, { method: "POST" }));
      if (!alive()) return;
      window.location.assign(`/albums/${done.id}`);
    } catch (e) {
      if (alive()) setError((e as Error).message);
      endTurn();
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
      {dead && (
        <p role="alert" className="s-error" data-testid="album-session-stale">
          {L.sessionChanged}
        </p>
      )}
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
                    onClick={() => mutate((list) => decideAll(list, "blurred"))}
                    data-testid="album-blur"
                  >
                    {L.blurAndAdd}
                  </Button>
                  <Button
                    variant="secondary"
                    icon="upload"
                    onClick={() => mutate((list) => decideAll(list, "kept"))}
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
                    onClick={() => mutate((list) => reopenDecisions(list))}
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
                    {removing === (p.clientId ?? p.id) && (
                      <span className="o-t-caption" data-testid="album-tile-removing">
                        {L.removing}
                      </span>
                    )}
                  </div>
                  <div className="alb-item__actions">
                    <Button
                      variant="secondary"
                      type="button"
                      icon="trash"
                      disabled={busy || !online}
                      onClick={() => void removeBase(p)}
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
                      {removing === i.clientId && (
                        <span className="o-t-caption" data-testid="album-tile-removing">
                          {L.removing}
                        </span>
                      )}
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
                              ? patchFrame(i.clientId, { marking: false })
                              : patchFrame(i.clientId, {
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
                        disabled={busy || (!online && Boolean(i.attempted || i.photoId))}
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
                        onChange={(rects: PlateRect[]) => patchFrame(i.clientId, { rects, edited: true })}
                        readOnly={busy}
                        testId="album-plate-editor"
                      />
                      <Button
                        variant="secondary"
                        type="button"
                        icon="close"
                        disabled={busy}
                        onClick={() => patchFrame(i.clientId, { rects: [], marking: false, edited: true })}
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

          {!online && (base > 0 || items.some((i) => i.attempted || i.photoId)) && (
            <p role="status" className="o-t-caption s-muted" data-testid="album-remove-offline">
              {L.needNetwork}
            </p>
          )}
          {removeError && (
            <p role="alert" className="s-error" data-testid="album-remove-error">
              {L.removeFailed} {removeError.message}{" "}
              <button
                type="button"
                className="alb-line"
                disabled={busy || !online}
                onClick={() => retryRemove(removeError.key)}
                data-testid="album-remove-retry"
              >
                {L.retry}
              </button>
            </p>
          )}
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
