// L'envoi (lot 39) : SendProgress, décision de Damien (prototype v39, 19/10) : pendant l'envoi, la voiture vue de
// dessus drifte autour du O (trace de fumée), un anneau moutarde autour du O se remplit avec le pourcentage, puis à
// 100 % la voiture se gare dans le O (remplace UploadProgress de l'appli). SendBurst, une candidature envoyée : un tour
// de drift, la voiture se gare, le O s'allume (pic de néon, un seul à la fois). Réduction des animations : pas de
// drift, l'anneau suit le pourcentage, fondu de 120 ms.
// Lot M1 (correction de Damien sur la maquette 1.8) : `ring={false}` retire l'anneau qui se remplit (« des bandes qui se
// remplissent, pas beau », retour 16) : la voiture drifte seule autour du O, l'écran pose le pourcentage en petit à
// côté ; à 100 % elle se gare. `SendBurst` prend un `label` (« Véhicule au garage »).

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { olive } from "../../motion";
import { duration } from "../motionHooks";
import { useNeonPulse } from "../neon";
import { useTheme } from "../theme";
import { OLoader } from "./OLoader";

export type SendProgressProps = {
  /** Avancement de l'envoi, 0 → 1. À 1, l'anneau se ferme puis la voiture se gare dans le O. */
  progress: number;
  /** Appelé quand la voiture est garée. */
  onParked?: () => void;
  /** Côté de l'indicateur, en px. */
  size?: number;
  /** Anneau moutarde qui se remplit autour du O (par défaut) ; `false` : la voiture drifte seule (lot M1). */
  ring?: boolean;
};

export function SendProgress({ progress, onParked, size = 96, ring = true }: SendProgressProps) {
  const { reducedMotion } = useTheme();
  const p = Math.max(0, Math.min(1, progress));
  const [complete, setComplete] = useState(p >= 1);
  useEffect(() => {
    if (p < 1) {
      setComplete(false);
      return;
    }
    // L'anneau finit de se remplir (`base`) avant que la voiture se gare.
    const timer = setTimeout(() => setComplete(true), reducedMotion ? 0 : duration.base);
    return () => clearTimeout(timer);
  }, [p, reducedMotion]);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Envoi en cours"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <OLoader size={size} progress={ring ? p : undefined} done={complete} onParked={onParked} label={null} />
    </View>
  );
}

export type SendBurstProps = {
  /** Appelé quand le O s'est allumé : l'écran affiche « Candidature envoyée ». */
  onDone?: () => void;
  size?: number;
  /** Rejouer (recette). */
  playKey?: unknown;
  /** Texte alternatif (« Candidature envoyée » par défaut). */
  label?: string;
};

/** Une candidature envoyée : un tour de drift, la voiture se gare, le O s'allume. */
export function SendBurst({ onDone, size = 120, playKey, label = "Candidature envoyée" }: SendBurstProps) {
  const { t, reducedMotion } = useTheme();
  const [done, setDone] = useState(reducedMotion);
  const { style: glow, fire } = useNeonPulse();
  const finish = useRef(onDone);
  finish.current = onDone;
  const lit = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (lit.current) clearTimeout(lit.current);
    },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'envoi (recette)
  useEffect(() => {
    setDone(reducedMotion);
    if (reducedMotion) return;
    const timer = setTimeout(() => setDone(true), olive.orbit);
    return () => clearTimeout(timer);
  }, [reducedMotion, playKey]);

  return (
    <View style={[styles.burst, { width: size, height: size }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: size * 0.5, height: size * 0.4, borderRadius: size, boxShadow: t.shadow.neonAccent },
          glow,
        ]}
      />
      <OLoader
        key={String(playKey ?? "")}
        size={size}
        done={done}
        label={label}
        onParked={() => {
          fire();
          if (lit.current) clearTimeout(lit.current);
          lit.current = setTimeout(() => finish.current?.(), duration.poster);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  burst: { alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute" },
});
