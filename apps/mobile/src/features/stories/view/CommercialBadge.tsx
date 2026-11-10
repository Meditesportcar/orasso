// Bandeau « Collaboration commerciale · <pro> » d'une story (lot R7m2, maquette R7.21 `.r7collabb`) : en tête, sous l'en-tête
// de la visionneuse, texte exact, logo rond du pro. Posé par l'API (jamais retiré, y compris sur la copie du pro) ; toucher
// le bandeau ouvre la fiche du pro. Rien sans mention.
import { Icon, Photo, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { partnershipLabels as L, type StoryView } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

const { space2 } = tokens.spacing;

export function CommercialBadge({ story }: { story: StoryView }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const partner = story.commercialPartner;
  if (!partner) return null;
  const logo = mediaSource(partner.logoUrl);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${L.commercialLine(partner.name)}. ${L.commercialOpenPro(partner.name)}`}
      onPress={() => router.push(`/p/${partner.slug}`)}
      hitSlop={8}
      style={[styles.pill, { backgroundColor: withAlpha(c.night, 0.6), borderColor: withAlpha(c.nightInk, 0.55) }]}
      testID="story-commercial"
    >
      {logo ? (
        <View style={styles.logo}>
          <Photo source={logo} style={styles.img} />
        </View>
      ) : (
        <Icon name="briefcase" size={16} color={c.nightInk} />
      )}
      <Text variant="caption" color={c.nightInk} style={styles.text}>
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    maxWidth: "100%",
  },
  logo: { width: 20, height: 20, borderRadius: 10, overflow: "hidden" },
  img: { width: 20, height: 20 },
  text: { flexShrink: 1, fontSize: 12.5, lineHeight: 16, fontFamily: "Archivo-ExtraBold" },
});
