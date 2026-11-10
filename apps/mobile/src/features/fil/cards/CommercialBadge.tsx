// Bandeau « Collaboration commerciale · <pro> » d'une publication (lot R7m2, maquette R7.21 `.r7collabl`) : en tête de la
// carte, avant l'en-tête et la photo, pour qu'on le lise avant le reste. Posé par l'API (jamais retiré) ; toucher le pro
// ouvre sa fiche. Rien sans mention.
import { Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CommercialPartnerView, partnershipLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

const { space1, space2 } = tokens.spacing;

export function CommercialBadge({ partner }: { partner: CommercialPartnerView | null }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  if (!partner) return null;
  const logo = mediaSource(partner.logoUrl);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${L.commercialLine(partner.name)}. ${L.commercialOpenPro(partner.name)}`}
      onPress={() => router.push(`/p/${partner.slug}`)}
      hitSlop={6}
      style={[styles.row, { borderBottomColor: c.line }]}
      testID="feed-post-commercial"
    >
      {logo ? (
        <View style={styles.logo}>
          <Photo source={logo} style={styles.img} />
        </View>
      ) : (
        <Icon name="briefcase" size={16} color={c.accentText} />
      )}
      <Text variant="caption" color={c.ink} style={styles.text}>
        <Text variant="caption" color={c.ink} style={styles.bold}>
          {L.commercialCollaboration}
        </Text>
        {` · ${partner.name}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingBottom: space2,
    marginBottom: space1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: { width: 20, height: 20, borderRadius: 10, overflow: "hidden" },
  img: { width: 20, height: 20 },
  text: { flexShrink: 1, fontSize: 12.5, lineHeight: 16 },
  bold: { fontFamily: "Archivo-ExtraBold" },
});
