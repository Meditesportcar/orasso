// La photo d'un souvenir (Accueil, Fil, page) : ma voiture masquée si elle existe, sinon l'affiche de l'événement, sinon
// un fond de nuit. Un fondu vers la couleur de l'affiche en bas (`fade`) quand la photo se prolonge dans une carte.
import { Photo, useTheme } from "@orasso/design-system/native";
import type { MemoryItem } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

export function MemoryPhoto({ memory, height, fade }: { memory: MemoryItem; height: number; fade?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={{ height }} testID="memory-photo">
      <Photo
        source={mediaSource(memory.photoUrl ?? memory.posterUrl)}
        placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
        style={StyleSheet.absoluteFill}
      />
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
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
});
