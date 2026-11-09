// « Partager en story » (lot R7f4, maquette R7.23) : le contenu arrive en carte sur un fond 9:16 aux couleurs du contenu ; on
// la déplace, on pince pour l'agrandir ; elle reste touchable dans la visionneuse (« Voir la voiture »). Le fond et la carte
// sont rendus par l'API (`GET /me/share/card`) : un seul rendu, le serveur refait la même composition avec le cadrage choisi
// (`POST /me/stories` avec `linked` et `frame`, sans média). Les gestes passent par PanResponder (même geste au téléphone et
// dans le navigateur) et posent des valeurs partagées : la carte suit sur le fil UI (worklet), comme « Ajuster ».
import { Icon, Text, TextField, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  canvasPerView,
  type Frame,
  moveFrame,
  STORY_CAPTION_MAX,
  STORY_H,
  STORY_W,
  type StoryAudienceOption,
  type StoryLinkType,
  type ShareInfo,
  shareLabels as L,
  storyAudienceOptions,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { SmButton } from "@/features/passionne/kit";
import { markStoryPublished } from "@/features/stories/publish/publishSignal";
import { Label, Option } from "@/features/stories/publish/parts";
import { useStoryMotion } from "@/features/stories/publish/StoryCanvas";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3, space4 } = tokens.spacing;
/** La carte rendue par l'API : 1080 × 1350 (4:5), posée au centre du canevas 1080 × 1920. */
const CARD_W = 1080;
const CARD_H = 1350;
const REST: Frame = { scale: 1, offsetX: 0, offsetY: 0 };

const cardUrl = (type: StoryLinkType, id: string, part: "card" | "ground") =>
  `/api/me/share/card?type=${type}&id=${encodeURIComponent(id)}&part=${part}`;

