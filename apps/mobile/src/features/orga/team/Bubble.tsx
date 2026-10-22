// Bulle d'un membre de l'équipe (artefact DA v2, `s-ostaff`, classes `.bub`, `.bub small`, `.bub .rb`, `.avs span`) :
// un rond plein à la couleur d'avatar du membre, initiales crème en Archivo large 900 (taille / 3,6), le prénom en
// petites capitales sous les initiales des grandes bulles (> 58 px), la pastille de rôle moutarde au coin (trois
// lettres). La taille suit le nombre d'événements tenus (`bubbleSize`, 36 à 96 px). Un toucher l'ouvre.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaV2Labels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { avatarToken, bubbleInitials, bubbleName, bubbleSize } from "@/lib/orgaV2";

const { radiusPill } = tokens.radius;

export function Bubble({
  userId,
  pseudo,
  held,
  onPress,
  size,
  badge,
  dim,
  label,
  disabled,
  testID,
}: {
  userId: string;
  pseudo: string;
  /** Événements tenus : la taille de la bulle et le nom accessible. */
  held: number;
  onPress?: () => void;
  /** Taille imposée (grappe réduite, rangée d'avatars `.avs`, en-tête de feuille). */
  size?: number;
  /** Pastille de rôle `.rb` (trois lettres du rôle pour l'événement choisi). */
  badge?: string | null;
  /** Présence pas encore confirmée : avatar estompé dans les rangées de rôles. */
  dim?: boolean;
  /** Nom accessible, quand l'action n'est pas « ouvrir la fiche » (retirer un rôle). */
  label?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const diameter = size ?? bubbleSize(held);
  const fontSize = Math.round(diameter / 3.6);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={label ?? L.bubbleLabel(pseudo, held)}
      testID={testID}
      style={({ pressed }) => [
        styles.round,
        {
          width: diameter,
          height: diameter,
          backgroundColor: c[avatarToken(userId)],
          opacity: dim ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        diameter > 40 ? { boxShadow: t.shadow.shadowCard } : null,
      ]}
    >
      <Text
        variant="bodyStrong"
        color={c.avatarInk}
        style={[styles.initials, { fontSize, lineHeight: fontSize * 1.1 }]}
      >
        {bubbleInitials(pseudo)}
      </Text>
      {diameter > 58 ? (
        <Text variant="meta" color={c.avatarInk} style={styles.name} numberOfLines={1}>
          {bubbleName(pseudo)}
        </Text>
      ) : null}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.accent }]} accessibilityElementsHidden>
          <Text variant="meta" color={c.accentInk} style={styles.badgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** La bulle « +N » des demandes (ou « + » pour inviter) : anneau d'encre, pointillés moutarde décalés de 4 px (`.bub.req`). */
export function RequestBubble({
  count,
  size = 56,
  onPress,
  label,
  testID,
}: {
  count: number;
  size?: number;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.reqOuter,
        { width: size + 12, height: size + 12, borderColor: c.accent, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <View style={[styles.round, { width: size, height: size, borderWidth: 2, borderColor: c.ink }]}>
        <Text variant="bodyStrong" color={c.ink} style={styles.reqText}>
          {count > 0 ? `+${count}` : "+"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: radiusPill, alignItems: "center", justifyContent: "center" },

  initials: { fontWeight: "900", textAlign: "center" },
  name: { fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", opacity: 0.85, maxWidth: "86%" },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  reqOuter: {
    borderRadius: radiusPill,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  reqText: { fontSize: 15, fontWeight: "900" },
});
