import type { HTMLAttributes, ReactNode } from "react";
import type { IconName } from "../../icons";
import { Credit } from "./Brand";
import { Button } from "./Button";
import { cx } from "./cx";

/** Bandeau en coin : Retenue et Sur place (moutarde), Annulé (rouge), Incertain (hachuré) ; En attente : aucun. */
export type PosterStatus = "pending" | "retained" | "onsite" | "cancelled" | "uncertain";

const bandLabels: Record<Exclude<PosterStatus, "pending">, string> = {
  retained: "Retenue",
  onsite: "Sur place",
  cancelled: "Annulé",
  uncertain: "Incertain",
};

export type PosterCardProps = Omit<HTMLAttributes<HTMLElement>, "title" | "children"> & {
  /** Étiquette au-dessus du titre (« Prochain accès · J-2 »). */
  label: ReactNode;
  /** Titre en italique large, deux lignes au plus (saut de ligne avec <br />). */
  title: ReactNode;
  /** Ligne de faits sous le titre (« Sam 17 oct · 19 h · Zone JDM · 21° »). */
  facts?: ReactNode;
  /** La photo, coupée à 10° : une image, ou tout contenu qui remplit son cadre. */
  photo?: ReactNode;
  /** Le bouton « sur affiche » qui chevauche la photo de 14 px. */
  action?: { label: string; icon: IconName; next?: boolean; onClick?: () => void; href?: string };
  status?: PosterStatus;
  /** Se dévoile par la coupe à 10° (`poster`). Faux pour le mode staff et le mode jour J (terrain). */
  reveal?: boolean;
  /** Affiche la signature « ORASSO » : celle de l'écran, donc jamais sur une autre carte du même écran. */
  credit?: boolean;
};

/**
 * La carte affiche : la seule carte claire de l'écran, celle qui porte ce qui est à toi. Une seule par écran,
 * jamais deux empilées, jamais dans une liste qui défile à l'horizontale. En Sable elle s'inverse par les jetons.
 */
export function PosterCard({
  label,
  title,
  facts,
  photo,
  action,
  status = "pending",
  reveal = true,
  credit = true,
  className,
  ...rest
}: PosterCardProps) {
  return (
    <article className={cx("o-poster", reveal && "o-anim-cut", className)} {...rest}>
      {status !== "pending" && (
        <span className={cx("o-poster__band o-t-label", `o-poster__band--${status}`, reveal && "o-anim-stamp")}>
          {bandLabels[status]}
        </span>
      )}
      <div className="o-poster__label o-t-label">{label}</div>
      <h2 className="o-poster__title o-t-poster-xl">{title}</h2>
      {facts && <div className="o-poster__facts o-t-meta">{facts}</div>}
      {photo && <div className="o-poster__photo">{photo}</div>}
      {action && (
        <div className="o-poster__action">
          <Button
            variant="poster"
            icon={action.icon}
            next={action.next}
            onClick={action.onClick}
            href={action.href}
            fullWidth
          >
            {action.label}
          </Button>
        </div>
      )}
      {credit && <Credit surface="light-surface" className="o-poster__credit" />}
    </article>
  );
}
