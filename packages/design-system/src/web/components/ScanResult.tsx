import type { HTMLAttributes } from "react";
import { type ScanResultState, scanLabels } from "../../labels";
import { Credit } from "./Brand";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ScanResultProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  state: ScanResultState;
  /** Véhicule : jamais tronqué, passe sur deux lignes. */
  vehicle?: string;
  pseudo?: string;
  /** La zone attribuée, lue à distance (30 px) ; garde sa taille quel que soit le nom. */
  zone?: string;
  /** Texte de l'état : « il y a quatre secondes » (OK), « 19:12 » l'heure du premier scan (déjà entré). */
  time?: string;
  /** Raison du refus, en une ligne (« QR inconnu ou autre événement »). */
  reason?: string;
  /** Dernier scan : atténué à 88 % jusqu'au suivant. */
  settled?: boolean;
  /** Joue l'entrée : se gare du bas, néon en pic, refus secoué trois fois. Faux hors terrain. */
  animated?: boolean;
};

/**
 * Le résultat d'un scan à l'entrée : une couleur, une forme, un son, un chiffre lisible à trois mètres.
 * OK = moutarde (ta place, tu passes), déjà entré = crème (une information, pas une faute), refusé = rouge.
 * Sans vert. S'affiche en bas de la caméra sans l'interrompre.
 */
export function ScanResult({
  state,
  vehicle,
  pseudo,
  zone,
  time,
  reason,
  settled = false,
  animated = true,
  className,
  ...rest
}: ScanResultProps) {
  const kicker = state === "refused" ? scanLabels.refused : [scanLabels[state], time].filter(Boolean).join(" · ");
  const name = state === "refused" ? reason : [vehicle, pseudo].filter(Boolean).join(" · ");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "o-scan",
        `o-scan--${state}`,
        settled && "is-settled",
        animated && (state === "refused" ? "o-anim-scan-refused" : "o-anim-scan"),
        className,
      )}
      {...rest}
    >
      <span className="o-scan__icon" aria-hidden="true">
        {state === "ok" && <Icon name="check" size={32} strokeWidth={3} />}
        {state === "duplicate" && <span className="o-scan__digit">2</span>}
        {state === "refused" && <Icon name="close" size={32} strokeWidth={3} />}
      </span>
      <div className="o-scan__text">
        <div className="o-scan__kicker o-t-label">{kicker}</div>
        <div className="o-scan__name o-t-title o-never-truncate">{name}</div>
      </div>
      {zone && state !== "refused" && (
        <div className="o-scan__zone o-t-zone">
          <small className="o-t-label">Zone</small>
          {zone}
        </div>
      )}
      {state !== "refused" && <Credit surface="light-surface" />}
    </div>
  );
}
