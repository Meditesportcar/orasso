import { type ReactNode, useEffect, useRef, useState } from "react";
import type { IconName } from "../../icons";
import { type TabSetName, tabSets } from "../../labels";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Brush } from "./Textures";

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** L'onglet du milieu : pastille inclinée en néon (Accès pour le passionné et le pro, Tri pour l'organisateur). */
  center?: boolean;
  /** Pastille de notification moutarde de 8 px sur l'icône (la Boîte). */
  dot?: boolean;
  href?: string;
};

export type TabBarProps = {
  /** La casquette : choisit les cinq onglets du README. Ignoré si `tabs` est fourni. */
  set?: TabSetName;
  tabs?: readonly TabItem[];
  /** Identifiant de l'onglet actif. */
  active: string;
  onSelect?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

function TabContent({ tab, active }: { tab: TabItem; active: boolean }): ReactNode {
  const icon = <Icon name={tab.icon} size={22} strokeWidth={1.8} filled={active && !tab.center} />;
  if (tab.center) {
    return (
      <>
        {icon}
        <span className="o-tabbar__center-label">{tab.label}</span>
      </>
    );
  }
  return (
    <>
      <span className="o-tabbar__icon">
        {icon}
        {tab.dot && <i className="o-tabbar__dot" />}
      </span>
      {tab.label}
    </>
  );
}

/**
 * Cinq onglets sur du métal brossé, avec l'Accès (ou le Tri) au milieu comme une pastille d'affiche. Le mode
 * staff et le mode jour J n'ont pas de barre d'onglets : on en sort par la pastille ✕ de l'en-tête.
 */
export function TabBar({ set = "fan", tabs, active, onSelect, className, "aria-label": ariaLabel = "Navigation" }: TabBarProps) {
  const items: readonly TabItem[] = tabs ?? tabSets[set];
  // Le nouvel onglet se gare, mais seulement quand l'onglet change : pas au premier rendu.
  const previous = useRef(active);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (previous.current !== active) {
      previous.current = active;
      setMoved(true);
    }
  }, [active]);
  return (
    <nav className={cx("o-tabbar", className)} aria-label={ariaLabel} data-moved={moved || undefined}>
      <div className="o-tabbar__metal" aria-hidden="true">
        <Brush />
      </div>
      {items.map((tab) => {
        const isActive = tab.id === active;
        const cls = cx("o-tabbar__tab o-t-tab", tab.center && "is-center", isActive && "is-active");
        const content = <TabContent tab={tab} active={isActive} />;
        return tab.href ? (
          <a key={tab.id} className={cls} href={tab.href} aria-current={isActive ? "page" : undefined}>
            {content}
          </a>
        ) : (
          <button key={tab.id} type="button" className={cls} onClick={() => onSelect?.(tab.id)} aria-current={isActive ? "page" : undefined}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
