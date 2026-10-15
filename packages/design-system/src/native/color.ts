// Petits calculs de couleur et d'ombre sur les jetons (équivalents natifs de color-mix et de text-shadow du CSS).

import type { TextStyle } from "react-native";
import { parseColor } from "./gradientCss";

/** La couleur d'un jeton à `alpha` (0 à 1) de son opacité d'origine : color-mix(in srgb, X n%, transparent). */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return `rgba(${c.r},${c.g},${c.b},${+(c.a * alpha).toFixed(3)})`;
}

/** Une ombre de texte CSS d'un jeton (« 0 1px 0 rgba(…) », ou « none ») en propriétés de style React Native. */
export function textShadowOf(css: string): TextStyle {
  if (css === "none") return {};
  const match = css.match(/^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+(.+)$/);
  if (!match) return {};
  const [, x = "0", y = "0", blur = "0", color = ""] = match;
  return {
    textShadowOffset: { width: Number(x), height: Number(y) },
    textShadowRadius: Number(blur),
    textShadowColor: color,
  };
}
