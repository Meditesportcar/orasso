// Photos d'un véhicule en plein écran (lot 31) : on glisse d'une photo à l'autre, ✕ ferme. `reportable` (lot 32,
// véhicule d'un autre) : « Signaler » la photo affichée (la visionneuse se ferme, la feuille s'ouvre à la racine).

import { Button, Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { moderationLabels, type VehiclePhoto } from "@orasso/shared";
import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { openReport } from "@/features/ReportSheet";
import { mediaSource } from "@/lib/media";

const { space3 } = tokens.spacing;

export function PhotoViewer({
  photos,
  start,
  onClose,
  reportable = false,
}: {
  photos: VehiclePhoto[];
  reportable?: boolean;
  /** Index de la photo à ouvrir ; null = fermé. */
  start: number | null;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (start !== null) setIndex(start);
  }, [start]);
  return (
    <Modal visible={start !== null} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: t.color.groundDeep }]}>
        {start !== null ? (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            keyExtractor={(p) => p.id}
            initialScrollIndex={Math.min(start, Math.max(0, photos.length - 1))}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index }) => (
              <View style={{ width, height, justifyContent: "center" }}>
                <Photo
                  source={mediaSource(item.url)}
                  style={{ width, height: width * (item.height / Math.max(1, item.width)) }}
                  accessibilityLabel={`Photo ${index + 1} sur ${photos.length}`}
                />
              </View>
            )}
          />
        ) : null}
        <View style={[styles.bar, { top: insets.top + space3 }]}>
          <Text variant="meta" color={t.color.ink}>
            {start !== null ? `${index + 1} / ${photos.length}` : ""}
          </Text>
          <Button variant="close" label="Fermer la photo" onPhoto onPress={onClose} />
        </View>
        {reportable && start !== null && photos[index] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={moderationLabels.reportTitle("cette photo")}
            onPress={() => {
              const id = photos[index]?.id;
              onClose();
              if (id) openReport({ type: "photo", id });
            }}
            style={[styles.report, { bottom: insets.bottom + space3 }]}
            testID="photo-report"
          >
            <Icon name="flag" size={18} color={t.color.ink} />
            <Text variant="meta" color={t.color.ink}>
              {moderationLabels.report}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  report: {
    position: "absolute",
    left: space3,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.space2,
    minHeight: tokens.spacing.touch,
  },
  bar: {
    position: "absolute",
    left: space3,
    right: space3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
