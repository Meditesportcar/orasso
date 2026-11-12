// L'étiquette « Offre » d'une publication (lot R9c, maquette R9.2b/R9.3) : l'étiquette, le titre en gras et la ligne des dates
// (icône calendrier). Posée par la carte du Fil, donc par la vue « Une par une » et la page d'une publication seule ; rien sur
// les vignettes de la grille (décisions du 10/11, § 2 : pas de pastille). Une offre terminée garde la même ligne, l'étiquette
// au contour (neutre) : elle reste une publication de la fiche, seul son état change.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type OfferView, offerDatesLabel, proOffersLabels as T } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

const { space1, space2 } = tokens.spacing;

export function OfferLine({ offer }: { offer: OfferView }) {
  const { t } = useTheme();
  const c = t.color;
  const ended = offer.state === "ended";
  return (
    <View style={styles.wrap} testID="feed-post-offer">
      <View style={styles.row}>
        <Tag tone={ended ? "line" : "acc"} testID="feed-post-offer-tag">
          {ended ? T.tagEnded : T.tag}
        </Tag>
        <View style={styles.dates}>
          <Icon name="calendar" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.datesText} testID="feed-post-offer-dates">
            {offerDatesLabel(offer)}
          </Text>
        </View>
      </View>
      <Text variant="bodyStrong" color={c.ink} style={styles.title} testID="feed-post-offer-title">
        {offer.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space1 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
  dates: { flexDirection: "row", alignItems: "center", gap: space1 + 2, flexShrink: 1 },
  datesText: { flexShrink: 1 },
  title: { fontSize: 15, lineHeight: 20 },
});
