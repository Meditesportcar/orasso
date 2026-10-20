// Bulle d'un membre de l'équipe (DA v2, lot 52, prototype `s-ostaff`) : un rond de 44 à 88 px dont la taille suit le
// nombre d'événements tenus (`bubbleSize`), les initiales du pseudo, une pastille de rôle au coin. Un toucher l'ouvre.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { orgaV2Labels as L, type StructureRole } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { bubbleInitials, bubbleSize } from "@/lib/orgaV2";

const { radiusPill } = tokens.radius;

const roleIcon = { owner: "badge", co_organizer: "grade", staff: "staff" } as const;

export function Bubble({
  pseudo,
  kind,
  held,
  onPress,
  size,
  mark,
  label,
  disabled,
  testID,
}: {
  pseudo: string;
  kind: StructureRole;
  /** Événements tenus : la taille de la bulle. */
  held: number;
  onPress?: () => void;
  /** Taille imposée (rangée de rôles) au lieu de celle de l'engagement. */
  size?: number;
  /** Petite marque en haut à droite (présence confirmée). */
  mark?: boolean;
  /** Nom accessible, quand l'action n'est pas « ouvrir la fiche » (retirer un rôle). */
  label?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const diameter = size ?? bubbleSize(held);
  const pastille = Math.max(16, Math.round(diameter * 0.3));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={label ?? L.bubbleLabel(pseudo, held)}
      testID={testID}
      style={[styles.hit, { width: diameter, height: diameter }]}
    >
      <View
        style={[
          styles.round,
          { width: diameter, height: diameter, backgroundColor: c.plate, borderColor: c.plateEdge },
        ]}
      >
        <Text
          variant="bodyStrong"
          color={c.plateInk}
          style={{ fontSize: Math.round(diameter * 0.3), lineHeight: Math.round(diameter * 0.36) }}
        >
          {bubbleInitials(pseudo)}
        </Text>
      </View>
      <View
        style={[
          styles.pastille,
          { width: pastille, height: pastille, backgroundColor: c.plateChip, borderColor: c.plateEdge },
        ]}
        accessibilityElementsHidden
      >
        <Icon name={roleIcon[kind]} size={Math.round(pastille * 0.6)} color={c.plateInk} />
      </View>
      {mark ? <View style={[styles.mark, { backgroundColor: c.accent }]} accessibilityElementsHidden /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { alignItems: "center", justifyContent: "center" },
  round: { borderRadius: radiusPill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pastille: {
    position: "absolute",
    right: -2,
    bottom: -2,
    borderRadius: radiusPill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { position: "absolute", right: 2, top: 2, width: 10, height: 10, borderRadius: radiusPill },
});
