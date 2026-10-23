// Recadrage carré d'Orasso (lot M1, maquette 1.2, retours 09 et 10) : remplace le recadreur du système. Le cadre carré
// est fixe ; c'est la photo qu'on glisse (un doigt) et qu'on zoome (deux doigts, ou − et +), le cadre ne sort jamais de
// la photo. Aperçu en direct de la vignette carrée et de la fiche (le carré cadré au centre d'une carte en paysage).
// Fond sombre dans les deux thèmes, comme un appareil photo. Les gestes passent par PanResponder (même geste au
// téléphone et dans le navigateur) et posent des valeurs partagées : l'image et les aperçus suivent sur le fil UI.
//
// Réutilisable pour toute photo carrée (affiche, profil, galerie) : `photo`, `initial`, `onConfirm(crop)`.
import { Button, Icon, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { vehicleAddLabels as V } from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, Image, PanResponder, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type CropView,
  centerCrop,
  clampView,
  cropFromView,
  displayScale,
  MAX_ZOOM,
  MIN_ZOOM,
  pinchZoom,
  type SquareCrop,
  stepZoom,
  viewFromCrop,
} from "@/lib/squareCrop";

const { space1, space2, space3, space4 } = tokens.spacing;
/** Marge du cadre dans la scène (`.cr-frame` : 4 % de chaque côté). */
const FRAME_MARGIN = 0.04;
const PREVIEW = 70;
const PREVIEW_WIDE = 112;
const CORNER = 20;

export type SquareCropperProps = {
  photo: { uri: string; width: number; height: number };
  /** Cadre de départ (rouvrir là où on l'avait laissé) ; sinon le carré centré. */
  initial?: SquareCrop;
  /** « Photo 1 sur 2 · format carré ». */
  subtitle: string;
  onCancel: () => void;
  onConfirm: (crop: SquareCrop) => void;
  /** Découpe en cours (le bouton attend). */
  busy?: boolean;
};

