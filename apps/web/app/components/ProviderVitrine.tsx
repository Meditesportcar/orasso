// Vitrine d'un prestataire (lot 57, parité de l'appli du lot 54, prototype DA v2 `s-vitrine`) : métier, menu avec les
// prix, besoins sur place, zone d'intervention et avis des organisateurs. Montrée au prestataire (« Vue organisateur »)
// et aux organisations (`/prestataires/:id`).
import { Chip, ChipRow, Plate } from "@orasso/design-system/web";
import {
  formatMenuPrice,
  instagramHandle,
  instagramUrl,
  proV2Labels as P,
  type ProviderPublic,
  type ProviderReviewsSummary,
  providerReviewTexts,
  vendorTypeLabels,
  vitrineTexts,
} from "@orasso/shared";

import { formatDay } from "../lib/format";

export function ProviderVitrine({
  provider: p,
  reviews,
}: {
  provider: Pick<
    ProviderPublic,
    | "name"
    | "typeLabel"
    | "trades"
    | "tagline"
    | "teamSize"
    | "menu"
    | "menuRange"
    | "powerNeed"
    | "frontageM"
    | "waterNeed"
    | "radiusKm"
    | "departments"
    | "description"
    | "instagram"
    | "website"
    | "photos"
  >;
  reviews: ProviderReviewsSummary | null;
}) {
  const ig = instagramUrl(p.instagram);
  return (
    <div className="s-stack" data-testid="provider-vitrine">
      <div className="s-stack s-stack--tight">
        <div className="o-t-label s-label">
          {P.tradePlace(p.typeLabel, p.departments.length ? p.departments.join(", ") : null)}
        </div>
        <h2 className="s-title o-never-truncate">{p.name}</h2>
        {p.tagline && <p className="s-lead">{p.tagline}</p>}
        <ChipRow>
          {p.trades.map((t) => (
            <Chip key={t}>{vendorTypeLabels[t]}</Chip>
          ))}
          {p.teamSize ? <Chip>{vitrineTexts.teamSize(p.teamSize)}</Chip> : null}
        </ChipRow>
      </div>
      {p.photos.length > 0 && (
        <ul className="s-photos">
          {p.photos.slice(0, 6).map((ph) => (
            <li key={ph.id}>
              <img src={ph.url} alt="" />
            </li>
          ))}
        </ul>
      )}
      {p.description && <p className="s-prewrap">{p.description}</p>}

      <Plate as="section" className="s-stack s-stack--tight" aria-label={vitrineTexts.menuTitle}>
        <div className="s-row s-row--between">
          <h3 className="s-h2">{vitrineTexts.menuTitle}</h3>
          {p.menuRange && (
            <span className="o-t-caption">{vitrineTexts.menuRange(p.menuRange.min, p.menuRange.max)}</span>
          )}
        </div>
        {p.menu.length === 0 ? (
          <p className="o-t-caption">{P.menuNone}</p>
        ) : (
          <ul className="pv-menu" data-testid="vitrine-menu">
            {p.menu.map((m) => (
              <li key={`${m.label}-${m.priceCents}`}>
                <span className="o-never-truncate">{m.label}</span>
                <span className="o-t-body-strong">{formatMenuPrice(m.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Plate>

      <section className="s-stack s-stack--tight" aria-label={vitrineTexts.needsTitle}>
        <h3 className="s-h2">{vitrineTexts.needsTitle}</h3>
        <ChipRow>
          {p.powerNeed && <Chip>{vitrineTexts.power(p.powerNeed)}</Chip>}
          {p.frontageM ? <Chip>{vitrineTexts.frontage(p.frontageM)}</Chip> : null}
          {p.waterNeed !== null && <Chip>{vitrineTexts.water(p.waterNeed)}</Chip>}
        </ChipRow>
      </section>

      <section className="s-stack s-stack--tight" aria-label={vitrineTexts.zoneTitle}>
        <h3 className="s-h2">{vitrineTexts.zoneTitle}</h3>
        <p>
          {vitrineTexts.radius(p.radiusKm)}
          {p.departments.length ? ` · ${P.zoneDepartments} ${p.departments.join(", ")}` : ""}
        </p>
      </section>

      {(ig || p.website) && (
        <p className="o-t-caption">
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer">
              {instagramHandle(p.instagram)}
            </a>
          )}
          {ig && p.website ? " · " : ""}
          {p.website && (
            <a href={p.website} target="_blank" rel="noreferrer">
              {p.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </p>
      )}

      <section
        className="s-stack s-stack--tight"
        aria-label={providerReviewTexts.sectionTitle}
        data-testid="vitrine-reviews"
      >
        <h3 className="s-h2">{providerReviewTexts.sectionTitle}</h3>
        {!reviews || reviews.count === 0 || reviews.average === null ? (
          <p className="s-muted">{providerReviewTexts.none}</p>
        ) : (
          <>
            <p className="o-t-body-strong">{providerReviewTexts.summary(reviews.average, reviews.count)}</p>
            <ul className="s-stack s-stack--tight s-list-plain">
              {reviews.latest.map((r) => (
                <li key={r.id} className="s-card s-stack s-stack--tight" data-testid="vitrine-review">
                  <div className="s-row s-row--between">
                    <strong className="o-never-truncate">{r.structureName}</strong>
                    <span className="o-t-body-strong">{r.rating}/5</span>
                  </div>
                  <span className="o-t-caption s-muted">
                    {r.eventTitle} · {formatDay(r.eventEndsAt)}
                  </span>
                  {r.comment && <p>« {r.comment} »</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
