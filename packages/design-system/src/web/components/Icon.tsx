import type { SVGProps } from "react";
import { type IconName, type IconShape, iconShapes } from "../../icons";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  /** Taille en px (grille de 24). 20 sur un bouton principal, 18 ailleurs, 22 dans la barre d'onglets. */
  size?: number;
  /** Épaisseur du trait (2 par défaut ; 1,8 dans la barre d'onglets). */
  strokeWidth?: number;
  /** Remplie : seulement l'onglet actif de la barre d'onglets. */
  filled?: boolean;
  /** Texte alternatif ; sans lui, l'icône est décorative (aria-hidden). */
  title?: string;
};

function renderShape(shape: IconShape, index: number) {
  const [tag, attrs] = shape;
  if (tag === "path") return <path key={index} {...attrs} />;
  if (tag === "circle") return <circle key={index} {...attrs} />;
  return <rect key={index} {...attrs} />;
}

/** Une icône du jeu Icons : trait en currentColor, la couleur vient du contexte. */
export function Icon({ name, size = 24, strokeWidth = 2, filled = false, title, ...rest }: IconProps) {
  const shapes = iconShapes[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
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
      {shapes.map(renderShape)}
    </svg>
  );
}
