// Placement (docs/02 « zones, attendus / arrivés par zone », prototype « Placement · Argelès ») : par zone de
// l'événement, arrivés / attendus et places restantes, d'après la liste du téléphone (hors ligne).
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { counters } from "@/lib/staff/model";
import { useStaffEvent } from "@/lib/staff/useStaff";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space2, space3 } = tokens.spacing;

export default function Placement() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useStaffEvent(id);
  const count = state ? counters(state) : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace(`/staff/${id}`));

  return (
    <FlowScreen
      title={state ? `Placement · ${state.meta.title}` : "Placement"}
      facts="Zones · attendus / arrivés"
      onClose={close}
      still
    >
      {state === null ? (
        <Notice tone="error">La liste n'est pas sur ce téléphone : synchronise depuis l'écran du mode staff.</Notice>
      ) : null}
      {count?.zones.map((z) => (
        <Plate key={z.code ?? "none"} style={styles.zone}>
          <View style={styles.head}>
            <Text variant="zone" color={c.plateInk}>
              {z.code ?? "—"}
            </Text>
            <Text variant="number" color={c.plateInk}>
              {z.arrived} / {z.expected}
            </Text>
          </View>
          <Text variant="bodyStrong" color={c.plateInk}>
            {z.name}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {z.capacity !== null
              ? `${Math.max(0, z.capacity - z.arrived)} places restantes sur ${z.capacity}`
              : `${z.expected - z.arrived} attendus`}
          </Text>
        </Plate>
      ))}
      <Muted variant="meta">
        Les zones sont celles de l'événement. Le plan avec placement véhicule par véhicule viendra plus tard.
      </Muted>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  zone: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
