// Carte de l'Explorer sur téléphone (lot 29) : MapLibre natif avec les tuiles du site, une épingle moutarde par
// événement ou pro localisé ; toucher une épingle ouvre sa fiche sous la carte. Le rendu web est dans `ExplorerMap.web.tsx`
// (la carte native n'a pas de rendu navigateur : repli sur la liste avec un message). Positions affichées : seulement
// celles de ce qui est public par nature (événements publiés, pros publiés), jamais celle d'une personne.
import { Camera, Map as MapView, Marker } from "@maplibre/maplibre-react-native";
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerLabels } from "@orasso/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Muted } from "@/ui/Muted";
import { type MapPin, OSM_STYLE, pinsKey, viewFor } from "./mapPins";

const { space1, space3 } = tokens.spacing;

/** Vrai : la carte s'affiche ici (téléphone). Faux sur le web. */
export const mapSupported = true;

export function ExplorerMap({ pins, onOpen }: { pins: MapPin[]; onOpen: (pin: MapPin) => void }) {
  const { t } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const view = useMemo(() => viewFor(pins), [pins]);
  const selected = pins.find((p) => p.id === selectedId) ?? null;
  return (
    <View style={styles.wrap} testID="explorer-map">
      <View style={[styles.map, { borderColor: t.color.line }]}>
        {/* La clé remet la caméra sur les nouvelles épingles quand les filtres changent. */}
        <MapView key={pinsKey(pins)} style={StyleSheet.absoluteFill} mapStyle={OSM_STYLE} logo={false}>
          <Camera
            initialViewState={
              "bounds" in view ? { bounds: view.bounds, padding: { top: 48, right: 48, bottom: 48, left: 48 } } : view
            }
          />
          {pins.map((pin) => (
            <Marker key={pin.id} id={pin.id} lngLat={[pin.lng, pin.lat]} onPress={() => setSelectedId(pin.id)}>
              <View style={styles.hit} accessibilityRole="button" accessibilityLabel={pin.title} testID="map-pin">
                <View
                  style={[
                    styles.pin,
                    pin.id === selectedId ? styles.pinSelected : null,
                    {
                      backgroundColor: pin.id === selectedId ? t.color.night : t.color.accent,
                      borderColor: pin.id === selectedId ? t.color.accent : t.color.night,
                    },
                  ]}
                />
              </View>
            </Marker>
          ))}
        </MapView>
      </View>
      {pins.length === 0 ? <Muted variant="body">{explorerLabels.mapNoPosition}</Muted> : null}
      {selected ? (
        <Plate style={styles.card} testID="map-card">
          <Text variant="posterS" color={t.color.plateInk}>
            {selected.title}
          </Text>
          <Text variant="meta" color={t.color.plateMuted}>
            {selected.subtitle}
          </Text>
          <Button variant="secondary" icon="next" onPress={() => onOpen(selected)} fullWidth>
            {explorerLabels.mapPinOpen}
          </Button>
        </Plate>
      ) : pins.length > 0 ? (
        <Muted variant="caption">Touche une épingle pour voir la fiche.</Muted>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  map: { height: 360, borderRadius: 12, overflow: "hidden", borderWidth: 1 },
  hit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  pin: { width: 20, height: 20, borderRadius: 999, borderWidth: 3 },
  pinSelected: { width: 28, height: 28 },
  card: { gap: space1, padding: space3 },
});
