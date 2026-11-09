// Au-dessus de la légende d'une story vidéo (lot R7g, maquette R7.7 `r7vtime`) : « 0:11 / 0:24 » et le bouton du son, qui
// se coupe d'un toucher (le choix est gardé pendant la session, `videoSession`). Posés au-dessus de la surface de gestes.
import { Icon, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { clock, storyVideoLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { toggleVideoMuted, useVideoMuted } from "./videoSession";

export function VideoBar({ seconds, durationMs }: { seconds: number; durationMs: number }) {
  const { t } = useTheme();
  const c = t.color;
  const muted = useVideoMuted();
  return (
    <View style={styles.row} pointerEvents="box-none" testID="story-video-bar">
      <View style={[styles.pill, { backgroundColor: withAlpha(c.night, 0.55) }]}>
        <Icon name="video" size={16} color={c.nightInk} />
        <Text variant="caption" color={c.nightInk} testID="story-video-time">
          {clock(seconds * 1000)} / {clock(durationMs)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? L.soundOn : L.soundOff}
        accessibilityState={{ selected: !muted }}
        onPress={toggleVideoMuted}
        hitSlop={6}
        style={[styles.round, { backgroundColor: withAlpha(c.night, 0.55) }]}
        testID="story-video-sound"
      >
        <Icon name={muted ? "soundOff" : "sound"} size={20} color={c.nightInk} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
