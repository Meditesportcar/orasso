import type { ReactNode } from "react";
import { cx } from "./cx";

export type AvatarRingState = "followers" | "crew" | "live" | "seen" | null;
export type AvatarRingSize = "sm" | "md" | "lg" | "xl";

export type AvatarRingProps = {
  /** `followers` : anneau d'encre ; `crew` : rouge brique ; `live` : moutarde (le seul néon permis) ; `seen` : fin ; `null` : aucun. */
  ring?: AvatarRingState;
  /** sm 40, md 56, lg 64, xl 88 px. */
  size?: AvatarRingSize;
  /** L'adresse de la photo ; sans elle, l'initiale de `name` sur fond rouge. */
  src?: string | null;
  name: string;
  /** Fourni : l'anneau est un lien (ouvre les stories). */
  href?: string;
  /** Texte alternatif du lien ; sans lien, l'avatar est décoratif. */
  label?: string;
  className?: string;
  /** Remplace la photo (par exemple un logo de structure). */
  children?: ReactNode;
};

/** Anneau d'avatar (lot R7b1, maquette R7 `.r7ring`) : une photo ronde et l'anneau de ce qu'elle a à montrer. Sans texte dans l'anneau. */
export function AvatarRing({ ring = null, size = "lg", src, name, href, label, className, children }: AvatarRingProps) {
  const cls = cx("o-avring", `o-avring--${size}`, ring && `o-avring--${ring}`, className);
  const face = (
    <span className="o-avring__face">
      {children ??
        (src ? (
          <img src={src} alt="" className="o-avring__img" />
        ) : (
          <span className="o-avring__initial o-t-poster">{name.charAt(0).toUpperCase()}</span>
        ))}
    </span>
  );
  if (href) {
    return (
      <a className={cls} href={href} aria-label={label}>
        {face}
      </a>
    );
  }
  if (label) {
    return (
      <span className={cls} role="img" aria-label={label}>
        {face}
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {face}
    </span>
  );
}
