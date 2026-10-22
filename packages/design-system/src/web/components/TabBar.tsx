import { type ReactNode, useEffect, useRef, useState } from "react";
import type { IconName } from "../../icons";
import { type TabSetName, tabSets } from "../../labels";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { CenterTabO } from "./Olive";

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** L'onglet du milieu : pastille inclinée en néon (Accueil, ou Direct pour l'organisateur ; v1 : Accès, Tri). */
  center?: boolean;
  /** DA v2 : l'onglet du milieu porte le O (la voiture garée ; animé par le lot 39 via `centerSlot`). */
  o?: boolean;
  /** Pastille de notification moutarde de 8 px sur l'icône (la Boîte). */
  dot?: boolean;
  href?: string;
};

export type TabBarProps = {
  /** Le profil : choisit les cinq onglets (DA v2). Ignoré si `tabs` est fourni. */
  set?: TabSetName;
  /** Contenu du O de l'onglet central ; par défaut le O vivant (CenterTabO, lot 39) : garé si actif, sorti sinon. */
  centerSlot?: ReactNode;
  tabs?: readonly TabItem[];
  /** Identifiant de l'onglet actif. */
  active: string;
  onSelect?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

function TabContent({ tab, active, centerSlot }: { tab: TabItem; active: boolean; centerSlot?: ReactNode }): ReactNode {
  const icon = <Icon name={tab.icon} size={22} strokeWidth={2} filled={active && !tab.center ? "parts" : false} />;
  if (tab.center) {
    // Lot C1 : le rond `.obtn` de l'artefact (68 px, débord de 22 px), le libellé en bas de la barre.
    return (
      <>
        <span className="o-tabbar__o">
          {tab.o ? (centerSlot ?? <CenterTabO active={active} size={58} />) : <Icon name={tab.icon} size={30} />}
        </span>
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
      {active ? <i className="o-tabbar__ind" aria-hidden="true" /> : null}
    </>
  );
}

function TabEntry({
  tab,
  active,
  onSelect,
  centerSlot,
}: {
  tab: TabItem;
  active: boolean;
  onSelect?: (id: string) => void;
  centerSlot?: ReactNode;
}) {
  const cls = cx(
    "o-tabbar__tab o-t-tab",
    tab.center && "is-center",
    tab.center && tab.o && "is-o",
    active && "is-active",
  );
  const content = <TabContent tab={tab} active={active} centerSlot={centerSlot} />;
  if (tab.href) {
    return (
      <a className={cls} href={tab.href} aria-current={active ? "page" : undefined}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => onSelect?.(tab.id)} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  );
}

/**
 * Cinq onglets sur la barre flottante de l'artefact (lot C1), avec le O au milieu (Accueil, ou Direct pour
 * l'organisateur) dans son rond. Le conteneur la pose en bas (`position: fixed` ou `absolute`). Le mode staff et le mode jour J n'ont pas de barre d'onglets : on en
 * sort par la pastille ✕ de l'en-tête.
 */
export function TabBar({
  set = "exhibitor",
  tabs,
  centerSlot,
  active,
  onSelect,
  className,
  "aria-label": ariaLabel = "Navigation",
}: TabBarProps) {
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
      {items.map((tab) => (
        <TabEntry key={tab.id} tab={tab} active={tab.id === active} onSelect={onSelect} centerSlot={centerSlot} />
      ))}
    </nav>
  );
}
