// « Publier au Fil » sur le site (lot R7e2, D38, maquette R7.24) : 1 à 6 photos (fichiers), recadrage 4:5 par défaut avec
// bascule 1:1 / paysage (canvas, mêmes calculs que l'appli : `feedCropPlan`), la plaque de chaque photo (cadre posé à la main
// avec `PlateFrame`, ou « Aucune plaque visible » confirmée : obligatoire, sinon le bouton est grisé avec la ligne qui dit
// quoi), un mot (500 au plus), la voiture et l'événement. Envoi photo par photo (`POST /api/me/uploads`, purpose
// `feed_post`), puis `POST /api/me/feed-posts`. Pas de détection automatique de plaque sur le site (elle vit dans l'appli).
import { Button, Icon } from "@orasso/design-system/web";
import {
  DEFAULT_FEED_ASPECT,
  eventsWithPlace,
  FEED_ASPECT_RATIOS,
  FEED_CAPTION_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedPostView,
  feedAspectLabels,
  feedCropPlan,
  feedPostBody,
  feedScreenLabels as L,
  type PlateRect,
  publishIssue,
  type UploadResult,
  vehicleWizardLabels as V,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import "../../styles/garage.css";
import { apiFetch } from "../../lib/api.client";
import { FicheBar } from "../FicheBar";
import { PlateFrame } from "../PlateFrame";
import { SquareCrop } from "../SquareCrop";
import { rememberPublished } from "./mine";

type Item = {
  key: string;
  /** La photo choisie, telle quelle : le recadrage repart d'elle quand le format change. */
  source: File;
  /** La photo recadrée (celle qui part) et son aperçu. */
  cropped: File;
  url: string;
  rects: PlateRect[];
  noPlate: boolean;
  /** Le centre choisi au doigt (« Glisse pour recadrer », 0 à 1) ; absent : le centre de la photo. */
  focus?: { x: number; y: number };
};

const ASPECTS: FeedAspect[] = ["portrait_4_5", "square", "landscape"];
const ASPECT_SHORT: Record<FeedAspect, string> = { portrait_4_5: "4:5", square: "1:1", landscape: "Paysage" };

/** Recadre une photo au format (centré) et la rend en JPEG ; le fichier d'origine si elle ne se lit pas. */
async function crop(file: File, aspect: FeedAspect, focus?: { x: number; y: number }): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const plan = feedCropPlan(bitmap.width, bitmap.height, aspect, focus);
  const canvas = document.createElement("canvas");
  canvas.width = plan.outWidth;
  canvas.height = plan.outHeight;
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, plan.originX, plan.originY, plan.width, plan.height, 0, 0, plan.outWidth, plan.outHeight);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
}