export function SquareCropper({ photo, initial, subtitle, onCancel, onConfirm, busy = false }: SquareCropperProps) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState(0);
  const frame = Math.round(stage * (1 - FRAME_MARGIN * 2));
  const { width: w, height: h } = photo;

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const fs = useSharedValue(0);
  const [zoomShown, setZoomShown] = useState(1);
  const view = useRef<CropView>({ zoom: 1, tx: 0, ty: 0 });

  const apply = (next: CropView) => {
    const v = clampView(w, h, frame, next);
    view.current = v;
    zoom.value = v.zoom;
    tx.value = v.tx;
    ty.value = v.ty;
    return v;
  };
  const latest = useRef({ apply, frame });
  latest.current = { apply, frame };

  // Cadre de départ, dès que la scène est mesurée.
  // biome-ignore lint/correctness/useExhaustiveDependencies: une fois par photo et par taille de scène
  useEffect(() => {
    if (!frame) return;
    fs.value = frame;
    const v = apply(viewFromCrop(w, h, frame, initial ?? centerCrop(w, h)));
    setZoomShown(v.zoom);
  }, [frame, photo.uri]);

  const responder = useMemo(() => {
    let start: CropView = { zoom: 1, tx: 0, ty: 0 };
    let pinch: { distance: number; mid: { x: number; y: number } } | null = null;
    const touchesOf = (e: GestureResponderEvent) => e.nativeEvent.touches ?? [];
    const spread = (e: GestureResponderEvent) => {
      const [a, b] = touchesOf(e);
      if (!a || !b) return null;
      return {
        distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
        mid: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 },
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start = view.current;
        pinch = spread(e);
      },
      onPanResponderMove: (e, g) => {
        const two = spread(e);
        if (two) {
          // Deux doigts : on pince (zoom) et on glisse avec le milieu des doigts.
          if (!pinch) {
            pinch = two;
            start = view.current;
          }
          const z = pinchZoom(start.zoom, pinch.distance, two.distance);
          latest.current.apply({
            zoom: z,
            tx: start.tx * (z / start.zoom) + (two.mid.x - pinch.mid.x),
            ty: start.ty * (z / start.zoom) + (two.mid.y - pinch.mid.y),
          });
          return;
        }
        if (pinch) {
          // Un doigt levé : on repart de là, sans saut.
          pinch = null;
          start = { ...view.current, tx: view.current.tx - g.dx, ty: view.current.ty - g.dy };
        }
        latest.current.apply({ zoom: start.zoom, tx: start.tx + g.dx, ty: start.ty + g.dy });
      },
      onPanResponderRelease: () => {
        pinch = null;
        setZoomShown(view.current.zoom);
      },
      onPanResponderTerminate: () => {
        pinch = null;
        setZoomShown(view.current.zoom);
      },
    });
  }, []);

  const press = (dir: 1 | -1) => {
    const v = view.current;
    const z = stepZoom(v.zoom, dir);
    setZoomShown(apply({ zoom: z, tx: v.tx * (z / v.zoom), ty: v.ty * (z / v.zoom) }).zoom);
  };

  const base = frame ? displayScale(w, h, frame, 1) : 0;
  const imgW = w * base;
  const imgH = h * base;
  const track = useAnimatedStyle(() => {
    "worklet";
    return { width: `${((zoom.value - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` };
  });
  const knob = useAnimatedStyle(() => {
    "worklet";
    return { left: `${((zoom.value - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` };
  });

  return (
    <View style={[styles.fill, { backgroundColor: c.night, paddingTop: insets.top }]} testID="square-cropper">
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text variant="posterM" color={c.nightInk} accessibilityRole="header">
            {V.cropTitle}
          </Text>
          <Text variant="caption" color={withAlpha(c.nightInk, 0.7)}>
            {subtitle}
          </Text>
        </View>
        <ZoomButton icon="close" label={V.cropCancel} onPress={onCancel} size={38} testID="crop-cancel" />
      </View>
      <View
        style={[styles.stage, { height: stage ? stage * 1.04 : 360 }]}
        onLayout={(e) => setStage(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        accessibilityLabel={V.cropHint}
        testID="crop-stage"
      >
        {frame ? (
          <>
            <CropImage uri={photo.uri} width={imgW} height={imgH} zoom={zoom} tx={tx} ty={ty} />
            <FrameMask stage={stage} frame={frame} ink={c.nightInk} accent={c.accent} dim={withAlpha(c.night, 0.7)} />
            <View style={styles.badge} pointerEvents="none">
              <View>
                <Tag tone="acc">{V.cropBadge}</Tag>
              </View>
            </View>
          </>
        ) : null}
      </View>
      <View style={[styles.body, { paddingBottom: space4 + insets.bottom }]}>
        <View style={styles.hint}>
          <Icon name="move" size={16} color={withAlpha(c.nightInk, 0.8)} />
          <Text variant="caption" color={withAlpha(c.nightInk, 0.8)}>
            {V.cropHint}
          </Text>
        </View>
        <View style={styles.zoom}>
          <ZoomButton icon="minus" label={V.zoomOut} onPress={() => press(-1)} testID="crop-zoom-out" />
          <View style={[styles.track, { backgroundColor: withAlpha(c.nightInk, 0.18) }]}>
            <Animated.View style={[styles.trackFill, { backgroundColor: c.accent }, track]} />
            <Animated.View style={[styles.knob, { backgroundColor: c.nightInk }, knob]} />
          </View>
          <ZoomButton icon="add" label={V.zoomIn} onPress={() => press(1)} testID="crop-zoom-in" />
          <Text variant="numberNarrow" color={c.nightInk} style={styles.zoomValue} testID="crop-zoom-value">
            {V.zoomValue(zoomShown)}
          </Text>
        </View>
        <View style={styles.previews}>
          <View style={styles.previewCol}>
            <Text variant="label" color={withAlpha(c.nightInk, 0.7)}>
              {V.previewThumb}
            </Text>
            <Preview
              uri={photo.uri}
              box={{ width: PREVIEW, height: PREVIEW }}
              side={PREVIEW}
              frame={fs}
              base={{ width: imgW, height: imgH }}
              view={{ zoom, tx, ty }}
              line={withAlpha(c.nightInk, 0.2)}
            />
          </View>
          <View style={styles.previewCol}>
            <Text variant="label" color={withAlpha(c.nightInk, 0.7)}>
              {V.previewCard}
            </Text>
            <Preview
              uri={photo.uri}
              box={{ width: PREVIEW_WIDE, height: PREVIEW }}
              side={PREVIEW_WIDE}
              frame={fs}
              base={{ width: imgW, height: imgH }}
              view={{ zoom, tx, ty }}
              line={withAlpha(c.nightInk, 0.2)}
            />
          </View>
          <Text variant="caption" color={withAlpha(c.nightInk, 0.7)} style={styles.grow}>
            {V.previewText}
          </Text>
        </View>
        <View style={styles.footer}>
          <ZoomButton icon="close" label={V.cropCancel} onPress={onCancel} size={52} />
          <View style={styles.grow}>
            <Button
              variant="primary"
              icon="check"
              fullWidth
              loading={busy}
              onPress={() => onConfirm(cropFromView(w, h, frame, view.current))}
              testID="crop-validate"
            >
              {V.cropValidate}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
}

/** La photo sous le cadre : centrée, glissée puis zoomée autour de son centre (valeurs partagées). */
function CropImage({
  uri,
  width,
  height,
  zoom,
  tx,
  ty,
}: {
  uri: string;
  width: number;
  height: number;
  zoom: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }] };
  });
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={[{ width, height }, style]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      </Animated.View>
    </View>
  );
}

