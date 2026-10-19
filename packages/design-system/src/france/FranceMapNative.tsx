// FranceMap (natif) : carte des départements, sélection multiple (lot 41). Repos : `map-land-2` ; choisi : `accent` ;
// favori : bordé `ink`. La carte ne bouge pas (pas de zoom ni de recherche : v16). Données et licence : departments.ts.

import { memo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { Text } from "../native/text";
import { useTheme } from "../native/theme";
import { franceDepartments, franceMapCredit, franceMapSize, franceMapViewBox } from "./departments";

export type FranceMapProps = {
  /** Codes choisis, dans l'ordre du choix. */
  selected: readonly string[];
  /** Code du favori (le premier choisi), bordé d'encre. */
  favorite?: string | null;
  onToggle: (code: string) => void;
  style?: ViewStyle;
  /** Nom lu par les lecteurs d'écran. */
  accessibilityLabel?: string;
};

function FranceMapBase({ selected, favorite, onToggle, style, accessibilityLabel }: FranceMapProps) {
  const { t } = useTheme();
  const c = t.color;
  const chosen = new Set(selected);
  // Le favori est dessiné en dernier pour que son bord passe par-dessus ses voisins.
  const ordered = [...franceDepartments].sort((a, b) => Number(a.code === favorite) - Number(b.code === favorite));
  return (
    <View style={[styles.box, style]} accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" viewBox={franceMapViewBox} style={{ aspectRatio: franceMapSize.width / franceMapSize.height }}>
        <G>
          {ordered.map((d) => {
            const on = chosen.has(d.code);
            const fav = d.code === favorite;
            return (
              <Path
                key={d.code}
                d={d.d}
                fill={on ? c.accent : c.mapLand2}
                stroke={fav ? c.ink : c.ground}
                strokeWidth={fav ? 2.5 : 1}
                strokeLinejoin="round"
                onPress={() => onToggle(d.code)}
                testID={`dept-${d.code}`}
                accessibilityLabel={`${d.code} ${d.name}${on ? ", choisi" : ""}`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

export const FranceMap = memo(FranceMapBase);

/** Crédit de la carte (CC BY 4.0, H7) : à poser sous toute carte de France (`onPlate` : sur une plaque graphite). */
export function FranceMapCredit({ style, onPlate = false }: { style?: ViewStyle; onPlate?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={style}>
      <Text variant="credit" color={onPlate ? t.color.plateMuted : t.color.inkFaint}>
        {franceMapCredit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ box: { width: "100%" } });
