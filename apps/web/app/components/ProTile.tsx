import { Chip, Icon, Plate } from "@orasso/design-system/web";
import { type ProCard, proActivityLabels } from "@orasso/shared";

/** Une carte de pro dans l'annuaire et les pages de structure. Tout est un lien vers `/p/<slug>`. */
export function ProTile({ pro }: { pro: ProCard }) {
  const where = pro.city
    ? [pro.city, pro.department].filter(Boolean).join(" · ")
    : pro.interventionDepartments.length > 0
      ? `Intervient : ${pro.interventionDepartments.join(", ")}`
      : "";
  return (
    <Plate as="article" className="s-tile" data-testid="pro-tile">
      <a className="s-tile__link" href={`/p/${pro.slug}`}>
        <div className="s-tile__photo s-tile__photo--logo" aria-hidden="true">
          {pro.logoUrl ? <img src={pro.logoUrl} alt="" loading="lazy" /> : <Icon name="vehicle" size={40} />}
        </div>
        <div className="s-tile__body">
          <span className="o-t-label s-tile__format">
            {pro.activities.map((a) => proActivityLabels[a]).join(" · ")}
          </span>
          <h3 className="s-tile__title">{pro.name}</h3>
          {where && <span className="o-t-meta s-tile__muted">{where}</span>}
        </div>
      </a>
      <div className="s-tile__foot">
        {pro.verified && (
          <span className="s-verified o-t-label" data-testid="pro-verified">
            Pro vérifié
          </span>
        )}
        <Chip>{pro.followersCount} abonnés</Chip>
      </div>
    </Plate>
  );
}
