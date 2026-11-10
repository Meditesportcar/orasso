// Bandeau « Collaboration commerciale · <pro> » d'une story (lot R7m2, maquette R7.21 `.r7collabb`) : en tête, sous l'en-tête
// de la visionneuse, texte exact, logo rond du pro. Posé par l'API (jamais retiré, y compris sur la copie du pro) ; toucher
// le bandeau ouvre la fiche du pro. Rien sans mention.
import { Icon, Photo, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { partnershipLabels as L, type StoryView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

const { space1, space2, space4 } = tokens.spacing;
const { radiusPill } = tokens.radius;
/** Le logo rond du pro : un cran au-dessus d'une icône de 16 (jetons de l'échelle d'espacement). */
const LOGO = space4 + space1;

export function CommercialBadge({ story }: { story: StoryView }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const partner = story.commercialPartner;
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
      hitSlop={8}
      style={[styles.pill, { backgroundColor: withAlpha(c.night, 0.6), borderColor: withAlpha(c.nightInk, 0.55) }]}
      testID="story-commercial"
    >
      {logo ? (
        <View style={styles.logo}>
          <Photo source={logo} style={styles.img} />
        </View>
      ) : (
        <Icon name="briefcase" size={LOGO - space1} color={c.nightInk} />
      )}
      <Text variant="bodyStrong" color={c.nightInk} style={styles.text}>
        {L.commercialLine(partner.name)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingVertical: space1 + 2,
    paddingHorizontal: space2 + 2,
    borderRadius: radiusPill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    maxWidth: "100%",
  },
  logo: { width: LOGO, height: LOGO, borderRadius: radiusPill, overflow: "hidden" },
  img: { width: LOGO, height: LOGO },
  text: { flexShrink: 1 },
});
