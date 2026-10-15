import { type HTMLAttributes, useEffect, useRef, useState } from "react";
import { type BadgeStatus, badgeLabels, rankLabel } from "../../labels";
import { cx } from "./cx";

export type StatusBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  status: BadgeStatus;
  /** Rang dans la liste d'attente (statut `waitlist`) : « Liste d'attente · 4e ». */
  rank?: number;
  /** Posé sur une plaque graphite : la liste d'attente garde le bleu clair du Béton. */
  onPlate?: boolean;
  /** Retourné comme une plaque quand le statut change (`base`). */
  animated?: boolean;
};

/**
 * Le statut d'une candidature ou d'un événement, incliné comme une étiquette d'affiche, reconnaissable sans sa
 * couleur (contour, plein, barré, hachuré). Jamais un « Refusée » rouge, jamais deux badges sur une même carte.
 */
export function StatusBadge({ status, rank, onPlate = false, animated = true, className, ...rest }: StatusBadgeProps) {
  const previous = useRef(status);
  const [flips, setFlips] = useState(0);
  useEffect(() => {
    if (previous.current !== status) {
      previous.current = status;
      setFlips((n) => n + 1);
    }
  }, [status]);

  const label = status === "waitlist" && rank ? `${badgeLabels.waitlist} · ${rankLabel(rank)}` : badgeLabels[status];
  return (
    <span
      key={flips}
      className={cx("o-badge o-t-label", `o-badge--${status}`, onPlate && "o-badge--plate", animated && flips > 0 && "o-anim-flip", className)}
      {...rest}
    >
      <span className="o-badge__text">{label}</span>
    </span>
  );
}
