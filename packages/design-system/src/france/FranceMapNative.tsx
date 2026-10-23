// FranceMap (natif) : carte des départements, sélection multiple (lot 41). Décorative pour le lecteur d'écran : le chemin
// accessible est la liste (`DepartmentChecklist`). Repos : `map-land-2` ; choisi : `accent` ;
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
  /**
   * Lot M6 (« Ton coin », maquette 8.1) : la France remplie d'une teinte « terre » un cran au-dessus de la carte qui la
   * porte (deptLand), frontières de la couleur de ce fond. Sans ces deux couleurs, le dessin d'origine (mapLand2,
   * frontières ground) reste celui des autres écrans.
   */
  land?: string;
  border?: string;
  style?: ViewStyle;
};

/** Le favori est dessiné en dernier pour que son bord passe par-dessus ses voisins. */
const orderedFor = (favorite?: string | null) =>
  [...franceDepartments].sort((a, b) => Number(a.code === favorite) - Number(b.code === favorite));

function FranceMapBase({ selected, favorite, onToggle, land, border, style }: FranceMapProps) {
  const { t } = useTheme();
  const c = t.color;
  const chosen = new Set(selected);
  const ordered = orderedFor(favorite);
  const paint = (code: string) => ({
    fill: chosen.has(code) ? c.accent : (land ?? c.mapLand2),
    stroke: code === favorite ? c.ink : (border ?? c.ground),
    strokeWidth: code === favorite ? 2.5 : 1,
  });

  // Navigateur (recette web de l'appli) : react-native-svg y ajoute à chaque tracé des gestionnaires de réponse que le
  // DOM ne connaît pas (erreurs React en développement) ; un <svg> du DOM, plus simple, fait le même dessin.
  if (Platform.OS === "web") {
    return (
      <View style={[styles.box, style]} aria-hidden>
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: carte décorative, la liste est le chemin accessible */}
        <svg
          viewBox={franceMapViewBox}
          width="100%"
          focusable="false"
          style={{ display: "block", aspectRatio: `${franceMapSize.width} / ${franceMapSize.height}` }}
        >
          {ordered.map((d) => {
            const p = paint(d.code);
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: tracé décoratif, la liste des départements est le chemin accessible
              <path
                key={d.code}
                d={d.d}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={p.strokeWidth}
                strokeLinejoin="round"
                style={{ cursor: "pointer" }}
                tabIndex={-1}
                data-testid={`dept-${d.code}`}
                onClick={() => onToggle(d.code)}
              />
            );
          })}
        </svg>
      </View>
    );
  }

  return (
    <View style={[styles.box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
