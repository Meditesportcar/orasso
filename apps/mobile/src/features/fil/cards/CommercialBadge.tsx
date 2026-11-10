// Bandeau « Collaboration commerciale · <pro> » d'une publication (lot R7m2, maquette R7.21 `.r7collabl`) : en tête de la
// carte, avant l'en-tête et la photo, pour qu'on le lise avant le reste. Posé par l'API (jamais retiré) ; toucher le pro
// ouvre sa fiche. Rien sans mention.
import { Icon, Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type CommercialPartnerView, partnershipLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

const { space1, space2, space4 } = tokens.spacing;
const { radiusPill } = tokens.radius;
/** Le logo rond du pro : un cran au-dessus d'une icône de 16 (jetons de l'échelle d'espacement). */
const LOGO = space4 + space1;

export function CommercialBadge({ partner }: { partner: CommercialPartnerView | null }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  if (!partner) return null;
  const logo = mediaSource(partner.logoUrl);
  // Fiche plus visible (dépubliée, supprimée) : le texte reste, sans lien.
  const slug = partner.slug;
  return (
    <Pressable
      accessibilityRole={slug ? "link" : "text"}
      accessibilityLabel={
        slug
          ? `${L.commercialLine(partner.name)}. ${L.commercialOpenPro(partner.name)}`
          : L.commercialLine(partner.name)
      }
      disabled={!slug}
      onPress={slug ? () => router.push(`/p/${slug}`) : undefined}
      hitSlop={6}
      style={[styles.row, { borderBottomColor: c.line }]}
      testID="feed-post-commercial"
    >
      {logo ? (
        <View style={styles.logo}>
          <Photo source={logo} style={styles.img} />
        </View>
      ) : (
        <Icon name="briefcase" size={LOGO - space1} color={c.accentText} />
      )}
      <Text variant="caption" color={c.ink} style={styles.text}>
        <Text variant="bodyStrong" color={c.ink}>
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
  logo: { width: LOGO, height: LOGO, borderRadius: radiusPill, overflow: "hidden" },
  img: { width: LOGO, height: LOGO },
  text: { flexShrink: 1 },
});
