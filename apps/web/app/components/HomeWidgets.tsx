// Blocs de l'Accueil du site (lot 30) : mêmes widgets que l'appli, en grille. Les données viennent de `GET /me/home`
// (chargé côté serveur) ; rien n'appelle une source externe depuis le navigateur. Aucun néon, aucun bouton principal
// ici (le « Prochain accès » porte les siens). Un nom ne se tronque jamais.
import { Button, Chip, Icon } from "@orasso/design-system/web";
import {
  applicationStatusLabels,
  type EventWeather,
  eventFormatLabels,
  type FuelStation,
  type HomeData,
  type HomeFavoriteGarage,
  type HomeNudgeKind,
  type HomeSponsored,
  homeLabels,
  homeNudges,
  homeWidgetTitles,
  type MyApplication,
  type NearbyPlace,
  proActivityLabels,
  weatherTexts,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { Form } from "react-router";

import { apiFetch } from "../lib/api.client";
import { formatDayShort, formatTime } from "../lib/format";
import { UsePosition } from "./UsePosition";
import { Weather } from "./Weather";

export const RADIUS_FORM = "home-radius";

const directionsUrl = (lat: number, lng: number) => `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="hm-block" data-testid={`widget-${id}`} aria-labelledby={`hm-${id}`}>
      <h2 className="o-t-label hm-block__title" id={`hm-${id}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PendingBlock({ items }: { items: MyApplication[] }) {
  return (
    <Block id="pending" title={homeWidgetTitles.pending}>
      {items.length === 0 ? (
        <p className="hm-block__muted">{homeLabels.pendingEmpty}</p>
      ) : (
        items.map((a) => (
          <a key={a.id} className="hm-line" href="/app/acces">
            <span className="o-t-meta hm-line__date">{formatDayShort(a.event.startsAt)}</span>
            <span className="hm-line__body">
              <strong>{a.event.title}</strong>
              <span className="o-t-caption hm-block__muted">
                {applicationStatusLabels[a.status]}
                {a.status === "waitlisted" && a.waitlistRank ? ` · rang ${a.waitlistRank}` : ""}
              </span>
            </span>
          </a>
        ))
      )}
    </Block>
  );
}

/** Autour de moi : curseur de rayon (formulaire GET, envoyé au relâchement), « Utiliser ma position » facultatif. */
export function NearbyBlock({ nearby, onDevice }: { nearby: NonNullable<HomeData["nearby"]>; onDevice: boolean }) {
  return (
    <Block id="nearby" title={homeWidgetTitles.nearby}>
      <Form method="get" id={RADIUS_FORM} className="hm-radius">
        <label className="o-t-meta" htmlFor="home-radius-input">
          {homeLabels.radius(nearby.radiusKm)}
        </label>
        <input
          id="home-radius-input"
          name="rayon"
          type="range"
          min={10}
          max={300}
          step={10}
          defaultValue={nearby.radiusKm}
          aria-label={homeLabels.radiusLabel}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          data-testid="home-radius"
        />
        <noscript>
          <Button type="submit" variant="plate" icon="check">
            {homeLabels.done}
          </Button>
        </noscript>
      </Form>
      {nearby.events.length === 0 ? (
        <p className="hm-block__muted" data-testid="nearby-empty">
          {nearby.source === null ? homeLabels.nearbyNoPlace : homeLabels.nearbyEmpty(nearby.radiusKm)}
        </p>
      ) : (
        nearby.events.map((e) => (
          <a key={e.id} className="hm-line" href={`/e/${e.slug}`} data-testid="nearby-event">
            <span className="o-t-meta hm-line__date">{formatDayShort(e.startsAt)}</span>
            <span className="hm-line__body">
              <strong>{e.title}</strong>
              <span className="o-t-caption hm-block__muted">
                {eventFormatLabels[e.format]} · {formatTime(e.startsAt)}
                {e.city ? ` · ${e.city}` : ""}
                {typeof e.distanceKm === "number" ? ` · ${homeLabels.distance(e.distanceKm)}` : ""}
              </span>
            </span>
          </a>
        ))
      )}
      {onDevice ? (
        <>
          <p className="o-t-caption hm-block__muted">{homeLabels.usingPosition}</p>
          <Button variant="plate" icon="close" href="/app">
            {homeLabels.stopPosition}
          </Button>
        </>
      ) : (
        <UsePosition formId={RADIUS_FORM} />
      )}
    </Block>
  );
}

export function WeatherBlock({ weather }: { weather: HomeData["weather"] }) {
  return (
    <Block id="weather" title={homeWidgetTitles.weather}>
      {weather ? (
        <Weather
          weather={
            {
              provider: weather.provider,
              attribution: weather.attribution,
              fetchedAt: "",
              summary: weather.summary,
              days: [],
            } satisfies EventWeather
          }
          title={weather.kind === "event" ? weather.event.title : weatherTexts.todayTitle}
          compact
        />
      ) : (
        <p className="hm-block__muted">{weatherTexts.unavailable}</p>
      )}
      {weather?.kind === "event" && <p className="o-t-caption">{weather.event.title}</p>}
    </Block>
  );
}

export function AgendaBlock({ items }: { items: MyApplication[] }) {
  return (
    <Block id="agenda" title={homeWidgetTitles.agenda}>
      {items.length === 0 ? (
        <p className="hm-block__muted">{homeLabels.agendaEmpty}</p>
      ) : (
        items.map((a) => (
          <div key={a.id} className="hm-line">
            <span className="o-t-meta hm-line__date">{formatDayShort(a.event.startsAt)}</span>
            <span className="hm-line__body">
              {a.event.title} · {applicationStatusLabels[a.status].toLowerCase()}
            </span>
          </div>
        ))
      )}
    </Block>
  );
}

function trackPro(slug: string, kind: "call" | "route") {
  void apiFetch(`/pros/by-slug/${encodeURIComponent(slug)}/track`, { method: "POST", json: { kind } });
}

export function GarageBlock({ garage }: { garage: HomeFavoriteGarage | null }) {
  return (
    <Block id="favorite_garage" title={homeWidgetTitles.favorite_garage}>
      {garage ? (
        <>
          <a className="hm-line" href={`/p/${garage.slug}`}>
            <span className="hm-line__body">
              <strong className="o-t-poster-m">{garage.name}</strong>
              <span className="o-t-meta hm-block__muted">
                {garage.activities.map((a) => proActivityLabels[a]).join(" · ")}
                {garage.city ? ` · ${garage.city}` : ""}
              </span>
            </span>
          </a>
          <div className="s-row">
            {garage.phone && (
              <Button
                variant="plate"
                icon="phone"
                href={`tel:${garage.phone.replace(/\s+/g, "")}`}
                onClick={() => trackPro(garage.slug, "call")}
              >
                {homeLabels.call}
              </Button>
            )}
            {garage.lat !== null && garage.lng !== null && (
              <Button
                variant="plate"
                icon="place"
                href={directionsUrl(garage.lat, garage.lng)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackPro(garage.slug, "route")}
              >
                {homeLabels.route}
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="hm-block__muted">{homeLabels.garageEmpty}</p>
      )}
    </Block>
  );
}

function FuelPrices({ station }: { station: FuelStation }) {
  const names = homeLabels.fuelNames;
  return (
    <div className="hm-prices">
      {(Object.keys(names) as (keyof typeof names)[]).map((k) => {
        const price = station.prices[k];
        return price === null ? null : (
          <Chip key={k}>
            {`${names[k]} ${price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${homeLabels.priceUnit}`}
          </Chip>
        );
      })}
    </div>
  );
}

export function PlacesBlock({ kind, places }: { kind: "wash" | "fuel"; places: NearbyPlace[] | FuelStation[] }) {
  return (
    <Block id={kind} title={homeWidgetTitles[kind]}>
      {places.length === 0 ? (
        <p className="hm-block__muted">{homeLabels.placesEmpty}</p>
      ) : (
        <>
          {places.map((p) => (
            <div key={`${p.lat},${p.lng},${p.name}`} className="hm-place" data-testid="place-line">
              <div className="hm-place__head">
                <div>
                  <strong>{p.name}</strong>
                  {p.address && <div className="o-t-caption hm-block__muted">{p.address}</div>}
                </div>
                <span className="o-t-meta hm-block__muted">{homeLabels.distance(p.distanceKm)}</span>
              </div>
              {kind === "fuel" && "prices" in p && <FuelPrices station={p} />}
              <div>
                <Button
                  variant="plate"
                  icon="place"
                  href={directionsUrl(p.lat, p.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${homeLabels.route} : ${p.name}`}
                >
                  {homeLabels.route}
                </Button>
              </div>
            </div>
          ))}
          <p className="o-t-caption hm-block__muted">
            {kind === "wash" ? homeLabels.washAttribution : homeLabels.fuelAttribution}
          </p>
        </>
      )}
    </Block>
  );
}

/** Emplacement sponsorisé : même apparence que les autres blocs, mention « Sponsorisé ». Un clic est compté. */
export function SponsoredBlock({ sponsored }: { sponsored: HomeSponsored }) {
  return (
    <Block id="sponsored" title={homeLabels.sponsored}>
      <strong className="o-t-poster-m">{sponsored.title}</strong>
      <p className="hm-block__muted">{sponsored.body}</p>
      <a className="o-t-meta" href={`/p/${sponsored.pro.slug}`}>
        {sponsored.pro.name}
      </a>
      <div>
        <Button
          variant="plate"
          icon="next"
          href={sponsored.linkUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => void apiFetch(`/sponsored/${sponsored.id}/click`, { method: "POST" })}
          data-testid="sponsored-open"
        >
          {homeLabels.moreInfo}
        </Button>
      </div>
    </Block>
  );
}

const NUDGE_ICON = {
  verify_email: "check",
  enable_2fa: "profile",
  add_vehicle: "add",
  create_crew: "crew",
} as const;
const NUDGE_HREF: Record<HomeNudgeKind, string> = {
  verify_email: "/app/moi",
  enable_2fa: "/app/securite",
  add_vehicle: "/app/garage/nouveau",
  create_crew: "/app/crews",
};

/** Une seule incitation à la fois. `primary` : aucun « Prochain accès » ne porte déjà le bouton principal. */
export function NudgeBlock({ kind, primary }: { kind: HomeNudgeKind; primary: boolean }) {
  const copy = homeNudges[kind];
  return (
    <section className="hm-block" data-testid="home-nudge">
      <Icon name={NUDGE_ICON[kind]} size={24} />
      <strong className="o-t-poster-m">{copy.title}</strong>
      <p className="hm-block__muted">{copy.body}</p>
      <div>
        <Button variant={primary ? "primary" : "secondary"} icon={NUDGE_ICON[kind]} href={NUDGE_HREF[kind]}>
          {copy.action}
        </Button>
      </div>
    </section>
  );
}
