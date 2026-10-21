// Une icône du jeu Icons (32 pictogrammes + 3), dessinée avec react-native-svg d'après iconShapes.

import Svg, { Circle, Path, Rect } from "react-native-svg";
import { type IconName, type IconShape, iconShapes, shapeFilled } from "../icons";
import { Labeled } from "./Labeled";

export type IconProps = {
  name: IconName;
  /** Taille en px (grille de 24). 20 sur un bouton principal, 18 ailleurs, 22 dans la barre d'onglets. */
  size?: number;
  /** Couleur du trait (un jeton du thème). */
  color: string;
  /** Épaisseur du trait (2 par défaut ; 1,8 dans la barre d'onglets). */
  strokeWidth?: number;
  /** Remplie : `true` tout, `"parts"` seulement les parties `.fillme` de l'artefact (onglet actif, lot C1). */
  filled?: boolean | "parts";
  /** Texte alternatif ; sans lui, l'icône est décorative. */
  title?: string;
};

function renderShape(shape: IconShape, index: number, fill?: string) {
  const [tag, attrs] = shape;
  const extra = fill ? { fill } : {};
  if (tag === "path") return <Path key={index} {...attrs} {...extra} />;
  if (tag === "circle") return <Circle key={index} {...attrs} {...extra} />;
  return <Rect key={index} {...attrs} {...extra} />;
}

/** Une icône du jeu Icons : trait arrondi de 2 px sur la grille de 24, la couleur est donnée par le composant. */
export function Icon({ name, size = 24, color, strokeWidth = 2, filled = false, title }: IconProps) {
  return (
    <Labeled label={title}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled === true ? color : "none"}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconShapes[name].map((shape, i) =>
          renderShape(shape, i, filled === "parts" && shapeFilled(name, i, filled) ? color : undefined),
        )}
      </Svg>
    </Labeled>
  );
}
