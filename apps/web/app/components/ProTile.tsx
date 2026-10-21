import { Chip } from "@orasso/design-system/web";
import { type ProCard, proActivityLabels } from "@orasso/shared";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/**
 * Une carte de pro (DA v2, lot 56) dans l'annuaire, les pages de structure et la présentation : le logo sur l'aplat de
 * l'affiche (ou les initiales, jamais un rectangle vide), le nom, les activités, le lieu. Tout est un lien vers
 * `/p/<slug>`.
 */
export function ProTile({ pro, hints = [] }: { pro: ProCard; hints?: string[] }) {
  const where = pro.city
    ? [pro.city, pro.department].filter(Boolean).join(" · ")
    : pro.interventionDepartments.length > 0
      ? `Intervient : ${pro.interventionDepartments.join(", ")}`
      : "";
  return (
    <article className="w-card s-pcard w-card--pro" data-testid="pro-tile">
      <a className="w-card__link" href={`/p/${pro.slug}`}>
        <span className="w-card__poster w-card__poster--logo" aria-hidden="true">
          {pro.logoUrl ? (
            <img className="w-card__logo-img" src={pro.logoUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="w-card__minimal">
              <span className="o-t-poster-l w-card__initials">{initials(pro.name)}</span>
            </span>
          )}
        </span>
        <span className="w-card__body">
          <span className="o-t-label w-card__format">
            {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
          </span>
          <h3 className="w-card__title o-t-poster-s">{pro.name}</h3>
          {where && <span className="w-card__meta o-t-meta">{where}</span>}
        </span>
      </a>
      <div className="w-card__foot">
        {pro.verified && (
          <span className="s-verified o-t-label" data-testid="pro-verified">
            Pro vérifié
          </span>
        )}
        <Chip>{pro.followersCount} abonnés</Chip>
        {hints.map((hint) => (
          <Chip key={hint}>{hint}</Chip>
        ))}
      </div>
    </article>
  );
}
