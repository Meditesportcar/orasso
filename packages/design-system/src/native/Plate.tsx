// Plate : la plaque graphite. Voir docs/design-system/components/Plate.

import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { radius, useTheme } from "./theme";

/** Vrai dans une plaque : les champs et cases y lisent les jetons plate-* (comme `.o-plate .o-field` du web). */
const PlateContext = createContext(false);
export const useInPlate = () => useContext(PlateContext);

export type PlateProps = ViewProps & {
  /**
   * `card` : la carte graphite (profil, véhicules, compteurs, candidat, agenda, consignes).
   * `label` : un libellé isolé sur une petite plaque `radius-sm`. `note` : note ou encart « à confirmer »,
   * bordure pointillée, jamais transparent en Sable.
   */
  kind?: "card" | "label" | "note";
  children?: ReactNode;
};

/**
 * La plaque graphite : la carte du thème Sable dès que le fond est sombre, c'est-à-dire presque toujours sur le
 * téléphone. En Béton c'est simplement la carte ordinaire : un seul composant, qui lit les jetons plate-*.
 * Ne se décline pas en couleur.
 */
export function Plate({ kind = "card", style, children, ...rest }: PlateProps) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <PlateContext.Provider value>
      <View
        style={[
          styles.base,
          { backgroundColor: c.plate, borderColor: c.plateEdge, boxShadow: t.shadow.shadowCard },
          kind === "label" && styles.label,
          kind === "note" && { borderWidth: 1.5, borderStyle: "dashed", borderColor: c.plateLine, boxShadow: "none" },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </PlateContext.Provider>
  );
}

const styles = StyleSheet.create({
  base: {
    position: "relative",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.radiusLg,
  },
  label: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.radiusSm,
    boxShadow: "none",
  },
});
