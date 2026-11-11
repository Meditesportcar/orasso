// « Publier au Fil » sur le site (lot R7e2, D38, maquette R7.24) : 1 à 6 photos (fichiers), recadrage 4:5 par défaut avec
// bascule 1:1 / paysage (canvas, mêmes calculs que l'appli : `feedCropPlan`), la plaque de chaque photo (cadre posé à la main
// avec `PlateFrame`, ou « Aucune plaque visible » confirmée : obligatoire, sinon le bouton est grisé avec la ligne qui dit
// quoi), un mot (500 au plus), la voiture et l'événement. Envoi photo par photo (`POST /api/me/uploads`, purpose
// `feed_post`), puis `POST /api/me/feed-posts`. Pas de détection automatique de plaque sur le site (elle vit dans l'appli).
import { Button, Icon } from "@orasso/design-system/web";
import {
  type AttachableEventItem,
  attachableQuery,
  attachDateLabel,
  attachLeadOf,
  attachStateLabel,
  type CommercialDraft,
  captionMaxOf,
  chooseAuthor,
  chooseEvent,
  commercialField,
  commercialIssue,
  DEFAULT_FEED_ASPECT,
  FEED_ASPECT_RATIOS,
  FEED_PLACE_LABEL_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  type FeedPostView,
  feedAspectLabels,
  feedCropPlan,
  feedPostBodyR8,
  importantAvailable,
  importantBlocked,
  importantImmediate,
  importantReasonLabels,
  importantReasons,
  importantWhoText,
  initialPublishChoice,
  feedScreenLabels as L,
  type NotifyPreview,
  noCommercialDraft,
  type PersonaEntry,
  type PlateRect,
  type PublishChoice,
  partnershipLabels,
  publicationErrors,
  publishAuthors,
  publishIssueR8,
  publishSays,
  showAuthorChoice,
  showEventBlock,
  feedPublishLabels as T,
  type UploadResult,
  vehicleWizardLabels as V,
  vehicleAllowed,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import "../../styles/fil.css";
import "../../styles/fil-publish.css";
import { CommercialLine, useCommercialLine } from "../stories/CommercialLine";
import "../../styles/garage.css";
import { apiFetch } from "../../lib/api.client";
import { FicheBar } from "../FicheBar";
import { PlateFrame } from "../PlateFrame";
import { SquareCrop } from "../SquareCrop";
import { rememberPublished } from "./mine";
import { convertAll, holdLock } from "./prepare";

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
  pseudo,
  avatarUrl,
  personas,
  vehicles,
  optionsFailed,
}: {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  personas: Pick<PersonaEntry, "kind" | "id" | "label" | "logoUrl">[];
  vehicles: { id: string; label: string }[];
  optionsFailed: boolean;
}) {
  const [aspect, setAspect] = useState<FeedAspect>(DEFAULT_FEED_ASPECT);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);
  // La confirmation « Aucune plaque visible » porte la clé de la photo qu'elle concerne (jamais l'index : une photo retirée
  // ferait passer la suivante à sa place).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  // Au nom de qui, pour quel événement, « Info importante » (lot R8p) : un seul état, des règles pures.
  const [choice, setChoice] = useState<PublishChoice>(initialPublishChoice);
  const authors = useMemo(() => publishAuthors(personas, pseudo, avatarUrl), [personas, pseudo, avatarUrl]);
  const author = authors.find((a) => a.key === choice.authorKey) ?? (authors[0] as (typeof authors)[number]);
  const fan = vehicleAllowed(author);
  const [loaded, setLoaded] = useState<{ key: string; items: AttachableEventItem[] | null; failed: boolean }>({
    key: "",
    items: null,
    failed: false,
  });
  const [reloadEvents, setReloadEvents] = useState(0);
  const [recipients, setRecipients] = useState<{ eventId: string; n: number | null } | null>(null);
  const [security, setSecurity] = useState(false);
  // « Collaboration commerciale » (lot R7m2) : obligatoire si un partenaire actif est cité dans la légende, sinon à la main.
  const [commercial, setCommercial] = useState<CommercialDraft>(noCommercialDraft);
  const commercialLine = useCommercialLine(caption, commercial);
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
  const eventBlock = showEventBlock(author);
  // Les événements rattachables de la casquette choisie (rôle déduit par l'API), rechargés à chaque changement de casquette.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la casquette est identifiée par sa clé.
  useEffect(() => {
    if (!eventBlock) return;
    let live = true;
    setLoaded({ key: author.key, items: null, failed: false });
    const q = attachableQuery(author);
    const query = new URLSearchParams({ persona: q.persona });
    if (q.structureId) query.set("structureId", q.structureId);
    if (q.proId) query.set("proId", q.proId);
    void apiFetch<{ items: AttachableEventItem[] }>(`/me/feed-posts/attachable-events?${query}`).then((res) => {
      if (!live) return;
      setLoaded(
        res.ok
          ? { key: author.key, items: res.data.items, failed: false }
          : { key: author.key, items: [], failed: true },
      );
    });
    return () => {
      live = false;
    };
  }, [author.key, eventBlock, reloadEvents]);
  const events = eventBlock && loaded.key === author.key ? (loaded.items ?? []) : [];
  const eventsLoading = eventBlock && (loaded.key !== author.key || loaded.items === null);
  const event = events.find((e) => e.id === choice.eventId) ?? null;
  const showImportant = importantAvailable(author, event);
  // Combien d'inscrits sont prévenus : relu à chaque événement choisi ; en cas d'échec, la phrase sans nombre.
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu pour l'événement choisi.
  useEffect(() => {
    if (!showImportant || !event) return;
    let live = true;
    const id = event.id;
    void apiFetch<NotifyPreview>(`/events/${id}/notify-preview`).then((res) => {
      if (live) setRecipients({ eventId: id, n: res.ok ? res.data.recipients : null });
    });
    return () => {
      live = false;
    };
  }, [showImportant, event?.id]);
  const posterVisual = items.length === 0 && event !== null && event.hasVisual;

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
    const gen = generation.current;
    const room = FEED_POST_PHOTOS_MAX - items.length;
    await holdLock(
      setPreparing,
      async () => {
        const fresh = await convertAll(
          [...files].slice(0, room),
          async (file): Promise<Item> => {
            const cropped = await crop(file, aspect);
            return {
              key: crypto.randomUUID(),
              source: file,
              cropped,
              url: URL.createObjectURL(cropped),
              rects: [],
              noPlate: false,
            };
          },
          (f) => URL.revokeObjectURL(f.url),
        );
        if (gen !== generation.current) {
          for (const f of fresh) URL.revokeObjectURL(f.url);
          return;
        }
        setItems((list) => [...list, ...fresh].slice(0, FEED_POST_PHOTOS_MAX));
        if (input.current) input.current.value = "";
      },
      setError,
    );
  }

  async function changeAspect(next: FeedAspect) {
    if (locked || next === aspect) return;
    const gen = ++generation.current;
    setAspect(next);
    setConfirmKey(null);
    if (!items.length) return;
    setFormatNote(true);
    await holdLock(
      setPreparing,
      async () => {
        const again = await convertAll(
          items,
          async (i): Promise<Item> => {
            const cropped = await crop(i.source, next);
            return { ...i, cropped, url: URL.createObjectURL(cropped), rects: [], noPlate: false };
          },
          (f) => URL.revokeObjectURL(f.url),
        );
        if (gen !== generation.current) {
          for (const f of again) URL.revokeObjectURL(f.url);
          return;
        }
        setItems(again);
        keys.current = {};
      },
      setError,
    );
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
    const gen = generation.current;
    await holdLock(
      setPreparing,
      async () => {
        const cropped = await crop(target.source, aspect, focus);
        if (gen !== generation.current) return;
        const url = URL.createObjectURL(cropped);
        URL.revokeObjectURL(target.url);
        delete keys.current[target.key + target.url];
        patch(key, (i) => ({ ...i, cropped, url, focus, rects: [], noPlate: false }));
      },
      setError,
    );
  }
  const important = { on: showImportant && choice.importantOn, reason: choice.importantReason };
  const issue =
    publishIssueR8({ photos: items, caption, preparing, author, event, important }) ??
    (fan ? commercialIssue(commercialLine, partnershipLabels.commercialPick) : null);

  async function publish() {
    if (busy || issue) return;
    setBusy(true);
    setError(null);
    setSecurity(false);
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
    const body = feedPostBodyR8({
      photos: items.map((p, i) => ({ rects: p.rects, noPlate: p.noPlate, uploadKey: uploaded[i] as string })),
      caption,
      aspect,
      clientId,
      author,
      eventId: event ? event.id : null,
      vehicleId: choice.vehicleId,
      placeLabel: choice.placeLabel,
      important,
      ...(fan ? commercialField(commercialLine) : {}),
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
    if (res.status === 0) return setError(T.noNetwork);
    if (res.error.code === "persona_forbidden" || res.error.code === "two_factor_required") {
      setSecurity(true);
      return setError(res.error.code === "persona_forbidden" ? publicationErrors.persona_forbidden : res.error.message);
    }
    if (res.error.code === "event_not_attachable") {
      setChoice((c) => chooseEvent(c, null));
      setReloadEvents((n) => n + 1);
      return setError(`${publicationErrors.event_not_attachable} ${T.listReloaded}`);
    }
    if (res.error.code === "important_quota") {
      const d = (res.error as { details?: { leftToday?: number; leftWeek?: number } }).details;
      const at = event?.id;
      if (at && d && Number.isFinite(d.leftToday) && Number.isFinite(d.leftWeek)) {
        setLoaded((l) => ({
          ...l,
          items: (l.items ?? []).map((x) =>
            x.id === at ? { ...x, important: { leftToday: Number(d.leftToday), leftWeek: Number(d.leftWeek) } } : x,
          ),
        }));
      }
      setChoice((c) => ({ ...c, importantOn: false, importantReason: null }));
      return setError(publicationErrors.important_quota);
    }
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
        {posterVisual && event ? (
          <div className="fp-poster" data-testid="fil-publish-poster">
            {event.posterUrl ? <img src={event.posterUrl} alt={T.posterAlt(event.title)} /> : null}
            <p className="o-t-caption">{T.posterNote}</p>
          </div>
        ) : null}
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
          maxLength={captionMaxOf(author)}
          rows={3}
          placeholder={L.captionPlaceholder}
          disabled={busy}
          onChange={(e) => setCaption(e.currentTarget.value)}
          data-testid="fil-publish-caption"
        />
        <span className="o-t-caption">{fan ? L.captionHint : T.captionHintPage}</span>
      </label>

      <p className="fp-note" data-testid="fil-publish-gesture">
        <Icon name="info" size={16} />
        <span>
          <strong>{T.oneGesture.lead}</strong> {T.oneGesture.rest}
        </span>
      </p>

      {optionsFailed ? (
        <p className="o-t-caption">Ta voiture n&apos;a pas pu être chargée : tu peux publier sans.</p>
      ) : null}
      {showAuthorChoice(authors) ? (
        <div className="s-stack s-stack--tight" data-testid="fil-publish-as">
          <div className="o-t-label">{T.asTitle}</div>
          <div className="fp-opts">
            {authors.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={a.key === author.key}
                className={a.key === author.key ? "fp-opt is-on" : "fp-opt"}
                disabled={busy}
                onClick={() => setChoice((c) => chooseAuthor(c, authors, a.key))}
                data-testid={`fil-publish-as-${a.key}`}
              >
                <Icon name={a.icon} size={22} />
                <span>
                  <b>{a.title}</b>
                  <small>{a.hint}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {fan && vehicles.length ? (
        <div className="s-stack s-stack--tight">
          <div className="o-t-label">
            {L.vehicle} <span className="o-t-caption">{L.optional}</span>
          </div>
          <div className="fil-chips">
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                className={choice.vehicleId === v.id ? "fil-chip is-on" : "fil-chip"}
                aria-pressed={choice.vehicleId === v.id}
                disabled={busy}
                onClick={() => setChoice((c) => ({ ...c, vehicleId: c.vehicleId === v.id ? null : v.id }))}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {eventBlock ? (
        <div className="s-stack s-stack--tight" data-testid="fil-publish-events">
          <div className="o-t-label">
            {attachLeadOf(author)} · {T.optional}
          </div>
          <div className="fp-opts">
            <button
              type="button"
              aria-pressed={!event}
              className={!event ? "fp-opt is-on" : "fp-opt"}
              disabled={busy}
              onClick={() => setChoice((c) => chooseEvent(c, null))}
              data-testid="fil-publish-event-none"
            >
              <Icon name="close" size={22} />
              <span>
                <b>{T.attachNone}</b>
                <small>{T.attachNoneHint[author.destination]}</small>
              </span>
            </button>
            {events.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={event?.id === e.id}
                className={event?.id === e.id ? "fp-opt is-on" : "fp-opt"}
                disabled={busy}
                onClick={() => setChoice((c) => chooseEvent(c, e.id))}
                data-testid={`fil-publish-event-${e.id}`}
              >
                <Icon
                  name={
                    e.role === "on_site" ? "truck" : e.role === "attendee" && e.phase === "after" ? "stamp" : "ticket"
                  }
                  size={22}
                />
                <span>
                  <b>{e.title}</b>
                  <small>
                    {attachDateLabel(e.startsAt)} · {attachStateLabel(e.role, e.phase)}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {eventsLoading ? <p className="o-t-caption">{T.attachLoading}</p> : null}
          {loaded.key === author.key && loaded.failed ? <p className="o-t-caption">{T.attachFailed}</p> : null}
          {fan ? <p className="o-t-caption">{T.attachFoot}</p> : null}
        </div>
      ) : null}
      {!event ? (
        <label className="s-field">
          <span className="o-t-label">
            {T.placeLabel} · {T.optional}
          </span>
          <input
            type="text"
            value={choice.placeLabel}
            maxLength={FEED_PLACE_LABEL_MAX}
            placeholder={T.placePlaceholder}
            disabled={busy}
            onChange={(e) => {
              const placeLabel = e.currentTarget.value;
              setChoice((c) => ({ ...c, placeLabel }));
            }}
            data-testid="fil-publish-place"
          />
          <span className="o-t-caption">{T.placeHint}</span>
        </label>
      ) : null}
      {showImportant && event ? (
        <ImportantBlock
          event={event}
          choice={choice}
          recipients={recipients?.eventId === event.id ? recipients.n : null}
          busy={busy}
          onChoice={setChoice}
        />
      ) : null}
      {fan ? <CommercialLine line={commercialLine} onDraft={setCommercial} disabled={busy} kind="post" /> : null}
      <SaysBlock says={publishSays(author, event, important.on)} />

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
      {security ? (
        <a className="fil-link" href="/app/securite" data-testid="fil-publish-security">
          <Icon name="shield" size={16} /> {T.securityLink}
        </a>
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

/** La case « Info importante », ses cinq motifs et le plafond (même règles et mêmes mots que l'appli). */
function ImportantBlock({
  event,
  choice,
  recipients,
  busy,
  onChoice,
}: {
  event: AttachableEventItem;
  choice: PublishChoice;
  recipients: number | null;
  busy: boolean;
  onChoice: (fn: (c: PublishChoice) => PublishChoice) => void;
}) {
  const blocked = importantBlocked(event);
  const on = choice.importantOn && !blocked;
  const left = event.important;
  const quota = left ? T.importantQuota(left.leftToday, left.leftWeek) : null;
  const sub = blocked
    ? T.importantLimit[blocked]
    : on
      ? importantWhoText(recipients, importantImmediate(event.startsAt, new Date()))
      : T.importantOff;
  return (
    <div className="s-stack s-stack--tight" data-testid="fil-publish-important">
      <button
        type="button"
        aria-pressed={on}
        aria-label={`${T.important} : ${on ? T.importantChecked : T.importantUnchecked}. ${sub}`}
        className={on ? "fp-opt fp-opt--box is-on" : "fp-opt fp-opt--box"}
        disabled={busy || blocked !== null}
        onClick={() => onChoice((c) => ({ ...c, importantOn: !c.importantOn, importantReason: null }))}
        data-testid="fil-publish-important-toggle"
      >
        <Icon name="bell" size={22} />
        <span>
          <b>{T.important}</b>
          <small data-testid="fil-publish-important-sub">{sub}</small>
        </span>
        <span className="fp-box" aria-hidden="true">
          {on ? <Icon name="check" size={16} /> : null}
        </span>
      </button>
      {on ? (
        <>
          <div className="o-t-label">{T.importantReason}</div>
          <div className="fil-chips" data-testid="fil-publish-important-reasons">
            {importantReasons.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={choice.importantReason === r}
                className={choice.importantReason === r ? "fil-chip is-on" : "fil-chip"}
                disabled={busy}
                onClick={() => onChoice((c) => ({ ...c, importantReason: r }))}
                data-testid={`fil-publish-important-${r}`}
              >
                {importantReasonLabels[r]}
              </button>
            ))}
          </div>
          {quota ? (
            <p className="fp-note" data-testid="fil-publish-important-quota">
              <Icon name="info" size={16} />
              <span>
                <strong>{quota.lead}</strong> {quota.rest}
              </span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SaysBlock({ says }: { says: ReturnType<typeof publishSays> }) {
  return (
    <div className="s-stack s-stack--tight" data-testid="fil-publish-says">
      <div className="o-t-label">{T.says}</div>
      <div className="fp-says">
        {says.logoUrl ? (
          <img src={says.logoUrl} alt="" />
        ) : (
          <span className="fp-says__ini">{says.authorName.charAt(0)}</span>
        )}
        <span>
          <b>{says.authorName}</b>
          <small data-testid="fil-publish-says-phrase">{says.phrase ?? T.sayNow}</small>
        </span>
        {says.stamp ? (
          <span className="fp-stamp">
            <Icon name="stamp" size={14} /> {T.stamp}
          </span>
        ) : null}
      </div>
      <p className="fp-note" data-testid="fil-publish-says-where">
        <Icon name="info" size={16} />
        <span>{says.where}</span>
      </p>
    </div>
  );
}
