// Bandeau « Horloge simulée : +2 j 4 h » (lot 34a), visible tant que l'API annonce un décalage non nul : on ne confond
// jamais l'heure d'Orasso avec l'heure réelle. Absent (rien n'est rendu) hors simulation.

import { Icon, Plate, Text, useTheme } from "@orasso/design-system/native";
import { devClockLabels, formatClockOffset } from "@orasso/shared";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useClockOffset } from "@/lib/clock";

export function ClockBanner() {
  const offset = useClockOffset();
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const text = formatClockOffset(offset);
  if (!text) return null;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 4 }]} pointerEvents="none">
      <Plate kind="label" accessibilityRole="text" accessibilityLabel={devClockLabels.bannerHint} style={styles.plate}>
        <Icon name="wait" size={16} color={t.color.plateInk} />
        <Text variant="label" color={t.color.plateInk}>
          {devClockLabels.banner(text)}
        </Text>
      </Plate>
    </View>
  );
}

// Posé par-dessus l'écran, sous l'encoche : ne déplace rien (les barres du haut gardent leur place).
const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", zIndex: 1000 },
  plate: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center" },
});
