// « Publier une story » sur le site (lot R7f3, D38, maquettes R7.8 `p-publier` et R7.22 `s-format`) : une photo (fichier), en
// cinq sections comme l'appli. 1 Photo ; 2 « Ajuster » si elle n'est pas en 9:16 (posée sur un fond flouté, glissement à la
// souris, molette ou − et + pour zoomer : le même `Frame` que l'appli et le serveur) ; 3 la plaque à la main (`PlateFrame`,
// pas de détection sur le site : « Trace le cadre sur la plaque, ou confirme qu'aucune n'est visible », décision
// obligatoire) ; 4 les détails (légende, @identification parmi ceux qui peuvent voir la story, événement, lieu, voiture,
// public) ; 5 l'aperçu 9:16 et « Publier pour 24 h ». Envoi : `POST /api/me/uploads` (purpose `story`) puis
// `POST /api/me/stories`. Lot R7g : « Choisir une vidéo » (30 s et 60 Mo au plus, H.264) saute « Ajuster » et la plaque (une
// vidéo est publiée telle quelle), s'envoie avec sa progression puis sa vignette. Pas d'appareil photo sur le site (réservé à l'appli). Casquette : passionné (les stories d'une
// structure ou d'une fiche pro se publient depuis l'appli).
import { Button, Icon } from "@orasso/design-system/web";
import {
  addTag,
  eventsWithPlace,
  fillFrame,
  fitDefault,
  frameState,
  isStoryRatio,
  storyPublishLabels as L,
  limitFrame,
  moveFrame,
  type PeopleSearchPage,
  type PlateRect,
  removeTag,
  STORY_CAPTION_MAX,
  STORY_PLACE_MAX,
  STORY_VIDEO_UPLOAD_PATH,
  STORY_VIDEO_UPLOAD_TIMEOUT_MS,
  type StoryAudienceOption,
  type StoryCreated,
  type StoryTagPick,
  storyVideoLabels as SV,
  sendIfAlive,
  storyAudienceOptions,
  storyBody,
  storyEventSticker,
  storyPlateDecided,
  storyPublishIssue,
  storyVideoBody,
  storyVideoLayout,
  taggableHint,
  taggableQuery,
  type UploadResult,
  vehicleWizardLabels as V,
  zoomPercent,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";

import "../../styles/fil.css";
import "../../styles/garage.css";
import "../../styles/stories.css";
import { apiFetch } from "../../lib/api.client";
import { FicheBar } from "../FicheBar";
import { PREPARE_FAILED } from "../fil/prepare";
import { PlateFrame } from "../PlateFrame";
import { Canvas } from "./Canvas";
import { prepareStoryPhoto, type StoryPhoto } from "./prepare";
import { ClipRefused, prepareStoryClip, releaseClip, type StoryClip } from "./prepareVideo";

export type PublishFormProps = {
  /** Mon réglage de compte : « public » ou « privé » (sous-titre de « Mes abonnés », autocollant d'événement). */
  visibility: "public" | "private";
  crews: { id: string; name: string; membersCount: number }[];
  vehicles: { id: string; label: string }[];
  applications: { status: string; event: { id: string; title: string; startsAt: string; status: string } }[];
  optionsFailed: boolean;
};

async function upload(file: File): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  const body = new FormData();
  body.append("purpose", "story");
  body.append("file", file);
  try {
    const res = await fetch("/api/me/uploads", { method: "POST", body, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as (UploadResult & { error?: { message: string } }) | null;
    if (res.status === 429) return { ok: false, message: L.tooManyRequests };
    if (!res.ok || !json?.key) return { ok: false, message: json?.error?.message ?? "Envoi impossible. Réessaie." };
    return { ok: true, key: json.key };
  } catch {
    return { ok: false, message: L.offline };
  }
}

/**
 * Envoi d'un fichier avec sa progression réelle (octets partis : `XMLHttpRequest`, `fetch` n'en donne pas). Une vidéo part
 * **brute** (`POST /api/me/uploads/story-video`, le fichier lui-même en corps, `Content-Length` posé par le navigateur) : le
 * serveur l'écrit en flux, sans la garder en mémoire. La vignette est un envoi ordinaire.
 */
function uploadWithProgress(
  file: File,
  purpose: "story_video" | "story_poster",
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, message: "" });
    const raw = purpose === "story_video";
    const body = new FormData();
    if (!raw) {
      body.append("purpose", purpose);
      body.append("file", file);
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", raw ? STORY_VIDEO_UPLOAD_PATH : "/api/me/uploads");
    xhr.withCredentials = true;
    if (raw) xhr.setRequestHeader("content-type", file.type === "video/quicktime" ? file.type : "video/mp4");
    xhr.timeout = STORY_VIDEO_UPLOAD_TIMEOUT_MS;
    // Page quittée : l'envoi s'arrête (rien n'est publié, le serveur efface le morceau reçu).
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const settled = () => signal?.removeEventListener("abort", onAbort);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      settled();
      let json: (UploadResult & { error?: { message: string } }) | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status === 429)
        return resolve({ ok: false, message: (raw && json?.error?.message) || L.tooManyRequests });
      if (xhr.status < 200 || xhr.status >= 300 || !json?.key) {
        return resolve({ ok: false, message: json?.error?.message ?? "Envoi impossible. Réessaie." });
      }
      resolve({ ok: true, key: json.key });
    };
    xhr.onerror = () => {
      settled();
      resolve({ ok: false, message: SV.offline });
    };
    // Délai dépassé : son propre message (la connexion est là, elle est trop lente).
    xhr.ontimeout = () => {
      settled();
      resolve({ ok: false, message: SV.uploadTimeout });
    };
    xhr.onabort = () => {
      settled();
      resolve({ ok: false, message: signal?.aborted ? "" : SV.offline });
    };
    xhr.send(raw ? file : body);
  });
}

