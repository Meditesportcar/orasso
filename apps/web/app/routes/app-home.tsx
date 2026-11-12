import { Button, Counters, Plate, PosterCard } from "@orasso/design-system/web";
import {
  defaultHomeWidgets,
  gradeLabels,
  type HomeData,
  homeBlockLabels,
  homeLabels,
  homeWidgetOffered,
  normalizeHomeWidgets,
  visibleHomeWidgets,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { redirect } from "react-router";

import {
  AgendaBlock,
  GarageBlock,
  NearbyBlock,
  NudgeBlock,
  PendingBlock,
  PlacesBlock,
  SponsoredBlock,
  WeatherBlock,
} from "../components/HomeWidgets";
import { FriendsNewsBlock, LiveBlock, LiveLine, MyCrewBlock, MyOutingsBlock } from "../components/home/DashboardBlocks";
import { MemoriesBlock } from "../components/home/Memories";
import { OutingWeatherLine } from "../components/home/OutingWeather";
import { SpotMeetupBlock } from "../components/home/SpotMeetup";
import { WhatsNewBanner } from "../components/WhatsNewBanner";
import { api, requireMe } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import { whatsNewSeen } from "../lib/whatsnew.server";
import type { Route } from "./+types/app-home";
import "../styles/home.css";
import "../styles/home-r7a2.css";
import "../styles/weather-r8m.css";

// Accueil du compte (docs/02, lot 30) : « Prochain accès » en tête, puis les blocs réglables dans l'ordre choisi (mêmes
// que dans l'appli), un emplacement sponsorisé et une seule incitation. Rayon, position et réglages sont dans l'adresse
// de la page ou dans des formulaires : tout marche sans JavaScript, sauf le curseur qui s'envoie au relâchement.
export function meta() {
  return [{ title: "Accueil · Orasso" }, { name: "robots", content: "noindex" }];
}

const num = (v: string | null): number | undefined => {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// Lot R7i, tour 2 : l'Accueil porte le bloc « Au spot » (lieu exact d'un rendez-vous) : ni le navigateur ni un relais ne le gardent.
export const headers: Route.HeadersFunction = ({ parentHeaders }) => {
  const h = new Headers(parentHeaders);
  h.set("cache-control", "private, no-store");
  return h;
};

export async function loader({ request }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const url = new URL(request.url);
  const rayon = num(url.searchParams.get("rayon"));
  const lat = num(url.searchParams.get("lat"));
  const lng = num(url.searchParams.get("lng"));
  const params = new URLSearchParams();
  if (rayon !== undefined && rayon >= 10 && rayon <= 200) params.set("radiusKm", String(Math.round(rayon)));
  if (lat !== undefined && lng !== undefined) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }
  const res = await api<HomeData>(request, `/me/home${params.size ? `?${params}` : ""}`);
  return {
    pseudo: me.profile.pseudo,
    // Bandeau « où sont passées les choses » (lot R7a1) : une seule fois par navigateur (cookie `whatsnew_r7=vu`) ;
    // le visiteur (sans véhicule) n'a pas de garage, sa variante n'en parle pas.
    whatsNew: whatsNewSeen(request)
      ? null
      : me.personas.some((p) => p.kind === "visitor")
        ? ("visitor" as const)
        : ("exhibitor" as const),
    grade: me.profile.grade,
    points: me.profile.pointsSeason,
    device: lat !== undefined && lng !== undefined ? { lat, lng } : null,
    home: res.ok ? res.data : null,
    failed: !res.ok,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  // Coordinateur (23/10) : l'Accueil n'écrit plus le rayon (il se règle dans « Tes préférences ») ; « Utiliser ma
  // position » recharge seulement l'affichage autour de l'appareil (`radius` : ancien nom, accepté).
  if (form.get("intent") === "position" || form.get("intent") === "radius") {
    const params = new URLSearchParams();
    const lat = num(String(form.get("lat") ?? "") || null);
    const lng = num(String(form.get("lng") ?? "") || null);
    if (lat !== undefined && lng !== undefined) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    }
    throw redirect(`/app?${params}`);
  }
  throw redirect("/app");
}

export default function AppHome({ loaderData }: Route.ComponentProps) {
  const { pseudo, grade, points, device, home, failed, whatsNew } = loaderData;
  const widgets = normalizeHomeWidgets(home?.widgets ?? defaultHomeWidgets);
  const live = home?.live ?? null;
  const next = home?.nextAccess ?? null;
  const nudge = home?.nudge ?? null;
  // Lot R8e1 : la météo de l'événement est une ligne de la carte (retenue seulement) ; « Météo de l'événement » masqué : aucune.
  const outingWeather =
    next?.status === "accepted" && visibleHomeWidgets(widgets).includes("event_weather")
      ? (home?.outingsWeather?.[next.event.id] ?? null)
      : null;
  // « En cours » (présence sur place) porte aussi la météo de son événement.
  const liveWeather =
    live && visibleHomeWidgets(widgets).includes("event_weather")
      ? (home?.outingsWeather?.[live.event.id] ?? null)
      : null;
  const nudgeLeads = !next && nudge === "add_vehicle";

  const blocks: Record<string, ReactNode> = home
    ? {
        live: live ? <LiveBlock live={live} /> : null,
        my_outings: home.myOutings ? <MyOutingsBlock data={home.myOutings} /> : null,
        my_crew: home.myCrew ? <MyCrewBlock data={home.myCrew} /> : null,
        friends_news: home.friendsNews ? <FriendsNewsBlock data={home.friendsNews} /> : null,
        spot_meetup: home.spotMeetup ? <SpotMeetupBlock data={home.spotMeetup} /> : null,
        pending: home.pendingStatuses.length ? <PendingBlock items={home.pendingStatuses} /> : null,
        nearby: home.nearby ? <NearbyBlock nearby={home.nearby} device={device} /> : null,
        weather: (
          <WeatherBlock weather={home.weather} myWeather={home.myWeather} pending={home.weatherPending === true} />
        ),
        memories: home.memories ? <MemoriesBlock data={home.memories} /> : null,
        agenda: home.agenda.length ? <AgendaBlock items={home.agenda} /> : null,
        favorite_garage: home.favoriteGarage ? <GarageBlock garage={home.favoriteGarage} /> : null,
        wash: <PlacesBlock kind="wash" places={home.wash} />,
        fuel: <PlacesBlock kind="fuel" places={home.fuel} />,
      }
    : {};

  return (
    <div className="s-stack">
      <div className="hm-head">
        <h1 className="s-title">Salut {pseudo}</h1>
        <Button variant="plate" icon="edit" href="/app/accueil/personnaliser" data-testid="home-personalize">
          {homeBlockLabels.personalizeShort}
        </Button>
      </div>

      {whatsNew ? <WhatsNewBanner variant={whatsNew} /> : null}

      {failed && (
        <p className="s-notice" role="status">
          {homeLabels.loadFailed}
        </p>
      )}

      {live ? (
        <LiveLine live={live} accessHref={live.hasPlace ? "/app/sorties" : null} weather={liveWeather} />
      ) : next ? (
        <PosterCard
          label={`${homeLabels.nextAccess} · ${formatDay(next.event.startsAt)}`}
          title={next.event.title}
          facts={
            <>
              {`${formatTime(next.event.startsAt)}${next.zone ? ` · Zone ${next.zone.code}` : ""}`}
              {outingWeather ? <OutingWeatherLine weather={outingWeather} /> : null}
            </>
          }
          status={next.status === "accepted" ? "retained" : "pending"}
          action={
            next.status === "accepted"
              ? { label: "Voir mon accès", icon: "qr", next: true, href: "/app/sorties" }
              : { label: homeLabels.seeAccess, icon: "wait", next: true, href: "/app/sorties" }
          }
          data-testid="next-access"
        />
      ) : nudgeLeads && nudge ? (
        <NudgeBlock kind={nudge} primary />
      ) : (
        <Plate className="hm-block" data-testid="home-lead">
          <strong className="o-t-poster-m">Trouve ton prochain événement</strong>
          <p className="hm-block__muted">
            Rassemblements, expositions, cars & coffee : candidate avec l'un de tes véhicules.
          </p>
          <div>
            <Button variant="primary" icon="explore" href="/app/explorer">
              {homeLabels.explore}
            </Button>
          </div>
        </Plate>
      )}

      <Counters
        variant="plate"
        items={[
          { value: home?.counts.pending ?? 0, label: "En attente" },
          { value: home?.counts.retained ?? 0, label: "Retenues" },
          { value: points, label: `Pts · ${gradeLabels[grade]}` },
        ]}
      />

      {nudge && !nudgeLeads && <NudgeBlock kind={nudge} primary={false} />}

      {home && (
        <div className="hm-grid">
          {visibleHomeWidgets(widgets)
            // Lot R1 : stations de lavage et de carburant retirées pour l'instant (`NEARBY_STATIONS_ENABLED`).
            .filter((id) => id !== "next_access" && homeWidgetOffered(id))
            .map((id) => (blocks[id] ? <div key={id}>{blocks[id]}</div> : null))}
          {home.sponsored && (
            <div>
              <SponsoredBlock sponsored={home.sponsored} />
            </div>
          )}
        </div>
      )}

      {home && (
        <p>
          <Button variant="plate" icon="edit" href="/app/accueil/personnaliser" data-testid="home-personalize-bottom">
            {homeBlockLabels.personalize}
          </Button>
        </p>
      )}
    </div>
  );
}
