import { Button, Icon, LiveO, OLoader, Outlined, StampDrop } from "@orasso/design-system/web";
import { departments, type EventCard, siteLabels as L, type Page, proPitchDiscounts } from "@orasso/shared";

import { EventTile, PosterFace } from "../components/EventTile";
import { Qr } from "../components/Qr";
import { api, getMe, originOf } from "../lib/api.server";
import { nowMs } from "../lib/clock";
import { nearOutcome } from "../lib/events-filter";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const asked = url.searchParams.get("departement");
  const me = await getMe(request);
  // « Autour de » : le département choisi, sinon le premier département du secteur du compte connecté.
  const raw = asked ?? me?.profile.departments[0] ?? "";
  const department = (departments as readonly string[]).includes(raw) ? raw : "";
  const near = department ? await api<Page<EventCard>>(request, `/events?limit=6&department=${department}`) : null;
  const outcome = nearOutcome(near && { ok: near.ok, count: near.ok ? near.data.items.length : 0 });
  const all = !near?.ok || near.data.items.length === 0 ? await api<Page<EventCard>>(request, "/events?limit=6") : null;
  const items = (near?.ok && near.data.items.length > 0 ? near.data.items : all?.ok ? all.data.items : []).slice(0, 6);
  return {
    department,
    nearFound: outcome === "found",
    // Résultat vide (avis « aucun événement dans le … ») ≠ appel en erreur (aucun avis : on ne sait pas).
    nearEmpty: outcome === "empty",
    items,
    appHref: "/appli",
    origin: originOf(request),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const origin = loaderData?.origin ?? "";
  const description =
    "Orasso relie les organisateurs d'événements automobiles et les passionnés : trouve un rassemblement près de chez toi, candidate avec ton véhicule, entre avec ton QR.";
  return [
    { title: "Orasso · Événements automobiles, de l'inscription à l'entrée" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Orasso" },
    { property: "og:title", content: "Orasso · Événements automobiles" },
    { property: "og:description", content: description },
    { property: "og:url", content: `${origin}/` },
    { property: "og:image", content: `${origin}/og-image.png` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

const DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" });
const SHORT = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/** « Samedi » dans la semaine qui vient, sinon « 1er nov. » (comme le bandeau du prototype). */
function tickerDay(iso: string): string {
  const at = new Date(iso);
  const days = (at.getTime() - nowMs()) / 86_400_000;
  if (days < 7) {
    const name = DAY.format(at);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return SHORT.format(at).replace(/^1 /, "1er ");
}

function tickerState(event: EventCard): string {
  if (event.remaining === null) return "ouvert";
  return event.remaining > 0 ? `${event.remaining} places` : "liste d'attente";
}

/** Bandeau moutarde des prochaines dates : défile (le jeu est copié pour la boucle), fixe en mouvement réduit. */
function Ticker({ items }: { items: EventCard[] }) {
  const group = (hidden: boolean) => (
    <span className="w-ticker__group" aria-hidden={hidden || undefined}>
      {items.map((event) => (
        <a
          key={event.id}
          className="w-ticker__item o-t-meta"
          href={`/e/${event.slug}`}
          tabIndex={hidden ? -1 : undefined}
        >
          <b>{tickerDay(event.startsAt)}</b>
          {event.title} · {tickerState(event)}
        </a>
      ))}
    </span>
  );
  return (
    <div className="w-ticker" data-testid="home-ticker">
      <div className="w-ticker__track">
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}

const ORGANIZER_WALL = ["neon", "jdm", "ticket"] as const;
const GRADE_PITCH = [
  { label: "Route", value: proPitchDiscounts.route, top: false },
  { label: "Sport", value: proPitchDiscounts.sport, top: true },
  { label: "Circuit", value: proPitchDiscounts.circuit, top: false },
  { label: "Légende", value: proPitchDiscounts.legende, top: false },
] as const;

/** Boutiques : liens vers `/appli` (lot 36), qui dit si l'appli est déjà publiée. */
function Stores({ href }: { href: string }) {
  return (
    <div className="w-stores">
      {[L.home.googlePlay, L.home.appStore].map((name) => (
        <a key={name} className="w-store o-t-button" href={href}>
          <Icon name="export" size={16} />
          {name}
        </a>
      ))}
    </div>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { department, items, nearFound, nearEmpty, appHref } = loaderData;
  const city = department && nearFound ? (items[0]?.city ?? null) : null;
  const fan = items.slice(0, 3);
  return (
    <div className="s-home">
      {items.length > 0 && <Ticker items={items} />}

      <section className="w w-hero" aria-labelledby="home-title">
        <div>
          <span className="o-t-label w-kicker">{L.home.kicker}</span>
          <Outlined on="ground" as="h1" id="home-title" className="o-t-poster-xl w-hero__title">
            {L.home.title}
          </Outlined>
          <p className="w-lead">{L.home.lead}</p>
          <div className="w-hero__buttons">
            <Button variant="primary" icon="explore" href="/evenements">
              {L.home.find}
            </Button>
            <Button variant="secondary" icon="add" href="/organisateurs">
              {L.home.organize}
            </Button>
          </div>
          <Stores href={appHref} />
        </div>
        <div className="w-fan">
          {fan.map((event) => (
            <a key={event.id} className="w-fan__card" href={`/e/${event.slug}`} aria-label={event.title}>
              <PosterFace event={event} />
            </a>
          ))}
          {/* Artefact (s-web-home) : liveO(170, tandem, k .9) en boucle, fumée et traces en canvas. */}
          <LiveO className="w-fan__o" size={170} mode="tandem" scale={0.9} />
        </div>
      </section>

      <section className="w w-sec" aria-labelledby="next-title">
        <div className="w-sec__head">
          <div>
            <span className="o-t-label w-kicker">{city ? L.home.around(city) : L.home.everywhere}</span>
            <h2 id="next-title" className="o-t-poster-l">
              {L.home.weekendAndAfter}
            </h2>
          </div>
          <a className="w-sec__more o-t-button" href="/evenements">
            {L.home.allEvents}
            <Icon name="next" size={16} />
          </a>
        </div>
        {department && nearEmpty && items.length > 0 && (
          <p className="s-notice" data-testid="home-none-near">
            {L.home.noneNear(department)}
          </p>
        )}
        {items.length === 0 ? (
          <p className="s-notice">{L.home.noEvents}</p>
        ) : (
          <div className="w-cards" data-testid="home-events">
            {items.slice(0, 4).map((event) => (
              <EventTile key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      <div className="w">
        <section className="w-stripe" aria-labelledby="band-driver">
          <div>
            <h2 id="band-driver" className="o-t-poster-l w-stripe__title">
              {L.home.driver.title}
              <span>{L.home.driver.accent}</span>
            </h2>
            <p>{L.home.driver.text}</p>
            <ul>
              {L.home.driver.points.map((point) => (
                <li key={point} className="o-t-body-strong">
                  <Icon name="check" size={20} />
                  {point}
                </li>
              ))}
            </ul>
            <Button variant="secondary" icon="vehicle" href="/inscription">
              {L.home.driver.cta}
            </Button>
          </div>
          <div className="w-stripe__vis" aria-hidden="true">
            <div className="w-phone">
              <div className="w-phone__card">
                <span className="o-t-label">{L.home.driver.zone}</span>
                <span className="o-t-number">JDM</span>
                <Qr payload="https://orasso.fr" label="" />
              </div>
            </div>
            <div className="w-passport">
              <span className="o-t-label">{L.home.driver.passport}</span>
              <div className="w-passport__stamps">
                <StampDrop ink="var(--stamp-ink-66)" shape="round" seed={3} size={110} />
                <StampDrop ink="var(--stamp-ink-default)" shape="square" seed={7} size={110} />
              </div>
            </div>
          </div>
        </section>

        <section className="w-stripe w-stripe--rev" aria-labelledby="band-orga">
          <div>
            <h2 id="band-orga" className="o-t-poster-l w-stripe__title">
              {L.home.organizer.title}
              <span>{L.home.organizer.accent}</span>
            </h2>
            <p>{L.home.organizer.text}</p>
            <Button variant="secondary" icon="next" href="/organisateurs">
              {L.home.organizer.cta}
            </Button>
          </div>
          <div className="w-stripe__vis">
            <div className="w-wall">
              {ORGANIZER_WALL.map((style) => (
                <img key={style} src={`/styles/${style}.png`} alt="" loading="lazy" width={540} height={675} />
              ))}
            </div>
          </div>
        </section>

        <section className="w-stripe" aria-labelledby="band-pro">
          <div>
            <h2 id="band-pro" className="o-t-poster-l w-stripe__title">
              {L.home.pro.title}
              <span>{L.home.pro.accent}</span>
            </h2>
            <p>{L.home.pro.text}</p>
            <Button variant="secondary" icon="next" href="/professionnels">
              {L.home.pro.cta}
            </Button>
          </div>
          <div className="w-stripe__vis">
            <div className="w-discounts">
              {GRADE_PITCH.map((grade) => (
                <div key={grade.label} className={grade.top ? "is-top" : undefined}>
                  <span className="o-t-label">{grade.label}</span>
                  <b className="o-t-number-narrow">{grade.value} %</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="w">
        <section className="w-dl" aria-labelledby="app-title">
          <OLoader size={110} done label={null} />
          <div>
            <h2 id="app-title" className="o-t-poster-l">
              {L.home.app.title}
            </h2>
            <p>{L.home.app.text}</p>
          </div>
          <Stores href={appHref} />
        </section>
      </div>
    </div>
  );
}
