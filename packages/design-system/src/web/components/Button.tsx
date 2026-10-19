import type { HTMLAttributes, ReactNode } from "react";
import type { IconName } from "../../icons";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { OLoader } from "./Olive";

type DomProps = Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  /** Fourni : le bouton est rendu en lien <a>. */
  href?: string;
  target?: string;
  rel?: string;
  name?: string;
  value?: string;
  form?: string;
};

type Common = DomProps & {
  children?: ReactNode;
  className?: string;
  /** Raccourci clavier du site : affiché dans une touche devant l'icône. */
  shortcut?: string;
  /** Travail en cours : l'indicateur du kit (24 px) remplace l'icône et le néon s'éteint. */
  loading?: boolean;
  /** La flèche « suivant » à droite : libellé qui ouvre un mode plein écran. */
  next?: boolean;
  /** `column` : icône au-dessus du libellé (rangée de trois du tri et du staff). */
  layout?: "row" | "column";
  fullWidth?: boolean;
};

/** Tout bouton porte une icône à gauche de son libellé : `icon` est obligatoire (sauf la pastille ✕, qui est une icône). */
export type ButtonProps =
  | (Common & { variant?: "primary" | "secondary" | "poster" | "alert"; icon: IconName })
  /** Fond graphite (plaque), contour poster à 50 % ; `tone` : pointillé pour Refuser, bleu pour Attente. */
  | (Common & { variant: "plate"; icon: IconName; tone?: "default" | "dashed" | "wait" })
  /** Secours du staff : 72 px (Plaque, Express, Sans scan) ou 56 px (Liste, Incident, Discussion). */
  | (Common & { variant: "rescue"; icon: IconName; height?: 56 | 72; dashed?: boolean })
  /** La pastille ✕ de 34 px, seule façon de quitter un écran de flux. `label` : nom accessible obligatoire. */
  | (Common & { variant: "close"; label: string; onPhoto?: boolean; icon?: IconName });

type Loose = Common & {
  variant?: string;
  icon?: IconName;
  tone?: string;
  height?: number;
  dashed?: boolean;
  onPhoto?: boolean;
  label?: string;
};

// Icône : 20 px sur le principal, 18 px ailleurs, 22 px au-dessus du libellé et sur les gros boutons du staff.
function iconSize(variant: string, layout: string): number {
  if (variant === "close") return 16;
  if (layout === "column" || variant === "rescue") return 22;
  return variant === "primary" ? 20 : 18;
}

/**
 * Le bouton Orasso : droit, en capitales larges, une icône à gauche (toujours). Un seul bouton principal par écran.
 * Rend un <a> quand `href` est fourni.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    icon,
    tone,
    height,
    dashed,
    onPhoto,
    label,
    children,
    className,
    shortcut,
    loading,
    next,
    layout = "row",
    fullWidth,
    href,
    type = "button",
    disabled,
    ...dom
  } = props as Loose;

  const cls = cx(
    "o-button",
    variant !== "close" && "o-t-button",
    `o-button--${variant}`,
    tone === "wait" && "o-button--wait",
    (dashed || tone === "dashed") && "o-button--dashed",
    height === 72 && "o-button--tall",
    onPhoto && "o-button--on-photo",
    layout === "column" && "o-button--column",
    fullWidth && "o-button--full",
    loading && "is-loading",
    className,
  );

  const content =
    variant === "close" ? (
      <Icon name={icon ?? "close"} size={iconSize(variant, layout)} strokeWidth={2.2} />
    ) : (
      <>
        {shortcut && <kbd className="o-button__key">{shortcut}</kbd>}
        {loading ? (
          <OLoader
            size={24}
            tone={variant === "primary" ? "light" : "dark"}
            label={null}
            className="o-button__loader"
          />
        ) : (
          icon && <Icon name={icon} size={iconSize(variant, layout)} />
        )}
        <span className="o-button__label">{children}</span>
        {next && <Icon name="next" size={18} />}
      </>
    );

  const ariaLabel = variant === "close" ? label : undefined;

  if (href !== undefined) {
    return (
      <a
        className={cls}
        href={disabled || loading ? undefined : href}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        aria-disabled={disabled || undefined}
        {...dom}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      {...dom}
    >
      {content}
    </button>
  );
}
