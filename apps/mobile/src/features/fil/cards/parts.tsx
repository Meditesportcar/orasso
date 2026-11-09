// Pièces des cartes du Fil : le rond d'un organisateur ou d'un pro (logo, ou initiales), le trophée d'un résultat, la
// ligne de repères (raison + temps), la raison d'une personne.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FeedCard, feedAgo } from "@orasso/shared";
import { Image, StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { mediaSource } from "@/lib/media";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Logo rond d'une structure ou d'un pro ; sans logo, ses initiales sur la plaque de nuit (jamais un rond vide). */
export function OrgLogo({ url, name, size = 38 }: { url: string | null; name: string; size?: number }) {
  const { t } = useTheme();
  const source = mediaSource(url);
  return (
    <View
      style={[styles.logo, { width: size, height: size, backgroundColor: t.color.night }]}
      accessibilityElementsHidden
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      ) : (
        <Text variant="label" color={t.color.nightInk}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/** Rond du trophée d'un résultat de vote. */
export function TrophyHead({ size = 38 }: { size?: number }) {
  const { t } = useTheme();
  return (
    <View style={[styles.logo, { width: size, height: size, backgroundColor: t.color.surfaceRaised }]}>
      <Icon name="trophy" size={20} color={t.color.accentText} />
    </View>
  );
}

/** La petite ligne d'une carte : la raison, puis « · il y a 3 h ». */
export const reasonLine = (card: FeedCard): string => `${card.reason.label} · ${feedAgo(card.at, now())}`;

const styles = StyleSheet.create({
  logo: {
    borderRadius: tokens.radius.radiusPill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
