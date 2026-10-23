// « Pour ta … » du Garage (lot M5, maquette 7.1 ; idée de Damien, priorité) : les pros partenaires utiles à ce véhicule,
// avec leur remise ; le sponsorisé en tête, lié au véhicule (emplacement ciblé sur une de ses catégories). La réponse
// n'est jamais gardée sur le téléphone. Tour 2 : le sponsorisé n'est compté qu'à sa première apparition à l'écran
// (`POST /sponsored/:id/impression`) ; plafond atteint, il disparaît. Une réponse d'un autre véhicule (changement de
// véhicule, réponse en retard) n'est jamais montrée ; hors ligne, la section n'apparaît pas. Sans département connu :
// une phrase pour choisir son coin, aucune liste.
import { Icon, OrgLogo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { gradeLabels, homeLabels, proActivityLabels, type VehiclePro, vehicleProsLabels } from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

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

/**
 * Compte l'affichage du sponsorisé à sa première apparition à l'écran (écran au premier plan, au moins la moitié de la
 * ligne dans la fenêtre), une seule fois. Renvoie faux si l'API le refuse (plafond du jour atteint) : on le retire.
 */
function useImpression(id: string | null) {
  const ref = useRef<View>(null);
  const focused = useIsFocused();
  const { height } = useWindowDimensions();
  const [state, setState] = useState<"waiting" | "counted" | "refused">("waiting");
  useEffect(() => {
    if (!id || !focused || state !== "waiting") return;
    let stopped = false;
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (stopped || h <= 0 || y + h / 2 > height || y + h / 2 < 0) return;
        stopped = true;
        api.sponsoredImpression(id).then(
          () => setState("counted"),
          (e: { status?: number }) => {
            // 409 (plafond atteint), 404 (emplacement arrêté) : il ne s'affiche plus. Autre panne : réessai plus tard.
            if (e.status === 409 || e.status === 404) setState("refused");
            else stopped = false;
          },
        );
      });
    check();
    const timer = setInterval(check, 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, focused, height, state]);
  return { ref, refused: state === "refused" };
}

export function VehiclePros({
  vehicleId,
  modelName,
  round = 0,
}: {
  vehicleId: string;
  modelName: string;
  /** Change à chaque « tirer pour actualiser » du Garage : la section se relit. */
  round?: number;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const pros = useApi(() => api.vehiclePros(vehicleId), [vehicleId, round]);
  // Une réponse d'un autre véhicule n'est jamais montrée (le composant est aussi remonté à chaque véhicule).
  const data = pros.data?.vehicleId === vehicleId ? pros.data : null;
  const seen = useImpression(data?.sponsored?.id ?? null);
  if (!data) return null;
  if (data.needsPlace && !data.sponsored) {
    return (
      <View style={styles.wrap} testID="garage-pros">
        <SecH title={`Pour ta ${modelName}`} meta={vehicleProsLabels.partners} testID="garage-pros-head" />
        <Text variant="body" color={t.color.inkMuted} testID="garage-pros-needs-place">
          {vehicleProsLabels.needsPlace}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/reglages/preferences")}
          style={styles.place}
          testID="garage-pros-place"
        >
          <Icon name="place" size={16} color={t.color.accentText} />
          <Text variant="bodyStrong" color={t.color.accentText}>
            {vehicleProsLabels.needsPlaceLink}
          </Text>
        </Pressable>
      </View>
    );
  }
  const sponsoredShown = data.sponsored && !seen.refused ? data.sponsored : null;
  if (!sponsoredShown && data.pros.length === 0) return null;
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
  const s = sponsoredShown;
  return (
    <View style={styles.wrap} testID="garage-pros">
      <SecH title={`Pour ta ${modelName}`} meta="Pros partenaires" testID="garage-pros-head" />
      <View style={styles.list}>
        {s ? (
          <View ref={seen.ref} collapsable={false}>
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
          </View>
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
      {data.needsPlace ? (
        <Text variant="caption" color={t.color.inkMuted} testID="garage-pros-needs-place">
          {vehicleProsLabels.needsPlace}
        </Text>
      ) : null}
      <Text variant="caption" color={t.color.inkMuted}>
        {vehicleProsLabels.qrHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 + 2 },
  place: { flexDirection: "row", alignItems: "center", gap: space1, alignSelf: "flex-start", minHeight: 44 },
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