export function PublishForm({ visibility, crews, vehicles, applications, optionsFailed }: PublishFormProps) {
  const [photo, setPhoto] = useState<StoryPhoto | null>(null);
  // Lot R7g : la vidéo choisie (jamais en même temps qu'une photo), ses clés d'envoi gardées pour une reprise.
  const [clip, setClip] = useState<StoryClip | null>(null);
  const [frame, setFrame] = useState(fitDefault(1, 1));
  const [rects, setRects] = useState<PlateRect[]>([]);
  const [noPlate, setNoPlate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [caption, setCaption] = useState("");
  const [place, setPlace] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [tags, setTags] = useState<StoryTagPick[]>([]);
  const [panel, setPanel] = useState<"tag" | "event" | "place" | "vehicle" | null>(null);
  const [audienceKey, setAudienceKey] = useState("followers");
  const [dropped, setDropped] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<StoryCreated | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ url: string; key: string } | null>(null);
  const clipKeys = useRef<{ url: string; video?: string; poster?: string } | null>(null);
  // Pendant l'envoi comme pendant la préparation d'une photo, rien de ce qui part ne bouge.
  const locked = busy || preparing;

  const events = eventsWithPlace(applications);
  const options: StoryAudienceOption[] = storyAudienceOptions(
    { persona: "fan" },
    visibility,
    crews.map((c) => ({ id: c.id, name: c.name, members: c.membersCount })),
  );
  // Le public choisi n'existe plus (crew quitté ou supprimé) : il reste invalide, rien ne part avant un nouveau choix.
  const chosen = options.find((o) => o.key === audienceKey);
  const lost = !chosen;
  const audience = chosen?.audience ?? "followers";
  const sticker = storyEventSticker(visibility, audience);
  const author = { persona: "fan" as const };

  // Pendant l'envoi, la page ne se quitte pas (✕, « Annuler », lien, retour du navigateur) : rien ne part après coup. Un
  // changement de page dans l'appli est bloqué ; un lien classique est neutralisé ; fermer l'onglet est signalé.
  const open = useRef(true);
  /** Envoi de vidéo en cours : annulé quand la page est quittée (R7g, tour 3). */
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
      uploadAbort.current?.abort();
    };
  }, []);
  const blocker = useBlocker(busy);
  useEffect(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!busy) return;
    const stop = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest("a[href]")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("click", stop, true);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("click", stop, true);
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy]);

  // L'aperçu de la photo est libéré à la sortie de la page.
  const live = useRef<StoryPhoto | null>(null);
  live.current = photo;
  const liveClip = useRef<StoryClip | null>(null);
  liveClip.current = clip;
  useEffect(
    () => () => {
      if (live.current) URL.revokeObjectURL(live.current.url);
      if (liveClip.current) releaseClip(liveClip.current);
    },
    [],
  );

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file || locked) return;
    setError(null);
    setPreparing(true);
    try {
      const next = await prepareStoryPhoto(file);
      if (!next) return setError(PREPARE_FAILED);
      if (photo) URL.revokeObjectURL(photo.url);
      if (clip) releaseClip(clip);
      setClip(null);
      clipKeys.current = null;
      uploaded.current = null;
      setPhoto(next);
      setFrame(fitDefault(next.width, next.height));
      setRects([]);
      setNoPlate(false);
      setConfirming(false);
    } catch {
      setError(PREPARE_FAILED);
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = "";
    }
  }

  /** Lot R7g : une vidéo choisie (poids, durée et H.264 vérifiés avant l'envoi : l'API reste juge). */
  async function pickVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file || locked) return;
    setError(null);
    setPreparing(true);
    try {
      const next = await prepareStoryClip(file);
      if (photo) URL.revokeObjectURL(photo.url);
      if (clip) releaseClip(clip);
      setPhoto(null);
      uploaded.current = null;
      clipKeys.current = null;
      setClip(next);
      setRects([]);
      setNoPlate(false);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ClipRefused ? e.message : SV.unreadable);
    } finally {
      setPreparing(false);
      if (videoInput.current) videoInput.current.value = "";
    }
  }

  const plate = { rects, noPlate, detection: "unavailable" as const };
  const issue = storyPublishIssue({
    hasPhoto: Boolean(photo || clip),
    preparing,
    plate: clip ? null : plate,
    caption,
    audienceLost: lost,
  });
  const needsFit = photo ? !isStoryRatio(photo.width, photo.height) : false;
  const event = events.find((e) => e.id === eventId) ?? null;
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  function chooseAudience(key: string) {
    const next = options.find((o) => o.key === key);
    if (!next || locked) return;
    const same = Boolean(chosen) && next.audience === audience && next.crewId === (chosen?.crewId ?? null);
    const nextTags = same ? tags : [];
    const nextEvent = next.audience === "crew" ? null : eventId;
    setDropped(nextTags.length !== tags.length || nextEvent !== eventId);
    setTags(nextTags);
    setEventId(nextEvent);
    setAudienceKey(next.key);
  }

  /** Vidéo : envoi avec progression, vignette, création (même reprise sans doublon que la photo). */
  async function publishClip(video: StoryClip) {
    if (busy || issue) return;
    setBusy(true);
    setError(null);
    const keys = clipKeys.current?.url === video.url ? clipKeys.current : { url: video.url };
    clipKeys.current = keys;
    if (!keys.video) {
      setProgress(SV.sendingPercent(0));
      const abort = new AbortController();
      uploadAbort.current = abort;
      const up = await uploadWithProgress(
        video.file,
        "story_video",
        (r) => {
          if (open.current) setProgress(SV.sendingPercent(Math.round(r * 100)));
        },
        abort.signal,
      );
      if (uploadAbort.current === abort) uploadAbort.current = null;
      if (!open.current) return;
      if (!up.ok) {
        setError(up.message);
        setBusy(false);
        setProgress(null);
        // Un refus du serveur (format, durée) : au nouvel essai, tout repart.
        clipKeys.current = null;
        return;
      }
      keys.video = up.key;
    }
    if (!keys.poster) {
      const up = await uploadWithProgress(video.poster, "story_poster", () => undefined);
      if (!up.ok) {
        setError(up.message);
        setBusy(false);
        setProgress(null);
        return;
      }
      keys.poster = up.key;
    }
    setProgress(L.publishing);
    const body = storyVideoBody({
      uploadKey: keys.video,
      posterKey: keys.poster,
      audience,
      crewId: chosen?.crewId ?? null,
      author,
      caption,
      place,
      vehicleId,
      eventId,
      tags,
    });
    const sent = await sendIfAlive(
      () => open.current,
      async () => undefined,
      async () => {
        const post = () => apiFetch<StoryCreated>("/me/stories", { method: "POST", json: body });
        const first = await post();
        if (!first.ok && first.status === 400 && first.error.code === "validation_error") return post();
        return first;
      },
    );
    if (!sent.sent) return;
    const res = sent.value;
    setBusy(false);
    setProgress(null);
    if (res.ok) {
      clipKeys.current = null;
      return setDone(res.data);
    }
    if (res.status === 429) return setError(L.tooManyRequests);
    if (res.status >= 400 && res.status < 500) clipKeys.current = null;
    setError(res.error.message);
  }

  async function publish() {
    if (clip) return publishClip(clip);
    if (!photo || busy || issue) return;
    setBusy(true);
    setError(null);
    let key = uploaded.current?.url === photo.url ? uploaded.current.key : null;
    if (!key) {
      setProgress(L.sending);
      const up = await upload(photo.file);
      if (!up.ok) {
        setError(up.message);
        setBusy(false);
        setProgress(null);
        return;
      }
      key = up.key;
      uploaded.current = { url: photo.url, key };
    }
    setProgress(L.publishing);
    const body = storyBody({
      uploadKey: key,
      frame,
      rects,
      noPlate,
      audience,
      crewId: chosen?.crewId ?? null,
      author,
      caption,
      place,
      vehicleId,
      eventId,
      tags,
    });
    // La page peut avoir été quittée malgré tout : rien n'est créé après coup (`sendIfAlive`).
    // Un 400 « image déjà utilisée » après une réponse perdue : on refait la requête une fois avec la même clé (elle
    // retrouve la story) avant d'oublier la clé.
    const sent = await sendIfAlive(
      () => open.current,
      async () => undefined,
      async () => {
        const post = () => apiFetch<StoryCreated>("/me/stories", { method: "POST", json: body });
        const first = await post();
        if (!first.ok && first.status === 400 && first.error.code !== "plate_decision_required") return post();
        return first;
      },
    );
    if (!sent.sent) return;
    const res = sent.value;
    setBusy(false);
    setProgress(null);
    if (res.ok) {
      uploaded.current = null;
      return setDone(res.data);
    }
    if (res.status === 429) return setError(L.tooManyRequests);
    // Une clé déjà envoyée peut avoir été refusée (image inconnue) : au nouvel essai, tout repart.
    if (res.status === 400) uploaded.current = null;
    setError(res.error.message);
  }

  if (done) {
    return (
      <div className="fil" data-testid="story-done">
        <FicheBar title={L.done} back="/app/fil" />
        <div className="story-done">
          <p className="o-t-body">
            {clip ? SV.doneText(L.doneAudience[audience]) : L.doneText(L.doneAudience[audience])}
          </p>
          {done.replayed ? (
            <p className="o-t-caption">{L.doneReplayed}</p>
          ) : done.skipped.length ? (
            <p className="o-t-caption">{L.doneSkipped}</p>
          ) : null}
        </div>
        <a className="fil-publish" href="/app/fil" data-testid="story-done-back">
          <Icon name="feed" size={20} /> {L.backToFeed}
        </a>
      </div>
    );
  }

  const state = photo ? frameState(frame, photo.width, photo.height) : "fit";
  const badge = !photo
    ? ""
    : state === "full"
      ? L.fitFull
      : state === "fit"
        ? L.fitPosed
        : L.fitZoom(zoomPercent(frame, photo.width, photo.height));
  const overlays = (
    <>
      {event || place.trim() || vehicle || tags.length ? (
        <div className="story-stickers">
          {event ? <Sticker icon="ticket" text={event.title} testId="story-sticker-event" /> : null}
          {place.trim() ? <Sticker icon="place" text={place.trim()} testId="story-sticker-place" /> : null}
          {vehicle ? <Sticker icon="vehicle" text={vehicle.label} testId="story-sticker-vehicle" /> : null}
          {tags.map((t) => (
            <Sticker key={t.id} icon="profile" text={`@${t.pseudo}`} testId="story-sticker-tag" />
          ))}
        </div>
      ) : null}
      {caption.trim() ? (
        <div className="story-caption" data-testid="story-caption-overlay">
          {caption.trim()}
        </div>
      ) : null}
    </>
  );

  return (
    <form
      className="fil fil-form story-form"
      data-testid="story-publish"
      onSubmit={(e) => {
        e.preventDefault();
        void publish();
      }}
    >
      <FicheBar title={L.title} facts={L.subtitle} back="/app/fil" />

      <section className="s-stack s-stack--tight">
        <h2 className="o-t-label">1 · Photo ou vidéo</h2>
        <p className="o-t-caption">{L.pickHintSite}</p>
        <p className="o-t-caption">{SV.pickHintSite}</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => void pick(e.currentTarget.files)}
          data-testid="story-file"
        />
        <Button
          type="button"
          variant="secondary"
          icon="gallery"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          {photo ? L.gallery : L.pickSite}
        </Button>
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/quicktime"
          hidden
          onChange={(e) => void pickVideo(e.currentTarget.files)}
          data-testid="story-video-file"
        />
        <Button
          type="button"
          variant="secondary"
          icon="video"
          disabled={locked}
          onClick={() => videoInput.current?.click()}
          data-testid="story-video-pick"
        >
          {SV.pickSite}
        </Button>
      </section>

      {photo && needsFit ? (
        <section className="s-stack s-stack--tight" data-testid="story-fit">
          <h2 className="o-t-label">2 · {L.fitTitle}</h2>
          <div className="story-fit">
            <Canvas
              src={photo.url}
              width={photo.width}
              height={photo.height}
              frame={frame}
              onFrame={locked ? undefined : (next) => setFrame(limitFrame(next, photo.width, photo.height))}
              testId="story-fit-canvas"
            >
              <span className="story-canvas__badge" data-testid="story-fit-badge">
                {badge}
              </span>
            </Canvas>
            <p className="o-t-caption">{state === "full" ? L.fitFullNote : L.fitNote}</p>
            <div className="story-fit__bar">
              <Button
                type="button"
                variant="secondary"
                icon="minus"
                disabled={locked}
                onClick={() => setFrame(moveFrame(frame, 1 / 1.25, 0, 0, photo.width, photo.height))}
                data-testid="story-fit-zoom-out"
              >
                {L.zoomOut}
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon="add"
                disabled={locked}
                onClick={() => setFrame(moveFrame(frame, 1.25, 0, 0, photo.width, photo.height))}
                data-testid="story-fit-zoom-in"
              >
                {L.zoomIn}
              </Button>
              {state !== "fit" ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="undo"
                  disabled={locked}
                  onClick={() => setFrame(fitDefault(photo.width, photo.height))}
                  data-testid="story-fit-reset"
                >
                  {L.reset}
                </Button>
              ) : null}
              {state !== "full" ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="crop"
                  disabled={locked}
                  onClick={() => setFrame(fillFrame(photo.width, photo.height))}
                  data-testid="story-fit-fill"
                >
                  {L.fill}
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {photo ? (
        <section className="s-stack s-stack--tight" data-testid="story-plate">
          <h2 className="o-t-label">
            {needsFit ? 3 : 2} · {L.plateTitle}
          </h2>
          <p className="o-t-caption">{L.plateIntro}</p>
          {noPlate ? (
            <>
              <img className="fil-preview" src={photo.url} alt={L.plateNoneBadge} />
              <p className="o-t-caption" data-testid="story-plate-state">
                {V.noPlateConfirmBody}
              </p>
              <Button
                type="button"
                variant="secondary"
                icon="undo"
                disabled={locked}
                onClick={() => setNoPlate(false)}
                data-testid="story-plate-blur"
              >
                {L.plateUndoNone}
              </Button>
            </>
          ) : (
            <>
              <PlateFrame
                key={photo.url}
                readOnly={locked}
                src={photo.url}
                alt={L.plateTitle}
                name="plateRects"
                initial={rects}
                testId="story-plate-editor"
                onChange={(next) => setRects((cur) => (cur === next ? cur : next))}
              />
              <p className="o-t-caption" data-testid="story-plate-state">
                {rects.length
                  ? storyPlateDecided({ rects, noPlate })
                    ? L.platePlaced(rects.length)
                    : L.platePlace
                  : L.plateSiteHint}
              </p>
              {confirming ? (
                <div className="fil-confirm" data-testid="story-plate-none-confirm">
                  <strong>{V.noPlateConfirmTitle}</strong>
                  <p className="o-t-caption">{V.noPlateConfirmBody}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    icon="check"
                    fullWidth
                    disabled={locked}
                    onClick={() => {
                      setNoPlate(true);
                      setRects([]);
                      setConfirming(false);
                    }}
                    data-testid="story-plate-none-yes"
                  >
                    {V.noPlateConfirm}
                  </Button>
                  <Button
                    type="button"
                    variant="plate"
                    icon="close"
                    fullWidth
                    disabled={locked}
                    onClick={() => setConfirming(false)}
                  >
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon="eye"
                  disabled={locked}
                  onClick={() => setConfirming(true)}
                  data-testid="story-plate-none"
                >
                  {L.plateNone}
                </Button>
              )}
            </>
          )}
          <p className="o-t-caption">{V.irreversible}</p>
        </section>
      ) : null}

      {photo || clip ? (
        <section className="s-stack s-stack--tight" data-testid="story-details">
          <h2 className="o-t-label">
            {clip ? 2 : needsFit ? 4 : 3} · {L.details}
          </h2>
          {clip ? (
            <p className="o-t-caption" data-testid="story-video-asis">
              {SV.asIsLine}
            </p>
          ) : null}
          <label className="s-field">
            <span className="o-t-label">{L.caption}</span>
            <textarea
              value={caption}
              maxLength={STORY_CAPTION_MAX}
              rows={2}
              placeholder={L.captionPlaceholder}
              disabled={busy}
              onChange={(e) => setCaption(e.currentTarget.value)}
              data-testid="story-caption"
            />
            <span className="o-t-caption">{L.captionHint}</span>
          </label>

          <div className="o-t-label">{L.tools}</div>
          <div className="story-tools" data-testid="story-tools">
            <ToolChip
              on={panel === "tag" || tags.length > 0}
              disabled={locked}
              onClick={() => setPanel(panel === "tag" ? null : "tag")}
            >
              {L.toolTag}
            </ToolChip>
            <ToolChip
              on={panel === "event" || Boolean(event)}
              disabled={locked || !sticker.allowed}
              onClick={() => setPanel(panel === "event" ? null : "event")}
            >
              {L.toolEvent}
            </ToolChip>
            <ToolChip
              on={panel === "place" || Boolean(place.trim())}
              disabled={locked}
              onClick={() => setPanel(panel === "place" ? null : "place")}
            >
              {L.toolPlace}
            </ToolChip>
            <ToolChip
              on={panel === "vehicle" || Boolean(vehicle)}
              disabled={locked}
              onClick={() => setPanel(panel === "vehicle" ? null : "vehicle")}
            >
              {L.toolVehicle}
            </ToolChip>
          </div>
          {!sticker.allowed ? (
            <p className="o-t-caption" data-testid="story-event-disabled">
              {L.eventTitle} : {sticker.reason}
            </p>
          ) : null}
          {dropped ? (
            <p className="o-t-caption" data-testid="story-dropped">
              Ce public ne voit pas tout : les identifications et l&apos;événement qui n&apos;y valent plus ont été
              retirés.
            </p>
          ) : null}

          {panel === "tag" ? (
            <TagSearch
              tags={tags}
              onTags={setTags}
              taggable={taggableQuery({ audience, crewId: chosen?.crewId ?? null, persona: "fan" })}
              hint={taggableHint(audience, visibility, "fan")}
              disabled={locked}
            />
          ) : null}
          {panel === "event" && sticker.allowed ? (
            <div className="s-stack s-stack--tight" data-testid="story-event-panel">
              <strong>{L.eventTitle}</strong>
              {events.length ? (
                <div className="fil-chips">
                  {events.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={eventId === e.id ? "fil-chip is-on" : "fil-chip"}
                      aria-pressed={eventId === e.id}
                      disabled={locked}
                      onClick={() => setEventId(eventId === e.id ? null : e.id)}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="o-t-caption">{L.eventNone}</p>
              )}
              <p className="o-t-caption">{eventId ? L.eventWarn : L.eventHint}</p>
            </div>
          ) : null}
          {panel === "place" ? (
            <label className="s-field" data-testid="story-place-panel">
              <span className="o-t-label">{L.placeTitle}</span>
              <input
                type="text"
                value={place}
                maxLength={STORY_PLACE_MAX}
                placeholder={L.placePlaceholder}
                disabled={locked}
                onChange={(e) => setPlace(e.currentTarget.value)}
                data-testid="story-place"
              />
              <span className="o-t-caption">{L.placeHint}</span>
            </label>
          ) : null}
          {panel === "vehicle" ? (
            <div className="s-stack s-stack--tight" data-testid="story-vehicle-panel">
              <strong>{L.vehicleTitle}</strong>
              {vehicles.length ? (
                <div className="fil-chips">
                  {vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={vehicleId === v.id ? "fil-chip is-on" : "fil-chip"}
                      aria-pressed={vehicleId === v.id}
                      disabled={locked}
                      onClick={() => setVehicleId(vehicleId === v.id ? null : v.id)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="o-t-caption">{L.vehicleNone}</p>
              )}
            </div>
          ) : null}
          {optionsFailed ? (
            <p className="o-t-caption">
              Ta voiture, tes crews et tes événements n&apos;ont pas pu être chargés : tu peux publier sans.
            </p>
          ) : null}

          <div className="o-t-label">{L.audienceTitle}</div>
          <fieldset className="story-group" data-testid="story-audience">
            <legend className="fil-sr">{L.audienceTitle}</legend>
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={chosen?.key === o.key}
                className="story-option"
                disabled={locked}
                onClick={() => chooseAudience(o.key)}
                data-testid={`story-audience-${o.audience}`}
              >
                <Icon name={o.audience === "crew" ? "shield" : "profile"} size={20} />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.hint}</small>
                </span>
              </button>
            ))}
          </fieldset>
          <p className="o-t-caption">{L.audienceNote}</p>
        </section>
      ) : null}

      {clip ? (
        <section className="story-preview" data-testid="story-preview">
          <h2 className="o-t-label">3 · {L.previewTitle}</h2>
          <div className="story-canvas" data-testid="story-preview-canvas">
            <div className="story-video" data-layout={storyVideoLayout(clip.width, clip.height)}>
              {storyVideoLayout(clip.width, clip.height) === "blurred" ? (
                <img className="story-video__back" src={clip.posterUrl} alt="" draggable={false} />
              ) : null}
              {/* biome-ignore lint/a11y/useMediaCaption: aperçu muet d'une vidéo de l'utilisateur, sans piste de sous-titres. */}
              <video
                className="story-video__media"
                src={clip.url}
                poster={clip.posterUrl}
                muted
                loop
                autoPlay
                playsInline
                data-testid="story-preview-video"
              />
            </div>
            {overlays}
          </div>
          <p className="o-t-caption">{SV.previewNote}</p>
        </section>
      ) : null}

      {photo ? (
        <section className="story-preview" data-testid="story-preview">
          <h2 className="o-t-label">
            {needsFit ? 5 : 4} · {L.previewTitle}
          </h2>
          <Canvas
            src={photo.url}
            width={photo.width}
            height={photo.height}
            frame={frame}
            plateRects={noPlate ? undefined : rects}
            testId="story-preview-canvas"
          >
            {overlays}
          </Canvas>
          <p className="o-t-caption">{L.previewNote}</p>
        </section>
      ) : null}

      {error ? (
        <p className="s-error" role="alert" data-testid="story-error">
          {error}
        </p>
      ) : null}
      {progress ? (
        <p className="o-t-caption" role="status" data-testid="story-progress">
          {progress}
        </p>
      ) : issue ? (
        <p className="o-t-caption" data-testid="story-missing">
          {issue}
        </p>
      ) : null}
      <Button type="submit" icon="send" fullWidth disabled={busy || Boolean(issue)} data-testid="story-publish-send">
        {L.publish}
      </Button>
      {busy ? (
        <span className="fil-link" aria-disabled="true" data-testid="story-cancel">
          <Icon name="close" size={16} /> Annuler
        </span>
      ) : (
        <a className="fil-link" href="/app/fil" data-testid="story-cancel">
          <Icon name="close" size={16} /> Annuler
        </a>
      )}
    </form>
  );
}

