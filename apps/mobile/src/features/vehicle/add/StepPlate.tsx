// Étape 2 de l'ajout : sa plaque (lot 51 ; logique du lot M2 ; visuel du lot M1 d'après les maquettes 1.3 et 1.4,
// retours 11 à 15). Un bandeau de vignettes dit l'état de chaque photo (masquée, aucune plaque, à vérifier) ; toucher
// une vignette ouvre la photo. La photo reste fixe, les outils sont de petits boutons posés dessus (Cadre, Retirer,
// Aucune plaque) ; l'aperçu masque la plaque en noir plein (ce qu'on voit est ce qui sera publié, le vrai flou reste
// celui du serveur). « Continuer » emmène à la photo à régler : la vignette clignote et le message s'affiche sur la
// photo. « Aucune plaque » se confirme photo par photo, sur la photo. Puis le numéro, prérempli par une lecture sûre,
// obligatoire, modifiable ; « ancien véhicule » et « non immatriculé » dans le même bloc. Plaque affichée simple, sans
// bande « F » ni département (correction de Damien).
//
// Interface (lot M2) — inchangée : `draft` (photos avec `rects`, `detection`, `readings` posées par `detectionPatch`,
// `plate`, `former`, `status`, `unregistered`) ; sorties `onRects(i, rects)`, `onNoPlate(i, bool)`, `onMode(mode)`,
// `patch(…)`. Une lecture « probable » n'est jamais appliquée d'office : la photo est signalée « à vérifier ». Le
// numéro n'est prérempli que d'une lecture sûre (`prefillPatch`), jamais par-dessus une saisie (`plateTouched`).
import {
  Chip,
  ChipRow,
  FitTitle,
  Icon,
  type IconName,
  Tag,
  Text,
  textStyles,
  tokens,
  useTheme,
  withAlpha,
} from "@orasso/design-system/native";
import {
  archiveStatusChoices,
  vehicleWizardLabels as L,
  MAX_PLATE_RECTS,
  nextPlateFrame,
  vehicleAddLabels as V,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { mediaSource } from "@/lib/media";
import { type BlurMode, type Draft, type DraftPhoto, needsPlateDecision } from "./model";
import { PlateFrameEditor } from "./PlateFrameEditor";
import { StepHead, StepNote } from "./parts";
import { plateHelp, prefillPatch, typedPlate } from "./plateStep";

const { space1, space2, space3 } = tokens.spacing;
const THUMB = 74;

export type PlateState = "ok" | "none" | "check" | "fix" | "pending" | "online";

/** État d'une photo pour le bandeau (une lecture probable rend la photo « à vérifier », sans cadre posé d'office). */
export function plateState(p: DraftPhoto): PlateState {
  if (p.rects.length || p.plateBlurred) return "ok";
  if (p.remoteId) return "online";
  if (p.noPlate) return "none";
  if (p.detection === "pending") return "pending";
  if (p.readings?.some((r) => r.probable)) return "check";
  return "fix";
}

/** Première photo à régler (recherche en cours, puis sans cadre ni « aucune plaque »), ou -1. */
export const photoToFix = (d: Draft): number => {
  const pending = d.photos.findIndex((p) => !p.remoteId && p.detection === "pending");
  return pending >= 0 ? pending : d.photos.findIndex(needsPlateDecision);
};

export function StepPlate({
  draft,
  patch,
  onRects,
  onNoPlate,
  focus,
  issue,
  issueShown,
  onAddPhotos,
}: {
  draft: Draft;
  patch: (change: Partial<Draft>) => void;
  onMode: (mode: BlurMode) => void;
  onRects: (index: number, rects: DraftPhoto["rects"]) => void;
  onNoPlate: (index: number, value: boolean) => void;
  /** « Continuer » avec une photo à régler : on l'ouvre et sa vignette clignote. */
  focus?: { index: number; tick: number } | null;
  /** Ce qui bloque l'étape (`stepIssue`) et s'il faut le dire (après « Continuer »). */
  issue?: string | null;
  issueShown?: boolean;
  /** Le « + » du bandeau : retour aux photos. */
  onAddPhotos?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [blink, setBlink] = useState<number | null>(null);
  const i = Math.min(index, Math.max(0, draft.photos.length - 1));
  const photo = draft.photos[i];
  const state = photo ? plateState(photo) : null;

  // « Continuer » vers la photo à régler.
  useEffect(() => {
    if (!focus) return;
    setIndex(focus.index);
    setBlink(focus.index);
    setConfirming(null);
  }, [focus]);
  // Réglée : la vignette ne clignote plus.
  useEffect(() => {
    const p = blink === null ? undefined : draft.photos[blink];
    if (p && !["fix", "check", "pending"].includes(plateState(p))) setBlink(null);
  }, [blink, draft.photos]);

  // Numéro prérempli par une lecture sûre (à confirmer) ; jamais une saisie, même effacée (état dans le brouillon).
  const prefill = prefillPatch(draft);
  useEffect(() => {
    if (prefill) patch(prefill);
  }, [prefill, patch]);
  const help = plateHelp(draft);
  const read = help === L.plateRead;
  const numberIssue = issueShown && issue && (issue === L.plateRequired || issue === L.plateInvalid) ? issue : null;
  const showFix = state === "check" || (state === "fix" && (issueShown || blink === i));

  return (
    <>
      <StepHead title={V.plateTitle} text={V.plateText} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityLabel={V.plateStrip}
        testID="plate-strip"
      >
        {draft.photos.map((p, j) => (
          <Thumb
            key={p.key}
            photo={p}
            n={j + 1}
            selected={j === i}
            blink={blink === j}
            onPress={() => {
              setIndex(j);
              setConfirming(null);
            }}
          />
        ))}
        {onAddPhotos ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={V.add}
            onPress={onAddPhotos}
            style={[styles.more, { borderColor: c.line }]}
          >
            <Icon name="add" size={20} color={c.inkMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
      {photo ? (
        <PlateFrameEditor
          source={photo.remoteId ? mediaSource(photo.uri) : { uri: photo.uri }}
          width={photo.width}
          height={photo.height}
          rects={photo.rects}
          editable
          mask="black"
          loupe
          onChange={(rects) => onRects(i, rects)}
          badge={state === "ok" || state === "none" || state === "online" ? <Badge n={i + 1} state={state} /> : null}
          testID="plate-editor"
        >
          {showFix ? (
            <View
              style={[styles.msg, { backgroundColor: c.night, borderColor: c.win }]}
              accessibilityRole="alert"
              testID="plate-message"
            >
              <Icon name="info" size={18} color={c.winText} />
              <Text variant="caption" color={c.nightInk} style={styles.grow}>
                {state === "check" ? V.plateProbable(i + 1) : V.plateFix(i + 1)}
              </Text>
            </View>
          ) : null}
          {state === "pending" ? (
            <View style={[styles.msg, { backgroundColor: c.night, borderColor: c.line }]}>
              <Icon name="search" size={18} color={c.nightInk} />
              <Text variant="caption" color={c.nightInk} style={styles.grow}>
                {V.plateSearching}
              </Text>
            </View>
          ) : null}
          <View style={styles.tools}>
            <Tool
              icon="add"
              label={V.toolFrame}
              on={state === "fix" || state === "check"}
              disabled={photo.rects.length >= MAX_PLATE_RECTS}
              onPress={() => onRects(i, [...photo.rects, nextPlateFrame(photo.rects)])}
              testID="plate-frame-add"
            />
            {photo.rects.length ? (
              <Tool
                icon="close"
                label={V.toolRemove}
                onPress={() => onRects(i, photo.rects.slice(0, -1))}
                testID="plate-frame-remove"
              />
            ) : null}
            {!photo.remoteId && photo.rects.length === 0 ? (
              <Tool
                icon="eye"
                label={V.toolNone}
                on={Boolean(photo.noPlate)}
                onPress={() => (photo.noPlate ? onNoPlate(i, false) : setConfirming(i))}
                testID="plate-none"
                checked={Boolean(photo.noPlate)}
              />
            ) : null}
          </View>
          {confirming === i ? (
            <View style={[styles.confirm, { backgroundColor: withAlpha(c.night, 0.82) }]} testID="plate-none-confirm">
              <FitTitle title={V.noneTitle} variant="posterM" color={c.nightInk} align="center" maxLines={3} />
              <Text variant="caption" color={withAlpha(c.nightInk, 0.8)} style={styles.center}>
                {V.noneText}
              </Text>
              <View style={styles.confirmRow}>
                <OverlayButton
                  icon="close"
                  label={V.noneCancel}
                  onPress={() => setConfirming(null)}
                  testID="plate-none-cancel"
                />
                <OverlayButton
                  icon="check"
                  label={V.noneYes}
                  strong
                  onPress={() => {
                    onNoPlate(i, true);
                    setConfirming(null);
                  }}
                  testID="plate-none-yes"
                />
              </View>
            </View>
          ) : null}
        </PlateFrameEditor>
      ) : null}
      {photo && photo.rects.length > 0 ? (
        <View style={styles.hints}>
          <HandHint icon="hand" lead={V.handTwo} text={V.handTwoText} />
          <HandHint icon="move" lead={V.handOne} text={V.handOneText} />
        </View>
      ) : null}

      <View style={[styles.block, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
        <View style={styles.blockHead}>
          <Text variant="label" color={c.inkMuted}>
            {V.plateLabel}
          </Text>
          {read ? (
            <View style={styles.read} testID="plate-read">
              <Icon name="spark" size={15} color={c.accentText} />
              <Text variant="bodyStrong" color={c.accentText} style={styles.small}>
                {V.plateRead}
              </Text>
            </View>
          ) : null}
        </View>
        <TextInput
          accessibilityLabel={`${L.plateNumber}, obligatoire`}
          value={draft.plate}
          onChangeText={(plate) => patch(typedPlate(plate))}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!draft.unregistered}
          placeholder="AB-123-CD"
          placeholderTextColor={c.inkFaint}
          maxLength={20}
          selectionColor={c.accent}
          style={[
            textStyles.title,
            styles.plate,
            {
              color: c.ink,
              backgroundColor: c.surfaceField,
              borderColor: numberIssue ? c.winText : c.ink,
              opacity: draft.unregistered ? 0.4 : 1,
            },
          ]}
          testID="vehicle-plate"
        />
        {numberIssue ? (
          <Text variant="caption" color={c.winText} accessibilityRole="alert" testID="vehicle-plate-error">
            {numberIssue}
          </Text>
        ) : help && !read ? (
          <StepNote icon="alert">{help}</StepNote>
        ) : (
          <Text variant="caption" color={c.inkMuted}>
            {V.plateHelp}
          </Text>
        )}
        <CheckRow
          title={L.formerTitle}
          text={L.formerText}
          checked={draft.former}
          onPress={() => patch({ former: !draft.former, status: draft.former ? "active" : "keepsake" })}
          testID="vehicle-former"
        />
        {draft.former ? (
          <>
            <ChipRow>
              {archiveStatusChoices.map((s) => (
                <Chip key={s.status} selected={draft.status === s.status} onPress={() => patch({ status: s.status })}>
                  {s.label}
                </Chip>
              ))}
            </ChipRow>
            <StepNote icon="info" testID="vehicle-former-cert">
              {V.formerNoCert}
            </StepNote>
          </>
        ) : null}
        <CheckRow
          title={L.unregistered}
          text={V.unregisteredText}
          checked={draft.unregistered}
          onPress={() => patch({ unregistered: !draft.unregistered, plate: draft.unregistered ? draft.plate : "" })}
          testID="vehicle-unregistered"
        />
      </View>
      <StepNote icon="lock">{V.privacyShort}</StepNote>
    </>
  );
}

/** Vignette du bandeau (`.pl-th`) : la photo, sa pastille d'état, son mot ; clignote quand « Continuer » y mène. */
function Thumb({
  photo,
  n,
  selected,
  blink,
  onPress,
}: {
  photo: DraftPhoto;
  n: number;
  selected: boolean;
  blink: boolean;
  onPress: () => void;
}) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const state = plateState(photo);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (blink && !reducedMotion) pulse.value = withRepeat(withTiming(0.35, { duration: 550 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
  }, [blink, reducedMotion, pulse]);
  const style = useAnimatedStyle(() => {
    "worklet";
    return { opacity: pulse.value };
  });
  const art: Record<PlateState, { bg: string; ink: string; icon: IconName; word: string }> = {
    ok: { bg: c.accent, ink: c.accentInk, icon: "check", word: c.accentText },
    none: { bg: c.night, ink: c.nightInk, icon: "close", word: c.inkMuted },
    check: { bg: c.win, ink: c.winInk, icon: "info", word: c.winText },
    fix: { bg: c.win, ink: c.winInk, icon: "info", word: c.winText },
    pending: { bg: c.surfaceRaised, ink: c.ink, icon: "search", word: c.inkMuted },
    online: { bg: c.surfaceRaised, ink: c.ink, icon: "check", word: c.inkMuted },
  };
  const a = art[state];
  const ring = selected ? c.accent : blink ? c.win : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={V.plateOpen(n, V.plateState[state])}
      onPress={onPress}
      style={styles.thumbCell}
      testID={`plate-thumb-${n}`}
    >
      <Animated.View style={[styles.thumb, { borderColor: ring, boxShadow: t.shadow.shadowCard }, style]}>
        <View style={styles.thumbInner}>
          <PhotoThumb photo={photo} />
        </View>
        <View style={[styles.state, { backgroundColor: a.bg }]}>
          <Icon name={a.icon} size={13} strokeWidth={3} color={a.ink} />
        </View>
      </Animated.View>
      <Text variant="caption" color={a.word} style={styles.word}>
        {V.plateState[state]}
      </Text>
    </Pressable>
  );
}

function PhotoThumb({ photo }: { photo: DraftPhoto }) {
  // Les vignettes du bandeau sont carrées : la photo (carrée depuis le lot M1) les remplit.
  return (
    <Image
      source={photo.remoteId ? mediaSource(photo.uri) : { uri: photo.uri }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  );
}

/** Pastille posée sur la photo (« Photo 1 · plaque masquée »). */
function Badge({ n, state }: { n: number; state: PlateState }) {
  const text = state === "ok" ? V.plateBadgeMasked(n) : state === "none" ? V.plateBadgeNone(n) : V.plateBadgeOnline(n);
  return (
    <View testID="plate-badge">
      <Tag tone="acc">{text}</Tag>
    </View>
  );
}

/** Petit bouton posé sur la photo (`.pl-b`) : voile sombre, moutarde quand il appelle le geste à faire. */
function Tool({
  icon,
  label,
  on = false,
  disabled = false,
  checked,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  on?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "checkbox"}
      accessibilityState={{ disabled, checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.tool, { backgroundColor: on ? c.accent : withAlpha(c.night, 0.76), opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon name={icon} size={16} color={on ? c.accentInk : c.nightInk} />
      <Text variant="bodyStrong" color={on ? c.accentInk : c.nightInk} style={styles.tiny}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Bouton de la confirmation posée sur la photo (`.pl-conf`) : sombre dans les deux thèmes, comme la photo. */
function OverlayButton({
  icon,
  label,
  strong = false,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  strong?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = strong ? c.night : c.nightInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={[styles.overlayBtn, { backgroundColor: strong ? c.nightInk : withAlpha(c.nightInk, 0.12) }]}
    >
      <Icon name={icon} size={16} color={ink} />
      <Text variant="button" color={ink} style={styles.tiny}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Ligne à cocher du bloc du numéro (`.vold.sm`) : case carrée, titre, précision. */
function CheckRow({
  title,
  text,
  checked,
  onPress,
  testID,
}: {
  title: string;
  text: string;
  checked: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={`${title}, ${text}`}
      onPress={onPress}
      testID={testID}
      style={[styles.check, { backgroundColor: c.surfaceRaised }]}
    >
      <View
        style={[
          styles.box,
          checked ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.inkFaint },
        ]}
      >
        {checked ? <Icon name="check" size={16} strokeWidth={3} color={c.accentInk} /> : null}
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.small}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.small}>
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

function HandHint({ icon, lead, text }: { icon: IconName; lead: string; text: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.hint}>
      <Icon name={icon} size={24} color={t.color.accentText} />
      <Text variant="caption" color={t.color.inkMuted} style={styles.grow}>
        <Text variant="bodyStrong" color={t.color.ink} style={styles.small}>
          {lead}
        </Text>{" "}
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  small: { fontSize: tokens.type.caption.fontSize, lineHeight: tokens.type.caption.lineHeight },
  tiny: { fontSize: tokens.type.meta.fontSize, lineHeight: tokens.type.meta.lineHeight },
  strip: { gap: space2, paddingRight: space2, alignItems: "flex-start" },
  thumbCell: { width: THUMB, alignItems: "center", gap: space1 + 1 },
  thumb: { width: THUMB, height: THUMB, borderRadius: tokens.radius.radiusMd, borderWidth: 3 },
  thumbInner: { flex: 1, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  state: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 22,
    height: 22,
    borderRadius: tokens.radius.radiusChip,
    alignItems: "center",
    justifyContent: "center",
  },
  word: { fontSize: tokens.type.label.fontSize, lineHeight: tokens.type.label.lineHeight, textAlign: "center" },
  more: {
    width: 44,
    height: THUMB,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  msg: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingVertical: 10,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 2,
  },
  tools: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: space1 + 2,
  },
  tool: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1 + 2,
    height: 36,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusPill,
  },
  confirm: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: space2 + 2,
    padding: 18,
  },
  overlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 44,
    paddingHorizontal: space3 + 2,
    borderRadius: tokens.radius.radiusMd,
  },
  confirmRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space2 },
  hints: { gap: space2 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: space2 + 2 },
  block: { gap: space2 + 2, padding: 14, borderRadius: tokens.radius.radiusLg },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  read: { flexDirection: "row", alignItems: "center", gap: space1 },
  plate: {
    height: 56,
    borderWidth: 2,
    borderRadius: tokens.radius.radiusSm,
    textAlign: "center",
    letterSpacing: 3,
    paddingHorizontal: space3,
    outlineStyle: "none",
  } as object,
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: 10,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusMd,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: tokens.radius.radiusSm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
