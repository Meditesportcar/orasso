// Écran « Pratique » (lot R8q, maquette R8.12 `pratH`), ouvert par « Voir tout » : plein écran, mode B. « Près de moi | Près de ma
// sortie », les puces « Tout · Stations-service · Lavage », la liste triée par distance ou la carte (MapLibre et OpenStreetMap, sur le
// modèle de l'Explorer), la bascule « Liste | Carte » collée en bas. Un seul bouton principal par vue : « Y aller » du lieu touché
// dans la carte ; dans la liste, tous les « Y aller » sont secondaires. Les distances se calculent ici, avec la position exacte
// (qui ne quitte jamais l'appareil) ; le dernier choix de la séance est retenu.
import { Chip, ChipRow, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type PracticalChoice as Choice,
  filterKind,
  formatKm,
  practicalTexts as L,
  type LatLng,
  type PracticalFilter,
  practicalTitle,
  withDistance,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListMapToggle } from "@/features/explorer/ExplorerScreen";
import { Seg, SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { PracticalMap } from "./PracticalMap";
import { usePracticalPosition } from "./position";
import { PracticalRow, useGoSheet } from "./Row";
import { giveMyPosition, practicalSession, usePracticalSources } from "./usePractical";

const { space2, space3 } = tokens.spacing;

/** Hauteur de la carte (`.r8map` de la maquette : 360). */
const MAP_HEIGHT = 360;

const filters: { value: PracticalFilter; label: string }[] = [
  { value: "all", label: L.filterAll },
  { value: "fuel", label: L.filterFuel },
  { value: "wash", label: L.filterWash },
];

export function PracticalScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ou?: string }>();
  const { go, sheet } = useGoSheet();
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const [choice, setChoice] = useState<Choice>(params.ou === "sortie" ? "outing" : practicalSession.choice);
  const [filter, setFilter] = useState<PracticalFilter>(practicalSession.filter);
  const [view, setView] = useState<"list" | "map">(practicalSession.view);
  const [picked, setPicked] = useState<string | null>(null);

  const outingOrigin = sources.outing.data?.origin ?? null;
  const active: Choice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  const from: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data?.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  const fromLat = from?.lat;
  const fromLng = from?.lng;
  const list = useMemo(
    () =>
      data && fromLat !== undefined && fromLng !== undefined
        ? filterKind(withDistance(data.places, { lat: fromLat, lng: fromLng }), filter)
        : [],
    [data, fromLat, fromLng, filter],
  );
  // Le lieu touché ; sans toucher, le plus proche est choisi d'office (la maquette ouvre la carte sur lui).
  const selected = list.find((p) => p.id === picked) ?? list[0] ?? null;
  const detail = (p: (typeof list)[number]) => `${L.kindLabel[p.kind]} · ${formatKm(p.distanceKm)}`;
  const mapDetail = (p: (typeof list)[number]) => (active === "outing" ? `${detail(p)} ${L.fromOuting}` : detail(p));
  const titleOf = (p: (typeof list)[number]) => practicalTitle(p, L.unnamed);
  const pick =
    <T,>(set: (v: T) => void, key: "choice" | "filter" | "view") =>
    (v: T) => {
      (practicalSession as Record<string, unknown>)[key] = v;
      set(v);
      setPicked(null);
    };
  const onPosition = active === "me" && sources.me.onPosition;

  return (
    <FlowScreen
      title={L.screenTitle}
      facts={L.screenSubtitle}
      closeLabel={L.back}
      onClose={() => router.back()}
      overlays={
        <ListMapToggle
          view={view === "map" ? "map" : "list"}
          onList={() => pick(setView, "view")("list")}
          onMap={() => pick(setView, "view")("map")}
          bottom={insets.bottom + space3 + 2}
        />
      }
    >
      {outingOrigin ? (
        <Seg<Choice>
          options={[
            { value: "me", label: L.nearMe },
            { value: "outing", label: L.nearOuting },
          ]}
          value={active}
          onChange={pick(setChoice, "choice")}
          wrap
          compact
          maxFontScale={1.12}
          testID="practical-choice"
        />
      ) : null}
      <ChipRow accessibilityRole="tablist">
        {filters.map((f) => (
          <Chip
            key={f.value}
            selected={filter === f.value}
            onPress={() => pick(setFilter, "filter")(f.value)}
            accessibilityRole="tab"
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>
      {active === "outing" && data?.origin ? (
        <View style={styles.hint}>
          <Icon name="ticket" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.hintText} testID="practical-hint">
            {L.aroundOuting(data.origin.label)}
          </Text>
        </View>
      ) : null}
      {active === "me" && !onPosition && data ? (
        <View style={styles.hint}>
          <Icon name="place" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.hintText} testID="practical-hint">
            {data.origin ? L.aroundCity(data.origin.label) : L.noOrigin}
          </Text>
        </View>
      ) : null}
      {read.offline && data ? <Notice>Hors ligne : voici ce que ton téléphone a gardé.</Notice> : null}

      {!data ? (
        <Text variant="caption" color={c.inkMuted} testID="practical-state">
          {read.loading ? L.loading : L.unavailable}
        </Text>
      ) : list.length === 0 ? (
        <Text variant="caption" color={c.inkMuted} testID="practical-empty">
          {data.partial && data.places.length === 0 ? L.unavailable : L.nothingNear}
        </Text>
      ) : view === "map" ? (
        <View testID="practical-map-view">
          <View style={styles.mapWrap}>
            <PracticalMap
              pins={list.map((p) => ({ id: p.id, kind: p.kind, title: titleOf(p), lat: p.lat, lng: p.lng }))}
              origin={from ? { kind: active === "outing" ? "outing" : "me", at: from } : null}
              selectedId={selected?.id ?? null}
              onSelect={setPicked}
              height={MAP_HEIGHT}
            />
            {selected ? (
              <View style={styles.selected} pointerEvents="box-none">
                <PracticalRow
                  kind={selected.kind}
                  title={titleOf(selected)}
                  detail={mapDetail(selected)}
                  onGo={() => go({ title: titleOf(selected), lat: selected.lat, lng: selected.lng })}
                  primary
                  testID="practical-selected"
                />
              </View>
            ) : null}
          </View>
          <Text variant="caption" color={c.inkMuted} style={styles.credit}>
            {L.mapAttribution}
          </Text>
        </View>
      ) : (
        <View style={styles.rows} testID="practical-list">
          {list.map((p, i) => (
            <PracticalRow
              key={p.id}
              kind={p.kind}
              title={titleOf(p)}
              detail={detail(p)}
              onGo={() => go({ title: titleOf(p), lat: p.lat, lng: p.lng })}
              testID={`practical-row-${i}`}
            />
          ))}
        </View>
      )}
      {active === "me" && !onPosition && data ? (
        <View style={styles.gps}>
          <SmButton
            kind="s"
            icon="target"
            disabled={busy}
            onPress={() => void giveMyPosition()}
            testID="practical-use-position"
          >
            {L.usePosition}
          </SmButton>
        </View>
      ) : null}
      {data && view === "list" && list.length > 0 ? (
        <View style={styles.credits}>
          <Text variant="caption" color={c.inkMuted}>
            {data.attribution.wash}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {data.attribution.fuel}
          </Text>
        </View>
      ) : null}
      <View style={styles.bar} />
      {sheet}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hintText: { flex: 1 },
  mapWrap: { position: "relative" },
  selected: { position: "absolute", left: 10, right: 10, bottom: 10 },
  credit: { paddingTop: space2 },
  credits: { gap: 2, paddingTop: space2 },
  gps: { alignItems: "flex-start", paddingTop: space3 - space2 },
  // La place de la bascule « Liste | Carte » collée en bas : le dernier lieu reste lisible au-dessus d'elle.
  bar: { height: 56 },
});
