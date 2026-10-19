import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type OutlinedProps = {
  /** Ce qui est sous le texte : le fond animé (contour `ground`) ou une photo (contour `night`). */
  on: "ground" | "photo";
  /** Élément rendu (span par défaut). */
  as?: "span" | "div" | "p" | "h1" | "h2" | "h3" | "strong";
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

/**
 * Le contour couleur du fond d'un texte posé sur une photo ou sur le fond animé (écart 1 de la DA v2). Les
 * propriétés sont héritées : le composant peut envelopper un bloc entier. Pas de contour ailleurs.
 */
export function Outlined({ on, as: Tag = "span", className, children, ...rest }: OutlinedProps) {
  return (
    <Tag className={cx(on === "photo" ? "o-onphoto" : "o-onbg", className)} {...rest}>
      {children}
    </Tag>
  );
}
