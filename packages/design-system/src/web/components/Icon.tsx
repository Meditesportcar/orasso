import type { SVGProps } from "react";
import { type IconName, type IconShape, iconShapes, shapeFilled } from "../../icons";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  /** Taille en px (grille de 24). 20 sur un bouton principal, 18 ailleurs, 22 dans la barre d'onglets. */
  size?: number;
  /** Épaisseur du trait (2 par défaut ; 1,8 dans la barre d'onglets). */
  strokeWidth?: number;
  /** Remplie : `true` tout, `"parts"` seulement les parties `.fillme` de l'artefact (onglet actif, lot C1). */
  filled?: boolean | "parts";
  /** Texte alternatif ; sans lui, l'icône est décorative (aria-hidden). */
  title?: string;
};

function renderShape(shape: IconShape, index: number, fill?: string) {
  const [tag, attrs] = shape;
  const extra = fill ? { fill } : {};
  if (tag === "path") return <path key={index} {...attrs} {...extra} />;
  if (tag === "circle") return <circle key={index} {...attrs} {...extra} />;
  return <rect key={index} {...attrs} {...extra} />;
}

/** Une icône du jeu Icons : trait en currentColor, la couleur vient du contexte. */
export function Icon({ name, size = 24, strokeWidth = 2, filled = false, title, ...rest }: IconProps) {
  const shapes = iconShapes[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled === true ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {shapes.map((shape, i) =>
        renderShape(shape, i, filled === "parts" && shapeFilled(name, i, filled) ? "currentColor" : undefined),
      )}
    </svg>
  );
}
