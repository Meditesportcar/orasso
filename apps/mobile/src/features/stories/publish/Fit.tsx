// « Ajuster » une photo de la galerie qui n'est pas en 9:16 (lot R7f3, maquette R7.22 `s-format`) : la photo est posée au
// centre du canevas 9:16 sur un fond flouté tiré de ses couleurs ; on pince pour zoomer jusqu'à remplir, on glisse pour
// cadrer, « Remplir » et « Rétablir » ramènent aux deux extrêmes. Trois états montrés : posée, ajustée (« Zoom 62 % »),
// remplie. Les gestes passent par PanResponder (même geste au téléphone et dans le navigateur) et posent des valeurs
// partagées : la photo suit sur le fil UI. Le cadrage (`frame`) est celui que le serveur relit : `rules/storyFrame.ts`.
import { Icon, type IconName, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import {
  canvasPerView,
  type Frame,
  frameState,
  storyPublishLabels as L,
  moveFrame,
  STORY_H,
  STORY_W,
  zoomPercent,
} from "@orasso/shared";
import { useMemo, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SmButton } from "@/ui/Kit";
import { fillDraft, resetDraft, type StoryDraft, withFrame } from "./model";
import { StoryCanvas, useStoryMotion } from "./StoryCanvas";

const { space2, space3, space4 } = tokens.spacing;
/** Un cran de « Zoom plus » / « Zoom moins ». */
const ZOOM_STEP = 1.25;

export function Fit({
  draft,
  onChange,
  onContinue,
  onCancel,
}: {
  draft: StoryDraft;
  onChange: (next: StoryDraft) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const { width: w, height: h } = draft.plate.photo;
  const uri = draft.display.uri;
  const motion = useStoryMotion(draft.frame);
  const live = useRef<Frame>(draft.frame);
  const [shown, setShown] = useState<Frame>(draft.frame);

  // Le plus grand canevas 9:16 qui tient entre l'en-tête et les boutons (≈ 250 px pour eux), jamais plus large que l'écran.
  const maxW = win.width - space3 * 2;
  const maxH = win.height - insets.top - insets.bottom - 250;
  const viewWidth = Math.max(160, Math.min(maxW, Math.floor((maxH * STORY_W) / STORY_H)));
  const cpv = canvasPerView(viewWidth);
  const latest = useRef({ draft, onChange, cpv });
  latest.current = { draft, onChange, cpv };

  /** Pose un cadrage : sur le fil UI tout de suite, dans React quand le pourcentage ou l'état change. */
  const apply = (next: Frame) => {
    live.current = next;
    motion.scale.value = next.scale;
    motion.x.value = next.offsetX;
    motion.y.value = next.offsetY;
    setShown((prev) =>
      zoomPercent(prev, w, h) === zoomPercent(next, w, h) && frameState(prev, w, h) === frameState(next, w, h)
        ? prev
        : next,
    );
  };
  const commit = () => {
    const next = withFrame(latest.current.draft, live.current);
    live.current = next.frame;
    setShown(next.frame);
    latest.current.onChange(next);
  };
  /** Pour les boutons : un nouveau cadrage venu du modèle (remplir, rétablir). */
  const setFrom = (next: StoryDraft) => {
    apply(next.frame);
    setShown(next.frame);
    latest.current.onChange(next);
  };

  // Le répondeur est créé une fois : il passe par `act` pour lire les dernières versions de `apply` et `commit`.
  const act = useRef({ apply, commit });
  act.current = { apply, commit };

  const responder = useMemo(() => {
    let start: Frame = live.current;
    let pinch: { distance: number; mid: { x: number; y: number } } | null = null;
    const spread = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches ?? [];
      if (!a || !b) return null;
      return {
        distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1,
        mid: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 },
      };
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
        const k = latest.current.cpv;
        const dims = latest.current.draft.plate.photo;
        const two = spread(e);
        if (two) {
          if (!pinch) {
            pinch = two;
            start = live.current;
          }
          act.current.apply(
            moveFrame(
              start,
              two.distance / pinch.distance,
              (two.mid.x - pinch.mid.x) * k,
              (two.mid.y - pinch.mid.y) * k,
              dims.width,
              dims.height,
            ),
          );
          return;
        }
        if (pinch) {
          // Un doigt levé : on repart de là, sans saut.
          pinch = null;
          start = {
            ...live.current,
            offsetX: live.current.offsetX - g.dx * k,
            offsetY: live.current.offsetY - g.dy * k,
          };
        }
        act.current.apply(moveFrame(start, 1, g.dx * k, g.dy * k, dims.width, dims.height));
      },
      onPanResponderRelease: () => {
        pinch = null;
        act.current.commit();
      },
      onPanResponderTerminate: () => {
        pinch = null;
        act.current.commit();
      },
    });
  }, []);

  const step = (ratio: number) => {
    const next = withFrame(latest.current.draft, moveFrame(live.current, ratio, 0, 0, w, h));
    setFrom(next);
  };

  const state = frameState(shown, w, h);
  const percent = zoomPercent(shown, w, h);
  const badge = state === "full" ? L.fitFull : state === "fit" ? L.fitPosed : L.fitZoom(percent);

  return (
    <View style={[styles.fill, { backgroundColor: c.night, paddingTop: insets.top }]} testID="story-fit">
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="posterM" color={c.nightInk} accessibilityRole="header">
            {L.title}
          </Text>
          <Text variant="caption" color={withAlpha(c.nightInk, 0.7)}>
            {`${L.badge916} · ${STORY_W} × ${STORY_H}`}
          </Text>
        </View>
        <RoundButton icon="close" label={L.close} onPress={onCancel} size={40} testID="story-fit-close" />
      </View>
      <View
        style={styles.stage}
        {...responder.panHandlers}
        accessibilityLabel={L.fitHintPinch}
        testID="story-fit-stage"
      >
        <StoryCanvas uri={uri} width={w} height={h} frame={draft.frame} motion={motion} viewWidth={viewWidth}>
          <View style={styles.badge} pointerEvents="none">
            <Tag tone="acc">{badge}</Tag>
          </View>
        </StoryCanvas>
      </View>
      <View style={[styles.body, { paddingBottom: space4 + insets.bottom }]}>
        <View style={styles.hint}>
          <Icon name="hand" size={16} color={withAlpha(c.nightInk, 0.8)} />
          <Text variant="caption" color={withAlpha(c.nightInk, 0.8)} style={styles.grow} testID="story-fit-note">
            {state === "full" ? L.fitFullNote : L.fitHintPinch}
          </Text>
        </View>
        <View style={styles.tools}>
          <RoundButton icon="minus" label={L.zoomOut} onPress={() => step(1 / ZOOM_STEP)} testID="story-fit-zoom-out" />
          <RoundButton icon="add" label={L.zoomIn} onPress={() => step(ZOOM_STEP)} testID="story-fit-zoom-in" />
          <View style={styles.grow} />
          {state !== "fit" ? (
            <SmButton
              kind="s"
              icon="undo"
              onPress={() => setFrom(resetDraft(latest.current.draft))}
              testID="story-fit-reset"
            >
              {L.reset}
            </SmButton>
          ) : null}
          {state !== "full" ? (
            <SmButton
              kind="s"
              icon="crop"
              onPress={() => setFrom(fillDraft(latest.current.draft))}
              testID="story-fit-fill"
            >
              {L.fill}
            </SmButton>
          ) : null}
        </View>
        <SmButton kind="p" big wide icon="next" onPress={onContinue} testID="story-fit-continue">
          {L.continue}
        </SmButton>
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  size = 44,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.round,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(t.color.nightInk, 0.14) },
      ]}
      testID={testID}
    >
      <Icon name={icon} size={size > 40 ? 22 : 20} color={t.color.nightInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2, paddingHorizontal: space3, paddingVertical: space2 },
  stage: { alignItems: "center", justifyContent: "center", flex: 1 },
  badge: { position: "absolute", left: space2, top: space2 },
  body: { paddingHorizontal: space3, gap: space3, paddingTop: space2 },
  hint: { flexDirection: "row", alignItems: "center", gap: space2 },
  tools: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  round: { alignItems: "center", justifyContent: "center" },
});
