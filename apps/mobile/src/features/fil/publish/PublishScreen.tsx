// « Publier au Fil » (lot R7e2, D38, maquettes R7.24 `s-ext` et R7.8 pour la plaque) : 1 à 6 photos (galerie ou appareil),
// recadrage 4:5 par défaut avec bascule 1:1 / paysage, la plaque de chaque photo (cadre repéré et ajustable, ou « Aucune
// plaque visible » confirmée : obligatoire, sinon le bouton est grisé avec la ligne qui dit quoi), un mot (500 au plus),
// la voiture (du garage) et l'événement (où j'ai une place). Envoi photo par photo (`POST /me/uploads` purpose
// `feed_post`), puis `POST /me/feed-posts`. Mode B (écran de flux). Un nouvel essai ne renvoie pas les photos déjà
// parties ; l'identifiant de la publication est gardé (une réponse perdue ne crée pas de doublon).
import { Chip, Icon, SendProgress, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  acceptEvents,
  actorKeyOfPublishAuthor,
  attachableQuery,
  attachLeadOf,
  coauthorLabels as CO,
  type CoAuthorSearchItem,
  type CommercialDraft,
  captionMaxOf,
  casquettesLabels,
  chooseAuthor,
  chooseEvent,
  coAuthorInputOf,
  commercialField,
  commercialIssue,
  DEFAULT_FEED_ASPECT,
  type EventsForbidden,
  type EventsLoad,
  emptyEventsLoad,
  emptyOfferForm,
  eventsOf,
  eventsStale,
  FEED_ASPECT_RATIOS,
  FEED_PLACE_LABEL_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  feedAspectLabels,
  feedPostBodyR8,
  importantAvailable,
  importantImmediate,
  feedScreenLabels as L,
  noCommercialDraft,
  proOffersLabels as OF,
  type OfferForm,
  offerDatesPhrase,
  type PublishChoice,
  partnershipLabels,
  publicationErrors,
  publishAuthors,
  publishIssueR8,
  publishSays,
  publishStartChoice,
  publishStartOffer,
  showAuthorChoice,
  showEventBlock,
  startEventsLoad,
  feedPublishLabels as T,
  vehicleWizardLabels as V,
  vehicleAllowed,
  withImportantLeft,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";

import { CommercialLine, useCommercialLine } from "@/features/stories/publish/CommercialLine";
import { PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { api } from "@/lib/api";
import type { FeedPostBody } from "@/lib/api/feed";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { accountGuard } from "@/lib/kv";
import { isTwoFactorError } from "@/lib/orga";
import { cropAspect, type PickedPhoto, pickPhotos, takePhoto } from "@/lib/photos";
import { detectPlateReadings, surePlates } from "@/lib/plates/detect";
import { useSession } from "@/lib/session";
import { discardTempPhotos, rememberTempPhotos, tempPhotoEpoch } from "@/lib/tempPhotos";
import { useApi } from "@/lib/useApi";
import { Seg, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SquareCropper } from "@/ui/SquareCropper";
import { markFeedDirty } from "../feedSignal";
import { CoAuthorLine } from "./CoAuthorLine";
import {
  addFrame,
  blurInstead,
  confirmNoPlateFor,
  cropAll,
  dropEventFromChoice,
  eventShown,
  type FeedDraftPhoto,
  framesFromDetection,
  liftsUncertainty,
  mergeRecropped,
  newDraftPhoto,
  plateBadge,
  plateControls,
  recropped,
  removeFrame,
  setFrames,
  withDetection,
} from "./model";
import { OfferBlock } from "./OfferBlock";
import { AuthorChoice, EventChoice, ImportantBox, Note, PosterVisual, Says } from "./PublishChoices";

const { space1, space2, space3 } = tokens.spacing;

const ASPECTS: { value: FeedAspect; label: string }[] = [
  { value: "portrait_4_5", label: "4:5" },
  { value: "square", label: "1:1" },
  { value: "landscape", label: "Paysage" },
];

/** Le refus de la liste des événements : pas le droit de parler au nom de la page, ou second facteur manquant. */
function forbiddenOf(e: unknown): EventsForbidden | null {
  if (isTwoFactorError(e)) return "two_factor_required";
  return e instanceof ApiRequestError && e.code === "persona_forbidden" ? "persona_forbidden" : null;
}

async function uploadPhoto(photo: PickedPhoto, i: number): Promise<string> {
  const form = new FormData();
  form.append("purpose", "feed_post");
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("file", new File([blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" }));
  } else {
    form.append("file", { uri: photo.uri, name: `photo-${i + 1}.jpg`, type: "image/jpeg" } as unknown as Blob);
  }
  return (await api.upload(form)).key;
}

/** Le formulaire est isolé par compte : un autre compte repart d'un brouillon vide (aucune liste ni présence de l'ancien). */
export function PublishScreen({ start }: { start?: PublishStart } = {}) {
  const { me } = useSession();
  return <PublishForm key={me?.user.id ?? "none"} start={start} />;
}

/** Lot R8d : « Publier pour cet événement » ouvre l'écran avec la structure et l'événement déjà choisis (`?structure=&evenement=`). */
export type PublishStart = {
  structure?: string;
  evenement?: string;
  auteur?: string;
  fiche?: string;
  etiquette?: string;
};

function PublishForm({ start }: { start?: PublishStart }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [aspect, setAspect] = useState<FeedAspect>(DEFAULT_FEED_ASPECT);
  const [photos, setPhotos] = useState<FeedDraftPhoto[]>([]);
  const [current, setCurrent] = useState(0);
  // La confirmation « Aucune plaque visible » porte la clé de la photo qu'elle concerne (jamais l'index : une photo retirée
  // ferait passer la suivante à sa place).
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  // Au nom de qui, pour quel événement, « Info importante » (lot R8p) : un seul état, des règles pures.
  const { me } = useSession();
  const authors = useMemo(
    () => publishAuthors(me?.personas ?? [], me?.profile.pseudo ?? "", me?.profile.avatarUrl ?? null),
    [me?.personas, me?.profile.pseudo, me?.profile.avatarUrl],
  );
  // Lot R9c : `?fiche=<identifiant>&etiquette=offre` ouvre l'écran réglé sur la fiche pro, avec l'étiquette « Offre ».
  // biome-ignore lint/correctness/useExhaustiveDependencies: valeurs de départ lues une seule fois
  const startOffer = useMemo(
    () => publishStartOffer({ fiche: start?.fiche, etiquette: start?.etiquette }, authors),
    [],
  );
  const [choice, setChoice] = useState<PublishChoice>(() =>
    startOffer
      ? { ...publishStartChoice({}, authors), authorKey: startOffer.authorKey }
      : publishStartChoice(start ?? {}, authors),
  );
  // Étiquette « Offre » (R9c) : titre et jours saisis ; comptée seulement pour la casquette fiche pro.
  const [offer, setOffer] = useState<OfferForm>(() => ({ ...emptyOfferForm, on: startOffer?.offerOn ?? false }));
  const author = authors.find((a) => a.key === choice.authorKey) ?? (authors[0] as (typeof authors)[number]);
  const fan = vehicleAllowed(author);
  const account = me?.user.id ?? "";
  const [loaded, setLoaded] = useState<EventsLoad>(emptyEventsLoad);
  const [reloadEvents, setReloadEvents] = useState(0);
  // Le compte et la casquette d'aujourd'hui : une réponse lue pour un autre couple est jetée.
  const now = useRef({ account, key: author.key, loadedAt: 0 });
  now.current = { account, key: author.key, loadedAt: loaded.loadedAt };
  // Un envoi sans réponse : le même corps, le même identifiant, tant que la personne n'a pas choisi de le modifier.
  const [uncertain, setUncertain] = useState<FeedPostBody | null>(null);
  const [checking, setChecking] = useState(false);
  // Ce formulaire existe encore ; une seule opération (envoi ou vérification) à la fois.
  const mounted = useRef(true);
  const running = useRef(false);
  const [found, setFound] = useState(false);
  const [recipients, setRecipients] = useState<{ eventId: string; n: number | null } | null>(null);
  const [security, setSecurity] = useState(false);
  // « Collaboration commerciale » (lot R7m2) : obligatoire si un partenaire actif est cité dans la légende, sinon à la main.
  const [commercial, setCommercial] = useState<CommercialDraft>(noCommercialDraft);
  const commercialLine = useCommercialLine(caption, commercial);
  // « Publier avec… » (lot R8o) : un seul co-auteur invité ; absent de la publication quand « Info importante » est cochée.
  const [coAuthor, setCoAuthor] = useState<CoAuthorSearchItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formatNote, setFormatNote] = useState(false);
  // « Recadrer » : la clé de la photo qu'on recadre au doigt (plein écran), et l'attente de la découpe.
  const [cropping, setCropping] = useState<string | null>(null);
  // Une photo se prépare (choix, recadrage, changement de format) : tout ce qui change la liste des photos est grisé
  // jusqu'à la fin, une seule opération à la fois.
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [invitedName, setInvitedName] = useState<string | null>(null);
  const [doneOffer, setDoneOffer] = useState<string | null>(null);
  const [clientId, setClientId] = useState(() => randomUUID());
  // Photos déjà envoyées (adresse locale → clé) : un nouvel essai ne les renvoie pas.
  const keys = useRef<Record<string, string>>({});
  // Chaque changement de format ouvre une génération : les recadrages et détections d'avant sont jetés à leur arrivée.
  const generation = useRef(0);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  // Une opération est d'actualité tant que l'écran est là, que le compte est le même et que le format n'a pas rechangé : un
  // JPEG qui arrive après est effacé tout de suite, jamais gardé.
  const aliveFor = (gen: number) => {
    const epoch = tempPhotoEpoch();
    return () => gen === generation.current && epoch === tempPhotoEpoch();
  };

  const vehicles = useApi(() => api.vehicles(), []);
  const eventBlock = showEventBlock(author);
  // Les événements rattachables de la casquette choisie (rôle déduit par l'API), pour ce compte : rechargés au changement de
  // casquette, au retour sur l'écran, au changement de jour de Paris (plafond de l'« Info importante »), après un échec.
  // biome-ignore lint/correctness/useExhaustiveDependencies: le compte et la casquette sont identifiés par leur clé.
  useEffect(() => {
    if (!eventBlock || !account) return;
    const guard = accountGuard();
    const asked = { account, key: author.key };
    setLoaded((l) => startEventsLoad(l, account, author.key));
    let live = true;
    const apply = (result: Parameters<typeof acceptEvents>[3]) => {
      if (!live || !guard.current()) return;
      setLoaded((l) => acceptEvents(l, now.current, asked, result, Date.now()));
    };
    api
      .attachableEvents(attachableQuery(author))
      .then((r) => apply({ ok: true, items: r.items }))
      .catch((e) => apply({ ok: false, forbidden: forbiddenOf(e) }));
    return () => {
      live = false;
    };
  }, [account, author.key, eventBlock, reloadEvents]);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else setReloadEvents((n) => n + 1);
    }, []),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (eventsStale(now.current.loadedAt, new Date())) setReloadEvents((n) => n + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  const events = eventBlock ? eventsOf(loaded, account, author.key) : [];
  const eventsLoading =
    eventBlock && (loaded.account !== account || loaded.key !== author.key || loaded.items === null) && !loaded.failed;
  const listedEvent = events.find((e) => e.id === choice.eventId) ?? null;
  // Le dernier événement connu pour ce choix : pendant un envoi figé, il reste affiché même si la liste relue ne le contient plus.
  const lastEvent = useRef<typeof listedEvent>(null);
  if (listedEvent) lastEvent.current = listedEvent;
  const event = eventShown(listedEvent, lastEvent.current, choice.eventId, uncertain !== null);
  // Un événement choisi qui n'est plus dans la liste relue (plus rattachable) : retiré, le reste du brouillon reste. Pas tant qu'un
  // envoi est figé en attente de vérification : le corps gardé le contient, l'écran montre ce qui part (l'effet attend la fin).
  useEffect(() => {
    if (!choice.eventId || !loaded.items || loaded.account !== account || loaded.key !== author.key) return;
    if (
      dropEventFromChoice(
        choice.eventId,
        loaded.items.map((e) => e.id),
        uncertain !== null,
      )
    )
      setChoice((c) => chooseEvent(c, null));
  }, [loaded, choice.eventId, account, author.key, uncertain]);
  const showImportant = importantAvailable(author, event);
  // Combien d'inscrits sont prévenus : relu à chaque événement choisi ; en cas d'échec, la phrase sans nombre.
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu pour l'événement choisi.
  useEffect(() => {
    if (!showImportant || !event) return;
    let live = true;
    const guard = accountGuard();
    const id = event.id;
    api
      .eventNotifyPreview(id)
      .then((r) => live && guard.current() && setRecipients({ eventId: id, n: r.recipients }))
      .catch(() => live && guard.current() && setRecipients({ eventId: id, n: null }));
    return () => {
      live = false;
    };
  }, [showImportant, event?.id]);
  const posterVisual = photos.length === 0 && event !== null && event.hasVisual;
  const activeVehicles = (vehicles.data ?? []).filter((v) => v.status === undefined || v.status === "active");

  const close = () => (router.canGoBack() ? router.back() : router.replace("/fil"));

  /** Cherche la plaque sur la photo recadrée de cette génération. */
  const detect = useCallback(async (key: string, photo: PickedPhoto, gen: number) => {
    let found: Awaited<ReturnType<typeof detectPlateReadings>> = null;
    try {
      found = await detectPlateReadings(photo.uri, photo.width, photo.height);
    } catch {
      found = null;
    }
    if (gen !== generation.current) return;
    const rects = found ? surePlates(found).map((f) => f.rect) : null;
    // Le résultat ne vaut que pour la photo recadrée qu'on a cherchée : une photo recadrée entre-temps repart de zéro.
    setPhotos((list) => list.map((p) => (p.key === key && p.photo.uri === photo.uri ? withDetection(p, rects) : p)));
  }, []);

  async function add(from: "gallery" | "camera") {
    if (busy || working) return;
    setError(null);
    setWorking(true);
    const gen = generation.current;
    const alive = aliveFor(gen);
    let sources: PickedPhoto[] = [];
    try {
      const room = FEED_POST_PHOTOS_MAX - photos.length;
      const picked = from === "camera" ? await takePhoto(4096) : await pickPhotos(room, undefined, 4096);
      sources = picked.slice(0, room);
      // Ces JPEG ne sont pas floutés : effacés dès qu'ils ne servent plus (`tempPhotos`), tout de suite s'ils arrivent trop tard.
      if (!alive()) return discardTempPhotos(picked.map((s) => s.uri));
      if (!sources.length) return;
      // Les sources sont notées dès leur retour : une purge pendant le recadrage les voit.
      rememberTempPhotos(...sources.map((s) => s.uri));
      const wanted = aspectRef.current;
      const cropped = await cropAll(
        sources,
        (s) => cropAspect(s, wanted),
        alive,
        discardTempPhotos,
        rememberTempPhotos,
      );
      if (!cropped) return discardTempPhotos(sources.map((s) => s.uri));
      // Devenu caduc entre la fin de `cropAll` et ici (démontage, purge du compte) : rien n'est gardé.
      if (!alive()) return discardTempPhotos([...sources.map((s) => s.uri), ...cropped.map((p) => p.uri)]);
      const fresh = sources.map((source, i) => newDraftPhoto(randomUUID(), source, cropped[i] as PickedPhoto));
      setPhotos((list) => [...list, ...fresh].slice(0, FEED_POST_PHOTOS_MAX));
      for (const p of fresh) void detect(p.key, p.photo, gen);
    } catch (e) {
      discardTempPhotos(sources.map((s) => s.uri));
      if (alive()) setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  async function changeAspect(next: FeedAspect) {
    if (busy || working || next === aspect) return;
    const gen = ++generation.current;
    const alive = aliveFor(gen);
    setAspect(next);
    setConfirmKey(null);
    if (!photos.length) return;
    setFormatNote(true);
    setWorking(true);
    try {
      const cropped = await cropAll(
        photos.map((p) => p.source),
        (s) => cropAspect(s, next),
        alive,
        discardTempPhotos,
        rememberTempPhotos,
      );
      if (!cropped) return;
      if (!alive()) return discardTempPhotos(cropped.map((p) => p.uri));
      const again = new Map(photos.map((p, i) => [p.key, cropped[i] as PickedPhoto]));
      discardTempPhotos(photos.map((p) => p.photo.uri));
      // Par clé, sur la liste d'aujourd'hui : une photo retirée ne revient pas, une photo ajoutée n'est pas perdue.
      setPhotos((list) => mergeRecropped(list, again));
      for (const [key, photo] of again) void detect(key, photo, gen);
    } catch (e) {
      if (alive()) setError(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  const patch = (key: string, fn: (p: FeedDraftPhoto) => FeedDraftPhoto) =>
    setPhotos((list) => list.map((p) => (p.key === key ? fn(p) : p)));

  const index = Math.min(current, Math.max(0, photos.length - 1));
  const photo = photos[index];
  // Les cartes de décision d'une photo retirée ne doivent pas rester ouvertes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la confirmation se ferme quand on change de photo.
  useEffect(() => setConfirmKey(null), [index, photo?.key, photo?.photo.uri]);
  const confirming = photo !== undefined && confirmKey === photo.key;

  // Départ de l'écran (publié, abandonné) : les opérations en cours sont invalidées (leurs JPEG tardifs sont effacés à
  // leur arrivée) et les JPEG non floutés du cache de l'appli sont effacés.
  useEffect(() => {
    mounted.current = true;
    return () => {
      // Le formulaire n'existe plus : une réponse qui arrive après n'écrit rien chez le formulaire suivant (même compte).
      mounted.current = false;
      generation.current++;
      discardTempPhotos();
    };
  }, []);

  /** Un nouveau cadrage au doigt : la photo est recadrée sur ce centre, sa décision de plaque repart de zéro, la détection est relancée. */
  async function recropAt(key: string, focus: { x: number; y: number }) {
    const target = photos.find((p) => p.key === key);
    if (!target || busy || working) return;
    setWorking(true);
    const gen = generation.current;
    const alive = aliveFor(gen);
    try {
      const cropped = await cropAspect(target.source, aspect, focus);
      if (!alive()) return discardTempPhotos([cropped.uri]);
      rememberTempPhotos(cropped.uri);
      discardTempPhotos([target.photo.uri]);
      setPhotos((list) => list.map((p) => (p.key === key ? recropped(p, cropped, focus) : p)));
      setConfirmKey(null);
      setCropping(null);
      void detect(key, cropped, gen);
    } catch (e) {
      if (alive()) {
        setError(errorMessage(e));
        setCropping(null);
      }
    } finally {
      setWorking(false);
    }
  }

  const controls = photo ? plateControls(photo) : null;
  const preparing = working || photos.some((p) => p.detection === "pending");
  const frozen = busy || uncertain !== null;
  const locked = frozen || working;
  const important = { on: showImportant && choice.importantOn, reason: choice.importantReason };
  const offerOn = author.persona === "pro" && offer.on;
  const issue =
    publishIssueR8({
      photos,
      caption,
      preparing,
      author,
      event,
      important,
      forbidden: eventBlock ? loaded.forbidden : null,
      offer: offerOn ? offer : null,
    }) ?? (fan ? commercialIssue(commercialLine, partnershipLabels.commercialPick) : null);

  async function publish() {
    if (running.current || busy || checking || working || (!uncertain && issue)) return;
    running.current = true;
    try {
      await publishRun();
    } finally {
      running.current = false;
    }
  }

  async function publishRun() {
    setBusy(true);
    setError(null);
    setSecurity(false);
    // Le compte au départ : après chaque attente, si ce n'est plus le même, rien ne part et rien n'est écrit (ni requête, ni
    // Fil global, ni photos temporaires : tout cela appartient au compte d'aujourd'hui).
    const guard = accountGuard();
    let sending: FeedPostBody | null = null;
    try {
      const uploaded: string[] = [];
      for (const [i, p] of uncertain ? [] : photos.entries()) {
        setSent(i);
        let key = keys.current[p.photo.uri];
        if (!key) {
          key = await uploadPhoto(p.photo, i);
          if (!guard.current()) return;
          keys.current[p.photo.uri] = key;
        }
        uploaded.push(key);
      }
      setSent(photos.length);
      const body: FeedPostBody = uncertain ?? {
        ...feedPostBodyR8({
          photos: photos.map((p, i) => ({ rects: p.rects, noPlate: p.noPlate, uploadKey: uploaded[i] as string })),
          caption,
          aspect,
          clientId,
          expectedUserId: account,
          author,
          eventId: event ? event.id : null,
          vehicleId: choice.vehicleId,
          placeLabel: choice.placeLabel,
          important,
          offer: offerOn ? offer : null,
          ...(fan ? commercialField(commercialLine) : {}),
        }),
        // « Publier avec… » (R8o) : le corps R8p ne le connaît pas ; il part à côté, sauf avec « Info importante ».
        ...(coAuthor && !important.on ? { coAuthor: coAuthorInputOf(coAuthor) } : {}),
      };
      if (!guard.current()) return;
      sending = body;
      const post = await api.createFeedPost({ ...body, expectedUserId: account });
      // La réponse d'un autre compte (déconnexion, reconnexion pendant l'envoi) n'écrit rien chez celui d'aujourd'hui.
      if (!guard.current()) return;
      setUncertain(null);
      // Ma publication passe en tête du Fil (l'API ne la met pas dans « Abonnements ») ; les JPEG non floutés s'effacent.
      markFeedDirty(post);
      // La confirmation d'une offre : « Publié : <fiche> · offre du 10 au 30 nov. » (maquette R9.2b).
      setDoneOffer(post.offer ? OF.published(author.name, offerDatesPhrase(post.offer)) : null);
      // Les JPEG temporaires sont ceux de ce formulaire : s'il n'existe plus, ce sont peut-être ceux du suivant.
      if (mounted.current) discardTempPhotos();
      setInvitedName(post.coAuthorInvite ? post.coAuthorInvite.name : null);
      setDone(true);
    } catch (e) {
      if (!guard.current()) return;
      // Un refus définitif prouve que rien n'a été créé : on sort de l'état incertain (429 et 401 ne prouvent rien : le contrôle
      // de rejeu de l'API vient après ; le corps incertain est gardé).
      // 409 `account_changed` : l'incertitude reste (une première tentative sous le bon compte a pu aboutir).
      if (e instanceof ApiRequestError && liftsUncertainty(e)) setUncertain(null);
      if (e instanceof ApiRequestError && e.status === 429) setError(L.tooManyRequests);
      else if (e instanceof ApiRequestError && e.status === 401) setError(errorMessage(e));
      else if (sending && e instanceof ApiRequestError && (e.isNetwork || e.status >= 500)) {
        // Pas de réponse : la publication est peut-être partie. Le formulaire se fige sur ce corps et ce `clientId`.
        setUncertain(sending);
        setError(T.noNetwork);
      } else if (e instanceof ApiRequestError && e.isNetwork) setError(T.noNetwork);
      else if (isTwoFactorError(e) || (e instanceof ApiRequestError && e.code === "persona_forbidden")) {
        // Pas le droit de parler au nom de cette page (ou second facteur manquant) : le message et le lien vers la sécurité.
        setError(
          e instanceof ApiRequestError && e.code === "persona_forbidden"
            ? publicationErrors.persona_forbidden
            : errorMessage(e),
        );
        setSecurity(true);
      } else if (e instanceof ApiRequestError && e.code === "event_not_attachable") {
        // L'événement n'est plus rattachable : la liste est rechargée, l'événement retiré, rien d'autre n'est perdu.
        setChoice((c) => chooseEvent(c, null));
        setReloadEvents((n) => n + 1);
        setError(`${publicationErrors.event_not_attachable} ${T.listReloaded}`);
      } else if (e instanceof ApiRequestError && e.code === "important_quota") {
        // Le plafond réel est affiché, la case se décoche, le reste du brouillon reste.
        const d = e.details as { leftToday?: number; leftWeek?: number } | undefined;
        const at = event?.id;
        if (at && d && Number.isFinite(d.leftToday) && Number.isFinite(d.leftWeek)) {
          setLoaded((l) => withImportantLeft(l, at, { leftToday: Number(d.leftToday), leftWeek: Number(d.leftWeek) }));
        }
        setChoice((c) => ({ ...c, importantOn: false, importantReason: null }));
        setError(publicationErrors.important_quota);
      } else if (e instanceof ApiRequestError && e.code === "plate_decision_required") {
        // Le serveur dit quelle photo n'a pas de décision de plaque : on l'ouvre.
        const at = Number((e.details as { photoIndex?: number } | undefined)?.photoIndex);
        if (Number.isFinite(at)) setCurrent(at);
        setError(e.message);
      } else {
        // Une clé déjà envoyée peut avoir été refusée (photo inconnue) : au nouvel essai, tout repart.
        if (e instanceof ApiRequestError && e.status === 400) keys.current = {};
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
      setSent(null);
    }
  }

  /**
   * « Modifier ma publication » après un envoi incertain : on vérifie d'abord (`GET /me/feed-posts/by-client/:clientId`).
   * Publiée : on le dit, rien à renvoyer. Absente : nouvel identifiant, saisie gardée. Vérification impossible : l'envoi
   * reste incertain (le formulaire ne se libère jamais sur un doute).
   */
  async function abandonUncertain() {
    if (!uncertain || checking || busy || running.current) return;
    running.current = true;
    const guard = accountGuard();
    setChecking(true);
    setError(null);
    try {
      const post = await api.feedPostByClient(uncertain.clientId);
      if (!guard.current()) return;
      markFeedDirty(post);
      if (mounted.current) discardTempPhotos();
      setUncertain(null);
      setFound(true);
      setDone(true);
    } catch (e) {
      if (!guard.current()) return;
      if (e instanceof ApiRequestError && e.status === 404) {
        setUncertain(null);
        setClientId(randomUUID());
        keys.current = {};
      } else setError(T.uncertainUnchecked);
    } finally {
      running.current = false;
      setChecking(false);
    }
  }

  if (cropping) {
    const at = photos.findIndex((p) => p.key === cropping);
    const target = photos[at];
    if (target) {
      const label = ASPECTS.find((a) => a.value === aspect)?.label ?? "";
      return (
        <SquareCropper
          key={target.key}
          photo={target.source}
          ratio={FEED_ASPECT_RATIOS[aspect]}
          initialFocus={target.focus}
          subtitle={L.cropOf(at + 1, photos.length, label)}
          badge={L.cropBadge(label)}
          hint={L.cropHint}
          busy={working}
          onCancel={() => setCropping(null)}
          onConfirmFocus={(focus) => void recropAt(target.key, focus)}
        />
      );
    }
  }

  if (done) {
    return (
      <FlowScreen title={L.publishTitle} onClose={close}>
        <View style={[styles.done, { backgroundColor: c.surface }]} testID="fil-publish-done">
          <Icon name="check" size={28} color={c.accentText} />
          <Text variant="posterM" color={c.ink}>
            {L.published}
          </Text>
          <Text variant="body" color={c.inkMuted}>
            {found ? T.uncertainFound : L.publishedText}
          </Text>
          {doneOffer ? (
            <Text variant="bodyStrong" color={c.ink} testID="fil-publish-done-offer">
              {doneOffer}
            </Text>
          ) : null}
          {invitedName ? (
            <Text variant="body" color={c.inkMuted} testID="fil-publish-invited">
              {CO.sent(invitedName)}
            </Text>
          ) : null}
        </View>
        <SmButton kind="p" big wide icon="feed" onPress={close} testID="fil-publish-back">
          {L.backToFeed}
        </SmButton>
        {fan ? (
          <SmButton kind="s" wide icon="gallery" onPress={() => router.replace("/fil/mes-publications")}>
            {L.mineTitle}
          </SmButton>
        ) : null}
      </FlowScreen>
    );
  }

  const badgeText = (p: FeedDraftPhoto) => {
    const b = plateBadge(p);
    return b === "blurred" ? L.plateOk : b === "none" ? L.plateNone : b === "pending" ? L.plateSearching : L.plateTodo;
  };

  return (
    <FlowScreen
      title={L.publishTitle}
      facts={author.destination === "me" ? L.publishSubtitle : casquettesLabels.publishAs(author.name)}
      onClose={close}
      footer={
        <View style={styles.footer}>
          {busy && sent !== null ? (
            <View style={styles.progress}>
              <SendProgress size={44} ring={false} progress={photos.length ? sent / photos.length : 0} />
              <Muted variant="caption" testID="fil-publish-progress">
                {sent < photos.length ? L.sending(sent + 1, photos.length) : L.publishing}
              </Muted>
            </View>
          ) : uncertain ? (
            <Muted variant="caption" testID="fil-publish-uncertain">
              {T.uncertainTitle}
            </Muted>
          ) : issue ? (
            <Muted variant="caption" testID="fil-publish-missing">
              {issue}
            </Muted>
          ) : null}
          {uncertain && !busy ? (
            <SmButton
              kind="s"
              wide
              icon="edit"
              disabled={checking}
              onPress={() => void abandonUncertain()}
              testID="fil-publish-uncertain-edit"
            >
              {checking ? T.uncertainChecking : T.uncertainEdit}
            </SmButton>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="upload"
            disabled={busy || checking || (!uncertain && Boolean(issue))}
            onPress={() => void publish()}
            testID="fil-publish-send"
          >
            {uncertain ? T.uncertainRetry : L.publish}
          </SmButton>
        </View>
      }
    >
      <View style={styles.block} testID="fil-publish">
        {/* Lot R9n (T18) : un seul geste pour publier ; « Story » ouvre l'écran de story au nom de la même casquette. */}
        <Seg
          value="post"
          onChange={(kind) => {
            if (kind === "story") {
              router.replace(
                `/story/publier?auteur=${encodeURIComponent(actorKeyOfPublishAuthor(author.key))}` as never,
              );
            }
          }}
          disabled={busy || checking || working}
          options={[
            { value: "post", label: casquettesLabels.publishKindPost, icon: "gallery" },
            { value: "story", label: casquettesLabels.publishKindStory, icon: "camera" },
          ]}
          testID="fil-publish-kind"
        />
        <Label text={L.publishPhotos} hint={L.publishPhotosCount(photos.length, FEED_POST_PHOTOS_MAX)} />
        {posterVisual && event ? <PosterVisual event={event} /> : null}
        <View style={styles.grid}>
          {photos.map((p, i) => (
            <Pressable
              key={p.key}
              accessibilityRole="button"
              accessibilityLabel={`${L.plateFrameFor(i + 1)} : ${badgeText(p)}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => setCurrent(i)}
              style={[styles.tile, { backgroundColor: c.night, borderColor: i === index ? c.accent : "transparent" }]}
              testID="fil-publish-photo"
            >
              <Image source={{ uri: p.photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={[styles.tileBadge, { backgroundColor: `${c.night}d9` }]}>
                <Icon name={plateBadge(p) === "todo" ? "alert" : "check"} size={12} color={c.nightInk} />
                <Text variant="caption" color={c.nightInk} style={styles.tileBadgeText}>
                  {badgeText(p)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L.removePhoto}
                disabled={locked}
                onPress={() => {
                  discardTempPhotos([p.source.uri, p.photo.uri]);
                  setPhotos((list) => list.filter((x) => x.key !== p.key));
                  setCurrent(0);
                }}
                style={[styles.tileX, { backgroundColor: `${c.night}c7` }]}
                hitSlop={6}
                testID="fil-publish-photo-remove"
              >
                <Icon name="trash" size={14} color={c.nightInk} />
              </Pressable>
            </Pressable>
          ))}
          {photos.length < FEED_POST_PHOTOS_MAX ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${L.addPhotos}, ${L.publishPhotosCount(photos.length, FEED_POST_PHOTOS_MAX)}`}
              disabled={locked}
              onPress={() => void add("gallery")}
              style={[styles.tile, styles.addTile, { borderColor: c.line }]}
              testID="fil-publish-add"
            >
              <Icon name="add" size={22} color={c.ink} />
              <Text variant="bodyStrong" color={c.ink}>
                {L.addPhotos}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {photos.length < FEED_POST_PHOTOS_MAX ? (
          <View style={styles.row}>
            <SmButton kind="s" icon="gallery" disabled={locked} onPress={() => void add("gallery")}>
              {L.gallery}
            </SmButton>
            <SmButton kind="s" icon="camera" disabled={locked} onPress={() => void add("camera")}>
              {L.camera}
            </SmButton>
          </View>
        ) : null}
      </View>

      <View style={styles.block}>
        <Label text={L.format} />
        <Seg<FeedAspect>
          value={aspect}
          onChange={(v) => void changeAspect(v)}
          disabled={locked}
          options={ASPECTS}
          testID="fil-publish-format"
        />
        <Muted variant="caption">{L.formatHint}</Muted>
        {formatNote && photos.length ? (
          <Muted variant="caption" testID="fil-publish-format-note">
            {feedAspectLabels[aspect]} · {L.formatChanged}
          </Muted>
        ) : null}
      </View>

      {photo ? (
        <View style={styles.block} testID="fil-publish-plate">
          <Label text={`${L.plateTitle} · ${L.plateFrameFor(index + 1)}`} />
          <PlateFrameEditor
            key={photo.key + photo.photo.uri}
            source={{ uri: photo.photo.uri }}
            width={photo.photo.width}
            height={photo.photo.height}
            rects={photo.rects}
            editable={photo.rects.length > 0 && !locked}
            onChange={(rects) => patch(photo.key, (p) => setFrames(p, rects))}
            mask="black"
            loupe
            testID="fil-publish-plate-editor"
          />
          <Text variant="caption" color={c.inkMuted} accessibilityLiveRegion="polite" testID="fil-publish-plate-state">
            {photo.detection === "pending"
              ? L.plateSearching
              : photo.noPlate
                ? L.plateConfirmNoneHint
                : photo.rects.length
                  ? (framesFromDetection(photo) ? L.plateFound : L.platePlaced)(photo.rects.length)
                  : L.plateNotFound}
          </Text>
          <View style={styles.row}>
            <SmButton
              kind="s"
              icon="crop"
              disabled={locked || controls?.searching}
              onPress={() => setCropping(photo.key)}
              testID="fil-publish-crop"
            >
              {L.crop}
            </SmButton>
            <SmButton
              kind="s"
              icon="add"
              disabled={locked || !controls?.canAdd}
              onPress={() => patch(photo.key, addFrame)}
              testID="fil-publish-frame-add"
            >
              {V.addFrame}
            </SmButton>
            {photo.rects.length ? (
              <SmButton
                kind="s"
                icon="close"
                disabled={locked}
                onPress={() => patch(photo.key, removeFrame)}
                testID="fil-publish-frame-remove"
              >
                {V.removeFrame}
              </SmButton>
            ) : null}
          </View>
          {photo.noPlate ? (
            <SmButton
              kind="s"
              icon="undo"
              wide
              disabled={locked}
              onPress={() => patch(photo.key, blurInstead)}
              testID="fil-publish-plate-blur"
            >
              {L.plateUndoNone}
            </SmButton>
          ) : confirming ? (
            <View style={[styles.confirm, { backgroundColor: c.surface }]} testID="fil-publish-none-confirm">
              <Text variant="bodyStrong" color={c.ink}>
                {V.noPlateConfirmTitle}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {V.noPlateConfirmBody}
              </Text>
              <SmButton
                kind="s"
                icon="check"
                wide
                disabled={locked || !controls?.canNone}
                onPress={() => {
                  // La confirmation vise la photo dont elle porte la clé : si elle n'est plus là, rien ne bouge.
                  setPhotos((list) => confirmNoPlateFor(list, confirmKey));
                  setConfirmKey(null);
                }}
                testID="fil-publish-none-yes"
              >
                {V.noPlateConfirm}
              </SmButton>
              <SmButton kind="g" icon="close" wide onPress={() => setConfirmKey(null)}>
                Annuler
              </SmButton>
            </View>
          ) : (
            <SmButton
              kind="s"
              icon="eye"
              wide
              disabled={locked || !controls?.canNone}
              onPress={() => setConfirmKey(photo.key)}
              testID="fil-publish-none"
            >
              {L.plateConfirmNone}
            </SmButton>
          )}
          <Muted variant="caption">{V.irreversible}</Muted>
        </View>
      ) : null}

      <TextField
        label={L.caption}
        value={caption}
        onChangeText={setCaption}
        editable={!frozen}
        placeholder={L.captionPlaceholder}
        maxLength={captionMaxOf(author)}
        multiline
        testID="fil-publish-caption"
      />
      <Muted variant="caption">{fan ? L.captionHint : T.captionHintPage}</Muted>
      {author.persona === "pro" ? <OfferBlock value={offer} onChange={setOffer} disabled={frozen} /> : null}

      <Note lead={T.oneGesture.lead} testID="fil-publish-gesture">
        {T.oneGesture.rest}
      </Note>
      {showAuthorChoice(authors) ? (
        <AuthorChoice
          authors={authors}
          value={author.key}
          disabled={frozen}
          onChoose={(key) => setChoice((c) => chooseAuthor(c, authors, key))}
        />
      ) : null}
      {fan && activeVehicles.length ? (
        <View style={styles.block}>
          <Label text={L.vehicle} hint={L.optional} />
          <View style={styles.chips}>
            {activeVehicles.map((v) => (
              <Chip
                key={v.id}
                selected={choice.vehicleId === v.id}
                onPress={() => !frozen && setChoice((c) => ({ ...c, vehicleId: c.vehicleId === v.id ? null : v.id }))}
              >
                {v.label}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {eventBlock ? (
        <EventChoice
          lead={attachLeadOf(author)}
          noneHint={T.attachNoneHint[author.destination]}
          events={events}
          loading={eventsLoading}
          failed={loaded.account === account && loaded.key === author.key && loaded.failed && !loaded.forbidden}
          onRetry={() => setReloadEvents((n) => n + 1)}
          value={event ? event.id : null}
          disabled={frozen}
          onChoose={(id) => setChoice((c) => chooseEvent(c, id))}
          foot={fan ? T.attachFoot : null}
        />
      ) : null}
      {!event ? (
        <TextField
          label={`${T.placeLabel} · ${T.optional}`}
          value={choice.placeLabel}
          onChangeText={(placeLabel) => setChoice((c) => ({ ...c, placeLabel }))}
          editable={!frozen}
          placeholder={T.placePlaceholder}
          maxLength={FEED_PLACE_LABEL_MAX}
          testID="fil-publish-place"
        />
      ) : null}
      {showImportant && event ? (
        <ImportantBox
          event={event}
          on={choice.importantOn}
          reason={choice.importantReason}
          recipients={recipients?.eventId === event.id ? recipients.n : null}
          immediate={importantImmediate(event.startsAt, new Date())}
          disabled={frozen}
          onToggle={(on) =>
            setChoice((c) => ({ ...c, importantOn: on, importantReason: on ? c.importantReason : null }))
          }
          onReason={(importantReason) => setChoice((c) => ({ ...c, importantReason }))}
        />
      ) : null}
      {fan ? <CommercialLine line={commercialLine} onDraft={setCommercial} disabled={frozen} kind="post" /> : null}
      {!important.on ? <CoAuthorLine value={coAuthor} onChange={setCoAuthor} disabled={frozen} /> : null}
      <Says says={publishSays(author, event, important.on, offerOn)} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loaded.forbidden && eventBlock ? (
        <Notice tone="error" testID="fil-publish-forbidden">
          {loaded.forbidden === "persona_forbidden" ? publicationErrors.persona_forbidden : T.forbiddenMore}
        </Notice>
      ) : null}
      {security || (loaded.forbidden && eventBlock) ? (
        <SmButton
          kind="s"
          wide
          icon="shield"
          onPress={() => router.push("/reglages/securite")}
          testID="fil-publish-security"
        >
          {T.securityLink}
        </SmButton>
      ) : null}
      {vehicles.error ? <LoadError message={vehicles.error.message} onRetry={() => void vehicles.reload()} /> : null}
    </FlowScreen>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  const { t } = useTheme();
  return (
    <Text variant="bodyStrong" color={t.color.ink} style={styles.label}>
      {text}
      {hint ? <Text variant="caption" color={t.color.inkMuted}>{`  ${hint}`}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space1 + 2 },
  progress: { flexDirection: "row", alignItems: "center", gap: space2 },
  block: { gap: space2 },
  label: { fontSize: 14, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: {
    width: "31.5%",
    aspectRatio: 0.8,
    borderRadius: tokens.radius.radiusMd + 2,
    overflow: "hidden",
    borderWidth: 2,
  },
  addTile: { borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
  tileBadge: {
    position: "absolute",
    left: 4,
    bottom: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: tokens.radius.radiusSm,
  },
  tileBadgeText: { fontSize: 10.5, flexShrink: 1 },
  tileX: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  confirm: { gap: space2, padding: space3, borderRadius: tokens.radius.radiusMd },
  done: { gap: space2, padding: space3, borderRadius: tokens.radius.radiusLg, alignItems: "flex-start" },
});
