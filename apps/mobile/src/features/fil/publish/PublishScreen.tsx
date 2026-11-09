// « Publier au Fil » (lot R7e2, D38, maquettes R7.24 `s-ext` et R7.8 pour la plaque) : 1 à 6 photos (galerie ou appareil),
// recadrage 4:5 par défaut avec bascule 1:1 / paysage, la plaque de chaque photo (cadre repéré et ajustable, ou « Aucune
// plaque visible » confirmée : obligatoire, sinon le bouton est grisé avec la ligne qui dit quoi), un mot (500 au plus),
// la voiture (du garage) et l'événement (où j'ai une place). Envoi photo par photo (`POST /me/uploads` purpose
// `feed_post`), puis `POST /me/feed-posts`. Mode B (écran de flux). Un nouvel essai ne renvoie pas les photos déjà
// parties ; l'identifiant de la publication est gardé (une réponse perdue ne crée pas de doublon).
import { Chip, Icon, SendProgress, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  DEFAULT_FEED_ASPECT,
  eventsWithPlace,
  FEED_ASPECT_RATIOS,
  FEED_CAPTION_MAX,
  FEED_POST_PHOTOS_MAX,
  type FeedAspect,
  feedAspectLabels,
  feedPostBody,
  feedScreenLabels as L,
  publishIssue,
  vehicleWizardLabels as V,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";

import { PlateFrameEditor } from "@/features/vehicle/add/PlateFrameEditor";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cropAspect, type PickedPhoto, pickPhotos, takePhoto } from "@/lib/photos";
import { detectPlateReadings, surePlates } from "@/lib/plates/detect";
import { discardTempPhotos, rememberTempPhotos } from "@/lib/tempPhotos";
import { useApi } from "@/lib/useApi";
import { Seg, SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SquareCropper } from "@/ui/SquareCropper";
import { markFeedDirty } from "../feedSignal";
import {
  addFrame,
  blurInstead,
  confirmNoPlate,
  type FeedDraftPhoto,
  framesFromDetection,
  newDraftPhoto,
  plateBadge,
  plateControls,
  recropped,
  removeFrame,
  setFrames,
  withDetection,
} from "./model";

const { space1, space2, space3 } = tokens.spacing;

const ASPECTS: { value: FeedAspect; label: string }[] = [
  { value: "portrait_4_5", label: "4:5" },
  { value: "square", label: "1:1" },
  { value: "landscape", label: "Paysage" },
];

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

