// Carte de « Pratique » sur téléphone (lot R8q, maquette R8.12), sur le modèle de `ExplorerMap` : MapLibre natif au style du thème,
// mon point (ou l'épingle de l'événement), une épingle par lieu avec l'icône de sa sorte ; le lieu touché passe en moutarde. La carte
// tient la page pendant ses gestes (`ScrollAssist`), comme celle de l'Explorer. Sur Android, ce sont les `onPress` des `Marker`
// (repérés par la carte) qui reçoivent le toucher. Le rendu navigateur est dans `PracticalMap.web.tsx`.
import { Camera, Images, Map as MapView, Marker } from "@maplibre/maplibre-react-native";
import {
  chooseMapStyle,
  hatchImageId,
  hatchPngDataUri,
  Icon,
  MePin,
  mapFallbackRaster,
  probedVectorTiles,
  probeVectorTiles,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { practicalTexts as L } from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, View } from "react-native";

import { mapGlyphsOrigin, mapTilesUrl, viewFor } from "@/features/explorer/mapPins";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { createTouchHold } from "@/ui/scrollHold";
import type { PracticalMapProps } from "./mapTypes";
import { kindIcon } from "./Row";

/** Vrai : la carte s'affiche ici. */
export const mapSupported = true;

export function PracticalMap({ pins, origin, selectedId, onSelect, height }: PracticalMapProps) {
  const { theme, t } = useTheme();
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
  const framed = useMemo(
    () => [...pins, ...(origin ? [{ lat: origin.at.lat, lng: origin.at.lng }] : [])],
    [pins, origin],
  );
  const view = useMemo(() => viewFor(framed, 12), [framed]);
  const key = useMemo(() => `${origin?.at.lat},${origin?.at.lng}|${pins.map((p) => p.id).join(",")}`, [pins, origin]);

  return (
    <View
      style={[styles.map, { height, borderRadius: tokens.radius.radiusLg }]}
      accessibilityLabel={L.mapLabel}
      onTouchStart={(e) => touchHold.start(ids(e))}
      onTouchEnd={(e) => touchHold.end(ids(e))}
      onTouchCancel={() => touchHold.cancel()}
      testID="practical-map"
    >
      {vectorOk === undefined ? null : (
        <MapView
          key={key}
          style={StyleSheet.absoluteFill}
          mapStyle={style as never}
          logo={false}
          attribution
          touchRotate={false}
          touchPitch={false}
          onDidFailLoadingMap={() => setFellBack(true)}
        >
          <Images images={{ [hatchImageId(theme)]: hatchPngDataUri(theme) }} />
          <Camera
            initialViewState={
              "bounds" in view ? { bounds: view.bounds, padding: { top: 48, right: 48, bottom: 96, left: 48 } } : view
            }
          />
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
          {pins.map((p) => {
            const on = p.id === selectedId;
            return (
              <Marker key={p.id} id={p.id} lngLat={[p.lng, p.lat]} onPress={() => onSelect(p.id)}>
                <Pressable
                  onPress={() => onSelect(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={p.title}
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.pin,
                    on
                      ? { backgroundColor: c.accent }
                      : { backgroundColor: c.surface, borderColor: c.ink, borderWidth: 2 },
                  ]}
                  testID={`practical-pin-${p.id}`}
                >
                  <Icon name={kindIcon[p.kind]} size={16} color={on ? c.accentInk : c.ink} />
                </Pressable>
              </Marker>
            );
          })}
        </MapView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { overflow: "hidden" },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  event: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
