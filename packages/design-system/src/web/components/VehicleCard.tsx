import type { HTMLAttributes, ReactNode } from "react";
import { Chip } from "./Chip";
import { cx } from "./cx";
import { Plate } from "./Plate";

export type VehicleCategory = {
  label: string;
  /** La catégorie recherchée par l'événement : en moutarde. */
  highlighted?: boolean;
};

export type VehicleCardProps = Omit<HTMLAttributes<HTMLElement>, "title" | "children"> & {
  /** Photo pleine (image ou contenu qui remplit son cadre), fondue vers photo-fade sur les 45 % du bas. */
  photo?: ReactNode;
  /** 156 px pour la première carte du garage, 120 px pour les suivantes. */
  first?: boolean;
  /** Tag « Certifié » en haut à gauche. */
  certified?: boolean;
  /** « 6 photos » en haut à droite. */
  photoCount?: number;
  /** Nom du véhicule : jamais tronqué, il passe sur deux lignes. */
  name: string;
  year?: number | string;
  /** Puissance (« 250 ch »). */
  power?: string;
  categories?: readonly VehicleCategory[];
  /** Ligne de faits (« 8 événements · dernier : Nocturne de Canet »). */
  facts?: ReactNode;
};

/**
 * La carte d'un véhicule : une photo pleine, un nom en italique d'affiche, ses catégories. C'est une plaque, dans
 * les deux thèmes. La signature « ORASSO » n'est pas ici mais sur la carte profil au-dessus (une par écran).
 */
export function VehicleCard({
  photo,
  first = false,
  certified = false,
  photoCount,
  name,
  year,
  power,
  categories = [],
  facts,
  className,
  ...rest
}: VehicleCardProps) {
  const specs = [year, power].filter(Boolean).join(" · ");
  return (
    <Plate as="article" className={cx("o-vehicle", className)} {...rest}>
      <div className={cx("o-vehicle__photo", first && "is-first")}>
        {photo}
        {certified && <span className="o-vehicle__tag o-t-credit">Certifié</span>}
        {photoCount ? <span className="o-vehicle__count o-t-credit">{photoCount} photos</span> : null}
      </div>
      <div className="o-vehicle__body">
        <h3 className="o-vehicle__title">
          <span className="o-t-poster-m o-never-truncate">{name}</span>
          {specs && <small className="o-t-meta">{specs}</small>}
        </h3>
        {categories.length > 0 && (
          <div className="o-vehicle__chips">
            {categories.map((category) => (
              <Chip
                key={category.label}
                surface="plate"
                selected={false}
                className={category.highlighted ? "o-chip--lit" : undefined}
              >
                {category.label}
              </Chip>
            ))}
          </div>
        )}
        {facts && <div className="o-vehicle__facts o-t-body">{facts}</div>}
      </div>
    </Plate>
  );
}

export type VehicleThumbProps = Omit<HTMLAttributes<HTMLElement>, "title" | "children"> & {
  /** Photo de 84 px de haut, coupée à --cut. */
  photo?: ReactNode;
  title: string;
  /** Faits (« Dim 25 oct · 12 km · 40 pl. »). */
  meta?: ReactNode;
};

/** La vignette (Autour de moi, Explorer) : 150 px, photo coupée à --cut, titre poster-s, faits meta. */
export function VehicleThumb({ photo, title, meta, className, ...rest }: VehicleThumbProps) {
  return (
    <article className={cx("o-thumb", className)} {...rest}>
      <div className="o-thumb__photo">{photo}</div>
      <div className="o-thumb__title o-t-poster-s o-never-truncate">{title}</div>
      {meta && <div className="o-thumb__meta o-t-meta">{meta}</div>}
    </article>
  );
}
