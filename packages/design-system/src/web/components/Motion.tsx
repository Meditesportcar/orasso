import { type ElementType, type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { duration } from "../../motion";
import { cx } from "./cx";

type BoxProps = HTMLAttributes<HTMLElement> & { as?: ElementType; children?: ReactNode };

/** Ce qui arrive se gare : park jusqu'à 6 px au-delà de sa place, puis inout jusqu'à la place (`base`). */
export function Park({ as: Tag = "div", className, children, ...rest }: BoxProps) {
  return (
    <Tag className={cx("o-anim-park", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Une liste qui apparaît en cascade (`stagger`) : quatre lignes au plus, les suivantes d'un bloc. */
export function Cascade({ as: Tag = "div", className, children, ...rest }: BoxProps) {
  return (
    <Tag className={cx("o-anim-stagger", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** L'affiche se dévoile par la coupe à 10° (`poster`) : carte affiche, nouveau grade, mode jour J. */
export function Reveal({ as: Tag = "div", className, children, ...rest }: BoxProps) {
  return (
    <Tag className={cx("o-anim-cut", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Changement d'onglet : fondu avec huit pixels de montée (base) ; l'ancien contenu s'efface en fast. */
export function TabPanel({ as: Tag = "div", className, children, ...rest }: BoxProps) {
  return (
    <Tag className={cx("o-anim-tab", className)} role="tabpanel" {...rest}>
      {children}
    </Tag>
  );
}

export type ScreenTransitionProps = {
  /** Clé de l'écran courant : quand elle change, le nouvel écran se gare depuis la droite. */
  screenKey: string;
  children: ReactNode;
  className?: string;
};

/**
 * Changer d'écran : l'écran qui arrive se gare depuis la droite (base) pendant que celui qui part s'efface en
 * fondu croisé (`screenOut`), jamais l'un posé sur l'autre puis l'ancien qui disparaît. Le premier écran apparaît
 * sans animation. Avec « réduction des animations », tout devient un fondu `fast`.
 */
export function ScreenTransition({ screenKey, children, className }: ScreenTransitionProps) {
  const current = useRef({ key: screenKey, node: children });
  const [leaving, setLeaving] = useState<{ key: string; node: ReactNode } | null>(null);
  const [entered, setEntered] = useState(false);

  if (current.current.key !== screenKey) {
    // On garde l'ancien écran le temps de son fondu de sortie.
    setLeaving(current.current);
    setEntered(true);
    current.current = { key: screenKey, node: children };
  } else {
    current.current.node = children;
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), duration.screenOut);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <div className={cx("o-screens", className)}>
      {leaving && (
        <div key={`out-${leaving.key}`} className="o-screens__leaving o-anim-fade-out" aria-hidden="true">
          {leaving.node}
        </div>
      )}
      <div key={screenKey} className={cx("o-screens__current", entered && "o-anim-screen")}>
        {children}
      </div>
    </div>
  );
}
