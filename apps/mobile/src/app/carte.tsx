// Carte d'Explorer en écran plein (lot C2a, artefact DA v2 `s-map`) : écran de flux sans barre d'onglets ni accès
// flottant, ouvert par la puce « Carte » d'Explorer. La carte occupe tout l'écran ; par-dessus : la recherche et ✕
// (`.map-top`), « Me localiser » et « Liste » à droite (`.map-ctl`), la légende en bas à gauche (`.map-legend`), et
// l'aperçu flottant de l'événement touché (`.map-peek`, la carte d'événement d'Explorer). Les gestes de la carte et le
// toucher des étiquettes sont ceux du lot 59c (`ExplorerMap`, mode `fill`). Le segment Pros garde la carte d'Explorer
// dans un écran de flux. Relecture du lot C2a : les filtres de la liste d'Explorer suivent (`filtres`, JSON) ; une pastille
// de plusieurs événements les montre tous (aperçu qui défile) ; une erreur de chargement s'affiche avec « Réessayer ».
import { Icon, type IconName, Text, useTheme } from "@orasso/design-system/native";
import { type EventCard, explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EventCardV2 } from "@/features/explorer/EventCardV2";
import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins } from "@/features/explorer/mapPins";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import {
  type EventFilters,
  emptyEventFilters,
  emptyProFilters,
  eventQuery,
  type ProFilters,
} from "@/features/explorer/queries";
import { useExplorerPosition } from "@/features/explorer/useExplorerPosition";
import { usePaged } from "@/features/explorer/usePaged";
import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { prefetchEvent, rememberEventCard } from "@/lib/eventPreview";
import { useSession } from "@/lib/session";
import { FlowScreen } from "@/ui/Screens";

export default function Carte() {
  const router = useRouter();
  const params = useLocalSearchParams<{ segment?: string; q?: string; filtres?: string }>();
  const q = typeof params.q === "string" ? params.q : "";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // Un objet stable par valeur du paramètre : la liste ne se recharge pas à chaque rendu.
  const proFilters = useMemo(() => parseFilters(params.filtres, emptyProFilters), [params.filtres]);
  const eventFilters = useMemo(() => parseFilters(params.filtres, emptyEventFilters), [params.filtres]);
  if (params.segment === "pros") return <ProsMap q={q} filters={proFilters} onClose={close} />;
  return <EventsMap initialQ={q} filters={eventFilters} onClose={close} />;
}

/** Les filtres passés par Explorer ; ceux d'une autre forme sont ignorés (repli sur les filtres vides). */
function parseFilters<T extends object>(raw: string | undefined, empty: T): T {
  if (!raw) return empty;
  try {
    const value = JSON.parse(raw) as Partial<T>;
    return { ...empty, ...Object.fromEntries(Object.entries(value).filter(([k]) => k in empty)) } as T;
  } catch {
    return empty;
  }
}

function ProsMap({ q, filters, onClose }: { q: string; filters: ProFilters; onClose: () => void }) {
  const dept = useSession().me?.profile.departments[0] ?? null;
  const position = useExplorerPosition();
  return (
    <FlowScreen title={L.map} facts={q || undefined} onClose={onClose}>
      <ProsSegment q={q} position={position} dept={dept} view="map" filters={filters} />
    </FlowScreen>
  );
}

