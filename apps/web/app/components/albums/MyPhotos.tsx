// « Tes photos » (lot R9f, maquette R9.7, `/app/albums/:id/mes-photos`) : les photos d'un album où je suis identifié, voiture ou pseudo.
// Même contenu que l'appli : l'en-tête du média, une ligne par photo (« Photo N », « Identifiée par … », « En story »,
// « Enregistrer », « … »), la feuille « … » (retirer mon identification | ce n'est pas ma voiture, signaler). **Aucun bouton
// principal**. « Enregistrer » télécharge le fichier crédité (inerte, avec sa raison, si le média ne l'autorise pas) ; « En story » reprend
// la photo avec le crédit du média, qui ne se retire pas. Aucune règle ici : tout vient de l'API.
import { Button, Chip, Icon } from "@orasso/design-system/web";
import {
  albumLabels,
  createOperationGate,
  albumTagLabels as L,
  liveStoryAt,
  type MyPhoto,
  type MyPhotosView,
  myPhotoTaggedBy,
  nextLiveStoryExpiry,
  proV2Labels,
  readIsQuiet,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigation, useRevalidator } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { listenSession } from "../../lib/sessionChannel";
import { latchStale } from "../../lib/sessionGuard";
import { PersonAvatar } from "../People";
import { ReportDialog } from "../ReportDialog";
import "../../styles/albums.css";

