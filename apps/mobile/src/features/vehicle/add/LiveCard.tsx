// La fiche du véhicule qui se construit en tête de chaque étape (artefact `s-vadd`, `.vlive` ; lot M1, maquettes 1.1 à
// 1.7) : d'abord la photo de couverture et le nombre de photos, puis « Plaque masquée, numéro privé », le type et le
// nom, la fiche technique et les catégories. Chaque ligne qui apparaît se gare (Park) ; animations réduites : fondu.
import { Icon, Park, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleAddLabels as V, vehicleTypeLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import type { LiveCard as LiveCardData } from "./model";

const { space1, space3 } = tokens.spacing;

export const typeIcon = { car: "vehicle", moto: "moto", truck: "truck" } as const;

export function LiveCard({ card, remoteCover }: { card: LiveCardData; remoteCover: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const cover = card.cover ? (remoteCover ? mediaSource(card.cover) : { uri: card.cover }) : undefined;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
      accessibilityLiveRegion="polite"
      testID="vehicle-live-card"
    >
      <View style={[styles.photo, { backgroundColor: c.surfaceRaised }]}>
        <Icon name="vehicle" size={34} color={c.inkFaint} />
        {cover ? (
          <View style={StyleSheet.absoluteFill}>
            <Park>
              <Photo source={cover} style={styles.photoFill} />
            </Park>
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <View style={styles.line}>
          {card.name ? (
            <>
              <Icon name={typeIcon[card.type]} size={14} color={c.accentText} />
              <Text variant="label" color={c.accentText}>
                {vehicleTypeLabels[card.type]}
              </Text>
            </>
          ) : (
            <>
              <Icon name="camera" size={14} color={c.accentText} />
              <Text variant="label" color={c.accentText} testID="vehicle-live-photos">
                {card.photos ? V.livePhotos(card.photos) : V.liveNoPhoto}
              </Text>
            </>
          )}
        </View>
        <Text variant="posterM" color={c.ink} testID="vehicle-live-name">
          {card.name ?? V.liveName}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.small}>
          {card.name ? (card.generation ?? vehicleTypeLabels[card.type]) : V.liveLater}
        </Text>
        {card.specs ? (
          <Park>
            <Text variant="caption" color={c.inkMuted} style={styles.small} testID="vehicle-live-specs">
              {card.specs}
            </Text>
          </Park>
        ) : null}
        {card.categories.length ? (
          <Park>
            <View style={styles.chips}>
              {card.categories.map((label) => (
                <Tag key={label} tone="line">
                  {label}
                </Tag>
              ))}
            </View>
          </Park>
        ) : null}
        {card.plate ? (
          <Park>
            <View style={styles.line}>
              <Icon name="lock" size={13} color={c.inkMuted} />
              <Text variant="caption" color={c.inkMuted} style={styles.plate}>
                {V.livePlate}
              </Text>
            </View>
          </Park>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: space3,
    alignItems: "center",
    padding: 10,
    borderRadius: tokens.radius.radiusLg,
  },
  photo: {
    width: 92,
    height: 68,
    borderRadius: 11,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photoFill: { width: 92, height: 68 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  line: { flexDirection: "row", alignItems: "center", gap: space1 },
  small: { fontSize: 11.5, lineHeight: 15 },
  plate: { fontSize: 11, lineHeight: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space1, marginTop: 3 },
});
