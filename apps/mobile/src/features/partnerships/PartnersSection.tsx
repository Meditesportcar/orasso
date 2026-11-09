// Lot R7m1 (maquette R7.19 `pp_fiche`) : « Ses partenaires » sur la fiche d'un pro : les passionnés à partenariat actif
// (pseudo, grade, voiture), chacun ouvre son profil. L'API décide ce qui s'y trouve : rien sans compte connecté, et pour un
// compte privé que la personne qui regarde ne suit pas, le pseudo, la photo et le grade sans voiture.
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, partnershipLabels as L, type PartnerOfPro } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/ui/Avatar";
import { SecH } from "@/ui/KitTz";

const { space2, space3 } = tokens.spacing;

export function PartnersSection({ items, onPlate = false }: { items: PartnerOfPro[]; onPlate?: boolean }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  if (!items.length) return null;
  const ink = onPlate ? c.plateInk : c.ink;
  const muted = onPlate ? c.plateMuted : c.inkMuted;
  return (
    <View style={styles.section} testID="pro-partners">
      <SecH title={L.partnersTitle} hint={L.partnersCount(items.length)} />
      {items.map((p) => {
        const body = (
          <>
            <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
            <View style={styles.text}>
              <Text variant="bodyStrong" color={ink}>
                {p.pseudo}
              </Text>
              <Text variant="caption" color={muted}>
                {[gradeLabels[p.grade], p.vehicle?.label].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Icon name="next" size={16} color={muted} />
          </>
        );
        return (
          <Pressable
            key={p.pseudo}
            accessibilityRole="link"
            accessibilityLabel={p.pseudo}
            onPress={() => router.push(`/u/${encodeURIComponent(p.pseudo)}`)}
            testID="pro-partner"
          >
            {onPlate ? (
              <Plate style={styles.row}>{body}</Plate>
            ) : (
              <View style={[styles.row, styles.card, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
                {body}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space2 },
  row: { flexDirection: "row", alignItems: "center", gap: space3 },
  card: { padding: space3, borderRadius: 14 },
  text: { flex: 1, gap: 2 },
});