/** Aperçu en direct : le carré du cadre, réduit au côté `side`, centré dans la boîte (vignette ou fiche). */
function Preview({
  uri,
  box,
  side,
  frame,
  base,
  view,
  line,
}: {
  uri: string;
  box: { width: number; height: number };
  side: number;
  frame: SharedValue<number>;
  base: { width: number; height: number };
  view: { zoom: SharedValue<number>; tx: SharedValue<number>; ty: SharedValue<number> };
  line: string;
}) {
  const { zoom, tx, ty } = view;
  const style = useAnimatedStyle(() => {
    "worklet";
    const k = frame.value > 0 ? side / frame.value : 0;
    return {
      width: base.width * k,
      height: base.height * k,
      transform: [{ translateX: tx.value * k }, { translateY: ty.value * k }, { scale: zoom.value }],
    };
  });
  return (
    <View style={[styles.preview, box, { borderColor: line }]}>
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={style}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </Animated.View>
      </View>
    </View>
  );
}

/** Voile autour du cadre, filet clair, coins moutarde et tiers (`.cr-frame` de la maquette). */
function FrameMask({
  stage,
  frame,
  ink,
  accent,
  dim,
}: {
  stage: number;
  frame: number;
  ink: string;
  accent: string;
  dim: string;
}) {
  const height = stage * 1.04;
  const left = (stage - frame) / 2;
  const top = (height - frame) / 2;
  const third = withAlpha(ink, 0.3);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.dim, { backgroundColor: dim, left: 0, right: 0, top: 0, height: top }]} />
      <View style={[styles.dim, { backgroundColor: dim, left: 0, right: 0, top: top + frame, bottom: 0 }]} />
      <View style={[styles.dim, { backgroundColor: dim, left: 0, width: left, top, height: frame }]} />
      <View style={[styles.dim, { backgroundColor: dim, right: 0, width: left, top, height: frame }]} />
      <View style={[styles.frame, { left, top, width: frame, height: frame, borderColor: ink }]}>
        {[1, 2].map((i) => (
          <View key={`v${i}`} style={[styles.thirdV, { left: (frame * i) / 3, backgroundColor: third }]} />
        ))}
        {[1, 2].map((i) => (
          <View key={`h${i}`} style={[styles.thirdH, { top: (frame * i) / 3, backgroundColor: third }]} />
        ))}
        <View style={[styles.corner, styles.tl, { borderColor: accent }]} />
        <View style={[styles.corner, styles.tr, { borderColor: accent }]} />
        <View style={[styles.corner, styles.bl, { borderColor: accent }]} />
        <View style={[styles.corner, styles.br, { borderColor: accent }]} />
      </View>
    </View>
  );
}

/** Bouton carré sur fond sombre (− et +, Annuler) : icône seule, nom pour les lecteurs d'écran. */
function ZoomButton({
  icon,
  label,
  onPress,
  size = 40,
  testID,
}: {
  icon: "close" | "add" | "minus";
  label: string;
  onPress: () => void;
  size?: number;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Button
      variant="close"
      onPhoto
      icon={icon}
      label={label}
      onPress={onPress}
      testID={testID}
      style={{
        width: size,
        height: size,
        minHeight: size,
        borderRadius: tokens.radius.radiusMd,
        backgroundColor: withAlpha(t.color.nightInk, 0.1),
      }}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingHorizontal: space4,
    paddingTop: space3,
    paddingBottom: space3,
  },
  stage: { width: "100%", overflow: "hidden" },
  center: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: { position: "absolute", top: space3, left: 0, right: 0, flexDirection: "row", justifyContent: "center" },
  dim: { position: "absolute" },
  frame: { position: "absolute", borderWidth: 2, borderRadius: tokens.radius.radiusSm / 2 },
  thirdV: { position: "absolute", top: 0, bottom: 0, width: 1 },
  thirdH: { position: "absolute", left: 0, right: 0, height: 1 },
  corner: { position: "absolute", width: CORNER, height: CORNER },
  tl: { left: -4, top: -4, borderLeftWidth: 4, borderTopWidth: 4 },
  tr: { right: -4, top: -4, borderRightWidth: 4, borderTopWidth: 4 },
  bl: { left: -4, bottom: -4, borderLeftWidth: 4, borderBottomWidth: 4 },
  br: { right: -4, bottom: -4, borderRightWidth: 4, borderBottomWidth: 4 },
  body: { paddingHorizontal: space4, paddingTop: space4, gap: space4, flex: 1 },
  hint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space2 },
  zoom: { flexDirection: "row", alignItems: "center", gap: space3 },
  track: { flex: 1, height: 6, borderRadius: tokens.radius.radiusPill },
  trackFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: tokens.radius.radiusPill },
  knob: {
    position: "absolute",
    top: -7,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: tokens.radius.radiusPill,
  },
  zoomValue: {
    minWidth: 44,
    textAlign: "right",
    fontSize: tokens.type.posterL.fontSize,
    lineHeight: tokens.type.posterL.lineHeight,
  },
  previews: { flexDirection: "row", alignItems: "flex-end", gap: space3 },
  previewCol: { gap: space1 },
  preview: { overflow: "hidden", borderRadius: tokens.radius.radiusSm, borderWidth: 1 },
  footer: { flexDirection: "row", alignItems: "center", gap: space2, marginTop: "auto" },
});
