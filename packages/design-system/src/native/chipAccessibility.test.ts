import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chipAccessibility, chipHasTouchTarget, chipPressableProps } from "./chipAccessibility";

const noop = () => {};

describe("accessibilité des puces interactives", () => {
  it("un bouton simple n'annonce aucun état et garde sa taille", () => {
    for (const selected of [false, true]) {
      expect(chipAccessibility(selected)).toEqual({ accessibilityRole: "button" });
      expect(chipPressableProps({ selected, onPress: noop })).toMatchObject({ targeted: false });
    }
  });

  it.each([false, true])("une vraie bascule annonce son état (aria-pressed), actif : %s", (selected) => {
    expect(chipAccessibility(selected, "toggle")).toEqual({
      accessibilityRole: "button",
      accessibilityState: { selected },
      "aria-pressed": selected,
    });
  });

  it.each([false, true])("un onglet annonce aria-selected, sélectionné : %s", (selected) => {
    expect(chipAccessibility(selected, "tab")).toEqual({
      accessibilityRole: "tab",
      accessibilityState: { selected },
      "aria-selected": selected,
    });
  });

  it.each([false, true])("un choix de réglage est un radio (aria-checked), coché : %s", (selected) => {
    expect(chipAccessibility(selected, "radio")).toEqual({
      accessibilityRole: "radio",
      accessibilityState: { checked: selected },
      "aria-checked": selected,
    });
  });

  it("seules les puces à état (segments, filtres, réglages) ont la cible agrandie", () => {
    expect(chipHasTouchTarget("button")).toBe(false);
    for (const role of ["toggle", "tab", "radio"] as const) expect(chipHasTouchTarget(role)).toBe(true);
  });

  it("les props de Pressable de Chip viennent de cette fonction, et une puce décorative n'en reçoit aucune", () => {
    const props = chipPressableProps({ selected: true, role: "tab", onPress: noop, accessibilityLabel: "Tous" });
    expect(props.a11y).toEqual(chipAccessibility(true, "tab"));
    expect(props.targeted).toBe(true);
    expect(props.accessibilityLabel).toBe("Tous");
    const source = readFileSync(resolve(import.meta.dirname, "Chip.tsx"), "utf8");
    // Sans onPress, Chip rend le corps nu (View) avant tout appel : pas de rôle, pas d'état.
    expect(source.indexOf("if (!onPress) return body;")).toBeGreaterThan(-1);
    expect(source.indexOf("if (!onPress) return body;")).toBeLessThan(source.indexOf("chipPressableProps("));
    expect(source).toContain("{...press.a11y}");
  });
});