async function upload(file: File): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
  const body = new FormData();
  body.append("purpose", "feed_post");
  body.append("file", file);
  try {
    const res = await fetch("/api/me/uploads", { method: "POST", body, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as (UploadResult & { error?: { message: string } }) | null;
    if (res.status === 429) return { ok: false, message: L.tooManyRequests };
    if (!res.ok || !json?.key) return { ok: false, message: json?.error?.message ?? "Envoi impossible. Réessaie." };
    return { ok: true, key: json.key };
  } catch {
    return { ok: false, message: "Connexion impossible. Réessaie." };
  }
}

export function PublishForm({
  userId,
  vehicles,
  applications,
  optionsFailed,
}: {
  userId: string;
  vehicles: { id: string; label: string }[];
  applications: { status: string; event: { id: string; title: string; startsAt: string; status: string } }[];
  optionsFailed: boolean;
}) {
  const [aspect, setAspect] = useState<FeedAspect>(DEFAULT_FEED_ASPECT);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);
  // La confirmation « Aucune plaque visible » porte la clé de la photo qu'elle concerne (jamais l'index : une photo retirée
  // ferait passer la suivante à sa place).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formatNote, setFormatNote] = useState(false);
  // « Recadrer » : la clé de la photo qu'on recadre au doigt.
  const [cropping, setCropping] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // Pendant l'envoi comme pendant un recadrage, rien de ce qui part ne bouge : l'écran montre exactement ce qui est envoyé.
  const locked = busy || preparing;
  const [clientId] = useState(() => crypto.randomUUID());
  const keys = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const events = eventsWithPlace(applications);

  // Les aperçus sont libérés à la sortie de la page (pas à chaque changement : ceux qui restent servent encore).
  const live = useRef<Item[]>([]);
  live.current = items;
  useEffect(
    () => () => {
      for (const i of live.current) URL.revokeObjectURL(i.url);
      generation.current++;
    },
    [],
  );

  async function pick(files: FileList | null) {
    if (!files?.length || locked) return;
    setError(null);
    setPreparing(true);
    const gen = generation.current;
    const room = FEED_POST_PHOTOS_MAX - items.length;
    const fresh: Item[] = [];
    for (const file of [...files].slice(0, room)) {
      const cropped = await crop(file, aspect);
      fresh.push({
        key: crypto.randomUUID(),
        source: file,
        cropped,
        url: URL.createObjectURL(cropped),
        rects: [],
        noPlate: false,
      });
    }
    setPreparing(false);
    if (gen !== generation.current) {
      for (const f of fresh) URL.revokeObjectURL(f.url);
      return;
    }
    setItems((list) => [...list, ...fresh].slice(0, FEED_POST_PHOTOS_MAX));
    if (input.current) input.current.value = "";
  }

  async function changeAspect(next: FeedAspect) {
    if (locked || next === aspect) return;
    const gen = ++generation.current;
    setAspect(next);
    setConfirmKey(null);
    if (!items.length) return;
    setFormatNote(true);
    setPreparing(true);
    const again: Item[] = [];
    for (const i of items) {
      const cropped = await crop(i.source, next);
      again.push({ ...i, cropped, url: URL.createObjectURL(cropped), rects: [], noPlate: false });
    }
    setPreparing(false);
    if (gen !== generation.current) {
      for (const f of again) URL.revokeObjectURL(f.url);
      return;
    }
    setItems(again);
    keys.current = {};
  }

  const index = Math.min(current, Math.max(0, items.length - 1));
  const item = items[index];
  // La confirmation « Aucune plaque visible » est celle de la photo affichée : elle ne suit pas la photo suivante.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la confirmation se ferme quand on change de photo.
  useEffect(() => setConfirmKey(null), [index, item?.key, item?.url]);

  /** Un nouveau cadrage au doigt : la photo est recadrée sur ce centre, sa décision de plaque repart de zéro. */
  async function recropAt(key: string, focus: { x: number; y: number }) {
    const target = items.find((i) => i.key === key);
    setCropping(null);
    if (!target) return;
    setPreparing(true);
    const gen = generation.current;
    const cropped = await crop(target.source, aspect, focus);
    setPreparing(false);
    if (gen !== generation.current) return;
    const url = URL.createObjectURL(cropped);
    URL.revokeObjectURL(target.url);
    delete keys.current[target.key + target.url];
    patch(key, (i) => ({ ...i, cropped, url, focus, rects: [], noPlate: false }));
  }
  const issue = publishIssue({ photos: items, caption, preparing });

  async function publish() {
    if (busy || issue) return;
    setBusy(true);
    setError(null);
    const uploaded: string[] = [];
    for (const [i, p] of items.entries()) {
      setProgress(L.sending(i + 1, items.length));
      let key = keys.current[p.key + p.url];
      if (!key) {
        const up = await upload(p.cropped);
        if (!up.ok) {
          setError(up.message);
          setBusy(false);
          setProgress(null);
          return;
        }
        key = up.key;
        keys.current[p.key + p.url] = key;
      }
      uploaded.push(key);
    }
    setProgress(L.publishing);
    const body = feedPostBody({
      photos: items.map((p, i) => ({ rects: p.rects, noPlate: p.noPlate, uploadKey: uploaded[i] as string })),
      caption,
      aspect,
      vehicleId,
      eventId,
      clientId,
    });
    const res = await apiFetch("/me/feed-posts", { method: "POST", json: body });
    setBusy(false);
    setProgress(null);
    if (res.ok) {
      // Ma publication passe en tête du Fil (l'API ne la met pas dans « Abonnements »).
      rememberPublished(userId, res.data as FeedPostView);
      return setDone(true);
    }
    if (res.status === 429) return setError(L.tooManyRequests);
    if (res.error.code === "plate_decision_required") {
      const at = Number((res.error as { details?: { photoIndex?: number } }).details?.photoIndex);
      if (Number.isFinite(at)) setCurrent(at);
    }
    if (res.status === 400) keys.current = {};
    setError(res.error.message);
  }

  const patch = (key: string, fn: (i: Item) => Item) =>
    setItems((list) => list.map((i) => (i.key === key ? fn(i) : i)));
  const badge = (i: Item) => (i.rects.length ? L.plateOk : i.noPlate ? L.plateNone : L.plateTodo);

  if (done) {
    return (
      <div className="fil" data-testid="fil-publish-done">
        <FicheBar title={L.published} back="/app/fil" />
        <p className="o-t-body">{L.publishedText}</p>
        <a className="fil-publish" href="/app/fil" data-testid="fil-publish-back">
          <Icon name="feed" size={20} /> {L.backToFeed}
        </a>
        <a className="fil-link" href="/app/fil/mes-publications">
          <Icon name="gallery" size={16} /> {L.mineTitle}
        </a>
      </div>
    );
  }

  const cropTarget = cropping ? items.find((i) => i.key === cropping) : undefined;
  return (
    <form
      className="fil fil-form"
      data-testid="fil-publish"
      onSubmit={(e) => {
        e.preventDefault();
        void publish();
      }}
    >
      <FicheBar title={L.publishTitle} facts={L.publishSubtitle} back="/app/fil" />
      {cropTarget ? (
        <SquareCrop
          key={cropTarget.key}
          file={cropTarget.source}
          ratio={FEED_ASPECT_RATIOS[aspect]}
          initialFocus={cropTarget.focus}
          subtitle={L.cropOf(items.indexOf(cropTarget) + 1, items.length, ASPECT_SHORT[aspect])}
          badge={L.cropBadge(ASPECT_SHORT[aspect])}
          hint={L.cropHint}
          onCancel={() => setCropping(null)}
          onFocus={(focus) => void recropAt(cropTarget.key, focus)}
        />
      ) : null}

      <section className="s-stack s-stack--tight">
        <div className="o-t-label">
          {L.publishPhotos} · {L.publishPhotosCount(items.length, FEED_POST_PHOTOS_MAX)}
        </div>
        <div className="fil-thumbs">
          {items.map((p, i) => (
            <div key={p.key} className={i === index ? "fil-thumb is-on" : "fil-thumb"}>
              <button
                type="button"
                className="fil-thumb__pick"
                onClick={() => setCurrent(i)}
                aria-label={`${L.plateFrameFor(i + 1)} : ${badge(p)}`}
                data-testid="fil-publish-photo"
              >
                <img src={p.url} alt="" />
                <span className="fil-thumb__badge">{badge(p)}</span>
              </button>
              <button
                type="button"
                className="fil-thumb__x"
                aria-label={L.removePhoto}
                disabled={locked}
                onClick={() => {
                  setItems((list) => list.filter((x) => x.key !== p.key));
                  setCurrent(0);
                }}
                data-testid="fil-publish-photo-remove"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
        {items.length < FEED_POST_PHOTOS_MAX ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => void pick(e.currentTarget.files)}
              data-testid="fil-publish-file"
            />
            <Button
              type="button"
              variant="secondary"
              icon="gallery"
              disabled={locked}
              onClick={() => input.current?.click()}
              data-testid="fil-publish-add"
            >
              {L.addPhotos}
            </Button>
          </>
        ) : null}
      </section>

      <section className="s-stack s-stack--tight">
        <div className="o-t-label">{L.format}</div>
        <div className="fil-filters" role="tablist" aria-label={L.format} data-testid="fil-publish-format">
          {ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              disabled={locked}
              aria-selected={aspect === a}
              className={aspect === a ? "is-on" : undefined}
              onClick={() => void changeAspect(a)}
              data-testid={`fil-publish-format-${a}`}
            >
              {ASPECT_SHORT[a]}
            </button>
          ))}
        </div>
        <p className="o-t-caption">{L.formatHint}</p>
        {formatNote && items.length ? (
          <p className="o-t-caption" data-testid="fil-publish-format-note">
            {feedAspectLabels[aspect]} · {L.formatChanged}
          </p>
        ) : null}
      </section>

      {item ? (
        <section className="s-stack s-stack--tight" data-testid="fil-publish-plate">
          <div className="o-t-label">
            {L.plateTitle} · {L.plateFrameFor(index + 1)}
          </div>
          {item.noPlate ? (
            <>
              <img className="fil-preview" src={item.url} alt={L.plateFrameFor(index + 1)} />
              <p className="o-t-caption" data-testid="fil-publish-plate-state">
                {L.plateConfirmNoneHint}
              </p>
              <Button
                type="button"
                variant="secondary"
                icon="undo"
                disabled={locked}
                onClick={() => patch(item.key, (i) => ({ ...i, noPlate: false }))}
                data-testid="fil-publish-plate-blur"
              >
                {L.plateUndoNone}
              </Button>
            </>
          ) : (
            <>
              <PlateFrame
                key={item.url}
                readOnly={locked}
                src={item.url}
                alt={L.plateFrameFor(index + 1)}
                name={`plateRects${index}`}
                initial={item.rects}
                testId="fil-publish-plate-editor"
                onChange={(rects) => patch(item.key, (i) => (i.rects === rects ? i : { ...i, rects }))}
              />
              <p className="o-t-caption" data-testid="fil-publish-plate-state">
                {item.rects.length ? L.platePlaced(item.rects.length) : L.plateNotFound}
              </p>
              <Button
                type="button"
                variant="secondary"
                icon="crop"
                disabled={locked}
                onClick={() => setCropping(item.key)}
                data-testid="fil-publish-crop"
              >
                {L.crop}
              </Button>
              {confirmKey === item.key ? (
                <div className="fil-confirm" data-testid="fil-publish-none-confirm">
                  <strong>{V.noPlateConfirmTitle}</strong>
                  <p className="o-t-caption">{V.noPlateConfirmBody}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    icon="check"
                    fullWidth
                    disabled={locked}
                    onClick={() => {
                      if (confirmKey !== item.key) return;
                      patch(item.key, (i) => ({ ...i, noPlate: true, rects: [] }));
                      setConfirmKey(null);
                    }}
                    data-testid="fil-publish-none-yes"
                  >
                    {V.noPlateConfirm}
                  </Button>
                  <Button
                    type="button"
                    variant="plate"
                    icon="close"
                    fullWidth
                    disabled={locked}
                    onClick={() => setConfirmKey(null)}
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
                  onClick={() => setConfirmKey(item.key)}
                  data-testid="fil-publish-none"
                >
                  {L.plateConfirmNone}
                </Button>
              )}
            </>
          )}
        </section>
      ) : null}

      <label className="s-field">
        <span className="o-t-label">{L.caption}</span>
        <textarea
          value={caption}
          maxLength={FEED_CAPTION_MAX}
          rows={3}
          placeholder={L.captionPlaceholder}
          disabled={busy}
          onChange={(e) => setCaption(e.currentTarget.value)}
          data-testid="fil-publish-caption"
        />
        <span className="o-t-caption">{L.captionHint}</span>
      </label>

      {optionsFailed ? (
        <p className="o-t-caption">
          Ta voiture et tes événements n&apos;ont pas pu être chargés : tu peux publier sans.
        </p>
      ) : null}
      {vehicles.length ? (
        <div className="s-stack s-stack--tight">
          <div className="o-t-label">
            {L.vehicle} <span className="o-t-caption">{L.optional}</span>
          </div>
          <div className="fil-chips">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                className={vehicleId === v.id ? "fil-chip is-on" : "fil-chip"}
                aria-pressed={vehicleId === v.id}
                disabled={busy}
                onClick={() => setVehicleId(vehicleId === v.id ? null : v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {events.length ? (
        <div className="s-stack s-stack--tight">
          <div className="o-t-label">
            {L.event} <span className="o-t-caption">{L.optional}</span>
          </div>
          <div className="fil-chips">
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                className={eventId === e.id ? "fil-chip is-on" : "fil-chip"}
                aria-pressed={eventId === e.id}
                disabled={busy}
                onClick={() => setEventId(eventId === e.id ? null : e.id)}
              >
                {e.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      {progress ? (
        <p className="o-t-caption" role="status" data-testid="fil-publish-progress">
          {progress}
        </p>
      ) : issue ? (
        <p className="o-t-caption" data-testid="fil-publish-missing">
          {issue}
        </p>
      ) : null}
      <Button type="submit" icon="upload" fullWidth disabled={busy || Boolean(issue)} data-testid="fil-publish-send">
        {L.publish}
      </Button>
      <a className="fil-link" href="/app/fil">
        <Icon name="close" size={16} /> Annuler
      </a>
    </form>
  );
}
