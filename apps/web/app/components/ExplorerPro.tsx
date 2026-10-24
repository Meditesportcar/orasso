// Une fiche de pro de l'Explorer (lot R2, maquettes R2.4 et R2.5 ; l'appli : `ProCardR2` de `ProsSegment.tsx`) : le même
// gabarit pour tous. Logo ou initiales, métiers, nom en entier (jamais tronqué), ville et distance, la ligne de remise
// toujours là pour un compte connecté (« −8 % avec ton grade Route », « −10 % dès le grade Sport » ou « Pas encore de
// remise Orasso »), l'étoile de mon garage favori. Tout est un lien vers `/p/<slug>`.
import { Icon } from "@orasso/design-system/web";
import {
  explorerLabels,
  gradeLabels,
  explorerV2Labels as L,
  type ProCard,
  proActivityLabels,
  explorerR2Labels as R,
} from "@orasso/shared";

import { isMover } from "../lib/explorerQuery";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || name.slice(0, 2).toUpperCase();

export function ExplorerProTile({ pro, gradeLabel }: { pro: ProCard; gradeLabel: string | null }) {
  const mover = isMover(pro);
  const km = pro.distanceKm;
  const d = pro.discount;
  return (
    <article className="ex-pro" data-testid="pro-tile">
      <a className="ex-pro__link" href={`/p/${pro.slug}`}>
        <span className="ex-pro__logo" aria-hidden="true">
          {pro.logoUrl ? <img src={pro.logoUrl} alt="" loading="lazy" decoding="async" /> : initials(pro.name)}
        </span>
        <div className="ex-pro__main">
          <span className="o-t-label ex-pro__jobs">{pro.activities.map((a) => proActivityLabels[a]).join(" · ")}</span>
          <h3 className="ex-pro__name o-never-truncate">
            {pro.name}
            {pro.verified ? (
              <span
                className="ex-pro__badge"
                role="img"
                aria-label={explorerLabels.verifiedPro}
                data-testid="pro-verified"
              >
                <Icon name="badge" size={17} />
              </span>
            ) : null}
          </h3>
          <span className="ex-pro__where o-t-caption">
            <Icon name={mover ? "vehicle" : "place"} size={14} />
            <span>
              {mover
                ? R.moverZone(pro.interventionDepartments)
                : [pro.city, pro.department].filter(Boolean).join(" · ")}
              {!mover && km !== undefined && km !== null ? <strong> · {L.km(km)}</strong> : null}
            </span>
          </span>
          {gradeLabel !== null ? (
            d ? (
              <span className="ex-pro__disc" data-testid="pro-discount">
                <span className="ex-pro__tag" data-from={d.from ? "true" : undefined}>
                  {R.discountTag(d.percent)}
                </span>
                <span className="o-t-caption">
                  {d.from ? R.discountFrom(gradeLabels[d.from]) : R.discountMine(d.percent, gradeLabel)}
                </span>
              </span>
            ) : (
              <span className="ex-pro__none o-t-caption" data-testid="pro-discount">
                {R.discountNone}
              </span>
            )
          ) : null}
          {pro.favorite ? (
            <span className="ex-pro__fav o-t-label" data-testid="pro-favorite">
              <Icon name="star" size={14} />
              {R.favorite}
            </span>
          ) : null}
        </div>
      </a>
    </article>
  );
}
