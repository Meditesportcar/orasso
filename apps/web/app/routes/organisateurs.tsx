import { Button, Icon, OLoader, Outlined } from "@orasso/design-system/web";
import { type EventCard, siteLabels as L, type Page, posterStyleLabels, sitePosterWall } from "@orasso/shared";

import { api, originOf } from "../lib/api.server";
import type { Route } from "./+types/organisateurs";

export async function loader({ request }: Route.LoaderArgs) {
  // « Voir un exemple » : la page publique d'une structure qui a déjà un événement à venir.
  const first = await api<Page<EventCard>>(request, "/events?limit=1");
  const slug = first.ok ? first.data.items[0]?.structure.slug : undefined;
  return { origin: originOf(request), exampleHref: slug ? `/o/${slug}` : "/evenements" };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Orasso est l'outil des associations, clubs et circuits : événement créé par étapes, affiche générée, tri des candidatures, liste d'attente automatique, QR d'accès et accueil hors ligne. Gratuit.";
  return [
    { title: "Organisateurs · Orasso" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Organisateurs · Orasso" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/organisateurs` },
    { property: "og:image", content: `${origin}/og-image.png` },
  ];
}

export default function Organisateurs({ loaderData }: Route.ComponentProps) {
  const O = L.organizers;
  return (
    <div className="s-home">
      <section className="w w-hero" aria-labelledby="orga-title">
        <div>
          <span className="o-t-label w-kicker">{O.kicker}</span>
          <Outlined on="ground" as="h1" id="orga-title" className="o-t-poster-xl w-hero__title">
            {O.title}
          </Outlined>
          <p className="w-lead">{O.lead}</p>
          <div className="w-hero__buttons">
            <Button variant="primary" icon="add" href="/app/structure/nouvelle">
              {O.create}
            </Button>
            <Button variant="secondary" icon="eye" href={loaderData.exampleHref}>
              {O.example}
            </Button>
          </div>
        </div>
        <div className="w-orga-vis" aria-hidden="true">
          <div className="w-orga-phone">
            <div className="w-orga-phone__photo">
              <Icon name="vehicle" size={64} />
            </div>
            <div className="w-orga-phone__body">
              <b className="o-t-poster-s">{O.phoneName}</b>
              <span className="o-t-caption">{O.phoneMeta}</span>
              <div className="w-orga-phone__choices o-t-button">
                <span>{O.refuse}</span>
                <span>{O.wait}</span>
                <span className="is-main">{O.retain}</span>
              </div>
            </div>
          </div>
          <div className="w-orga-poster">
            <img src="/styles/neon.png" alt="" width={540} height={675} />
          </div>
        </div>
      </section>

      <section className="w w-sec" aria-labelledby="steps-title">
        <div className="w-sec__head">
          <h2 id="steps-title" className="o-t-poster-l">
            {O.stepsTitle}
          </h2>
        </div>
        <ol className="w-flow" data-testid="orga-steps">
          {O.steps.map((step, i) => (
            <li key={step.title}>
              <i className="o-t-number-narrow">{i + 1}</i>
              <b className="o-t-body-strong">{step.title}</b>
              <p className="o-t-caption">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="w w-sec" aria-labelledby="wall-title">
        <div className="w-sec__head">
          <div>
            <h2 id="wall-title" className="o-t-poster-l">
              {O.wallTitle}
            </h2>
            <p>{O.wallText}</p>
          </div>
        </div>
        <div className="w-wall w-wall--eight" data-testid="poster-wall">
          {sitePosterWall.map((style) => (
            <img
              key={style}
              src={`/styles/${style}.png`}
              alt={posterStyleLabels[style]}
              loading="lazy"
              width={540}
              height={675}
            />
          ))}
        </div>
      </section>

      <div className="w">
        <section className="w-dl" aria-labelledby="orga-final">
          <OLoader size={110} done label={null} />
          <div>
            <h2 id="orga-final" className="o-t-poster-l">
              {O.finalTitle}
            </h2>
            <p>{O.finalText}</p>
          </div>
          <Button variant="secondary" icon="add" href="/app/structure/nouvelle">
            {O.finalCta}
          </Button>
        </section>
      </div>
    </div>
  );
}