export function PublishScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const [aspect, setAspect] = useState<FeedAspect>(DEFAULT_FEED_ASPECT);
  const [photos, setPhotos] = useState<FeedDraftPhoto[]>([]);
  const [current, setCurrent] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [caption, setCaption] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formatNote, setFormatNote] = useState(false);
  // « Recadrer » : la clé de la photo qu'on recadre au doigt (plein écran), et l'attente de la découpe.
  const [cropping, setCropping] = useState<string | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [clientId] = useState(() => randomUUID());
  // Photos déjà envoyées (adresse locale → clé) : un nouvel essai ne les renvoie pas.
  const keys = useRef<Record<string, string>>({});
  // Chaque changement de format ouvre une génération : les recadrages et détections d'avant sont jetés à leur arrivée.
  const generation = useRef(0);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const vehicles = useApi(() => api.vehicles(), []);
  const applications = useApi(() => api.applications("upcoming"), []);
  const events = eventsWithPlace(applications.data ?? []);
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
    setError(null);
    try {
      const room = FEED_POST_PHOTOS_MAX - photos.length;
      const picked = from === "camera" ? await takePhoto(4096) : await pickPhotos(room, undefined, 4096);
      if (!picked.length) return;
      const gen = generation.current;
      const wanted = aspectRef.current;
      const fresh: FeedDraftPhoto[] = [];
      for (const source of picked.slice(0, room)) {
        const cropped = await cropAspect(source, wanted);
        // Ces JPEG ne sont pas floutés : effacés dès qu'ils ne servent plus (`tempPhotos`).
        rememberTempPhotos(source.uri, cropped.uri);
        fresh.push(newDraftPhoto(randomUUID(), source, cropped));
      }
      if (gen !== generation.current) return;
      setPhotos((list) => [...list, ...fresh].slice(0, FEED_POST_PHOTOS_MAX));
      for (const p of fresh) void detect(p.key, p.photo, gen);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function changeAspect(next: FeedAspect) {
    if (busy || next === aspect) return;
    const gen = ++generation.current;
    setAspect(next);
    setConfirming(false);
    if (!photos.length) return;
    setFormatNote(true);
    try {
      const again: FeedDraftPhoto[] = [];
      for (const p of photos) {
        const cropped = await cropAspect(p.source, next);
        rememberTempPhotos(cropped.uri);
        again.push(recropped(p, cropped));
      }
      if (gen !== generation.current) {
        discardTempPhotos(again.map((p) => p.photo.uri));
        return;
      }
      discardTempPhotos(photos.map((p) => p.photo.uri));
      setPhotos(again);
      for (const p of again) void detect(p.key, p.photo, gen);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const patch = (key: string, fn: (p: FeedDraftPhoto) => FeedDraftPhoto) =>
    setPhotos((list) => list.map((p) => (p.key === key ? fn(p) : p)));

  const index = Math.min(current, Math.max(0, photos.length - 1));
  const photo = photos[index];
  // Les cartes de décision d'une photo retirée ne doivent pas rester ouvertes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la confirmation se ferme quand on change de photo.
  useEffect(() => setConfirming(false), [index, photo?.photo.uri]);

  // Départ de l'écran (publié, abandonné) : les JPEG non floutés du cache de l'appli sont effacés.
  useEffect(() => () => discardTempPhotos(), []);

  /** Un nouveau cadrage au doigt : la photo est recadrée sur ce centre, sa décision de plaque repart de zéro, la détection est relancée. */
  async function recropAt(key: string, focus: { x: number; y: number }) {
    const target = photos.find((p) => p.key === key);
    if (!target || cropBusy) return;
    setCropBusy(true);
    try {
      const cropped = await cropAspect(target.source, aspect, focus);
      rememberTempPhotos(cropped.uri);
      discardTempPhotos([target.photo.uri]);
      setPhotos((list) => list.map((p) => (p.key === key ? recropped(p, cropped, focus) : p)));
      setConfirming(false);
      setCropping(null);
      void detect(key, cropped, generation.current);
    } catch (e) {
      setError(errorMessage(e));
      setCropping(null);
    } finally {
      setCropBusy(false);
    }
  }

  const controls = photo ? plateControls(photo) : null;
  const preparing = photos.some((p) => p.detection === "pending");
  const issue = publishIssue({ photos, caption, preparing });

  async function publish() {
    if (busy || issue) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const [i, p] of photos.entries()) {
        setSent(i);
        let key = keys.current[p.photo.uri];
        if (!key) {
          key = await uploadPhoto(p.photo, i);
          keys.current[p.photo.uri] = key;
        }
        uploaded.push(key);
      }
      setSent(photos.length);
      const body = feedPostBody({
        photos: photos.map((p, i) => ({ rects: p.rects, noPlate: p.noPlate, uploadKey: uploaded[i] as string })),
        caption,
        aspect,
        vehicleId,
        eventId,
        clientId,
      });
      const post = await api.createFeedPost(body);
      // Ma publication passe en tête du Fil (l'API ne la met pas dans « Abonnements ») ; les JPEG non floutés s'effacent.
      markFeedDirty(post);
      discardTempPhotos();
      setDone(true);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 429) setError(L.tooManyRequests);
      else if (e instanceof ApiRequestError && e.code === "plate_decision_required") {
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
          busy={cropBusy}
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
            {L.publishedText}
          </Text>
        </View>
        <SmButton kind="p" big wide icon="feed" onPress={close} testID="fil-publish-back">
          {L.backToFeed}
        </SmButton>
        <SmButton kind="s" wide icon="gallery" onPress={() => router.replace("/fil/mes-publications")}>
          {L.mineTitle}
        </SmButton>
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
      facts={L.publishSubtitle}
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
          ) : issue ? (
            <Muted variant="caption" testID="fil-publish-missing">
              {issue}
            </Muted>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="upload"
            disabled={busy || Boolean(issue)}
            onPress={() => void publish()}
            testID="fil-publish-send"
          >
            {L.publish}
          </SmButton>
        </View>
      }
    >
      <View style={styles.block} testID="fil-publish">
        <Label text={L.publishPhotos} hint={L.publishPhotosCount(photos.length, FEED_POST_PHOTOS_MAX)} />
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
                disabled={busy}
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
              disabled={busy}
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
            <SmButton kind="s" icon="gallery" disabled={busy} onPress={() => void add("gallery")}>
              {L.gallery}
            </SmButton>
            <SmButton kind="s" icon="camera" disabled={busy} onPress={() => void add("camera")}>
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
            editable={photo.rects.length > 0 && !busy}
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
              disabled={busy || controls?.searching}
              onPress={() => setCropping(photo.key)}
              testID="fil-publish-crop"
            >
              {L.crop}
            </SmButton>
            <SmButton
              kind="s"
              icon="add"
              disabled={busy || !controls?.canAdd}
              onPress={() => patch(photo.key, addFrame)}
              testID="fil-publish-frame-add"
            >
              {V.addFrame}
            </SmButton>
            {photo.rects.length ? (
              <SmButton
                kind="s"
                icon="close"
                disabled={busy}
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
              disabled={busy}
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
                disabled={busy || !controls?.canNone}
                onPress={() => {
                  patch(photo.key, confirmNoPlate);
                  setConfirming(false);
                }}
                testID="fil-publish-none-yes"
              >
                {V.noPlateConfirm}
              </SmButton>
              <SmButton kind="g" icon="close" wide onPress={() => setConfirming(false)}>
                Annuler
              </SmButton>
            </View>
          ) : (
            <SmButton
              kind="s"
              icon="eye"
              wide
              disabled={busy || !controls?.canNone}
              onPress={() => setConfirming(true)}
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
        editable={!busy}
        placeholder={L.captionPlaceholder}
        maxLength={FEED_CAPTION_MAX}
        multiline
        testID="fil-publish-caption"
      />
      <Muted variant="caption">{L.captionHint}</Muted>

      {activeVehicles.length ? (
        <View style={styles.block}>
          <Label text={L.vehicle} hint={L.optional} />
          <View style={styles.chips}>
            {activeVehicles.map((v) => (
              <Chip
                key={v.id}
                selected={vehicleId === v.id}
                onPress={() => !busy && setVehicleId(vehicleId === v.id ? null : v.id)}
              >
                {v.label}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {events.length ? (
        <View style={styles.block}>
          <Label text={L.event} hint={L.optional} />
          <View style={styles.chips}>
            {events.map((e) => (
              <Chip
                key={e.id}
                selected={eventId === e.id}
                onPress={() => !busy && setEventId(eventId === e.id ? null : e.id)}
              >
                {e.title}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
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
