// La carte du véhicule qui se construit en haut de l'ajout (prototype `s-vadd`, `.vlive`) : type, nom, génération, puis
// la fiche, les catégories, la couverture et « Plaque floutée, numéro privé » à mesure des étapes. Chaque ligne qui
// apparaît se gare (Park) ; animations réduites : fondu.
import { Chip, Icon, Park, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { vehicleWizardLabels as L, vehicleTypeLabels } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import type { LiveCard as LiveCardData } from "./model";

const { space1, space2, space3 } = tokens.spacing;

export function LiveCard({ card, remoteCover }: { card: LiveCardData; remoteCover: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const cover = card.cover ? (remoteCover ? mediaSource(card.cover) : { uri: card.cover }) : undefined;
  return (
    <View
      style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}
      accessibilityLiveRegion="polite"
      testID="vehicle-live-card"
    >
      <View style={[styles.photo, { backgroundColor: c.surfaceSunken }]}>
        {cover ? (
          <Park>
            <Photo source={cover} style={styles.photoFill} />
          </Park>
        ) : (
          <Icon name="vehicle" size={34} color={c.inkFaint} />
        )}
      </View>
      <View style={styles.text}>
        <View style={styles.type}>
          <Icon name="vehicle" size={14} color={c.accentText} />
          <Text variant="label" color={c.accentText}>
            {vehicleTypeLabels[card.type]}
          </Text>
        </View>
        {card.name ? (
          <Text variant="posterS" color={c.ink} testID="vehicle-live-name">
            {card.name}
          </Text>
        ) : (
          <Text variant="meta" color={c.inkMuted}>
            {L.identityText}
          </Text>
        )}
        {card.generation ? (
          <Text variant="meta" color={c.inkMuted}>
            {card.generation}
          </Text>
        ) : null}
        {card.specs ? (
          <Park>
            <Text variant="meta" color={c.inkMuted} testID="vehicle-live-specs">
              {card.specs}
            </Text>
          </Park>
        ) : null}
        {card.categories.length ? (
          <Park>
            <View style={styles.chips}>
              {card.categories.map((label) => (
                <Chip key={label}>{label}</Chip>
              ))}
            </View>
          </Park>
        ) : null}
        {card.plate ? (
          <Park>
            <View style={styles.type}>
              <Icon name="plate" size={14} color={c.inkMuted} />
              <Text variant="meta" color={c.inkMuted}>
                {L.livePlate}
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
    padding: space2,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
  photo: {
    width: 92,
    height: 68,
    borderRadius: tokens.radius.radiusSm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photoFill: { width: 92, height: 68 },
  text: { flex: 1, minWidth: 0, gap: space1 },
  type: { flexDirection: "row", alignItems: "center", gap: space1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
});
