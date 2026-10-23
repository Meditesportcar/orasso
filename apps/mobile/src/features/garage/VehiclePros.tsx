// « Pour ta … » du Garage (lot M5, maquette 7.1 ; idée de Damien, priorité) : les pros partenaires utiles à ce véhicule,
// avec leur remise ; le sponsorisé en tête, lié au véhicule (emplacement ciblé sur une de ses catégories). La réponse
// n'est jamais gardée sur le téléphone : le sponsorisé n'est compté que quand l'API le renvoie (logique du lot C2a), et
// cet écran l'affiche toujours. Hors ligne : la section n'apparaît pas.
import { Icon, OrgLogo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, homeLabels, proActivityLabels, type VehiclePro } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { SecH } from "@/features/home/fanBlocks";
import { api } from "@/lib/api";
import { mediaSource } from "@/lib/media";
import { useApi } from "@/lib/useApi";

const { space1, space2, space3 } = tokens.spacing;

const discountText = (d: VehiclePro["discount"]) => (d ? `−${d.percent} %` : null);
const fromText = (d: VehiclePro["discount"]) => (d?.from ? `dès ${gradeLabels[d.from]}` : null);

function ProRow({
  name,
  logoUrl,
  line,
  discount,
  sponsored,
  onPress,
  testID,
}: {
  name: string;
  logoUrl: string | null;
  line: string;
  discount: VehiclePro["discount"];
  sponsored?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  const pct = discountText(discount);
  const from = fromText(discount);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[sponsored ? homeLabels.sponsored : null, name, line, pct, from].filter(Boolean).join(", ")}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.pro,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard },
        // `.pro.spn` : un filet moutarde (pas de néon : le seul de l'écran reste un bouton principal).
        sponsored ? { borderColor: c.accent } : null,
        pressed && styles.pressed,
      ]}
    >
      <OrgLogo name={name} logoUrl={mediaSource(logoUrl)?.uri ?? null} size={44} />
      <View style={styles.grow}>
        {sponsored ? (
          <Text variant="label" color={c.inkMuted} style={styles.spl} testID="garage-pros-sponsored-tag">
            {homeLabels.sponsored}
          </Text>
        ) : null}
        <Text variant="bodyStrong" color={c.ink} style={styles.name}>
          {name}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.line}>
          {line}
        </Text>
      </View>
      {pct ? (
        <View style={styles.rm}>
          <Text variant="numberNarrow" color={c.accentText} style={styles.pct}>
            {pct}
          </Text>
          {from ? (
            <Text variant="label" color={c.inkMuted} style={styles.from}>
              {from}
            </Text>
          ) : null}
        </View>
      ) : (
        <Icon name="next" size={18} color={c.ink} />
      )}
    </Pressable>
  );
}

export function VehiclePros({ vehicleId, modelName }: { vehicleId: string; modelName: string }) {
  const { t } = useTheme();
  const router = useRouter();
  const pros = useApi(() => api.vehiclePros(vehicleId), [vehicleId]);
  const data = pros.data;
  if (!data || (!data.sponsored && data.pros.length === 0)) return null;
  const lineOf = (p: Pick<VehiclePro, "activities" | "city" | "distanceKm">) =>
    [
      p.activities
        .slice(0, 2)
        .map((a) => proActivityLabels[a])
        .join(", "),
      p.city,
      typeof p.distanceKm === "number" ? `${Math.round(p.distanceKm)} km` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const s = data.sponsored;
  return (
    <View style={styles.wrap} testID="garage-pros">
      <SecH title={`Pour ta ${modelName}`} meta="Pros partenaires" testID="garage-pros-head" />
      <View style={styles.list}>
        {s ? (
          <ProRow
            name={s.pro.name}
            logoUrl={s.pro.logoUrl}
            line={[s.title, s.city].filter(Boolean).join(" · ")}
            discount={s.discount}
            sponsored
            testID="garage-pros-sponsored"
            onPress={() => {
              void api.sponsoredClick(s.id).catch(() => undefined);
              if (/^https?:\/\//i.test(s.linkUrl)) void Linking.openURL(s.linkUrl).catch(() => undefined);
            }}
          />
        ) : null}
        {data.pros.map((p) => (
          <ProRow
            key={p.slug}
            name={p.name}
            logoUrl={p.logoUrl}
            line={lineOf(p)}
            discount={p.discount}
            testID="garage-pros-item"
            onPress={() => router.push(`/p/${p.slug}`)}
          />
        ))}
      </View>
      <Text variant="caption" color={t.color.inkMuted}>
        La remise s'applique sur présentation de ton QR de compte.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 + 2 },
  list: { gap: space2 },
  pro: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  pressed: { opacity: 0.85 },
  grow: { flex: 1, minWidth: 0 },
  spl: { fontSize: 9.5, lineHeight: 12, marginBottom: 2 },
  name: { fontSize: 14, lineHeight: 18, fontWeight: "800" },
  line: { fontSize: 12, lineHeight: 16 },
  rm: { alignItems: "flex-end", gap: space1 },
  pct: { fontSize: 22, lineHeight: 22 },
  from: { fontSize: 9.5, lineHeight: 11 },
});
