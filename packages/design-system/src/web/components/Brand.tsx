import type { HTMLAttributes, ReactNode } from "react";
import loaderDark from "../assets/chargement-fond-sombre.svg";
import loaderLight from "../assets/chargement-fond-clair.svg";
import logoLight from "../assets/logo-fond-clair.svg";
import logoDark from "../assets/logo-fond-sombre.svg";
import monogramLight from "../assets/monogramme-fond-clair.svg";
import monogramDark from "../assets/monogramme-fond-sombre.svg";
import { cx } from "./cx";
import { Icon } from "./Icon";

/** Version du fichier de marque : « dark » = fond sombre (O crème), « light » = fond clair (O noir), « auto » = selon le thème. */
export type BrandTone = "auto" | "dark" | "light";

/** Deux images, CSS affiche la bonne : le rendu serveur n'a pas besoin de connaître le thème. */
function ThemedImage({
  dark,
  light,
  tone,
  alt,
  className,
  width,
  height,
}: {
  dark: string;
  light: string;
  tone: BrandTone;
  alt: string;
  className: string;
  width?: number;
  height?: number;
}) {
  const show = (version: "dark" | "light") => {
    const hidden = tone === "auto" ? false : tone !== version;
    return hidden ? null : (
      <img
        className={cx(className, `o-brand-img o-brand-img--${version}`, tone === "auto" && `o-brand-img--auto`)}
        src={version === "dark" ? dark : light}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
      />
    );
  };
  return (
    <>
      {show("dark")}
      {show("light")}
    </>
  );
}

export type LogoProps = {
  /** Largeur en px : 128 en tête de l'Accueil, 120 en-tête public du site, 110 en tête du menu latéral organisateur. */
  width?: number;
  tone?: BrandTone;
  className?: string;
};

/** Le logotype complet. En dessous de 100 px de large, utiliser Monogram. Jamais déformé ni recoloré. */
export function Logo({ width = 128, tone = "auto", className }: LogoProps) {
  // Rapport du fichier de marque : viewBox 642 × 104.
  const height = Math.round((width * 104) / 642);
  return (
    <ThemedImage
      dark={logoDark}
      light={logoLight}
      tone={tone}
      alt="Orasso"
      className={cx("o-logo", className)}
      width={width}
      height={height}
    />
  );
}

export type MonogramProps = { size?: number; tone?: BrandTone; className?: string; alt?: string };

/**
 * Le monogramme (le O) : 30 px dans un en-tête, avec margin-left −1,5 px pour que son bord gauche soit celui
 * du O du logotype. Jamais l'avatar de quelqu'un d'autre.
 */
export function Monogram({ size = 30, tone = "auto", className, alt = "Orasso" }: MonogramProps) {
  return (
    <ThemedImage
      dark={monogramDark}
      light={monogramLight}
      tone={tone}
      alt={alt}
      className={cx("o-monogram", className)}
      width={size}
      height={size}
    />
  );
}

/** L'indicateur de chargement du kit : la voiture qui se gare (cycle `loader`). 72 px plein écran, 24 px dans un bouton. */
export function Loader({ size = 24, tone = "auto", className }: { size?: number; tone?: BrandTone; className?: string }) {
  return (
    <ThemedImage
      dark={loaderDark}
      light={loaderLight}
      tone={tone}
      alt="Chargement en cours"
      className={cx("o-loader", className)}
      width={size}
      height={size}
    />
  );
}

export type CreditProps = {
  /** `dark-surface` : plaque, photo, affiche inversée (brand-credit) ; `light-surface` : crème, moutarde (brand-credit-light). */
  surface?: "dark-surface" | "light-surface";
  className?: string;
};

/**
 * La signature « ORASSO » : une seule par écran, en bas à droite de l'objet principal (qui doit être
 * `position: relative`). Jamais sur une carte secondaire.
 */
export function Credit({ surface = "dark-surface", className }: CreditProps) {
  return (
    <span className={cx("o-credit o-t-credit", `o-credit--${surface}`, className)} aria-hidden="true">
      Orasso
    </span>
  );
}

export type FloatingMarkProps = {
  /** `mark` : le monogramme à gauche ; `close` : la pastille ✕ à droite. */
  kind: "mark" | "close";
  onClick?: () => void;
  href?: string;
  closeLabel?: string;
  className?: string;
};

/**
 * Pastille flottante de 40 px des écrans à photo sans barre (Événement, Pro) : la marque à 12 px du bord gauche,
 * Fermer à 12 px du bord droit, à 18 px du haut. Le O reste exactement là où il est sur les écrans à barre.
 */
export function FloatingMark({ kind, onClick, href, closeLabel = "Fermer", className }: FloatingMarkProps) {
  const cls = cx("o-floating", `o-floating--${kind}`, className);
  if (kind === "mark") {
    return (
      <span className={cls}>
        <Monogram tone="dark" />
      </span>
    );
  }
  if (href) {
    return (
      <a className={cls} href={href} aria-label={closeLabel}>
        <Icon name="close" size={16} strokeWidth={2.2} />
      </a>
    );
  }
  return (
    <button type="button" className={cls} aria-label={closeLabel} onClick={onClick}>
      <Icon name="close" size={16} strokeWidth={2.2} />
    </button>
  );
}

/** « Propulsé par Orasso » : pied de page du site public seulement (pas dans le back-office). */
export function PoweredBy({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cx("o-powered o-t-label", className)}>{children ?? "Propulsé par Orasso"}</span>;
}

export type BrandMarkProps = HTMLAttributes<HTMLSpanElement>;
