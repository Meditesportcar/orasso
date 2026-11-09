// La photo d'un souvenir (Accueil, Fil, page) : ma voiture masquée si elle existe, sinon l'affiche de l'événement, sinon
// un fond de nuit. Un fondu vers la couleur de l'affiche en bas (`fade`) quand la photo se prolonge dans une carte.
import { Photo, useTheme } from "@orasso/design-system/native";
import type { MemoryItem } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { Stamp } from "@/features/passport/Stamp";
import { mediaSource } from "@/lib/media";

export function MemoryPhoto({
  memory,
  height,
  fade,
  stamp,
}: {
  memory: MemoryItem;
  height: number;
  fade?: boolean;
  /** Pose mon tampon en haut à droite de la photo (maquette R7.10) ; la valeur est sa taille. */
  stamp?: number;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={{ height }} testID="memory-photo">
      <Photo
        source={mediaSource(memory.photoUrl ?? memory.posterUrl)}
        placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
        style={StyleSheet.absoluteFill}
      />
      {stamp ? (
        <View
          style={[styles.stamp, { width: stamp + 12, height: stamp + 12, backgroundColor: c.surface }]}
          pointerEvents="none"
          testID="memory-photo-stamp"
        >
          <Stamp stamp={memory.stamp} size={stamp} paper={c.surface} />
        </View>
      ) : null}
      {fade ? (
        <View style={styles.fade} pointerEvents="none">
          <Photo
            placeholder={`linear-gradient(180deg, ${c.poster}00 0%, ${c.poster} 100%)`}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    position: "absolute",
    top: 12,
    right: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
});
