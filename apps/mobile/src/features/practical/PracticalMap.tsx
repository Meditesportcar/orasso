// Carte de « Pratique » sur téléphone (lot R8q, maquette R8.12), sur le modèle de `ExplorerMap` : MapLibre natif au style du thème,
// mon point (ou l'épingle de l'événement, ou la ville cherchée), une épingle par lieu avec l'icône de sa sorte ; le lieu touché passe en
// moutarde. Petit lot de fin F (option C) : la carte dit sa vue à la fin de chaque geste, regroupe ses épingles (pastille avec leur nombre :
// la toucher rapproche la carte jusqu'à les séparer, ou ouvre la liste quand elles sont à la même adresse) et couvre d'un voile léger ce qui
// n'est pas encore chargé. La carte tient la page pendant ses gestes (`ScrollAssist`), comme celle de l'Explorer. Sur Android, ce sont les
// `onPress` des `Marker` (repérés par la carte) qui reçoivent le toucher. Le rendu navigateur est dans `PracticalMap.web.tsx`.
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapView,
  Marker,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import {
  ClusterPin,
  chooseMapStyle,
  clusterPins,
  GROUP_MAX_ZOOM,
  hatchImageId,
  hatchPngDataUri,
  Icon,
  isStacked,
  MePin,
  mapFallbackRaster,
  probedVectorTiles,
  probeVectorTiles,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  fitView,
  practicalTexts as L,
  type PracticalZone,
  unloadedBands,
  viewZone,
  zoneContains,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";

import { mapGlyphsOrigin, mapTilesUrl } from "@/features/explorer/mapPins";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { createTouchHold } from "@/ui/scrollHold";
import type { PracticalMapProps } from "./mapTypes";
import { kindIcon } from "./Row";

/** Vrai : la carte s'affiche ici. */
export const mapSupported = true;

export function PracticalMap({
  pins,
  origin,
  selectedId,
  onSelect,
  onGroup,
  initial,
  command,
  cover,
  onView,
  height,
}: PracticalMapProps) {
  const { theme, t, reducedMotion } = useTheme();
  const c = t.color;
  const [vectorOk, setVectorOk] = useState<boolean | undefined>(() => probedVectorTiles(mapTilesUrl()));
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => {
    if (vectorOk !== undefined) return;
    let alive = true;
    void probeVectorTiles(mapTilesUrl()).then((ok) => {
      if (alive) setVectorOk(ok);
    });
    return () => {
      alive = false;
    };
  }, [vectorOk]);
  const camera = useRef<CameraRef>(null);
  const assist = useScrollAssist();
  const assistRef = useRef(assist);
  assistRef.current = assist;
  const touchHold = useMemo(() => createTouchHold((on) => assistRef.current?.hold(on)), []);
  useEffect(() => () => touchHold.cancel(), [touchHold]);
  const ids = (e: GestureResponderEvent) => e.nativeEvent.changedTouches.map((x) => x.identifier);
  const style = useMemo(
    () =>
      fellBack
        ? mapFallbackRaster(theme)
        : chooseMapStyle(theme, { glyphsOrigin: mapGlyphsOrigin(), tilesUrl: mapTilesUrl() }, vectorOk !== false),
    [theme, fellBack, vectorOk],
  );
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [seen, setSeen] = useState<{ zone: PracticalZone; zoom: number } | null>(null);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const duration = reducedMotion ? 0 : 420;

  // Première mise en page : la vue de départ est connue sans attendre un geste.
  useEffect(() => {
    if (!size.w || !size.h || seen) return;
    const zone = viewZone(initial, size.w, size.h);
    setSeen({ zone, zoom: initial.zoom });
    onViewRef.current(zone, initial.zoom);
  }, [size, seen, initial]);

  // Un ordre à la caméra : aller à une vue, ou cadrer des lieux.
  const lastSeq = useRef(command?.seq ?? 0);
  useEffect(() => {
    if (!command || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    const target = "view" in command ? command.view : size.w ? fitView(command.fit, size.w, size.h) : null;
    if (target) camera.current?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom, duration });
  }, [command, size, duration]);

  const zoom = seen?.zoom ?? initial.zoom;
  const zone = seen?.zone ?? null;
  const picked = pins.find((p) => p.id === selectedId) ?? null;
  const inView = useMemo(() => {
    if (!zone) return [];
    const padLat = ((zone.north - zone.south) * 20) / Math.max(1, size.h);
    const padLng = ((zone.east - zone.west) * 20) / Math.max(1, size.w);
    return pins.filter((p) => zoneContains(zone, p, padLat, padLng));
  }, [pins, zone, size]);
  const groups = useMemo(
    () =>
      clusterPins(
        inView.filter((p) => p.id !== picked?.id),
        Math.round(zoom),
      ),
    [inView, picked, zoom],
  );
  const veil = useMemo(() => {
    if (!zone) return null;
    const bands = unloadedBands(cover, zone);
    if (!bands.length) return null;
    return {
      type: "FeatureCollection" as const,
      features: bands.map((b) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [b.west, b.south],
              [b.east, b.south],
              [b.east, b.north],
              [b.west, b.north],
              [b.west, b.south],
            ],
          ],
        },
      })),
    };
  }, [cover, zone]);

  const open = (g: (typeof groups)[number]) => () => {
    if (isStacked(g, zoom)) onGroup(g.items.map((p) => p.id));
    else {
      const target = fitView(g.items, size.w || 352, size.h || 400, { maxZoom: GROUP_MAX_ZOOM });
      camera.current?.flyTo({ center: [target.lng, target.lat], zoom: target.zoom, duration });
    }
  };

  return (
    <View
      style={[styles.map, height ? { height } : styles.fill, { borderRadius: tokens.radius.radiusLg }]}
      accessibilityLabel={L.mapLabel}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onTouchStart={(e) => touchHold.start(ids(e))}
      onTouchEnd={(e) => touchHold.end(ids(e))}
      onTouchCancel={() => touchHold.cancel()}
      testID="practical-map"
    >
      {vectorOk === undefined ? null : (
        <MapView
          style={StyleSheet.absoluteFill}
          mapStyle={style as never}
          logo={false}
          attribution
          touchRotate={false}
          touchPitch={false}
          onRegionDidChange={(e: { nativeEvent: ViewStateChangeEvent }) => {
            const [west, south, east, north] = e.nativeEvent.bounds;
            const next = { south, west, north, east };
            setSeen({ zone: next, zoom: e.nativeEvent.zoom });
            onViewRef.current(next, e.nativeEvent.zoom);
          }}
          onDidFailLoadingMap={() => setFellBack(true)}
        >
          <Images images={{ [hatchImageId(theme)]: hatchPngDataUri(theme) }} />
          <Camera ref={camera} initialViewState={{ center: [initial.lng, initial.lat], zoom: initial.zoom }} />
          {veil ? (
            <GeoJSONSource id="practical-veil" data={veil}>
              <Layer id="practical-veil-fill" type="fill" paint={{ "fill-color": c.ink, "fill-opacity": 0.12 }} />
            </GeoJSONSource>
          ) : null}
          {origin?.kind === "me" ? (
            <Marker id="origin" lngLat={[origin.at.lng, origin.at.lat]}>
              <MePin />
            </Marker>
          ) : null}
          {origin?.kind === "outing" ? (
            <Marker id="origin" lngLat={[origin.at.lng, origin.at.lat]}>
              <View style={[styles.event, { backgroundColor: c.ink }]}>
                <Icon name="ticket" size={16} color={c.ground} />
              </View>
            </Marker>
          ) : null}
          {origin?.kind === "searched" ? (
            <Marker id="origin" lngLat={[origin.at.lng, origin.at.lat]}>
              <View style={[styles.event, { backgroundColor: c.ink }]}>
                <Icon name="place" size={16} color={c.ground} />
              </View>
            </Marker>
          ) : null}
          {groups.map((g) => {
            if (g.items.length > 1) {
              return (
                <Marker key={g.id} id={g.id} lngLat={[g.lng, g.lat]} onPress={open(g)}>
                  <ClusterPin count={g.items.length} onPress={open(g)} />
                </Marker>
              );
            }
            const p = g.items[0];
            if (!p) return null;
            return (
              <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} onPress={() => onSelect(p.id)}>
                <Pressable
                  onPress={() => onSelect(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={p.title}
                  style={[styles.pin, { backgroundColor: c.surface, borderColor: c.ink, borderWidth: 2 }]}
                  testID={`practical-pin-${p.id}`}
                >
                  <Icon name={kindIcon[p.kind]} size={16} color={c.ink} />
                </Pressable>
              </Marker>
            );
          })}
          {picked && zone && zoneContains(zone, picked) ? (
            <Marker id={`picked-${picked.id}`} lngLat={[picked.lng, picked.lat]} onPress={() => onSelect(picked.id)}>
              <Pressable
                onPress={() => onSelect(picked.id)}
                accessibilityRole="button"
                accessibilityLabel={picked.title}
                accessibilityState={{ selected: true }}
                style={[styles.pin, { backgroundColor: c.accent }]}
                testID={`practical-pin-${picked.id}`}
              >
                <Icon name={kindIcon[picked.kind]} size={16} color={c.accentInk} />
              </Pressable>
            </Marker>
          ) : null}
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { overflow: "hidden" },
  fill: { flex: 1 },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  event: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
