// Carte à partager (lots 31 et 50, prototype DA v2 `s-share`) : le format story en trois styles (Nuit, Sable, Néon),
// rendue par l'API avec les zones sûres d'Instagram (rien d'important dans les 14 % du haut ni les 20 % du bas), un
// aperçu, le bouton « Voir les zones masquées par Instagram » qui recouvre ces bandes, « En story » (feuille de partage
// du système, avec le PNG) et « Image » (publication 1:1). Jamais la plaque.

import { Button, Chip, ChipRow, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  shareSheetLabels as L,
  SHARE_SAFE,
  type ShareStyle,
  shareFormatLabels,
  shareStyleLabels,
  shareStyles,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

import { errorMessage } from "@/lib/http";
import {
  type PreparedShare,
  prepareShareImage,
  releasePrepared,
  type ShareOutcome,
  sendShareImage,
} from "@/lib/shareVehicle";
import { AppSheet } from "@/ui/AppSheet";
import { shareSheetKey } from "./shareSheetKey";

const { space1, space2 } = tokens.spacing;

/** Largeur de l'aperçu (hauteur : 16/9 de plus). */
const PREVIEW_WIDTH = 220;

/**
 * La feuille repart de zéro quand le véhicule ou sa version change (relecture du lot 50) : après le floutage d'une
 * plaque, la version change et l'ancien PNG (plaque nette) ne doit jamais être resservi.
 */
export function ShareSheet(props: {
  vehicleId: string;
  /** `VehicleFull.shareVersion`. */
  version: string;
  visible: boolean;
  onClose: () => void;
}) {
  return <ShareSheetBody key={shareSheetKey(props.vehicleId, props.version)} {...props} />;
}

function ShareSheetBody({
  vehicleId,
  version,
  visible,
  onClose,
}: {
  vehicleId: string;
  /** `VehicleFull.shareVersion`. */
  version: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [style, setStyle] = useState<ShareStyle>("night");
  const [stories, setStories] = useState<Partial<Record<ShareStyle, PreparedShare>>>({});
  const [loading, setLoading] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [busy, setBusy] = useState<"story" | "post" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const story = stories[style];
  // Les adresses d'objet du web sont libérées à la fermeture de la feuille.
  const kept = useRef(stories);
  kept.current = stories;
  useEffect(
    () => () => {
      for (const prepared of Object.values(kept.current)) if (prepared) releasePrepared(prepared);
    },
    [],
  );

  // L'aperçu du style choisi : rendu par l'API une fois, gardé tant que la feuille est ouverte.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `stories` est lu pour ne pas redemander une carte déjà rendue
  useEffect(() => {
    if (!visible || stories[style]) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    prepareShareImage(vehicleId, "story", style, version)
      .then((prepared) => !cancelled && setStories((current) => ({ ...current, [style]: prepared })))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visible, style, vehicleId, version]);

  async function send(format: "story" | "post") {
    setBusy(format);
    setError(null);
    setOutcome(null);
    try {
      const prepared = format === "story" ? story : await prepareShareImage(vehicleId, "post", style, version);
      if (prepared) {
        setOutcome(await sendShareImage(prepared));
        if (format === "post") releasePrepared(prepared);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const height = Math.round((PREVIEW_WIDTH * 16) / 9);
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.title}>
      <Text variant="title" color={t.color.ink}>
        {L.title}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {L.subtitle}. {L.help}
      </Text>
      <View testID="share-styles">
        <ChipRow>
          {shareStyles.map((s) => (
            <Chip key={s} selected={s === style} onPress={() => setStyle(s)}>
              {shareStyleLabels[s]}
            </Chip>
          ))}
        </ChipRow>
      </View>

      <View
        testID="share-preview"
        style={[styles.preview, { width: PREVIEW_WIDTH, height, backgroundColor: t.color.surfaceSunken }]}
      >
        {story ? (
          <Image
            source={{ uri: story.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={`${L.title} · ${shareStyleLabels[style]}`}
          />
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.color.accent} />
            <Text variant="caption" color={t.color.inkMuted}>
              {L.loading}
            </Text>
          </View>
        ) : null}
        {showSafe ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="share-safe">
            {(
              [
                { key: "top", top: 0, height: height * SHARE_SAFE.top },
                { key: "bottom", bottom: 0, height: height * SHARE_SAFE.bottom },
              ] as const
            ).map((band) => (
              <View
                key={band.key}
                style={[
                  styles.band,
                  band.key === "top" ? { top: 0 } : { bottom: 0 },
                  { height: band.height, borderColor: t.color.accent, backgroundColor: `${t.color.night}b3` },
                ]}
              >
                <Text variant="credit" color={t.color.nightInk}>
                  {L.maskedByInstagram}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Button variant="plate" icon="eye" onPress={() => setShowSafe((s) => !s)} fullWidth testID="share-safe-toggle">
        {showSafe ? L.hideSafe : L.showSafe}
      </Button>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button
            variant="primary"
            icon="share"
            loading={busy === "story"}
            disabled={!story || (busy !== null && busy !== "story")}
            onPress={() => void send("story")}
            fullWidth
            testID="share-story"
          >
            {L.story}
          </Button>
        </View>
        <Button
          variant="secondary"
          icon="gallery"
          loading={busy === "post"}
          disabled={busy !== null && busy !== "post"}
          onPress={() => void send("post")}
          accessibilityLabel={`${L.image} · ${shareFormatLabels.post}`}
          testID="share-post"
        >
          {L.image}
        </Button>
      </View>
      {outcome === "saved" ? (
        <Text variant="caption" color={t.color.inkMuted}>
          {L.saved}
        </Text>
      ) : null}
      {outcome === "unavailable" ? (
        <Text variant="caption" color={t.color.inkMuted}>
          {L.unavailable}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: "center", borderRadius: 14, overflow: "hidden" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space1 },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    gap: space2,
  },
  row: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
