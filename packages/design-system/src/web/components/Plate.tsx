import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type PlateProps = HTMLAttributes<HTMLElement> & {
  /** Élément rendu (div par défaut). */
  as?: ElementType;
  /**
   * `card` : la carte graphite (profil, véhicules, compteurs, candidat, agenda, consignes).
   * `label` : un libellé isolé sur une petite plaque `radius-sm`. `note` : note ou encart « à confirmer »,
   * bordure pointillée, jamais transparent en Sable.
   */
  kind?: "card" | "label" | "note";
  children?: ReactNode;
};

/**
 * La plaque graphite : la carte du thème Sable dès que le fond est sombre, c'est-à-dire presque toujours sur le
 * téléphone. En Béton c'est simplement la carte ordinaire : un seul composant, qui lit les jetons plate-*.
 * Ne se décline pas en couleur.
 */
export function Plate({ as: Tag = "div", kind = "card", className, children, ...rest }: PlateProps) {
  return (
    <Tag className={cx("o-plate", `o-plate--${kind}`, className)} {...rest}>
      {children}
    </Tag>
  );
}
