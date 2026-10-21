import type { ReactNode } from "react";
import type { IconName } from "../../icons";
import { initialsOf } from "../../initials";
import { Logo } from "./Brand";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";

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

/**
 * Pastille de casquette à côté du logotype (`.capchip` de l'artefact) : logo rond de la structure (ou ses initiales)
 * et le nom de la casquette (`role`, « Organisateur ») ; sans `role`, le rond seul.
 */
export type AppBarPersona = { logoUrl: string | null; label: string; role?: string };

export type AppBarProps = {
  /**
   * `tab` (DA v2, lot 38) : le logotype toujours à gauche (128 px, 112 px sous 360 px), la pastille de casquette,
   * puis Recherche et Boîte à droite (✕ Fermer si `onClose`/`closeHref`) ; le titre de la page est un `BigTitle`
   * sous la barre. `flow` : écran de flux (Scan, Jour J, Candidature) : le monogramme, le titre, l'action de
   * contexte éventuelle, puis ✕ Fermer en dernier. `home` et `page` : barres v1, dépréciées (remplacées par
   * `tab` au lot 40, retirées au lot 58).
   */
  kind: "tab" | "flow" | "home" | "page";
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
  /** Barre `tab` : pastille de casquette à côté du logotype. */
  persona?: AppBarPersona;
  /** Barre `tab` : la Boîte, avec son compteur (messages, demandes) ; elle perd son compteur quand on y est. */
  onInbox?: () => void;
  inboxHref?: string;
  inboxOn?: boolean;
  inboxCount?: number;
  /** Écran de flux : ✕ Fermer (et, en barre `tab`, une fermeture facultative). */
  onClose?: () => void;
  closeHref?: string;
  closeLabel?: string;
  /** Déborde de la marge de 16 px de l'écran, sur toute sa largeur. */
  bleed?: boolean;
  className?: string;
};

/**
 * L'en-tête (lot C1 : `.appbar` de l'artefact, 58 px de barre unie bordée d'un filet moutarde ; en flux, la
 * `.flowbar` posée sur le fond). La marque est toujours le premier élément à
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
  persona,
  onInbox,
  inboxHref,
  inboxOn,
  inboxCount,
  onClose,
  closeHref,
  closeLabel = "Fermer",
  bleed = false,
  className,
}: AppBarProps) {
  if (kind === "tab") {
    const hasClose = Boolean(onClose || closeHref);
    return (
      <header className={cx("o-appbar", "o-appbar--tab", bleed && "o-appbar--bleed", className)}>
        <Logo width={118} className="o-appbar__logo" />
        {persona && (
          // Lot C1 : la pastille `.capchip` de l'artefact (logo rond ou initiales sur moutarde, nom de la casquette).
          <span className={cx("o-appbar__persona", !persona.role && "is-round")} title={persona.label}>
            <span className="o-appbar__persona-logo">
              {persona.logoUrl ? (
                <img src={persona.logoUrl} alt={persona.label} />
              ) : (
                <span role="img" aria-label={persona.label}>
                  {initialsOf(persona.label)}
                </span>
              )}
            </span>
            {persona.role ? <span className="o-appbar__persona-role">{persona.role}</span> : null}
          </span>
        )}
        <span className="o-appbar__spacer" />
        <AppBarAction icon="search" label="Rechercher" onClick={onSearch} href={searchHref} on={searchOn} />
        <AppBarAction
          icon="inbox"
          label="Boîte"
          onClick={onInbox}
          href={inboxHref}
          on={inboxOn}
          count={inboxOn ? undefined : inboxCount}
        />
        {hasClose && (
          <Button variant="close" label={closeLabel} onClick={onClose} href={closeHref} className="o-appbar__close" />
        )}
      </header>
    );
  }
  const showTabActions = kind !== "flow";
  return (
    <header className={cx("o-appbar", `o-appbar--${kind}`, bleed && "o-appbar--bleed", className)}>
      {kind === "home" ? <Logo width={118} /> : null}
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
