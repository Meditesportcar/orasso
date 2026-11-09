// Carte « pro » : un professionnel publié près de chez moi (logo, nom, activités, ville), « Sa fiche ».
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedScreenLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";
import { SmButton } from "@/ui/Kit";
import { CardShell } from "./CardShell";
import { OrgLogo, reasonLine } from "./parts";
import type { CardProps } from "./types";

export function ProCard({ card, onMenu, faded }: CardProps<"pro">) {
  const { t } = useTheme();
  const router = useRouter();
  const { pro } = card.payload;
  const where = [pro.city, pro.department].filter(Boolean).join(" · ");
  return (
    <CardShell
      card={card}
      head={<OrgLogo url={pro.logoUrl} name={pro.name} />}
      title={pro.name}
      reason={reasonLine(card)}
      onMenu={onMenu}
      onTitle={() => router.push(`/p/${pro.slug}`)}
      faded={faded}
      actions={
        <>
          <View style={styles.grow} />
          <SmButton kind="s" icon="next" onPress={() => router.push(`/p/${pro.slug}`)} testID="feed-pro-open">
            {L.seePro}
          </SmButton>
        </>
      }
    >
      {pro.photoUrl ? (
        <View style={[styles.photo, { backgroundColor: t.color.night }]}>
          <Image
            source={mediaSource(pro.photoUrl)}
            style={styles.img}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
      {pro.activities.length || where ? (
        <Text variant="body" color={t.color.ink} style={styles.text}>
          {[pro.activities.join(", "), where].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </CardShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  text: { fontSize: 14, lineHeight: 20 },
  photo: { height: 170, borderRadius: tokens.radius.radiusMd + 2, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
});
