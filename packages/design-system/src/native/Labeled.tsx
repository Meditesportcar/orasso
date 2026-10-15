// Habille un dessin SVG de son texte alternatif : react-native-svg ne transmet pas proprement les propriétés
// d'accessibilité au DOM sur le web, c'est donc une View qui les porte. Sans `label`, le dessin est décoratif.

import type { ReactNode } from "react";
import type { AccessibilityRole } from "react-native";
import { View } from "react-native";

export function Labeled({
  label,
  role = "image",
  children,
}: {
  label?: string;
  role?: AccessibilityRole;
  children: ReactNode;
}) {
  if (!label) {
    return <View aria-hidden>{children}</View>;
  }
  return (
    <View accessible accessibilityRole={role} accessibilityLabel={label}>
      {children}
    </View>
  );
}
