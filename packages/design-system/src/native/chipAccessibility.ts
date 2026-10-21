/** Rôle d'une puce interactive : `button` n'annonce aucun état ; `toggle`, `tab` et `radio` annoncent leur sélection. */
export type ChipRole = "button" | "toggle" | "tab" | "radio";

/** Attributs d'accessibilité d'une puce interactive, selon son rôle (voir `ChipProps.accessibilityRole`). */
export function chipAccessibility(selected: boolean, role: ChipRole = "button") {
  if (role === "tab") {
    return { accessibilityRole: "tab" as const, accessibilityState: { selected }, "aria-selected": selected };
  }
  if (role === "radio") {
    return { accessibilityRole: "radio" as const, accessibilityState: { checked: selected }, "aria-checked": selected };
  }
  if (role === "toggle") {
    return { accessibilityRole: "button" as const, accessibilityState: { selected }, "aria-pressed": selected };
  }
  return { accessibilityRole: "button" as const };
}

/** Seules les puces à état (segments, filtres, réglages) ont une cible agrandie au jeton `touch`. */
export function chipHasTouchTarget(role: ChipRole = "button"): boolean {
  return role !== "button";
}

/**
 * Tout ce que `Chip` pose sur son `Pressable` quand il est interactif. Une puce décorative (sans `onPress`) n'appelle
 * pas cette fonction : ni rôle, ni état, ni cible.
 */
export function chipPressableProps(args: {
  selected: boolean;
  role?: ChipRole;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { selected, role = "button", onPress, accessibilityLabel } = args;
  return {
    onPress,
    accessibilityLabel,
    targeted: chipHasTouchTarget(role),
    a11y: chipAccessibility(selected, role),
  };
}
