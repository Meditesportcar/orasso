// Carte de l'Explorer sur téléphone (lot 29 ; lot 44 : style Orasso) : MapLibre natif au style du thème (terre en béton
// ou en sable, mer hachurée, noms en Archivo étroit), suivi en direct, sans rotation ni inclinaison ; étiquettes
// datées des événements, plaques des pros, pastilles des groupes (lieux confondus : la liste de leurs événements),
// point « toi » (position de l'appareil, jamais envoyée par la carte). Repli raster OpenStreetMap décidé par la
// demande du TileJSON (délai 3 s, gardée pour la session). Le rendu navigateur est dans `ExplorerMap.web.tsx`.
// Lot 59c (retours de l'APK d'essai) : la carte tient la page pendant ses gestes (défilement et « tirer pour recharger »
// coupés, `ScrollAssist`) : glisser et pincer ne se font plus voler ; elle est plus haute (55 % de l'écran). Sur
// Android, les vues React d'un `Marker` sont dessinées par la carte et ne reçoivent pas le toucher : c'est l'`onPress`
// du `Marker` (repéré par la carte) qui ouvre la fiche, puis la page défile jusqu'à elle.
import {
  Camera,
  type CameraRef,
  Images,
  Map as MapView,
  Marker,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import {
  ClusterPin,
  chooseMapStyle,
  clusterLabel,
  clusterPins,
  EventPin,
  GROUP_MAX_ZOOM,
  hatchImageId,
  hatchPngDataUri,
  isStacked,
  MePin,
  mapFallbackRaster,
  ProPin,
  probedVectorTiles,
  probeVectorTiles,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, StyleSheet, useWindowDimensions, View } from "react-native";

import { useTabSwipeDisabled } from "@/features/nav/useTabSwipe";
import { useScrollAssist } from "@/ui/ScrollAssist";
import { createTouchHold } from "@/ui/scrollHold";
import {
  type ExplorerMapProps,
  groupKind,
  type MapPin,
  mapGlyphsOrigin,
  mapHeight,
  mapTilesUrl,
  pinsKey,
  viewFor,
} from "./mapPins";

const { space3 } = tokens.spacing;

/** Un même toucher peut arriver deux fois (le `Marker` et sa vue sur iOS) : on n'en garde qu'un par demi-seconde. */
const PRESS_DEDUPE_MS = 500;

/** Vrai : la carte s'affiche ici. */
export const mapSupported = true;

export function ExplorerMap({
  pins,
  me,
  selectedId,
  onSelect,
  onSelectGroup,
  children,
  reveal: revealOnPress = true,
  fill = false,
}: ExplorerMapProps) {
  const { theme, t } = useTheme();
  const [zoom, setZoom] = useState<number>(() => {
    const v = viewFor(pins);
    return "zoom" in v ? v.zoom : 8;
  });
  // Repli décidé par la demande du TileJSON : `onDidFailLoadingMap` ne part que si le style échoue, pas quand la source
  // vectorielle tombe. Rendu natif réel à vérifier sur l'APK v2 (lot 58).
  const [vectorOk, setVectorOk] = useState<boolean | undefined>(() => probedVectorTiles(mapTilesUrl()));
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => {
    if (vectorOk !== undefined) return;
    let alive = true;
    void probeVectorTiles(mapTilesUrl()).then((ok) => {
      if (!alive) return;
      if (!ok) console.warn("[carte] TileJSON sans réponse : repli raster OSM");
      setVectorOk(ok);
    });
    return () => {
      alive = false;
    };
  }, [vectorOk]);
  const camera = useRef<CameraRef>(null);
  const assist = useScrollAssist();
  const { height: screenHeight } = useWindowDimensions();
  const below = useRef<View>(null);
  const lastPress = useRef({ id: "", at: 0 });
  /** Toucher d'une étiquette ou d'une pastille : une seule fois, puis la fiche (sous la carte) est montrée. */
  const press = (id: string, action: () => void, reveal = true) => {
    const at = Date.now();
    if (lastPress.current.id === id && at - lastPress.current.at < PRESS_DEDUPE_MS) return;
    lastPress.current = { id, at };
    action();
    if (reveal && revealOnPress) assist?.reveal(below.current);
  };
  // Un doigt sur la carte : la page ne défile plus ; le dernier des doigts posés sur la carte, levé, la rend (lot 59c,
  // tour 2 : identifiants suivis, un doigt resté ailleurs ne compte pas) ; la carte démontée la rend aussi.
  const assistRef = useRef(assist);
  assistRef.current = assist;
  const touchHold = useMemo(() => createTouchHold((on) => assistRef.current?.hold(on)), []);
  useEffect(() => () => touchHold.cancel(), [touchHold]);
  const ids = (e: GestureResponderEvent) => e.nativeEvent.changedTouches.map((t) => t.identifier);
  // Lot 40 : la carte garde le geste horizontal (pas de glissement vers l'onglet voisin).
  useTabSwipeDisabled();
  const view = useMemo(() => viewFor(pins), [pins]);
  const style = useMemo(
    () =>
      fellBack
        ? mapFallbackRaster(theme)
        : chooseMapStyle(theme, { glyphsOrigin: mapGlyphsOrigin(), tilesUrl: mapTilesUrl() }, vectorOk !== false),
    [theme, fellBack, vectorOk],
  );
  const groups = useMemo(() => clusterPins(pins, Math.round(zoom)), [pins, zoom]);

  return (
    <View style={fill ? styles.fillWrap : styles.wrap} testID="explorer-map">
      <View
        style={fill ? styles.fillMap : [styles.map, { borderColor: t.color.line, height: mapHeight(screenHeight) }]}
        onTouchStart={(e) => touchHold.start(ids(e))}
        onTouchEnd={(e) => touchHold.end(ids(e))}
        onTouchCancel={() => touchHold.cancel()}
      >
        {/* La clé remet la caméra sur les nouvelles épingles quand les filtres changent. */}
        {vectorOk === undefined ? null : (
          <MapView
            key={pinsKey(pins)}
            style={StyleSheet.absoluteFill}
            mapStyle={style as never}
            logo={false}
            attribution
            touchRotate={false}
            touchPitch={false}
            onRegionDidChange={(e: { nativeEvent: ViewStateChangeEvent }) => setZoom(e.nativeEvent.zoom)}
            onDidFailLoadingMap={() => {
              if (!fellBack) {
                console.warn("[carte] le style n'a pas pu se charger : repli raster OSM");
                setFellBack(true);
              }
            }}
          >
            <Images images={{ [hatchImageId(theme)]: hatchPngDataUri(theme) }} />
            <Camera
              ref={camera}
              initialViewState={
                "bounds" in view ? { bounds: view.bounds, padding: { top: 48, right: 48, bottom: 48, left: 48 } } : view
              }
            />
            {groups.map((g) => {
              const first = g.items[0] as MapPin;
              const stacked = g.items.length > 1;
              const listGroup = stacked && isStacked(g, zoom) && Boolean(onSelectGroup);
              const open = stacked
                ? () =>
                    press(
                      g.id,
                      () =>
                        listGroup && onSelectGroup
                          ? onSelectGroup(g.items as MapPin[])
                          : camera.current?.flyTo({
                              center: [g.lng, g.lat],
                              zoom: Math.min(zoom + 2, GROUP_MAX_ZOOM),
                            }),
                      listGroup,
                    )
                : () => press(g.id, () => onSelect(first));
              return (
                <Marker key={g.id} id={g.id} lngLat={[g.lng, g.lat]} anchor="bottom" onPress={open}>
                  {stacked ? (
                    <ClusterPin
                      count={g.items.length}
                      label={clusterLabel(g.items.length, groupKind(g.items as MapPin[]))}
                      onPress={open}
                    />
                  ) : first.kind === "pro" ? (
                    <ProPin label={first.label} accessibilityLabel={first.title} onPress={open} />
                  ) : (
                    <EventPin
                      label={first.label}
                      hot={first.id === selectedId}
                      accessibilityLabel={first.title}
                      onPress={open}
                    />
                  )}
                </Marker>
              );
            })}
            {me ? (
              <Marker id="me" lngLat={[me.lng, me.lat]}>
                <MePin />
              </Marker>
            ) : null}
          </MapView>
        )}
      </View>
      <View ref={below} collapsable={false} pointerEvents="box-none" style={fill ? styles.fillBelow : styles.below}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  map: { borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
  below: { gap: space3 },
  fillWrap: { flex: 1 },
  fillMap: { flex: 1, overflow: "hidden" },
  fillBelow: { position: "absolute", left: 12, right: 12, bottom: 12, gap: space3 },
});
