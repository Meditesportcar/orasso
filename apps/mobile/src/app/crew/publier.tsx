// « Publier dans le crew » (lot R5c1, maquette R5.10, sans l'étape de plaque ni le carré : D36) : 1 à 6 photos
// (galerie ou appareil), un mot, le véhicule et la sortie facultatifs, « Visible par les N membres du crew » ; ou un
// sondage (question, 2 à 6 réponses, fin facultative). Les photos partent une à une (`POST /me/uploads`,
// `purpose=crew_post`), puis la publication les rattache. `/crew/publier?crew=<adresse du crew>`.
import { Chip, Icon, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  CREW_POLL_OPTION_MAX,
  CREW_POLL_OPTIONS_MAX,
  CREW_POLL_OPTIONS_MIN,
  CREW_POLL_QUESTION_MAX,
  CREW_POST_PHOTOS_MAX,
  CREW_POST_TEXT_MAX,
  type CrewPostCreate,
  crewFeedLabels,
  crewLabels,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";

import { markCrewFeedDirty } from "@/features/crews/feed/feedSignal";
import { Seg, SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { type PickedPhoto, pickPhotos, takePhoto } from "@/lib/photos";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;
const END_CHOICES = [0, 1, 3, 7] as const;

type Mode = "photo" | "poll";

async function uploadPhoto(photo: PickedPhoto, i: number): Promise<string> {
  const form = new FormData();
  form.append("purpose", "crew_post");
  if (Platform.OS === "web") {
    const blob = await (await fetch(photo.uri)).blob();
    form.append("file", new File([blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" }));
  } else {
    form.append("file", { uri: photo.uri, name: `photo-${i + 1}.jpg`, type: "image/jpeg" } as unknown as Blob);
  }
  return (await api.upload(form)).key;
}

export default function PublishInCrew() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { crew: slug } = useLocalSearchParams<{ crew: string }>();
  const crew = useApi(() => api.crewBySlug(slug ?? ""), [slug], { enabled: Boolean(slug) });
  const crewId = crew.data?.id ?? "";
  const member = crew.data?.viewerState === "member" || crew.data?.viewerState === "leader";
  const options = useApi(() => api.crewPostOptions(crewId), [crewId], { enabled: Boolean(crewId && member) });
  const [mode, setMode] = useState<Mode>("photo");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  // Photos déjà envoyées (adresse locale → clé) : un nouvel essai ne les renvoie pas.
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [endDays, setEndDays] = useState<(typeof END_CHOICES)[number]>(0);
  const [busy, setBusy] = useState(false);
  // Tour 2 : identifiant de la publication, gardé entre les tentatives (une réponse perdue ne crée pas de doublon).
  const [clientId] = useState(() => randomUUID());
  // Tour 2 : pendant l'envoi, rien ne bouge (photos, texte, choix) ; un échec garde toutes les saisies.
  const guard =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (!busy) fn(...args);
    };
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/crew/${slug}`));
  const filledAnswers = answers.map((a) => a.trim()).filter(Boolean);
  const missing =
    mode === "photo"
      ? photos.length === 0 && !text.trim()
        ? crewFeedLabels.missingPhotoOrText
        : null
      : !question.trim()
        ? crewFeedLabels.missingQuestion
        : filledAnswers.length < CREW_POLL_OPTIONS_MIN
          ? crewFeedLabels.missingOptions
          : null;

  async function add(from: "gallery" | "camera") {
    setError(null);
    try {
      const room = CREW_POST_PHOTOS_MAX - photos.length;
      const picked = from === "camera" ? await takePhoto() : await pickPhotos(room);
      if (picked.length) setPhotos((list) => [...list, ...picked].slice(0, CREW_POST_PHOTOS_MAX));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function publish() {
    if (!crewId || missing) return;
    setBusy(true);
    setError(null);
    try {
      let body: CrewPostCreate;
      if (mode === "poll") {
        body = {
          kind: "poll",
          clientId,
          poll: {
            question: question.trim(),
            options: filledAnswers,
            endsAt: endDays ? new Date(now().getTime() + endDays * 86_400_000).toISOString() : null,
          },
        };
      } else if (photos.length) {
        const sent = { ...keys };
        for (const [i, p] of photos.entries()) {
          if (sent[p.uri]) continue;
          setProgress(crewFeedLabels.sending(i + 1, photos.length));
          sent[p.uri] = await uploadPhoto(p, i);
          setKeys({ ...sent });
        }
        body = {
          kind: "photo",
          clientId,
          text: text.trim() || null,
          photoKeys: photos.map((p) => sent[p.uri] as string),
          vehicleId,
          eventId,
        };
      } else {
        body = { kind: "text", clientId, text: text.trim(), vehicleId, eventId };
      }
      setProgress(null);
      await api.createCrewPost(crewId, body);
      markCrewFeedDirty(crewId);
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const v = crew.data;
  const opts = options.data;
  const facts = v ? `${v.name} · ${crewLabels.membersCount(v.membersCount)}` : undefined;

  if (!v || !member) {
    return (
      <FlowScreen title={crewFeedLabels.publishTitle} onClose={close}>
        {crew.error ? (
          <LoadError message={crew.error.message} onRetry={() => void crew.reload()} />
        ) : v ? (
          <Notice>{crewFeedLabels.membersOnly}</Notice>
        ) : (
          <Muted variant="body">…</Muted>
        )}
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      title={crewFeedLabels.publishTitle}
      facts={facts}
      onClose={close}
      footer={
        <View style={styles.footer}>
          {missing ? (
            <Muted variant="caption" testID="crew-publish-missing">
              {missing}
            </Muted>
          ) : progress ? (
            <Muted variant="caption">{progress}</Muted>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="upload"
            disabled={busy || Boolean(missing)}
            onPress={() => void publish()}
            testID="crew-publish-send"
          >
            {crewFeedLabels.publish}
          </SmButton>
        </View>
      }
    >
      <View testID="crew-publish">
        <Seg<Mode>
          value={mode}
          onChange={guard(setMode)}
          options={[
            { value: "photo", label: crewFeedLabels.publishPhoto, icon: "camera" },
            { value: "poll", label: crewFeedLabels.publishPoll, icon: "list" },
          ]}
          testID="crew-publish-mode"
        />
      </View>

      {mode === "photo" ? (
        <>
          <View style={styles.grid}>
            {photos.map((p, i) => (
              <View key={p.uri} style={[styles.tile, { backgroundColor: c.night }]} testID="crew-publish-photo">
                <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={crewFeedLabels.removePhoto}
                  disabled={busy}
                  onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                  style={[styles.tileX, { backgroundColor: `${c.night}c7` }]}
                  hitSlop={6}
                >
                  <Icon name="trash" size={14} color={c.nightInk} />
                </Pressable>
              </View>
            ))}
            {photos.length < CREW_POST_PHOTOS_MAX ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${crewFeedLabels.addPhoto}, ${crewFeedLabels.photosCount(photos.length)}`}
                disabled={busy}
                onPress={() => void add("gallery")}
                style={[styles.tile, styles.addTile, { borderColor: c.line }]}
                testID="crew-publish-add"
              >
                <Icon name="add" size={22} color={c.ink} />
                <Text variant="bodyStrong" color={c.ink}>
                  {crewFeedLabels.addPhoto}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {crewFeedLabels.photosCount(photos.length)}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.note, { backgroundColor: c.surfaceSunken }]}>
            <Icon name="lock" size={16} color={c.inkMuted} />
            <Text variant="caption" color={c.ink} style={styles.grow}>
              {crewFeedLabels.photosNote}
            </Text>
          </View>
          {photos.length < CREW_POST_PHOTOS_MAX ? (
            <View style={styles.row}>
              <SmButton kind="s" icon="gallery" disabled={busy} onPress={() => void add("gallery")}>
                {crewFeedLabels.pickPhotos}
              </SmButton>
              <SmButton kind="s" icon="camera" disabled={busy} onPress={() => void add("camera")}>
                {crewFeedLabels.takePhoto}
              </SmButton>
            </View>
          ) : null}
          <TextField
            label={crewFeedLabels.word}
            value={text}
            onChangeText={setText}
            editable={!busy}
            placeholder={crewFeedLabels.wordPlaceholder}
            maxLength={CREW_POST_TEXT_MAX}
            multiline
            testID="crew-publish-text"
          />
          {opts?.vehicles.length ? (
            <View style={styles.block}>
              <Label text={crewFeedLabels.withVehicle} optional />
              <View style={styles.chips}>
                {opts.vehicles.map((x) => (
                  <Chip
                    key={x.id}
                    selected={vehicleId === x.id}
                    onPress={guard(() => setVehicleId(vehicleId === x.id ? null : x.id))}
                  >
                    {x.label}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          {opts?.events.length ? (
            <View style={styles.block}>
              <Label text={crewFeedLabels.forEvent} optional />
              <View style={styles.chips}>
                {opts.events.map((x) => (
                  <Chip
                    key={x.id}
                    selected={eventId === x.id}
                    onPress={guard(() => setEventId(eventId === x.id ? null : x.id))}
                  >
                    {x.title}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <TextField
            label={crewFeedLabels.pollQuestion}
            value={question}
            onChangeText={setQuestion}
            editable={!busy}
            placeholder={crewFeedLabels.pollQuestionPlaceholder}
            maxLength={CREW_POLL_QUESTION_MAX}
            testID="crew-poll-question"
          />
          <View style={styles.block}>
            <Label text={crewFeedLabels.pollOptions} />
            {answers.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: les réponses sont des champs à leur place.
              <View key={i} style={styles.answer}>
                <TextField
                  label={crewFeedLabels.pollOption(i + 1)}
                  value={a}
                  onChangeText={(value) => setAnswers((list) => list.map((x, j) => (j === i ? value : x)))}
                  editable={!busy}
                  maxLength={CREW_POLL_OPTION_MAX}
                  style={styles.grow}
                  testID="crew-poll-answer"
                />
                {answers.length > CREW_POLL_OPTIONS_MIN ? (
                  <SmButton
                    kind="g"
                    icon="trash"
                    accessibilityLabel={crewFeedLabels.pollRemoveOption(i + 1)}
                    disabled={busy}
                    onPress={() => setAnswers((list) => list.filter((_, j) => j !== i))}
                  />
                ) : null}
              </View>
            ))}
            {answers.length < CREW_POLL_OPTIONS_MAX ? (
              <SmButton
                kind="s"
                icon="add"
                disabled={busy}
                onPress={() => setAnswers((list) => [...list, ""])}
                testID="crew-poll-add"
              >
                {crewFeedLabels.pollAddOption}
              </SmButton>
            ) : null}
          </View>
          <View style={styles.block}>
            <Label text={crewFeedLabels.pollEnd} optional />
            <View style={styles.chips}>
              {END_CHOICES.map((d) => (
                <Chip key={d} selected={endDays === d} onPress={guard(() => setEndDays(d))}>
                  {d === 0 ? crewFeedLabels.pollNoEnd : crewFeedLabels.pollEndIn(d)}
                </Chip>
              ))}
            </View>
          </View>
          <Muted variant="caption">{crewFeedLabels.pollHint}</Muted>
        </>
      )}

      <View style={[styles.vis, { backgroundColor: c.surfaceSunken }]} testID="crew-publish-visibility">
        <Icon name="lock" size={20} color={c.inkMuted} />
        <View style={styles.grow}>
          <Text variant="bodyStrong" color={c.ink}>
            {crewFeedLabels.visibleTo(opts?.crew.membersCount ?? v.membersCount)}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {crewFeedLabels.visibleHint}
          </Text>
        </View>
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {options.error ? <LoadError message={options.error.message} onRetry={() => void options.reload()} /> : null}
    </FlowScreen>
  );
}

function Label({ text, optional = false }: { text: string; optional?: boolean }) {
  const { t } = useTheme();
  return (
    <Text variant="bodyStrong" color={t.color.ink} style={styles.label}>
      {text}
      {optional ? <Text variant="caption" color={t.color.inkMuted}>{`  ${crewFeedLabels.optional}`}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space1 + 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  tile: { width: "31.5%", aspectRatio: 1, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  addTile: { borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 2 },
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
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    padding: space3,
    borderRadius: tokens.radius.radiusMd,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  block: { gap: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
  label: { fontSize: 13 },
  answer: { flexDirection: "row", alignItems: "flex-end", gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  vis: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: space3 + 2,
    borderRadius: tokens.radius.radiusMd + 2,
  },
});
