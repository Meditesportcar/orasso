// La mosaïque d'un album (lot R9e, maquette R9.5 `mosH`) : jusqu'à quatre photos, la première en grand à gauche, les autres en colonne.
// Sans photo : un aplat. Sert à l'album ouvert, à la carte du Fil et à l'onglet « Albums ».
import { tokens, useTheme } from "@orasso/design-system/native";
import type { AlbumPhotoView } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { AlbumPhoto } from "./AlbumPhoto";

const { space1 } = tokens.spacing;

export function AlbumCover({
  photos,
  height = 180,
  label,
  testID = "album-cover",
}: {
  photos: readonly AlbumPhotoView[];
  height?: number;
  label?: string;
  testID?: string;
}) {
  const { t } = useTheme();
  const [first, ...rest] = photos.slice(0, 4);
  const cell = { backgroundColor: t.color.surface, borderRadius: tokens.radius.radiusSm, overflow: "hidden" as const };
  return (
    <View style={[styles.row, { height }]} accessibilityLabel={label} testID={testID}>
      <View style={[styles.big, cell]}>{first ? <AlbumPhoto photo={first} style={styles.fill} cover /> : null}</View>
      {rest.length > 0 ? (
        <View style={styles.col}>
          {rest.map((p) => (
            <View key={p.id} style={[styles.small, cell]}>
              <AlbumPhoto photo={p} style={styles.fill} cover />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space1 },
  big: { flex: 2 },
  col: { flex: 1, gap: space1 },
  small: { flex: 1 },
  fill: { width: "100%", height: "100%" },
});
