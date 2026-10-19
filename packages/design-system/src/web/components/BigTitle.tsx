import type { ReactNode } from "react";
import { cx } from "./cx";

export type BigTitleProps = {
  /** Le titre de la page (« Mon garage »), en `poster-l` : toujours sur une ligne. */
  title: string;
  /** L'étiquette à droite (« 3 véhicules ») : c'est elle qui passe dessous quand la place manque (360 px). */
  label?: ReactNode;
  /** Niveau du titre (h1 par défaut). */
  level?: 1 | 2;
  className?: string;
};

/**
 * Le grand titre d'un onglet (DA v2, écart 7) : jamais coupé ni tronqué ; sa taille suit la largeur (entre `poster-l`
 * et `poster-xl`) et l'étiquette de droite se replie en dessous à 360 px.
 */
export function BigTitle({ title, label, level = 1, className }: BigTitleProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={cx("o-bigtitle", className)}>
      <div className="o-bigtitle__row">
        <Heading className="o-bigtitle__title o-t-poster-l">{title}</Heading>
        {label ? <span className="o-bigtitle__label o-t-label">{label}</span> : null}
      </div>
    </div>
  );
}