export function StoryComposer() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { me } = useSession();
  const params = useLocalSearchParams<{ type: StoryLinkType; id: string }>();
  const type = params.type;
  const id = params.id;
  const info = useApi<ShareInfo>(() => api.shareInfo(type, id), [type, id]);
  const crews = useApi(() => api.myCrews(), []);
  const visibility = me?.profile.visibility ?? "public";
  const options: StoryAudienceOption[] = useMemo(
    () =>
      storyAudienceOptions(
        { persona: "fan" },
        visibility,
        (crews.data ?? []).map((x) => ({ id: x.id, name: x.name, members: x.membersCount })),
      ),
    [visibility, crews.data],
  );
  const [audienceKey, setAudienceKey] = useState("");
  const chosen = options.find((o) => o.key === audienceKey) ?? options[0];
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un envoi par ouverture : une reprise après une réponse perdue rend la même story.
  const clientId = useRef(randomUUID()).current;

  // Le plus grand canevas 9:16 qui laisse la place au formulaire dessous.
  const viewWidth = Math.max(160, Math.min(win.width - space3 * 2, Math.floor((win.height * 0.52 * STORY_W) / STORY_H)));
  const viewHeight = Math.round((viewWidth * STORY_H) / STORY_W);
  const k = viewWidth / STORY_W;
  const cpv = canvasPerView(viewWidth);
  const motion = useStoryMotion(REST);
  const live = useRef<Frame>(REST);
  const latest = useRef({ cpv });
  latest.current = { cpv };

  const responder = useMemo(() => {
    let start: Frame = live.current;
    let pinch: { distance: number } | null = null;
    const spread = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches ?? [];
      if (!a || !b) return null;
      return { distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1 };
    };
    const apply = (next: Frame) => {
      live.current = next;
      motion.scale.value = next.scale;
      motion.x.value = next.offsetX;
      motion.y.value = next.offsetY;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start = live.current;
        pinch = spread(e);
      },
      onPanResponderMove: (e, g) => {
        const scaleBy = latest.current.cpv;
        const two = spread(e);
        if (two) {
          if (!pinch) {
            pinch = two;
            start = live.current;
          }
          apply(moveFrame(start, two.distance / pinch.distance, 0, 0, CARD_W, CARD_H));
          return;
        }
        if (pinch) {
          // Un doigt levé : on repart de là, sans saut.
          pinch = null;
          start = {
            ...live.current,
            offsetX: live.current.offsetX - g.dx * scaleBy,
            offsetY: live.current.offsetY - g.dy * scaleBy,
          };
        }
        apply(moveFrame(start, 1, g.dx * scaleBy, g.dy * scaleBy, CARD_W, CARD_H));
      },
      onPanResponderRelease: () => {
        pinch = null;
      },
      onPanResponderTerminate: () => {
        pinch = null;
      },
    });
  }, [motion]);

  const { x: mx, y: my, scale: ms } = motion;
  const front = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateX: mx.value * k }, { translateY: my.value * k }, { scale: ms.value }] };
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace("/accueil"));
  const data = info.data;
  const unavailable = info.error && !data;
  const publish = () => {
    if (!data || !chosen) return;
    setBusy(true);
    setError(null);
    api
      .shareStory({
        linked: { type: data.type, id: data.id },
        clientId,
        audience: chosen.audience,
        ...(chosen.crewId ? { crewId: chosen.crewId } : {}),
        persona: "fan",
        caption: caption.trim() || null,
        frame: live.current,
      })
      .then((created) => {
        markStoryPublished(created);
        close();
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };
  const notified = data?.organizerNotified;
  const eventLine =
    data?.type === "event"
      ? chosen?.audience === "crew" || visibility === "private"
        ? L.organizerNotNotified
        : (notified ?? true)
          ? L.organizerNotified
          : L.organizerNotNotified
      : null;

  return (
    <View style={[styles.fill, { backgroundColor: c.night, paddingTop: insets.top }]} testID="share-story-composer">
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="posterM" color={c.nightInk} accessibilityRole="header">
            {L.composeTitle}
          </Text>
          <Text variant="caption" color={withAlpha(c.nightInk, 0.7)}>
            {`9:16 · ${STORY_W} × ${STORY_H}`}
          </Text>
        </View>
        <SmButton kind="s" icon="close" onPress={close} accessibilityLabel={L.close} testID="share-story-close">
          {L.close}
        </SmButton>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: space4 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {unavailable ? (
          <Notice tone="error" testID="share-story-error">
            {errorMessage(info.error)}
          </Notice>
        ) : null}
        {data && !data.destinations.story ? (
          <Notice tone="error" testID="share-story-closed">
            {data.reasons.story ?? L.errors.unsupported}
          </Notice>
        ) : null}
        <View
          style={[styles.canvas, { width: viewWidth, height: viewHeight, backgroundColor: c.night }]}
          {...responder.panHandlers}
          accessibilityLabel={L.composeHint}
          testID="share-story-stage"
        >
          {data?.destinations.story ? (
            <>
              <CrewPhotoImage
                url={cardUrl(type, id, "ground")}
                style={StyleSheet.absoluteFill as never}
                resizeMode="cover"
                accessibilityLabel=""
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    width: CARD_W * k,
                    height: CARD_H * k,
                    left: 0,
                    top: (viewHeight - CARD_H * k) / 2,
                  },
                  front,
                ]}
                testID="share-story-card"
              >
                <CrewPhotoImage
                  url={cardUrl(type, id, "card")}
                  style={StyleSheet.absoluteFill as never}
                  resizeMode="contain"
                  accessibilityLabel={data.title}
                />
              </Animated.View>
              <View style={styles.touch} pointerEvents="none">
                <View style={[styles.pill, { backgroundColor: c.nightInk }]} testID="share-story-link">
                  <Icon name={type === "vehicle" ? "vehicle" : type === "vote_result" ? "trophy" : "ticket"} size={16} color={c.night} />
                  <Text variant="bodyStrong" color={c.night}>
                    {data.linkLabel}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.hint}>
          <Icon name="hand" size={16} color={withAlpha(c.nightInk, 0.8)} />
          <Text variant="caption" color={withAlpha(c.nightInk, 0.8)} testID="share-story-hint">
            {L.composeHint}
          </Text>
        </View>
        <View style={styles.form}>
          <TextField
            label={L.caption}
            value={caption}
            onChangeText={setCaption}
            placeholder={L.captionPlaceholder}
            maxLength={STORY_CAPTION_MAX}
            multiline
            editable={!busy}
            testID="share-story-caption"
          />
          <Label>QUI LA VOIT</Label>
          {options.map((o) => (
            <Option
              key={o.key}
              icon={o.audience === "crew" ? "shield" : o.audience === "public" ? "explore" : "profile"}
              title={o.label}
              hint={o.hint}
              selected={chosen?.key === o.key}
              disabled={busy || options.length === 1}
              onPress={() => setAudienceKey(o.key)}
              testID={`share-story-audience-${o.audience}`}
            />
          ))}
          {eventLine ? (
            <Muted variant="caption" testID="share-story-organizer">
              {eventLine}
            </Muted>
          ) : null}
          {error ? (
            <Notice tone="error" testID="share-story-publish-error">
              {error}
            </Notice>
          ) : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={busy || !data?.destinations.story || !chosen}
            onPress={publish}
            testID="share-story-publish"
          >
            {busy ? L.publishing : L.publish}
          </SmButton>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space3, paddingVertical: space2 },
  body: { alignItems: "center", gap: space3, paddingHorizontal: space3 },
  canvas: { overflow: "hidden", borderRadius: tokens.radius.radiusLg },
  touch: { position: "absolute", left: 0, right: 0, bottom: 18, alignItems: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space3, paddingVertical: 10, borderRadius: 999 },
  hint: { flexDirection: "row", alignItems: "center", gap: space2 },
  form: { alignSelf: "stretch", gap: space2 },
});
