import { Button, Icon, type IconName, Outlined } from "@orasso/design-system/web";
import {
  gradeLabels,
  grades,
  siteLabels as L,
  type Page,
  type ProActivity,
  type ProCard,
  type ProPublic,
  proActivities,
  proActivityLabels,
  proPitchDiscounts,
} from "@orasso/shared";

import { api, getMe, originOf } from "../lib/api.server";
import { proPitchCard } from "../lib/pro-pitch";
import type { Route } from "./+types/professionnels";

export async function loader({ request }: Route.LoaderArgs) {
  const me = await getMe(request);
  const proHref = me?.pro
    ? `/pro/${me.pro.slug}`
    : me
      ? "/app/pro/nouvelle"
      : `/inscription?retour=${encodeURIComponent("/app/pro/nouvelle")}`;
  // « La fiche en vrai » : un pro publié de l'annuaire (le premier), avec ses remises et ses photos.
  const list = await api<Page<ProCard>>(request, "/pros?limit=1");
  const slug = list.ok ? list.data.items[0]?.slug : undefined;
  const sample = slug ? await api<ProPublic>(request, `/pros/by-slug/${encodeURIComponent(slug)}`) : null;
  return {
    origin: originOf(request),
    proHref,
    hasPro: Boolean(me?.pro),
    sample: sample?.ok ? sample.data : null,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Garages, préparateurs, detailing, covering, pièces : sois visible auprès des passionnés d'Orasso et offre une remise à tes clients selon leur grade. Gratuit jusqu'au 21 juin 2027.";
  return [
    { title: "Professionnels · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Professionnels · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/professionnels` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

/** Icônes des activités (mêmes choix que l'appli, `proActivityIcons`). */
const ACTIVITY_ICONS: Record<ProActivity, IconName> = {
  garage: "vehicle",
  preparation: "up",
  detailing: "wash",
  covering: "gallery",
  parts: "shop",
  tyres: "explore",
  bodywork: "incident",
  tint: "weatherClear",
  upholstery: "cards",
  audio: "live",
  inspection: "check",
  other: "add",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export default function Professionnels({ loaderData }: Route.ComponentProps) {
  const P = L.pros;
  const { sample } = loaderData;
  const card = proPitchCard(sample);
  return (
    <div className="s-home">
      <section className="w w-hero" aria-labelledby="pro-title">
        <div>
          <span className="o-t-label w-kicker">{P.kicker}</span>
          <Outlined on="ground" as="h1" id="pro-title" className="o-t-poster-xl w-hero__title">
            {P.title}
          </Outlined>
          <p className="w-lead">{P.lead}</p>
          <div className="w-hero__buttons">
            <Button variant="primary" icon="briefcase" href={loaderData.proHref} data-testid="pro-cta">
              {loaderData.hasPro ? "Mon espace pro" : P.create}
            </Button>
            <Button variant="secondary" icon="eye" href={sample ? `/p/${sample.slug}` : "/pros"}>
              {P.example}
            </Button>
          </div>
        </div>
        <div className="w-pro-vis" data-testid="pro-sample">
          <div className="w-pro-card" aria-hidden="true">
            {sample?.photos[0] ? (
              <img className="w-pro-card__photo" src={sample.photos[0].url} alt="" />
            ) : (
              <span className="w-pro-card__photo w-card__minimal">
                <Icon name="briefcase" size={56} />
              </span>
            )}
            <div className="w-pro-card__body">
              <div className="w-pro-card__head">
                <span className="w-pro-card__logo">
                  {sample?.logoUrl ? <img src={sample.logoUrl} alt="" /> : initials(sample?.name ?? "Orasso")}
                </span>
                <div>
                  <b className="o-t-poster-s w-pro-card__name">{sample?.name ?? "Atelier Têt Detailing"}</b>
                  {card.fictional ? (
                    <span className="s-verified o-t-label" data-testid="pro-sample-fictional">
                      {P.fictional}
                    </span>
                  ) : (
                    card.badge && <span className="s-verified o-t-label">{P.validated}</span>
                  )}
                </div>
              </div>
              {card.discounts.length > 0 ? (
                <div className="w-discounts">
                  {card.discounts.map(({ grade: g, percent }) => (
                    <div key={g} className={g === "sport" ? "is-top" : undefined}>
                      <span className="o-t-label">{gradeLabels[g]}</span>
                      <b className="o-t-number-narrow">{percent} %</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="o-t-meta" data-testid="pro-sample-nodiscount">
                  {P.noDiscount}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="w w-sec" aria-labelledby="act-title">
        <div className="w-sec__head">
          <h2 id="act-title" className="o-t-poster-l">
            {P.activitiesTitle}
          </h2>
        </div>
        <div className="w-activities">
          {proActivities.slice(0, 6).map((a) => (
            <div key={a} className="o-t-body-strong">
              <Icon name={ACTIVITY_ICONS[a]} size={28} />
              {proActivityLabels[a]}
            </div>
          ))}
        </div>
      </section>

      <section className="w w-sec" aria-labelledby="disc-title">
        <div className="w-sec__head">
          <div>
            <h2 id="disc-title" className="o-t-poster-l">
              {P.discountsTitle}
            </h2>
            <p>{P.discountsText}</p>
          </div>
        </div>
        <div className="w-discounts w-discounts--five" data-testid="pro-discounts">
          {grades.map((g) => (
            <div key={g} className={g === "sport" ? "is-top" : undefined}>
              <span className="o-t-label">{gradeLabels[g]}</span>
              <b className="o-t-number-narrow">{proPitchDiscounts[g]} %</b>
            </div>
          ))}
        </div>
      </section>

      <section className="w w-sec" aria-labelledby="found-title">
        <div className="w-found" data-testid="pro-founders">
          <div>
            <span className="o-t-label">{P.foundersKicker}</span>
            <h2 id="found-title" className="o-t-poster-m">
              {P.foundersTitle}
            </h2>
            <p>{P.foundersText}</p>
          </div>
          <Button variant="poster" icon="grade" href={loaderData.proHref}>
            {P.foundersCta}
          </Button>
        </div>
      </section>
    </div>
  );
}
