import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { BattleLayer } from "./Olive";
import { Grain } from "./Textures";

export type GroundProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /**
   * `screen` : fond d'un écran de téléphone ; `site` : marquage au pas de 200 px, halo resserré ; `battle` (DA v2,
   * lot 39) : lampe à sodium et contre-jour (Béton) ou fond uni (Sable), avec les meutes de drift.
   */
  variant?: "screen" | "site" | "battle";
  /** Halo qui respire, phares, faisceau : passionné et site seulement. Faux pour le staff et le jour J. */
  animated?: boolean;
  /** `battle` : fond immobile, sans meute ni respiration (staff, jour J, tri : le terrain ne joue pas). */
  still?: boolean;
  /** Fond fixe plein écran (le site) ; sinon il remplit son conteneur. */
  fixed?: boolean;
  children?: ReactNode;
};

/**
 * Le fond vivant : cinq couches (halo, reflet, faisceau, marquage, vignette) puis le grain. Jamais un aplat.
 * Le contenu passe au-dessus. Le consommateur ne fournit que le thème (attribut data-theme d'un ancêtre).
 * Variante `battle` : vignette, contre-jour, lampe qui respire lentement, grain, puis les meutes (Olive.tsx).
 */
export function Ground({
  variant = "screen",
  animated = false,
  still = false,
  fixed = false,
  className,
  children,
  ...rest
}: GroundProps) {
  const motion = (name: string) => (animated ? `o-anim-ambient-${name}` : undefined);
  return (
    <div className={cx("o-ground", `o-ground--${variant}`, fixed && "o-ground--fixed", className)} {...rest}>
      {variant === "battle" ? (
        <div className="o-ground__fx" aria-hidden="true">
          <div className="o-ground__layer o-ground__vignette" />
          <div className="o-ground__layer o-ground__rim" />
          <div className={cx("o-ground__layer o-ground__lamp", !still && "o-anim-ambient-breath")} />
          <Grain />
          <BattleLayer still={still} />
        </div>
      ) : (
        <div className="o-ground__fx" aria-hidden="true">
          <div className="o-ground__layer o-ground__vignette" />
          <div className="o-ground__layer o-ground__marquage" />
          <div className={cx("o-ground__layer o-ground__faisceau", motion("sweep"))} />
          <div className={cx("o-ground__layer o-ground__reflet", motion("phares"))} />
          <div className={cx("o-ground__layer o-ground__halo", motion("breath"))} />
          <Grain />
        </div>
      )}
      <div className="o-ground__content">{children}</div>
    </div>
  );
}
