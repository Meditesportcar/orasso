// Ce que la vidéo d'une story ajoute à la visionneuse (lot R7g, maquette R7.7 `sk_video`) : « 0:11 / 0:24 » au-dessus de la
// légende (`VideoTime`) et le bouton du son dans l'en-tête, avant « ⋯ » (`VideoSound`) : il se coupe d'un toucher, le choix est
// gardé pendant la session (`videoSession`). Posés au-dessus de la surface de gestes.
import { Icon, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { clock, storyVideoLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { toggleVideoMuted, useVideoMuted } from "./videoSession";

export function VideoTime({ seconds, durationMs }: { seconds: number; durationMs: number }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.row} pointerEvents="none" testID="story-video-bar">
      <View style={[styles.pill, { backgroundColor: withAlpha(c.night, 0.55) }]}>
        <Icon name="video" size={16} color={c.nightInk} />
        <Text variant="caption" color={c.nightInk} testID="story-video-time">
          {clock(seconds * 1000)} / {clock(durationMs)}
        </Text>
      </View>
    </View>
  );
}

export function VideoSound() {
  const { t } = useTheme();
  const muted = useVideoMuted();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? L.soundOn : L.soundOff}
      accessibilityState={{ selected: !muted }}
      onPress={toggleVideoMuted}
      hitSlop={6}
      style={styles.btn}
      testID="story-video-sound"
    >
      <Icon name={muted ? "soundOff" : "sound"} size={22} color={t.color.nightInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
