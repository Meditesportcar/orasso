// Styles de texte du système (jetons `type`), côté natif : ajoute la largeur d'Archivo et les capitales,
// comme web/typography.css (le README demande au consommateur d'ajouter font-stretch et uppercase).

import { Children, type ReactNode } from "react";
import type { TextStyle } from "react-native";
import { type TypeStyleName, tokens } from "../tokens";
import { archivoAt, archivoFamily, type FontWidth } from "./fontFamily";

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
  // Largeur imposée par le jeton (fontStretch, 62 %) : voir textStyle.
  numberNarrow: "narrow",
};

/** Styles écrits en capitales. */
export const uppercased: ReadonlySet<TypeStyleName> = new Set<TypeStyleName>([
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
    // Lot C1 : un style qui porte sa largeur (boutons 118 %, onglets 115 %, étiquettes 75 %, chiffres 62 %) prend
    // l'instance embarquée la plus proche ; sinon la largeur de son groupe.
    fontFamily: spec.fontStretch
      ? archivoAt(Number.parseFloat(spec.fontStretch), spec.fontWeight, italic)
      : archivoFamily(widthOf[name], spec.fontWeight, italic),
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    // Les jetons donnent l'interlettrage en em ; React Native le veut en px.
    letterSpacing: spec.letterSpacing * spec.fontSize,
  };
  if (uppercased.has(name)) style.textTransform = "uppercase";
  if (name === "number" || name === "numberNarrow") style.fontVariant = ["tabular-nums"];
  return style;
}

/** Tous les styles, calculés une fois. */
export const textStyles = Object.fromEntries(
  (Object.keys(tokens.type) as TypeStyleName[]).map((name) => [name, textStyle(name)]),
) as Record<TypeStyleName, TextStyle>;

/**
 * Lot R3a (retour 2 de Damien : « AJOUTER DES… », PHOTOS manquant sur son Android) : Android mesure le texte avant de le
 * mettre en capitales (`textTransform`) ; la boîte prévue pour le texte en minuscules, plus étroit, reçoit une ligne de
 * moins que le texte affiché et la dernière est coupée. Sur Android, les styles en capitales reçoivent donc leur texte
 * déjà en capitales (français) : mesure et affichage portent sur le même texte. Ailleurs, rien ne change.
 */
export function capitalsFor(variant: TypeStyleName, children: ReactNode, os: string): ReactNode {
  if (os !== "android" || !uppercased.has(variant)) return children;
  const up = (c: ReactNode): ReactNode => (typeof c === "string" ? c.toLocaleUpperCase("fr-FR") : c);
  // `Children.map` garde des clés stables (aucun avertissement de liste).
  return Array.isArray(children) ? Children.map(children, up) : up(children);
}
