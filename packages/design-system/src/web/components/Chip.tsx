import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ChipProps = Omit<HTMLAttributes<HTMLElement>, "children" | "onClick"> & {
  children: ReactNode;
  /** Sélectionnée : fond encre (fond moutarde sur une plaque). */
  selected?: boolean;
  /**
   * `default` : catégorie, filtre, fait. `accent` : à toi (rayon, zone, grade), inclinée, moutarde.
   * `verified` : badge de confiance (structure vérifiée, pro vérifié, certifié), coins à 4 px, toujours en encre.
   */
  variant?: "default" | "accent" | "verified";
  /** Support : `plate` quand la chip est posée sur une plaque graphite. */
  surface?: "surface" | "plate";
  /** Fourni : la chip est un bouton (filtre). */
  onClick?: () => void;
};

/** Une catégorie, un filtre ou un fait, en capitales étroites. */
export function Chip({ children, selected = false, variant = "default", surface = "surface", onClick, className, ...rest }: ChipProps) {
  const cls = cx("o-chip o-t-meta", `o-chip--${variant}`, surface === "plate" && "o-chip--plate", selected && "is-selected", className);
  const inner = variant === "accent" ? <span className="o-chip__text">{children}</span> : children;
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected} {...(rest as HTMLAttributes<HTMLButtonElement>)}>
        {inner}
      </button>
    );
  }
  return (
    <span className={cls} {...rest}>
      {inner}
    </span>
  );
}

/** Une rangée de chips qui défile à l'horizontale ; la sélectionnée reste visible. */
export function ChipRow({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("o-chip-row", className)} {...rest}>
      {children}
    </div>
  );
}
