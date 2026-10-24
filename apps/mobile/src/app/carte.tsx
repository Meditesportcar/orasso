// Carte d'un seul événement en écran plein (lot M5, tour 2 : « Sur la carte » d'un ticket de l'Accueil, `?event=<adresse>`) :
// son épingle, sa fiche en aperçu, ✕. Elle est lue par sa page (l'API dit s'il est visible pour la personne : un
// événement sur invitation l'est pour ses invités), sans recherche.
// Lot R2 (maquette R2.8) : la carte de l'Explorer vit dans l'onglet Explorer, sous la bande ORASSO (bascule « Liste |
// Carte ») ; cette route ne sert plus qu'à un événement. Sans `event`, elle se referme.
import { Icon, type IconName, Text, useTheme } from "@orasso/design-system/native";
import { explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EventCardV2 } from "@/features/explorer/EventCardV2";
import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import { eventPins, eventPinsData } from "@/features/explorer/mapPins";
import { useExplorerPosition } from "@/features/explorer/useExplorerPosition";
import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { prefetchEvent, rememberEventCard } from "@/lib/eventPreview";
import { useApi } from "@/lib/useApi";

export default function Carte() {
  const router = useRouter();
  const params = useLocalSearchParams<{ event?: string }>();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  if (typeof params.event === "string" && params.event) return <EventFocusMap slug={params.event} onClose={close} />;
  return <Gone onClose={close} />;
}

/** Une ancienne adresse de la carte (avant le lot R2) : rien à montrer ici, on revient d'où l'on vient. */
function Gone({ onClose }: { onClose: () => void }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: une seule fois, à l'ouverture
  useEffect(() => {
    onClose();
  }, []);
  return null;
}

/** Bouton rond de l'écran carte (`.closex`). */
function MapButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
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
      style={[styles.ctl, { backgroundColor: c.ground, boxShadow: t.shadow.shadowCard }]}
    >
      <Icon name={icon} size={20} color={c.ink} />
    </Pressable>
  );
}

/** Un seul événement sur la carte (lot M5, tour 2) : son épingle, sa fiche en aperçu, ✕. Aucune recherche. */
function EventFocusMap({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const position = useExplorerPosition();
  const event = useApi(() => api.eventBySlug(slug), [slug]);
  const e = event.data;
  // Relecture du lot R1 : l'épingle suit les données de l'événement (adresse, coordonnées, date corrigées).
  const dataKey = e ? eventPinsData([e]) : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: recalculée quand les données de l'événement changent
  const pins = useMemo(() => (e ? eventPins([e], new Date(nowMs())) : []), [dataKey]);
  return (
    <View style={[styles.fill, { backgroundColor: c.ground }]} testID="map-screen">
      {e && pins.length ? (
        <ExplorerMap
          fill
          reveal={false}
          pins={pins}
          me={position.position}
          selectedId={e.id}
          onSelect={() => undefined}
        />
      ) : null}
      <View style={[styles.top, { top: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.fill} />
        <MapButton icon="close" label="Fermer" onPress={onClose} testID="map-close" />
      </View>
      {e ? (
        <View style={[styles.peek, { bottom: insets.bottom + 16 }]} testID="map-focus">
          <View style={[styles.peekCard, { boxShadow: t.shadow.shadowPoster }]}>
            <EventCardV2
              event={e}
              onPressIn={() => prefetchEvent(e.slug)}
              onPress={(r) => {
                rememberEventCard(e, r);
                router.push(`/e/${e.slug}`);
              }}
            />
          </View>
        </View>
      ) : null}
      {event.error ? (
        <View style={[styles.failed, { top: insets.top + 76, backgroundColor: c.ground }]} testID="map-error">
          <Text variant="caption" color={c.ink}>
            {event.error.message}
          </Text>
          <SmallButton icon="undo" onPress={() => void event.reload()}>
            Réessayer
          </SmallButton>
        </View>
      ) : !e ? (
        <View style={[styles.empty, { top: insets.top + 76, backgroundColor: c.ground }]} testID="map-loading">
          <Text variant="caption" color={c.inkMuted}>
            {L.loading}
          </Text>
        </View>
      ) : pins.length === 0 ? (
        <View style={[styles.empty, { top: insets.top + 76, backgroundColor: c.ground }]} testID="map-no-place">
          <Text variant="caption" color={c.inkMuted}>
            Lieu pas encore placé sur la carte.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `.map-top` : ✕ à 12 px du haut.
  top: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  ctl: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  // `.map-peek` : l'aperçu flottant, ombre d'affiche.
  peek: { position: "absolute", left: 16, right: 16, gap: 8 },
  peekCard: { borderRadius: 20 },
  failed: { position: "absolute", left: 16, right: 76, borderRadius: 12, padding: 10, gap: 8 },
  empty: { position: "absolute", left: 16, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
});