/** Bouton rond de l'écran carte (`.closex`, `.map-ctl button`). */
function MapButton({
  icon,
  label,
  onPress,
  size = 44,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: 38 | 44;
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
      style={[
        styles.ctl,
        { width: size, height: size, borderRadius: size === 38 ? 12 : 14 },
        { backgroundColor: c.ground, boxShadow: t.shadow.shadowCard },
      ]}
    >
      <Icon name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

function EventsMap({ initialQ, filters, onClose }: { initialQ: string; filters: EventFilters; onClose: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const position = useExplorerPosition();
  const [q, setQ] = useState(initialQ);
  const [selected, setSelected] = useState<string[]>([]);
  const ready = position.status !== "checking" && position.status !== "asking";
  const list = usePaged(
    (cursor) => api.exploreEvents(eventQuery(q, filters, position.position, "map", new Date(nowMs()), cursor)),
    [q, filters, position.position],
    q ? 300 : 0,
    ready,
  );
  const items = list.items ?? [];
  const pins = useMemo(() => eventPins(list.items ?? []), [list.items]);
  const picked: EventCard[] = items.filter((e) => selected.includes(e.id));
  const router = useRouter();

  return (
    <View style={[styles.fill, { backgroundColor: c.ground }]} testID="map-screen">
      {list.items ? (
        <ExplorerMap
          fill
          reveal={false}
          pins={pins}
          me={position.position}
          selectedId={selected.length === 1 ? selected[0] : null}
          onSelect={(p) => setSelected([p.id])}
          onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
        />
      ) : null}

      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View
          style={[styles.search, { backgroundColor: c.ground, borderColor: c.line, boxShadow: t.shadow.shadowCard }]}
        >
          <Icon name="search" size={18} color={c.inkMuted} />
          <TextInput
            value={q}
            onChangeText={(text) => {
              setQ(text);
              setSelected([]);
            }}
            placeholder={L.searchPlaceholder}
            placeholderTextColor={c.inkFaint}
            accessibilityLabel="Rechercher sur la carte"
            autoCapitalize="none"
            returnKeyType="search"
            style={[styles.input, { color: c.ink }]}
            testID="map-q"
          />
        </View>
        <MapButton icon="close" label="Fermer" size={38} onPress={onClose} testID="map-close" />
      </View>

      <View style={[styles.side, { top: insets.top + 76 }]} pointerEvents="box-none">
        <MapButton
          icon="place"
          label={position.status === "on" ? L.gpsOnA11y : L.gpsAskA11y}
          onPress={() => void position.request()}
          testID="map-locate"
        />
        <MapButton icon="list" label={L.list} onPress={onClose} testID="map-list" />
      </View>

      {picked.length === 0 ? (
        <View
          style={[
            styles.legend,
            { bottom: insets.bottom + 40, backgroundColor: c.ground, boxShadow: t.shadow.shadowCard },
          ]}
          testID="map-legend"
        >
          <Legend swatch={<View style={[styles.swEvent, { backgroundColor: c.accent }]} />} label="Événement" />
          <Legend swatch={<View style={[styles.swGroup, { backgroundColor: c.ink }]} />} label="Plusieurs" />
          <Legend
            swatch={
              <View
                style={[styles.swMe, { backgroundColor: c.statusWaitlist, borderColor: `${c.statusWaitlist}4d` }]}
              />
            }
            label="Toi"
          />
        </View>
      ) : (
        <View style={[styles.peek, { bottom: insets.bottom + 16, maxHeight: height * 0.5 }]} testID="map-picked">
          <ScrollView contentContainerStyle={styles.peekList} showsVerticalScrollIndicator={picked.length > 1}>
            {picked.map((e) => (
              <View key={e.id} style={[styles.peekCard, { boxShadow: t.shadow.shadowPoster }]}>
                <EventCardV2
                  event={e}
                  onPressIn={() => prefetchEvent(e.slug)}
                  onPress={(r) => {
                    rememberEventCard(e, r);
                    router.push(`/e/${e.slug}`);
                  }}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      {list.error ? (
        <View style={[styles.failed, { top: insets.top + 76, backgroundColor: c.ground }]} testID="map-error">
          <Text variant="caption" color={c.ink}>
            {list.error}
          </Text>
          <SmallButton icon="undo" onPress={() => void list.reload()}>
            Réessayer
          </SmallButton>
        </View>
      ) : list.items === null ? (
        <View style={[styles.empty, { top: insets.top + 76, backgroundColor: c.ground }]} testID="map-loading">
          <Text variant="caption" color={c.inkMuted}>
            {L.loading}
          </Text>
        </View>
      ) : null}
      {list.items && pins.length === 0 ? (
        <View style={[styles.empty, { top: insets.top + 76, backgroundColor: c.ground }]}>
          <Text variant="caption" color={c.inkMuted}>
            {L.emptyTitle}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.legendRow}>
      <View style={styles.swBox}>{swatch}</View>
      <Text variant="caption" color={t.color.ink} style={styles.legendText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.map-top` : la recherche (fond d'écran, ombre) et ✕, à 12 px du haut.
  top: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15 },
  ctl: { alignItems: "center", justifyContent: "center" },
  // `.map-ctl` : 44 px, rayon 14, à droite.
  side: { position: "absolute", right: 16, gap: 8 },
  // `.map-legend` : en bas à gauche, rayon 14, 11,5 px gras.
  legend: { position: "absolute", left: 16, gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendText: { fontSize: 11.5, lineHeight: 15, fontWeight: "700" },
  swBox: { width: 22, alignItems: "center" },
  swEvent: { width: 22, height: 12, borderRadius: 2, transform: [{ skewX: "-10deg" }] },
  swGroup: { width: 14, height: 14, borderRadius: 7 },
  swMe: { width: 20, height: 20, borderRadius: 10, borderWidth: 4 },
  // `.map-peek` : l'aperçu flottant, ombre d'affiche.
  peek: { position: "absolute", left: 16, right: 16, gap: 8 },
  peekCard: { borderRadius: 20 },
  peekList: { gap: 8 },
  failed: { position: "absolute", left: 16, right: 76, borderRadius: 12, padding: 10, gap: 8 },
  empty: { position: "absolute", left: 16, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
});
