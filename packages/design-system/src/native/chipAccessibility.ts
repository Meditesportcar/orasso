/** Les onglets exposent leur sélection ; les filtres cumulables restent des boutons à bascule. */
export function chipAccessibility(selected: boolean, role: "button" | "tab" = "button") {
  return {
    accessibilityRole: role,
    // Conservé pour les lecteurs d'écran natifs ; react-native-web utilise les attributs ARIA ci-dessous.
    accessibilityState: { selected },
    ...(role === "tab" ? { "aria-selected": selected } : { "aria-pressed": selected }),
  };
}
