// « Publier au Fil » sur le site (lot R7e2, D38, maquette R7.24) : 1 à 6 photos (fichiers), recadrage 4:5 par défaut avec
// bascule 1:1 / paysage (canvas, mêmes calculs que l'appli : `feedCropPlan`), la plaque de chaque photo (cadre posé à la main
// avec `PlateFrame`, ou « Aucune plaque visible » confirmée : obligatoire, sinon le bouton est grisé avec la ligne qui dit
// quoi), un mot (500 au plus), la voiture et l'événement. Envoi photo par photo (`POST /api/me/uploads`, purpose
// `feed_post`), puis `POST /api/me/feed-posts`. Pas de détection automatique de plaque sur le site (elle vit dans l'appli).
import { Button, Icon } from "@orasso/design-system/web";
import {
  type AccountCheck,
  type AttachableEventItem,
  acceptEvents,
  accountCheckOf,
  attachableQuery,
  attachDateLabel,
  attachLeadOf,
  attachStateLabel,
  type CommercialDraft,
  captionMaxOf,
  chooseAuthor,
  chooseEvent,
  clearUncertain,
  commercialField,
  commercialIssue,
  DEFAULT_FEED_ASPECT,
  draftFromBody,
  type EventsLoad,
  emptyEventsLoad,
  eventsOf,
  eventsStale,
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
  feedScreenLabels as L,
  loadUncertain,
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
  publishStartChoice,
  saveUncertain,
  showAuthorChoice,
  showEventBlock,
  startEventsLoad,
  feedPublishLabels as T,
  type UploadResult,
  vehicleWizardLabels as V,
  vehicleAllowed,
  withImportantLeft,
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
  start,
}: {
  userId: string;
  pseudo: string;
  avatarUrl: string | null;
  personas: Pick<PersonaEntry, "kind" | "id" | "label" | "logoUrl">[];
  vehicles: { id: string; label: string }[];
  optionsFailed: boolean;
  /** Lot R8d : « Publier pour cet événement » (`?structure=&evenement=`) pose la structure et l'événement de départ. */
  start?: { structure?: string | null; evenement?: string | null };
}) {
  const [aspect, setAspect] = useState<FeedAspect>(DEFAULT_FEED_ASPECT);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);
  // La confirmation « Aucune plaque visible » porte la clé de la photo qu'elle concerne (jamais l'index : une photo retirée
  // ferait passer la suivante à sa place).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  // Au nom de qui, pour quel événement, « Info importante » (lot R8p) : un seul état, des règles pures.
  const authors = useMemo(() => publishAuthors(personas, pseudo, avatarUrl), [personas, pseudo, avatarUrl]);
  const [choice, setChoice] = useState<PublishChoice>(() => publishStartChoice(start ?? {}, authors));
  const author = authors.find((a) => a.key === choice.authorKey) ?? (authors[0] as (typeof authors)[number]);
  const fan = vehicleAllowed(author);
  const [loaded, setLoaded] = useState<EventsLoad>(emptyEventsLoad);
  const [reloadEvents, setReloadEvents] = useState(0);
  // Le compte et la casquette d'aujourd'hui : une réponse lue pour un autre couple est jetée.
  const now = useRef({ account: userId, key: author.key, loadedAt: 0 });
  now.current = { account: userId, key: author.key, loadedAt: loaded.loadedAt };
  // Un envoi sans réponse : le même corps, le même identifiant, tant que la personne n'a pas choisi de le modifier.
  const [uncertain, setUncertainState] = useState<(ReturnType<typeof feedPostBodyR8> & { clientId: string }) | null>(
    null,
  );
  /** Garde (ou efface) le corps incertain dans l'onglet, rangé par compte : il survit à un rechargement (reconnexion). */
  const setUncertain = (body: (ReturnType<typeof feedPostBodyR8> & { clientId: string }) | null) => {
    setUncertainState(body);
    if (body) saveUncertain(tabStore(), userId, body);
    else clearUncertain(tabStore(), userId);
  };
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState(false);
  // Une seule opération à la fois : l'envoi et la vérification ne se chevauchent jamais (un « Réessayer » pendant la vérification
  // créerait une publication que le 404 en retard ferait oublier).
  const running = useRef<"send" | "check" | null>(null);
  // Les photos d'un envoi incertain repris après un rechargement : parties, mais plus dans l'appareil.
  const [keptPhotos, setKeptPhotos] = useState(0);
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
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  // Retour sur « Publier » après un rechargement : l'envoi incertain de ce compte reprend (même corps, même `clientId`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: lu une fois par compte.
  useEffect(() => {
    const saved = loadUncertain(tabStore(), userId);
    if (!saved) return;
    setUncertainState(saved as never);
    setClientId(saved.clientId as `${string}-${string}-${string}-${string}-${string}`);
    // Le brouillon affichable est celui du corps gardé : casquette, événement, légende… (les photos ne se restaurent pas).
    const draft = draftFromBody(saved, authors);
    setChoice(draft.choice);
    setCaption(draft.caption);
    if (draft.aspect) setAspect(draft.aspect);
    setKeptPhotos(draft.photoCount);
    setError(T.noNetwork);
  }, [userId]);
  const frozen = busy || uncertain !== null;
  const locked = frozen || preparing;
  const keys = useRef<Record<string, string>>({});
  const generation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const eventBlock = showEventBlock(author);
  // Les événements rattachables de la casquette choisie, pour ce compte : rechargés au changement de casquette, au retour sur
  // l'onglet, au changement de jour de Paris (plafond de l'« Info importante »), après un échec.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la casquette est identifiée par sa clé.
  useEffect(() => {
    if (!eventBlock) return;
    let live = true;
    const asked = { account: userId, key: author.key };
    setLoaded((l) => startEventsLoad(l, userId, author.key));
    const q = attachableQuery(author);
    const query = new URLSearchParams({ persona: q.persona });
    if (q.structureId) query.set("structureId", q.structureId);
    if (q.proId) query.set("proId", q.proId);
    void apiFetch<{ items: AttachableEventItem[] }>(`/me/feed-posts/attachable-events?${query}`).then((res) => {
      if (!live) return;
      const code = res.ok ? null : res.error.code;
      const forbidden = code === "persona_forbidden" || code === "two_factor_required" ? code : null;
      setLoaded((l) =>
        acceptEvents(
          l,
          now.current,
          asked,
          res.ok ? { ok: true, items: res.data.items } : { ok: false, forbidden },
          Date.now(),
        ),
      );
    });
    return () => {
      live = false;
    };
  }, [userId, author.key, eventBlock, reloadEvents]);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setReloadEvents((n) => n + 1);
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    const timer = window.setInterval(() => {
      if (eventsStale(now.current.loadedAt, new Date())) setReloadEvents((n) => n + 1);
    }, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
      window.clearInterval(timer);
    };
  }, []);
  const events = eventBlock ? eventsOf(loaded, userId, author.key) : [];
  const eventsLoading =
    eventBlock && (loaded.account !== userId || loaded.key !== author.key || loaded.items === null) && !loaded.failed;
  const event = events.find((e) => e.id === choice.eventId) ?? null;
  // Un événement choisi qui n'est plus dans la liste relue (plus rattachable) : retiré, le reste du brouillon reste.
  useEffect(() => {
    if (choice.eventId && loaded.items && loaded.account === userId && loaded.key === author.key) {
      if (!loaded.items.some((e) => e.id === choice.eventId)) setChoice((c) => chooseEvent(c, null));
    }
  }, [loaded, choice.eventId, userId, author.key]);
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
    publishIssueR8({
      photos: items,
      caption,
      preparing,
      author,
      event,
      important,
      forbidden: eventBlock ? loaded.forbidden : null,
    }) ?? (fan ? commercialIssue(commercialLine, partnershipLabels.commercialPick) : null);

  /** Le compte de la session : le même, un autre, plus de session (401), ou rien de sûr (réseau, 5xx). */
  async function accountCheck(): Promise<AccountCheck> {
    const me = await apiFetch<{ user: { id: string } }>("/me");
    return accountCheckOf(me.ok ? { ok: true, userId: me.data.user.id } : { ok: false, status: me.status }, userId);
  }
  const stopMessage = (check: Exclude<AccountCheck, "same">) =>
    check === "other" ? T.accountChanged : check === "signed_out" ? T.sessionLost : T.noNetwork;

  /**
   * « Modifier ma publication » après un envoi incertain : on vérifie d'abord (`GET /me/feed-posts/by-client/:clientId`).
   * Publiée : on le dit, rien à renvoyer. Absente : nouvel identifiant, saisie gardée. Vérification impossible : l'envoi
   * reste incertain (le formulaire ne se libère jamais sur un doute).
   */
  async function abandonUncertain() {
    if (!uncertain || running.current) return;
    running.current = "check";
    setChecking(true);
    setError(null);
    try {
      // Le compte avant la requête et avant d'exploiter sa réponse : un autre compte (autre onglet) répondrait 404 à notre place.
      const before = await accountCheck();
      if (before !== "same") return setError(stopMessage(before));
      const res = await apiFetch<FeedPostView>(`/me/feed-posts/by-client/${uncertain.clientId}`);
      const after = await accountCheck();
      if (after !== "same") return setError(stopMessage(after));
      if (res.ok) {
        rememberPublished(userId, res.data);
        setUncertain(null);
        setFound(true);
        return setDone(true);
      }
      if (res.status === 404) {
        setUncertain(null);
        setClientId(crypto.randomUUID());
        keys.current = {};
        return;
      }
      setError(T.uncertainUnchecked);
    } finally {
      running.current = null;
      setChecking(false);
    }
  }

  async function publish() {
    if (running.current || checking) return;
    running.current = "send";
    try {
      await publishRun();
    } finally {
      running.current = null;
    }
  }

  async function publishRun() {
    if (busy || (!uncertain && issue)) return;
    setBusy(true);
    setError(null);
    setSecurity(false);
    // Le compte de la session : si un autre onglet en a changé, rien ne part (ni photos, ni publication au nom d'un autre).
    const first = await accountCheck();
    if (first !== "same") {
      // L'envoi incertain, s'il y en a un, reste tel quel : rien n'est levé sur un contrôle qui n'a pas abouti.
      setBusy(false);
      return setError(stopMessage(first));
    }
    const uploaded: string[] = [];
    for (const [i, p] of uncertain ? [] : items.entries()) {
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
    const body =
      (uncertain as ReturnType<typeof feedPostBodyR8> | null) ??
      feedPostBodyR8({
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
    const second = await accountCheck();
    if (second !== "same") {
      setBusy(false);
      setProgress(null);
      return setError(stopMessage(second));
    }
    const res = await apiFetch("/me/feed-posts", { method: "POST", json: body });
    if (res.ok) {
      // Succès : l'écran de confirmation prend la place du formulaire tout de suite (jamais un formulaire modifiable avec
      // l'identifiant déjà publié, même si le contrôle du compte qui suit tarde).
      // La publication est transmise au Fil **avant** toute navigation : l'entrée porte l'identifiant du compte (le contrôle de
      // compte vient de passer avant l'envoi ; un autre compte, dans le même onglet, n'en voit jamais rien).
      rememberPublished(userId, res.data as FeedPostView);
      setUncertain(null);
      setDone(true);
      setBusy(false);
      setProgress(null);
      return;
    }
    setBusy(false);
    setProgress(null);
    if (res.status === 0 || res.status >= 500) {
      // Pas de réponse : la publication est peut-être partie. Le formulaire se fige sur ce corps et ce `clientId`.
      setUncertain(body);
      return setError(T.noNetwork);
    }
    // 429 et 401 tombent avant le contrôle de rejeu de l'API : ils ne prouvent rien, l'envoi incertain est gardé (401 : jusqu'à
    // la reconnexion). Toute autre réponse (succès, refus 4xx) dit que l'envoi est réglé.
    if (!res.ok && (res.status === 429 || res.status === 401)) {
      return setError(res.status === 429 ? L.tooManyRequests : res.error.message);
    }
    // Une réponse du serveur (succès ou refus) règle l'envoi : l'incertitude se lève ici, après qu'on a la réponse.
    setUncertain(null);
    if (res.status === 429) return setError(L.tooManyRequests);
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
        setLoaded((l) => withImportantLeft(l, at, { leftToday: Number(d.leftToday), leftWeek: Number(d.leftWeek) }));
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
        <p className="o-t-body">{found ? T.uncertainFound : L.publishedText}</p>
        <a className="fil-publish" href="/app/fil" data-testid="fil-publish-back">
          <Icon name="feed" size={20} /> {L.backToFeed}
        </a>
        {fan ? (
          <a className="fil-link" href="/app/fil/mes-publications">
            <Icon name="gallery" size={16} /> {L.mineTitle}
          </a>
        ) : null}
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
          disabled={frozen}
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
                disabled={frozen}
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
                disabled={frozen}
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
              disabled={frozen}
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
                disabled={frozen}
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
          {loaded.account === userId && loaded.key === author.key && loaded.failed && !loaded.forbidden ? (
            <>
              <p className="o-t-caption">{T.attachFailed}</p>
              <Button
                type="button"
                variant="secondary"
                icon="undo"
                onClick={() => setReloadEvents((n) => n + 1)}
                data-testid="fil-publish-events-retry"
              >
                {T.attachRetry}
              </Button>
            </>
          ) : null}
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
            disabled={frozen}
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
          busy={frozen}
          onChoice={setChoice}
        />
      ) : null}
      {fan ? <CommercialLine line={commercialLine} onDraft={setCommercial} disabled={frozen} kind="post" /> : null}
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
      ) : uncertain ? (
        <p className="o-t-caption" role="status" data-testid="fil-publish-uncertain">
          {T.uncertainTitle}
        </p>
      ) : issue ? (
        <p className="o-t-caption" data-testid="fil-publish-missing">
          {issue}
        </p>
      ) : null}
      {loaded.forbidden && eventBlock ? (
        <p className="s-error" role="alert" data-testid="fil-publish-forbidden">
          {loaded.forbidden === "persona_forbidden" ? publicationErrors.persona_forbidden : T.forbiddenMore}
        </p>
      ) : null}
      {keptPhotos > 0 && uncertain && items.length === 0 ? (
        <p className="o-t-caption" data-testid="fil-publish-kept-photos">
          {T.uncertainPhotos(keptPhotos)}
        </p>
      ) : null}
      {uncertain && !busy ? (
        <Button
          type="button"
          variant="secondary"
          icon="edit"
          disabled={checking}
          onClick={() => void abandonUncertain()}
          data-testid="fil-publish-uncertain-edit"
        >
          {checking ? T.uncertainChecking : T.uncertainEdit}
        </Button>
      ) : null}
      {security || (loaded.forbidden && eventBlock) ? (
        <a className="fil-link" href="/app/securite" data-testid="fil-publish-security">
          <Icon name="shield" size={16} /> {T.securityLink}
        </a>
      ) : null}
      <Button
        type="submit"
        icon="upload"
        fullWidth
        disabled={busy || checking || (!uncertain && Boolean(issue))}
        data-testid="fil-publish-send"
      >
        {uncertain ? T.uncertainRetry : L.publish}
      </Button>
      <a className="fil-link" href="/app/fil">
        <Icon name="close" size={16} /> Annuler
      </a>
    </form>
  );
}

/** La case « Info importante », ses cinq motifs et le plafond (même règles et mêmes mots que l'appli). */
/** Le stockage de l'onglet (absent côté serveur, refusé en navigation privée). */
function tabStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

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
          <span className="fp-stamp" data-testid="fil-publish-stamp">
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