function Sticker({
  icon,
  text,
  testId,
}: {
  icon: "ticket" | "place" | "vehicle" | "profile";
  text: string;
  testId: string;
}) {
  return (
    <span className="story-sticker" data-testid={testId}>
      <Icon name={icon} size={14} /> {text}
    </span>
  );
}

function ToolChip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={on ? "fil-chip is-on" : "fil-chip"}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** @identification : la liste ne propose que ceux qui pourraient voir la story (l'API filtre : `taggableFor`). */
function TagSearch({
  tags,
  onTags,
  taggable,
  hint,
  disabled,
}: {
  tags: StoryTagPick[];
  onTags: (next: StoryTagPick[]) => void;
  taggable: ReturnType<typeof taggableQuery>;
  hint: string;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PeopleSearchPage["items"] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const text = q.replace(/^@/, "").trim();
  const { taggableFor, crewId, persona } = taggable;

  useEffect(() => {
    if (text.length < 2) {
      setResults(null);
      setState("idle");
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      setState("loading");
      const params = new URLSearchParams({ q: text, limit: "8", taggableFor, persona });
      if (crewId) params.set("crewId", crewId);
      const res = await apiFetch<PeopleSearchPage>(`/users/search?${params}`);
      if (stale) return;
      if (res.ok) {
        setResults(res.data.items);
        setState("idle");
      } else setState("error");
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [text, taggableFor, crewId, persona]);

  const free = (results ?? []).filter((p) => !tags.some((t) => t.id === p.userId));
  return (
    <div className="story-people" data-testid="story-tag-picker">
      <label className="s-field">
        <span className="o-t-label">{L.tagFieldLabel}</span>
        <input
          type="text"
          value={q}
          placeholder={L.tagPlaceholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setQ(e.currentTarget.value)}
          data-testid="story-tag-input"
        />
      </label>
      <p className="o-t-caption">{hint}</p>
      {text.length > 0 && text.length < 2 ? <p className="o-t-caption">{L.tagTyping}</p> : null}
      {state === "loading" ? <p className="o-t-caption">{L.tagSearching}</p> : null}
      {state === "error" ? (
        <p className="s-error" role="alert">
          {L.tagFailed}
        </p>
      ) : null}
      {results && state === "idle" && free.length === 0 ? (
        <p className="o-t-caption" data-testid="story-tag-none">
          {L.tagNone}
        </p>
      ) : null}
      {free.slice(0, 6).map((p) => (
        <button
          key={p.userId}
          type="button"
          className="story-person"
          disabled={disabled}
          onClick={() => {
            onTags(addTag(tags, { id: p.userId, pseudo: p.pseudo }));
            setQ("");
            setResults(null);
          }}
          data-testid="story-tag-result"
        >
          <Icon name="profile" size={16} /> @{p.pseudo}
        </button>
      ))}
      {tags.length ? (
        <div className="fil-chips">
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="fil-chip is-on"
              aria-label={L.tagRemove(t.pseudo)}
              disabled={disabled}
              onClick={() => onTags(removeTag(tags, t.id))}
              data-testid="story-tag-chosen"
            >
              @{t.pseudo} <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      ) : null}
      {tags.length ? <p className="o-t-caption">{L.tagWarn(tags.map((t) => t.pseudo).join(", "))}</p> : null}
    </div>
  );
}