export function MyPhotos({
  view: loaded,
  albumId,
  myUserId,
}: {
  view: MyPhotosView;
  albumId: string;
  myUserId: string;
}) {
  // Relectures ordonnées : seule la dernière lancée s'applique (une réponse plus ancienne n'écrase ni la liste fraîche ni les retraits).
  const reads = useRef(createOperationGate());
  // La liste lue par la relecture d'après un retrait prime sur celle du chargement de la page, jusqu'au prochain chargement.
  const [fresh, setFresh] = useState<MyPhotosView | null>(null);
  const view = fresh ?? loaded;
  // Un nouveau chargement de la page (`loaded` : revalidation, autre compte) remplace la liste relue et périme toute relecture en route.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seulement au nouveau `loaded`
  useEffect(() => {
    reads.current.invalidate();
    setFresh(null);
    setReadError(null);
    setRereading(false);
    // Un retrait attend encore sa réconciliation (la page servie date d'avant le DELETE) : on relit.
    if (removedRef.current.size > 0) void reread();
  }, [loaded]);
  // Un autre compte annoncé par une autre fenêtre (sans nouveau chargement de cette page) : tout est périmé, rien des données n'est
  // rendu, puis la page est rechargée en entier. Une annonce de ce compte-ci est sans effet.
  const [stale, setStale] = useState(false);
  const staleRef = useRef(false);
  useEffect(
    () =>
      listenSession((announced) => {
        if (!latchStale(staleRef.current, myUserId, announced)) return;
        staleRef.current = true;
        reads.current.invalidate();
        setStale(true);
      }),
    [myUserId],
  );
  useEffect(() => {
    if (stale) window.location.reload();
  }, [stale]);
  // Page quittée (retour, autre lien) pendant la relecture : ni navigation ni mise à jour.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  // La page de départ d'une relecture : une 404 ne ramène à l'album que si l'utilisateur n'est pas parti ailleurs entre-temps.
  const here = useRef({ key: location.key, idle: navigation.state === "idle" });
  here.current = { key: location.key, idle: navigation.state === "idle" };
  // La relecture après un retrait a échoué (panne, pas une 404) : l'écran le dit, avec « Réessayer » ; les retraits ne sont réconciliés
  // qu'après une lecture réussie.
  const [readError, setReadError] = useState<string | null>(null);
  // L'heure au rendu : « Déjà en story » cesse à l'expiration de la story (rendu programmé, et au retour au premier plan).
  const [tick, setTick] = useState(0);
  const [sheet, setSheet] = useState<MyPhoto | null>(null);
  const [story, setStory] = useState<MyPhoto | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Les photos dont l'identification vient d'être retirée disparaissent tout de suite, sans attendre la relecture.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  // Lu par les relectures de routine : tant qu'un retrait attend sa réconciliation, aucune relecture n'est silencieuse.
  const removedRef = useRef<ReadonlySet<string>>(removed);
  removedRef.current = removed;
  const [rereading, setRereading] = useState(false);
  // Rangées par `tagId` : une photo peut porter deux identifications de moi ; retirer l'une laisse la photo (et son autre identification).
  // L'heure courante à chaque rendu (l'état `tick` ne sert qu'à provoquer le rafraîchissement) : une réponse reçue après l'expiration
  // d'une story ne bloque pas « En story ».
  const nowMs = Date.now();
  const photos = view.photos.filter((p) => !removed.has(p.tagId));
  const count = photos.length;
  const headline = view.vehicle ? L.photosOfYourCar(count, view.vehicle.label) : L.photosWhereIdentified(count);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reread` ne dépend que de refs et de l'album ; `tick` relance la programmation
  useEffect(() => {
    // Le retour au premier plan rafraîchit l'heure, quoi qu'il arrive.
    const onShow = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onShow);
    const next = nextLiveStoryExpiry(view.photos, Date.now());
    const id =
      next === null
        ? null
        : setTimeout(
            () => {
              setTick((n) => n + 1);
              // Jamais silencieuse tant qu'un retrait attend sa réconciliation (une panne doit se voir, avec « Réessayer »).
              void reread(removedRef.current.size === 0);
            },
            Math.min(Math.max(next - Date.now(), 0) + 250, 2 ** 31 - 1),
          );
    return () => {
      if (id !== null) clearTimeout(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [view, tick]);

  /** Relit `my-photos` (une seule lecture, ordonnée) ; `silent` : sans message d'erreur (relecture de routine). */
  async function reread(silent = false) {
    if (staleRef.current) return;
    // Des retraits en attente : la relecture n'est jamais silencieuse.
    const quiet = readIsQuiet(silent, removedRef.current.size);
    const latest = reads.current.start();
    const startKey = here.current.key;
    if (!quiet) setRereading(true);
    const next = await apiFetch<MyPhotosView>(`/me/albums/${encodeURIComponent(albumId)}/my-photos`, {
      timeoutMs: 15_000,
    });
    if (!alive.current || !latest() || staleRef.current) return;
    setRereading(false);
    if (next.ok) {
      setFresh(next.data);
      setRemoved(new Set());
      setReadError(null);
    } else if (next.status === 404) {
      // Plus aucune identification à mon nom : retour à l'album, sauf si l'utilisateur est déjà parti ailleurs (ou une page se charge).
      if (here.current.idle && here.current.key === startKey) navigate(`/albums/${albumId}`);
    } else if (!quiet) {
      setReadError(next.error.message);
    }
  }

  async function remove(photo: MyPhoto) {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/me/album-tags/${encodeURIComponent(photo.tagId)}`, { method: "DELETE", json: {} });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setSheet(null);
    setNote(L.screens.removed);
    setRemoved((cur) => new Set([...cur, photo.tagId]));
    // La sortie se décide sur la relecture : 404 = plus aucune identification à mon nom, on revient à l'album.
    await reread();
  }

  if (stale) {
    return (
      <div className="s-narrow s-stack" data-testid="my-photos-stale">
        <p role="status">Mise à jour…</p>
      </div>
    );
  }

  return (
    <div className="s-narrow s-stack" data-testid="my-photos">
      <h1 className="s-title">{L.myPhotos}</h1>
      <p className="o-t-caption s-muted">{view.album.event.title}</p>
      <div className="myp-who" data-testid="my-photos-who">
        <PersonAvatar url={view.media.logoUrl} pseudo={view.media.name} size={44} />
        <span className="myp-who__text">
          <strong data-testid="my-photos-media">{view.media.name}</strong>
          <span className="o-t-caption s-muted" data-testid="my-photos-headline">
            {headline}
          </span>
        </span>
      </div>
      {note && (
        <p className="s-notice" role="status" data-testid="my-photos-note">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="s-error" data-testid="my-photos-error">
          {error}
        </p>
      )}
      {readError && (
        <div role="alert" className="s-stack" data-testid="load-error">
          <p className="s-error">{readError}</p>
          <Button
            type="button"
            variant="secondary"
            icon="undo"
            onClick={() => void reread()}
            data-testid="load-error-retry"
          >
            {proV2Labels.retry}
          </Button>
        </div>
      )}
      {count === 0 && !readError && rereading && removed.size > 0 && (
        <p className="s-muted" role="status" data-testid="my-photos-loading">
          Chargement…
        </p>
      )}
      {count === 0 && !readError && !(rereading && removed.size > 0) && (
        <p className="s-muted">{L.screens.myPhotosEmpty}</p>
      )}
      <ul className="myp-list">
        {photos.map((p, i) => (
          <li key={p.id} className="myp-row" data-testid="my-photo">
            <span className="myp-row__thumb">
              <img src={p.url} alt="" loading="lazy" />
            </span>
            <span className="myp-row__text">
              <strong>{L.photoN(i + 1)}</strong>
              <span className="o-t-caption s-muted" data-testid="my-photo-by">
                {myPhotoTaggedBy(p.taggedBy, view.media.name)}
              </span>
              <span className="myp-row__actions">
                {liveStoryAt(p.liveStory, nowMs) ? (
                  // Déjà en story : l'écran le dit, sans formulaire de public ni de légende (rien à régler).
                  <span className="o-t-caption act-go" data-testid="my-photo-story-live">
                    {L.screens.storyAlready(L.screens.storyAudienceName(p.liveStory?.audience ?? "public"))}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    icon="camera"
                    disabled={!p.canStory}
                    onClick={() => setStory(p)}
                    data-testid="my-photo-story"
                  >
                    {L.inStory}
                  </Button>
                )}
                {p.canSave ? (
                  <Button
                    variant="secondary"
                    icon="export"
                    href={`/api/album-photos/${encodeURIComponent(p.id)}/download`}
                    data-testid="my-photo-save"
                  >
                    {L.save}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" icon="export" disabled data-testid="my-photo-save">
                    {L.save}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  icon="more"
                  onClick={() => {
                    setError(null);
                    setSheet(p);
                  }}
                  aria-label={albumLabels.more}
                  data-testid="my-photo-more"
                >
                  {albumLabels.more}
                </Button>
              </span>
              {!p.canSave && (
                <span className="o-t-caption s-muted" data-testid="my-photo-save-off">
                  {L.saveNotAllowed(view.media.name)}
                </span>
              )}
              {!p.canStory && (
                <span className="o-t-caption s-muted" data-testid="my-photo-story-off">
                  {L.errors.plateUnknown}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="o-t-caption s-muted" data-testid="my-photos-not-publications">
        {L.notMentions}
      </p>
      <SheetDialog open={sheet !== null} onClose={() => setSheet(null)} label={L.myPhotos}>
        {sheet && (
          <div className="myp-sheet" data-testid="photo-sheet">
            <p className="o-t-caption s-muted" data-testid="photo-sheet-intro">
              {sheet.taggedBy === "me"
                ? L.screens.sheetIntroSelf
                : L.screens.sheetIntroBy(sheet.taggedBy === "organizer" ? L.screens.organizerName : view.media.name)}
            </p>
            {error && (
              <p role="alert" className="s-error" data-testid="photo-sheet-error">
                {error}
              </p>
            )}
            <button
              type="button"
              className="myp-sheet__row"
              disabled={busy}
              onClick={() => void remove(sheet)}
              data-testid={sheet.taggedBy === "me" ? "photo-sheet-withdraw" : "photo-sheet-not-mine"}
            >
              <Icon name="close" size={20} />
              <span>
                <strong>{sheet.taggedBy === "me" ? L.withdrawMine : L.notMyCar}</strong>
                <span className="o-t-caption s-muted">
                  {sheet.taggedBy === "me"
                    ? L.photoStaysWith(view.media.name)
                    : L.isNotifiedDeclined(sheet.taggedBy === "organizer" ? L.screens.organizerName : view.media.name)}
                </span>
              </span>
            </button>
            <div className="myp-sheet__row" data-testid="photo-sheet-report">
              <ReportDialog
                targetType="album_photo"
                targetId={sheet.id}
                look="link"
                label={`${L.report} · ${L.awkwardOrPlate}`}
              />
            </div>
          </div>
        )}
      </SheetDialog>
      <StoryDialog
        photo={story}
        mediaName={view.media.name}
        myUserId={myUserId}
        onClose={() => setStory(null)}
        onDone={(text) => {
          setNote(text);
          revalidator.revalidate();
        }}
      />
    </div>
  );
}

/** Une fenêtre qui suit `open` (Échap la ferme et le dit au parent). */
function SheetDialog({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="tag-dialog"
      aria-label={label}
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="s-stack">
        <div className="tag-dialog__head">
          <h2 className="s-h2 tag-dialog__title">{label}</h2>
          <Button variant="close" label={L.screens.closePicker} onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** « En story » : la photo reprise telle quelle avec le crédit du média (non modifiable) ; qui la voit, légende, « Publier en story ». */
function StoryDialog({
  photo,
  mediaName,
  myUserId,
  onClose,
  onDone,
}: {
  photo: MyPhoto | null;
  mediaName: string;
  myUserId: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<"public" | "followers">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rejouée : la story de cette photo est déjà en ligne, l'API la rend telle quelle (ni public ni légende ne la modifient).
  const [done, setDone] = useState<{ replayed: boolean; audience: string } | null>(null);
  const shut = () => {
    setCaption("");
    setAudience("public");
    setError(null);
    setDone(null);
    onClose();
  };
  async function publish() {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ replayed: boolean; audience: string }>(
      `/album-photos/${encodeURIComponent(photo.id)}/share-to-story`,
      {
        method: "POST",
        json: { audience, caption: caption.trim() || null },
      },
    );
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    const shown = res.data.audience === "followers" ? L.screens.storyAudienceFollowers : L.screens.storyAudienceAll;
    setDone({ replayed: res.data.replayed, audience: shown });
    onDone(res.data.replayed ? L.screens.storyAlready(shown) : L.screens.storyShared(mediaName));
  }
  return (
    <SheetDialog open={photo !== null} onClose={shut} label={L.screens.storyTitle}>
      {photo && (
        <div className="s-stack" data-testid="story-dialog">
          <img className="myp-preview" src={photo.url} alt="" />
          <span className="myp-credit o-t-caption" data-testid="story-credit">
            {albumLabels.creditLine(mediaName)}
          </span>
          <p className="o-t-caption s-muted">{L.screens.storyCreditNote(mediaName)}</p>
          <p className="o-t-caption s-muted">{L.screens.storyPlateNote}</p>
          {done ? (
            <>
              <p className="s-notice" role="status" data-testid="story-done">
                {done.replayed
                  ? `${L.screens.storyAlready(done.audience)}. ${L.screens.storyAlreadyNote}`
                  : L.screens.storyDone}
              </p>
              <Button
                href={`/app/story/${encodeURIComponent(`u:${myUserId}`)}`}
                icon="next"
                variant="secondary"
                data-testid="story-see"
              >
                {L.screens.storySee}
              </Button>
            </>
          ) : (
            <>
              <label className="o-t-label" htmlFor="story-caption">
                {L.screens.storyCaption}
              </label>
              <input
                id="story-caption"
                className="s-input"
                value={caption}
                maxLength={120}
                onChange={(e) => setCaption(e.target.value)}
                data-testid="story-caption"
              />
              <span className="o-t-label">{L.screens.storyAudience}</span>
              <div className="tag-chips" role="radiogroup">
                <Chip selected={audience === "public"} onClick={() => setAudience("public")}>
                  {L.screens.storyAudienceAll}
                </Chip>
                <Chip selected={audience === "followers"} onClick={() => setAudience("followers")}>
                  {L.screens.storyAudienceFollowers}
                </Chip>
              </div>
              {error && (
                <p role="alert" className="s-error" data-testid="story-error">
                  {error}
                </p>
              )}
              <Button
                type="button"
                icon="camera"
                disabled={busy}
                onClick={() => void publish()}
                data-testid="story-publish"
              >
                {L.screens.storyPublish}
              </Button>
            </>
          )}
        </div>
      )}
    </SheetDialog>
  );
}
