// Styles de texte du système (jetons `type`), côté natif : ajoute la largeur d'Archivo et les capitales,
// comme web/typography.css (le README demande au consommateur d'ajouter font-stretch et uppercase).

import type { TextStyle } from "react-native";
import { type TypeStyleName, tokens } from "../tokens";
import { archivoFamily, type FontWidth } from "./fontFamily";

const widthOf: Record<TypeStyleName, FontWidth> = {
  posterXl: "wide",
  posterL: "wide",
  posterM: "wide",
  posterS: "wide",
  title: "wide",
  button: "wide",
  tab: "wide",
  label: "narrow",
  meta: "narrow",
  zone: "narrow",
  credit: "narrow",
  body: "normal",
  bodyStrong: "normal",
  caption: "normal",
  number: "normal",
};

const uppercased = new Set<TypeStyleName>([
  "posterXl",
  "posterL",
  "posterM",
  "posterS",
  "title",
  "button",
  "tab",
  "label",
  "meta",
  "zone",
  "credit",
]);

/** Le style React Native d'un style de texte du système. La couleur est choisie par le composant. */
export function textStyle(name: TypeStyleName): TextStyle {
  const spec = tokens.type[name];
  const italic = spec.fontStyle === "italic";
  const style: TextStyle = {
    fontFamily: archivoFamily(widthOf[name], spec.fontWeight, italic),
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    // Les jetons donnent l'interlettrage en em ; React Native le veut en px.
    letterSpacing: spec.letterSpacing * spec.fontSize,
  };
  if (uppercased.has(name)) style.textTransform = "uppercase";
  if (name === "number") style.fontVariant = ["tabular-nums"];
  return style;
}

/** Tous les styles, calculés une fois. */
export const textStyles = Object.fromEntries(
  (Object.keys(tokens.type) as TypeStyleName[]).map((name) => [name, textStyle(name)]),
) as Record<TypeStyleName, TextStyle>;
