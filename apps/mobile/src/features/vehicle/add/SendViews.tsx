// Envoi et succès de l'ajout de véhicule (lot M1, maquettes 1.8 et 1.9, corrections de Damien) : pendant l'envoi, la
// voiture du logo drifte autour du O, compacte, le pourcentage en petit à côté (plus l'anneau qui se remplit ni la
// moitié de l'écran), et à 100 % elle se gare dans le O ; puis l'animation « au garage » (un tour de drift, la voiture
// se gare, le O s'allume). Jamais « vous pouvez quitter l'écran ». Tout en worklets dans le design system ; mouvement
// réduit : fondu de 120 ms.
import { Icon, Photo, SendBurst, SendProgress, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleAddLabels as V } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import type { DraftPhoto } from "./model";

const { space1, space2, space3 } = tokens.spacing;
/** Côté du O pendant l'envoi : compact (correction de Damien). */
const SEND_O = 84;

export type PhotoState = "waiting" | "sending" | "done";

export function SendingView({
  done,
  total,
  complete,
  photos,
  states,
  onParked,
}: {
  done: number;
  total: number;
  complete: boolean;
  photos: DraftPhoto[];
  states: Record<string, PhotoState>;
  onParked?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const shown = useCreep(done, total, complete);
  const sendingPhotos = photos.filter((p) => !p.remoteId).length;
  const current = Math.min(photos.filter((p) => states[p.key] === "done").length + 1, Math.max(1, sendingPhotos));
  const status = complete
    ? V.sendParked(Math.max(1, sendingPhotos))
    : sendingPhotos
      ? V.sendPhotos(current, sendingPhotos)
      : V.saving;
  return (
    <>
      <Text variant="posterL" color={c.ink} accessibilityRole="header">
        {V.sendTitle}
      </Text>
      <View style={styles.sendRow}>
        <SendProgress
          size={SEND_O}
          ring={false}
          progress={complete ? 1 : total ? done / total : 0.05}
          onParked={onParked}
        />
        <View style={styles.grow}>
          <Text variant="numberNarrow" color={c.ink} testID="vehicle-send-percent">
            {V.percent(shown)}
          </Text>
          <Text variant="caption" color={c.inkMuted} accessibilityLiveRegion="polite" testID="vehicle-sending">
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.files}>
        {photos.map((p, i) => {
          const state = p.remoteId ? "done" : (states[p.key] ?? "waiting");
          const detail = p.remoteId
            ? V.photoOnline
            : p.rects.length
              ? V.photoMasked
              : p.noPlate
                ? V.photoNoPlate
                : V.photoSent;
          return (
            <View key={p.key} style={[styles.file, { backgroundColor: c.surface, borderColor: c.cardLine }]}>
              <View style={styles.thumb}>
                <Photo source={p.remoteId ? mediaSource(p.uri) : { uri: p.uri }} style={StyleSheet.absoluteFill} />
              </View>
              <View style={styles.grow}>
                <Text variant="bodyStrong" color={c.ink} style={styles.small}>
                  {i === 0 ? V.photoCover(i + 1) : V.photoN(i + 1)}
                </Text>
                <Text variant="caption" color={c.inkMuted} style={styles.small}>
                  {state === "waiting" ? V.photoWaiting : detail}
                </Text>
              </View>
              <View
                style={[styles.ok, { backgroundColor: c.accent, opacity: state === "done" ? 1 : 0.15 }]}
                accessibilityLabel={state === "done" ? V.photoSent : V.photoWaiting}
              >
                <Icon name="check" size={14} strokeWidth={3} color={c.accentInk} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** Le pourcentage affiché avance doucement vers l'étape en cours, sans la dépasser (pas de saut de 0 à 50 %). */
function useCreep(done: number, total: number, complete: boolean) {
  const { reducedMotion } = useTheme();
  const target = complete ? 100 : total ? ((done + 0.85) / total) * 100 : 8;
  const floor = complete ? 100 : total ? (done / total) * 100 : 0;
  const [value, setValue] = useState(floor);
  const latest = useRef({ target, floor });
  latest.current = { target, floor };
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      setValue((v) => {
        const { target: tg, floor: fl } = latest.current;
        const next = Math.max(fl, Math.min(tg, v + Math.max(0.6, (tg - v) * 0.08)));
        return next === v ? v : next;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  return reducedMotion ? floor : Math.max(value, floor);
}

export function DoneView({
  title,
  cover,
  remoteCover,
  name,
  specs,
  categories,
  playKey,
}: {
  title: string;
  cover: string | null;
  remoteCover: boolean;
  name: string;
  specs: string | null;
  categories: string[];
  playKey?: unknown;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <>
      <View style={styles.burst}>
        <SendBurst size={112} label={title} playKey={playKey} />
      </View>
      <View style={styles.doneText}>
        <Text
          variant="posterL"
          color={c.ink}
          accessibilityRole="header"
          style={styles.center}
          testID="vehicle-done-title"
        >
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.center}>
          {V.doneText}
        </Text>
      </View>
      <View
        style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowPoster }]}
        testID="vehicle-done-card"
      >
        <View style={[styles.cardPhoto, { backgroundColor: c.surfaceSunken }]}>
          {cover ? (
            <Photo source={remoteCover ? mediaSource(cover) : { uri: cover }} style={StyleSheet.absoluteFill} />
          ) : null}
        </View>
        <View style={styles.cardBody}>
          {categories.length ? (
            <View style={styles.tags}>
              {categories.map((label) => (
                <Tag key={label} tone="line">
                  {label}
                </Tag>
              ))}
            </View>
          ) : null}
          <Text variant="posterL" color={c.ink}>
            {name}
          </Text>
          {specs ? (
            <Text variant="caption" color={c.inkMuted}>
              {specs}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  small: { fontSize: tokens.type.meta.fontSize, lineHeight: tokens.type.meta.lineHeight },
  sendRow: { flexDirection: "row", alignItems: "center", gap: space3 + 2, paddingVertical: space2 },
  files: { gap: space1 + 2 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + 2,
    padding: space1 + 2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
  thumb: { width: 44, height: 44, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  ok: { width: 24, height: 24, borderRadius: tokens.radius.radiusPill, alignItems: "center", justifyContent: "center" },
  burst: { alignItems: "center", paddingTop: space2 },
  doneText: { gap: space1, alignItems: "center" },
  card: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  cardPhoto: { height: 200 },
  cardBody: { paddingVertical: space3, paddingHorizontal: space3 + 2, gap: space1 + 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space1 + 2 },
});
