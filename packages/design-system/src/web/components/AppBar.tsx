import type { ReactNode } from "react";
import type { IconName } from "../../icons";
import { Logo, Monogram } from "./Brand";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Brush } from "./Textures";

type ActionProps = {
  icon: IconName;
  /** Nom accessible (« Rechercher », « Journal »). */
  label: string;
  onClick?: () => void;
  href?: string;
  /** On est sur l'écran que la pastille ouvre : fond bar-ink, icône inversée. */
  on?: boolean;
  /** Pastille de notification : un compteur moutarde. */
  count?: number;
  /** Contenu libre à la place de l'icône (avatar, logo de structure). */
  children?: ReactNode;
  className?: string;
};

/** Une pastille d'action de l'en-tête : 34 px, `radius-chip`. */
export function AppBarAction({ icon, label, onClick, href, on = false, count, children, className }: ActionProps) {
  const cls = cx("o-appbar__action", on && "is-on", children && "has-content", className);
  const content = (
    <>
      {children ?? <Icon name={icon} size={18} />}
      {count ? <span className="o-appbar__count o-t-credit">{count}</span> : null}
    </>
  );
  if (href) {
    return (
      <a className={cls} href={href} aria-label={label} aria-current={on ? "page" : undefined}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={label} aria-pressed={on || undefined}>
      {content}
    </button>
  );
}

export type AppBarProps = {
  /**
   * `home` : le logotype complet, sans titre (Accueil). `page` : le monogramme, le titre, puis les trois pastilles
   * Recherche, Cloche, Avatar. `flow` : écran de flux (Scan, Jour J, Candidature) : le monogramme, le titre,
   * l'action de contexte éventuelle, puis ✕ Fermer en dernier.
   */
  kind: "home" | "page" | "flow";
  title?: string;
  /** Ligne de faits sous le titre (Tri, Scan, Direct) : « Nocturne de Canet · MéditeSportCar · J-2 ». */
  facts?: ReactNode;
  /** Écran de flux : compteur de contexte (« 62 / 116 »). */
  counter?: string;
  /** Pastille Recherche (écrans à onglets). */
  onSearch?: () => void;
  searchHref?: string;
  searchOn?: boolean;
  /** Pastille Cloche, avec son compteur ; elle perd son compteur quand on est sur la Boîte. */
  onNotifications?: () => void;
  notificationsHref?: string;
  notificationsOn?: boolean;
  notificationCount?: number;
  /** Avatar à droite : photo du compte, ou logo de la structure active. Il ouvre « Moi ». */
  avatar?: ReactNode;
  onAvatar?: () => void;
  avatarLabel?: string;
  /** Une autre casquette a quelque chose à traiter : pastille moutarde sur l'avatar. */
  avatarDot?: boolean;
  /** Écran de flux : ✕ Fermer. */
  onClose?: () => void;
  closeHref?: string;
  closeLabel?: string;
  /** Déborde de la marge de 16 px de l'écran, sur toute sa largeur. */
  bleed?: boolean;
  className?: string;
};

/**
 * L'en-tête : 64 px de métal brossé bordé d'un filet moutarde. La marque est toujours le premier élément à
 * gauche (même O, même place d'un écran à l'autre) ; la navigation « Fermer » est toujours à droite.
 */
export function AppBar({
  kind,
  title,
  facts,
  counter,
  onSearch,
  searchHref,
  searchOn,
  onNotifications,
  notificationsHref,
  notificationsOn,
  notificationCount,
  avatar,
  onAvatar,
  avatarLabel = "Moi et mes casquettes",
  avatarDot,
  onClose,
  closeHref,
  closeLabel = "Fermer",
  bleed = false,
  className,
}: AppBarProps) {
  const showTabActions = kind !== "flow";
  return (
    <header className={cx("o-appbar", `o-appbar--${kind}`, bleed && "o-appbar--bleed", className)}>
      <Brush />
      {kind === "home" ? <Logo width={128} /> : <Monogram />}
      {kind === "home" ? (
        <span className="o-appbar__spacer" />
      ) : (
        <div className="o-appbar__heading">
          <h1 className={cx("o-appbar__title o-t-title", facts && "has-facts")}>{title}</h1>
          {facts && <div className="o-appbar__facts o-t-label">{facts}</div>}
        </div>
      )}
      {kind === "flow" && counter && (
        <span className="o-appbar__counter o-t-meta">
          <span className="o-appbar__counter-text">{counter}</span>
        </span>
      )}
      {showTabActions && (
        <>
          <AppBarAction icon="search" label="Rechercher" onClick={onSearch} href={searchHref} on={searchOn} />
          <AppBarAction
            icon="bell"
            label="Journal"
            onClick={onNotifications}
            href={notificationsHref}
            on={notificationsOn}
            count={notificationsOn ? undefined : notificationCount}
          />
          {avatar && (
            <AppBarAction icon="profile" label={avatarLabel} onClick={onAvatar} className="o-appbar__avatar">
              {avatar}
              {avatarDot && <i className="o-appbar__dot" />}
            </AppBarAction>
          )}
        </>
      )}
      {kind === "flow" && (
        <Button variant="close" label={closeLabel} onClick={onClose} href={closeHref} className="o-appbar__close" />
      )}
    </header>
  );
}
