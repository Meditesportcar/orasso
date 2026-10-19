// FranceMap (web) : SVG inline, mêmes props que la version native (lot 41). Les tracés sont des boutons (clavier :
// Entrée ou Espace). Données et licence : departments.ts.

import { memo } from "react";
import { cx } from "../web/components/cx";
import { franceDepartments, franceMapCredit, franceMapLicenseUrl, franceMapViewBox } from "./departments";

export type FranceMapProps = {
  /** Codes choisis, dans l'ordre du choix. */
  selected: readonly string[];
  /** Code du favori (le premier choisi), bordé d'encre. */
  favorite?: string | null;
  onToggle: (code: string) => void;
  className?: string;
  /** Nom lu par les lecteurs d'écran. */
  label?: string;
};

function FranceMapBase({ selected, favorite, onToggle, className, label = "Carte des départements" }: FranceMapProps) {
  const chosen = new Set(selected);
  // Le favori est dessiné en dernier pour que son bord passe par-dessus ses voisins.
  const ordered = [...franceDepartments].sort((a, b) => Number(a.code === favorite) - Number(b.code === favorite));
  return (
    // biome-ignore lint/a11y/useSemanticElements: un fieldset ne s'applique pas à un svg ; groupe de boutons
    <svg
      className={cx("o-france", className)}
      viewBox={franceMapViewBox}
      role="group"
      aria-label={label}
      data-testid="france-map"
    >
      {ordered.map((d) => {
        const on = chosen.has(d.code);
        return (
          // biome-ignore lint/a11y/useSemanticElements: un tracé SVG ne peut pas être un button
          <path
            key={d.code}
            d={d.d}
            className={cx("o-france__dept", on && "is-selected", d.code === favorite && "is-favorite")}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${d.code} ${d.name}`}
            data-testid={`dept-${d.code}`}
            onClick={() => onToggle(d.code)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(d.code);
              }
            }}
          />
        );
      })}
    </svg>
  );
}

export const FranceMap = memo(FranceMapBase);

/** Crédit de la carte (CC BY 4.0, H7) : à poser sous toute carte de France, avec le lien vers la licence. */
export function FranceMapCredit({ className }: { className?: string }) {
  const [before, licence] = franceMapCredit.split(", ");
  return (
    <p className={cx("o-france__credit o-t-credit", className)} data-testid="france-credit">
      {before},{" "}
      <a href={franceMapLicenseUrl} target="_blank" rel="noreferrer">
        {licence}
      </a>
    </p>
  );
}
