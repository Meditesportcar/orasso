// Le tampon qui tombe à l'écran au scan (lot 50, prototype `s-passport`) : l'API publie `passport.stamped` sur le canal
// `user:{id}` au pointage (lot 49). Ce composant, monté une seule fois à la racine de l'appli (au-dessus des écrans et de leurs feuilles : passeport, jour J,
// n'importe où), écoute le canal, fait
// sentir un retour haptique, laisse le O frapper la page en plein écran (`StampDrop`, lot 39) puis rend la main : le
// tampon rejoint alors sa page (`emitStamped`, que le passeport écoute). La forme de la chute suit le tampon reçu. Réduction des animations : le tampon posé, fondu de 120 ms.

import { StampDrop, Text, tokens, useTheme } from "@orasso/design-system/native";
import { dropShapeOf, inkTokenKey, type PassportStamp, passportTexts, STAMP_GOLD, stampSentence } from "@orasso/shared";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { emitStamped } from "./stampBus";

const { space3, space4 } = tokens.spacing;

/** Combien de temps le tampon reste à l'écran avant de rejoindre sa page (le toucher le fait partir plus tôt). */
const STAY_MS = 2_400;

export function StampArrival({ testID = "stamp-arrival" }: { testID?: string }) {
  const { t } = useTheme();
  const { me } = useSession();
  const [stamp, setStamp] = useState<PassportStamp | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type !== "passport.stamped") return;
    const incoming = event.payload as PassportStamp;
    setStamp(incoming);
    setPlayKey((n) => n + 1);
    if (Platform.OS !== "web")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  });

  const shown = useRef<PassportStamp | null>(null);
  shown.current = stamp;
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const current = shown.current;
    shown.current = null;
    setStamp(null);
    if (current) emitStamped(current);
  }, []);

  useEffect(() => {
    if (!stamp) return;
    timer.current = setTimeout(close, STAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [stamp, close]);

  if (!stamp) return null;
  const ink = stamp.rare ? STAMP_GOLD.mid : t.color[inkTokenKey(stamp.ink)];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={`${passportTexts.notificationTitle(stamp.kind)} : ${stamp.event.title}. Toucher pour fermer.`}
      onPress={close}
      style={[styles.scrim, { backgroundColor: t.color.scrim }]}
    >
      <View style={styles.center}>
        <StampDrop ink={ink} shape={dropShapeOf(stamp)} seed={stamp.seed} size={220} playKey={playKey} />
        <Text variant="posterM" color={t.color.nightInk} style={styles.text}>
          {passportTexts.notificationTitle(stamp.kind)} : {stamp.event.title}
        </Text>
        <Text variant="body" color={t.color.nightInk} style={styles.text}>
          {stampSentence({
            kind: stamp.kind,
            format: stamp.event.format,
            ink: stamp.ink,
            department: stamp.event.department,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { alignItems: "center", gap: space3, paddingHorizontal: space4 },
  text: { textAlign: "center" },
});
