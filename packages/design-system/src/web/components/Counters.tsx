import { type HTMLAttributes, useEffect, useRef, useState } from "react";
import { cx } from "./cx";

export type CounterItem = {
  /** Valeur affichée ; elle ne change jamais de place quand elle change. */
  value: number | string;
  label: string;
};

export type CountersProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  items: readonly CounterItem[];
  /** Index de la cellule active (ce sur quoi on travaille : à trier, places restantes). Une seule. */
  active?: number;
  /** `plate` sur téléphone ; `surface` sur le site organisateur (zone claire de la page). */
  variant?: "plate" | "surface";
  /** `phone` : chiffre 18 px ; `site` : 24 px. */
  size?: "phone" | "site";
};

function Cell({ item, active }: { item: CounterItem; active: boolean }) {
  const previous = useRef(item.value);
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (previous.current !== item.value) {
      previous.current = item.value;
      setChanges((n) => n + 1);
    }
  }, [item.value]);
  const changed = changes > 0;
  return (
    <div
      className={cx("o-counters__cell", active && "is-active", changed && active && "o-anim-flash")}
      key={active ? changes : 0}
    >
      <b className={cx("o-counters__value o-t-number", changed && "o-anim-counter")} key={changes}>
        {item.value}
      </b>
      <span className="o-counters__label o-t-label">{item.label}</span>
    </div>
  );
}

/**
 * Une rangée de chiffres qui ne bougent pas de place quand ils changent. Mise à jour en temps réel sans
 * défilement : le chiffre glisse de 10 px et la cellule active flashe (`fast`).
 */
export function Counters({ items, active, variant = "plate", size = "phone", className, ...rest }: CountersProps) {
  return (
    <div className={cx("o-counters", `o-counters--${variant}`, `o-counters--${size}`, className)} {...rest}>
      {items.map((item, i) => (
        <Cell key={item.label} item={item} active={i === active} />
      ))}
    </div>
  );
}
