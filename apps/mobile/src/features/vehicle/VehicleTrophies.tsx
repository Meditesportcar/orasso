// Les trophées de la carte d'un véhicule (lot R7l3, maquette R7.18 `vr_car`) : une ligne par podium de vote (« Plus belle
// japonaise · Rassemblement du Lydia · 10 nov. »), et « Partenaire : Wrap 66 » quand l'API renvoie `partner` (R7m1). Rien
// quand il n'y a ni l'un ni l'autre. Les trophées viennent de l'API (`vehicle_trophies`, règlement des votes) ; aucune règle ici.
import { Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { partnerOf, vehicleTrophyTexts as T, trophiesOf, trophyLine } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { now } from "@/lib/clock";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

/** Les lignes seules (sans titre de section) : la carte du garage les range sous ses chiffres. */
export function VehicleTrophies({
  vehicle,
  compact = false,
  max,
}: {
  /** La fiche du véhicule telle que l'API la rend (`trophies`, éventuellement `partner`). */
  vehicle: unknown;
  /** Sans titre de section (dans une carte déjà titrée). */
  compact?: boolean;
  /** Au plus N lignes (le reste : « + N autres »). */
  max?: number;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const at = now();
  const lines = trophiesOf(vehicle).map((x) => trophyLine(x, at));
  const partner = partnerOf(vehicle);
  if (lines.length === 0 && !partner) return null;
  const shown = max ? lines.slice(0, max) : lines;
  const more = lines.length - shown.length;
  return (
    <View style={styles.col} testID="vehicle-trophies">
      {lines.length > 0 && !compact ? <SecHead title={T.title} hint={T.byThePublic} /> : null}
      {shown.map((l) => (
        <View
          key={l.id}
          style={[
            styles.row,
            {
              backgroundColor: compact ? c.surfaceRaised : c.surface,
              boxShadow: compact ? undefined : t.shadow.shadowCard,
            },
          ]}
          testID="vehicle-trophy"
        >
          <View style={[styles.round, { backgroundColor: c.surfaceSunken }]}>
            <Icon name="trophy" size={20} color={c.accent} />
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink}>
              {l.title}
            </Text>
            <Text variant="caption" color={c.inkMuted}>
              {l.sub}
            </Text>
          </View>
          <Tag tone={l.first ? "acc" : "line"}>{l.rank}</Tag>
        </View>
      ))}
      {more > 0 ? (
        <Text variant="caption" color={c.inkMuted}>
          {`+ ${more} ${more > 1 ? "autres trophées" : "autre trophée"}`}
        </Text>
      ) : null}
      {partner ? (
        <Pressable
          accessibilityRole={partner.slug ? "link" : "text"}
          accessibilityLabel={partner.title}
          disabled={!partner.slug}
          onPress={() => partner.slug && router.push(`/p/${partner.slug}` as never)}
          style={[
            styles.row,
            {
              backgroundColor: compact ? c.surfaceRaised : c.surface,
              boxShadow: compact ? undefined : t.shadow.shadowCard,
            },
          ]}
          testID="vehicle-partner"
        >
          <View style={[styles.round, { backgroundColor: c.surfaceSunken }]}>
            <Icon name="briefcase" size={20} color={c.ink} />
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink}>
              {partner.title}
            </Text>
          </View>
          {partner.slug ? <Icon name="next" size={18} color={c.inkMuted} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    borderRadius: 16,
    padding: space2 + 2,
    paddingRight: space3,
  },
  round: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0, gap: space1 / 2 },
});
