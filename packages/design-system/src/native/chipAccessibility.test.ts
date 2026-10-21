import { describe, expect, it } from "vitest";
import { chipAccessibility } from "./chipAccessibility";

describe("accessibilité des puces interactives", () => {
  it.each([false, true])("annonce un bouton à bascule, actif : %s", (selected) => {
    expect(chipAccessibility(selected)).toEqual({
      accessibilityRole: "button",
      accessibilityState: { selected },
      "aria-pressed": selected,
    });
  });

  it.each([false, true])("annonce un onglet, sélectionné : %s", (selected) => {
    expect(chipAccessibility(selected, "tab")).toEqual({
      accessibilityRole: "tab",
      accessibilityState: { selected },
      "aria-selected": selected,
    });
  });
});
