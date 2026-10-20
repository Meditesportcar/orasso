// Illustrations « scan » : le QR sur carte claire, la barre de scan qui passe, le résultat (Scan OK, remise vérifiée).
import { duration, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { QrCode } from "@/ui/QrCode";

import { Enter, useEnterProgress } from "../kit";

const { space2, space3 } = tokens.spacing;
const radius = tokens.radius;
/** Le QR d'exemple : un contenu fixe, jamais un vrai accès. */
const SAMPLE = "orasso-exemple-tuto";

/** Le QR sur sa carte claire (toujours sombre sur clair, comme le vrai) ; `delay` : il saute à l'écran. */
export function QrTile({ size = 84, delay = 200, label }: { size?: number; delay?: number; label: string }) {
  return (
    <Enter kind="pop" delay={delay}>
      <QrCode value={SAMPLE} size={size} label={label} />
    </Enter>
  );
}

/** Une barre moutarde qui descend sur le QR, une fois, à `delay`. */
export function Laser({ delay, height }: { delay: number; height: number }) {
  const { t, reducedMotion } = useTheme();
  const p = useEnterProgress(delay, duration.scan);
  const animated = useAnimatedStyle(() => {
    "worklet";
    const k = p.value;
    return { opacity: k === 0 || k === 1 ? 0 : 1, transform: [{ translateY: k * (height - 4) }] };
  });
  if (reducedMotion) return null;
  return <Animated.View pointerEvents="none" style={[styles.laser, { backgroundColor: t.color.accent }, animated]} />;
}

/** Le viseur du scanner : quatre coins moutarde, le QR dedans, la barre de scan et ce que dit le résultat. */
export function ScanBox({ qrLabel, laserAt, children }: { qrLabel: string; laserAt: number; children?: ReactNode }) {
  const { t } = useTheme();
  const size = 96;
  return (
    <View style={styles.scan}>
      <View style={[styles.frame, { borderColor: t.color.accent, borderRadius: radius.radiusMd }]}>
        <QrTile size={size} label={qrLabel} delay={150} />
        <Laser delay={laserAt} height={size} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scan: { flexDirection: "row", alignItems: "center", gap: space3 },
  frame: { borderWidth: 2, padding: space2, overflow: "hidden" },
  laser: { position: "absolute", left: space2, right: space2, top: space2, height: 3 },
});
