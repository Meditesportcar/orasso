// FranceMap (web) : SVG inline, mêmes props que la version native (lot 41). La carte est décorative pour le lecteur d'écran
// et ne prend pas le focus clavier : le chemin accessible est la liste des départements (`DepartmentChecklist`).

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
  /**
   * « Ton coin » (lot M6) : la France pleine (`dept-land`), frontières de la couleur de la carte qui la porte (`surface`).
   * Par défaut : le dessin d'origine (repos `map-land-2`, frontières de la couleur du fond).
   */
  land?: boolean;
};

function FranceMapBase({ selected, favorite, onToggle, className, land }: FranceMapProps) {
  const chosen = new Set(selected);
  // Le favori est dessiné en dernier pour que son bord passe par-dessus ses voisins.
  const ordered = [...franceDepartments].sort((a, b) => Number(a.code === favorite) - Number(b.code === favorite));
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: carte décorative, la liste est le chemin accessible
    <svg
      className={cx("o-france", land && "o-france--land", className)}
      viewBox={franceMapViewBox}
      aria-hidden="true"
      focusable="false"
      data-testid="france-map"
    >
      {ordered.map((d) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: tracé décoratif, la liste des départements est le chemin accessible
        <path
          key={d.code}
          d={d.d}
          className={cx("o-france__dept", chosen.has(d.code) && "is-selected", d.code === favorite && "is-favorite")}
          tabIndex={-1}
          data-testid={`dept-${d.code}`}
          onClick={() => onToggle(d.code)}
        />
      ))}
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
