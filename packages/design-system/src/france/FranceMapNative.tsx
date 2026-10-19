// FranceMap (natif) : carte des départements, sélection multiple (lot 41). Repos : `map-land-2` ; choisi : `accent` ;
// favori : bordé `ink`. La carte ne bouge pas (pas de zoom ni de recherche : v16). Données et licence : departments.ts.

import { memo } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
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

/** Le favori est dessiné en dernier pour que son bord passe par-dessus ses voisins. */
const orderedFor = (favorite?: string | null) =>
  [...franceDepartments].sort((a, b) => Number(a.code === favorite) - Number(b.code === favorite));

function FranceMapBase({ selected, favorite, onToggle, style, accessibilityLabel }: FranceMapProps) {
  const { t } = useTheme();
  const c = t.color;
  const chosen = new Set(selected);
  const ordered = orderedFor(favorite);
  const paint = (code: string) => ({
    fill: chosen.has(code) ? c.accent : c.mapLand2,
    stroke: code === favorite ? c.ink : c.ground,
    strokeWidth: code === favorite ? 2.5 : 1,
  });

  // Navigateur (recette web de l'appli) : react-native-svg y ajoute à chaque tracé des gestionnaires de réponse que le
  // DOM ne connaît pas (erreurs React en développement) ; un <svg> du DOM, plus simple, fait le même dessin.
  if (Platform.OS === "web") {
    return (
      <View style={[styles.box, style]}>
        {/* biome-ignore lint/a11y/useSemanticElements: un fieldset ne s'applique pas à un svg ; groupe de boutons */}
        <svg
          viewBox={franceMapViewBox}
          width="100%"
          role="group"
          aria-label={accessibilityLabel}
          style={{ display: "block", aspectRatio: `${franceMapSize.width} / ${franceMapSize.height}` }}
        >
          {ordered.map((d) => {
            const p = paint(d.code);
            return (
              // biome-ignore lint/a11y/useSemanticElements: un tracé SVG ne peut pas être un button
              <path
                key={d.code}
                d={d.d}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                strokeLinejoin="round"
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-pressed={chosen.has(d.code)}
                aria-label={`${d.code} ${d.name}`}
                data-testid={`dept-${d.code}`}
                onClick={() => onToggle(d.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(d.code);
                  }
                }}
              />
            );
          })}
        </svg>
      </View>
    );
  }

  return (
    <View style={[styles.box, style]} accessibilityLabel={accessibilityLabel}>
      <Svg width="100%" viewBox={franceMapViewBox} style={{ aspectRatio: franceMapSize.width / franceMapSize.height }}>
        <G>
          {ordered.map((d) => (
            <Path
              key={d.code}
              d={d.d}
              {...paint(d.code)}
              strokeLinejoin="round"
              onPress={() => onToggle(d.code)}
              testID={`dept-${d.code}`}
              accessibilityLabel={`${d.code} ${d.name}${chosen.has(d.code) ? ", choisi" : ""}`}
            />
          ))}
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
