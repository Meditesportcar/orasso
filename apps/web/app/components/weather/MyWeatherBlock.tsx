// Bloc « Ma météo » de l'Accueil du site (lot R8m, maquette R8.8 `meteoBlock`) : mêmes cartes et mêmes mots que l'appli, une carte
// par lieu (deux au plus), « Utiliser ma position » sans position donnée. Toucher une carte ouvre le détail.
import { Button, Icon, weatherIcons } from "@orasso/design-system/web";
import {
  myWeatherTexts as L,
  type MyWeatherPlaces,
  WEATHER_PROVIDER_TIMEOUT_MS,
  type WeatherCard,
  weatherAttributions,
  weatherCards,
  weatherCodeLabels,
  weatherTexts,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { apiFetch } from "../../lib/api.client";
import { askMyPosition, refreshMyPosition, useWeatherPosition } from "./position";

/** Le nom du lieu et sa source, tels que la carte les écrit. */
export function cardTitle(card: Pick<WeatherCard, "kind" | "label">): string {
  return L.place(card.label, card.kind === "position" ? "position" : card.kind === "city" ? "city" : "saved");
}

export function WeatherCardLink({
  card,
  index,
  loading = false,
}: {
  card: WeatherCard;
  index: number;
  loading?: boolean;
}) {
  const w = card.weather;
  const title = cardTitle(card);
  return (
    <Link
      className="wxm-card"
      to={`/app/meteo?card=${index}`}
      aria-label={w ? L.aria(title, weatherCodeLabels[w.now.code], Math.round(w.now.temp)) : `${L.title}, ${title}`}
      data-testid={`my-weather-card-${index}`}
    >
      <span className="o-t-label wxm-card__place">{title}</span>
      {w ? (
        <>
          <span className="wxm-card__temp">
            <Icon name={weatherIcons[w.now.code]} size={26} />
            <b className="o-t-number">{`${Math.round(w.now.temp)}°`}</b>
          </span>
          <small className="o-t-caption">{L.windRain(w.now.windKmh, w.now.precipitationProbability)}</small>
          <small className="o-t-caption" data-testid={`my-weather-card-${index}-source`}>
            {weatherAttributions[w.provider].replace(/^Météo : /, "")}
          </small>
        </>
      ) : (
        <small className="o-t-caption" data-testid={loading ? "weather-pending" : undefined}>
          {loading ? weatherTexts.loading : L.unavailable}
        </small>
      )}
    </Link>
  );
}

export function UsePositionButton({ onDone }: { onDone?: (ok: boolean) => void }) {
  const { busy } = useWeatherPosition();
  return (
    <Button
      type="button"
      variant="secondary"
      icon="target"
      disabled={busy}
      onClick={() => void askMyPosition().then((ok) => onDone?.(ok))}
      data-testid="my-weather-use-position"
    >
      {L.useMyPosition}
    </Button>
  );
}

export function MyWeatherCards({ myWeather }: { myWeather: MyWeatherPlaces }) {
  const { at } = useWeatherPosition();
  // Retour sur la page et retour de l'onglet : la météo de la position gardée en mémoire est relue (au plus toutes les dix
  // minutes ; rien n'est redemandé à l'appareil).
  useEffect(() => {
    void refreshMyPosition();
    const visible = () => {
      if (document.visibilityState === "visible") void refreshMyPosition();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, []);
  // Lot R8r : premier chargement, lieu sans météo en stock mais rafraîchissement lancé : « Météo en cours de chargement » puis
  // une seule relecture des lieux après le délai du fournisseur ; sans résultat, la carte dit « indisponible ».
  const [late, setLate] = useState<MyWeatherPlaces | null>(null);
  const [retryDone, setRetryDone] = useState(false);
  const places = late && myWeather.places.some((p) => !p.weather) ? late : myWeather;
  const waiting = myWeather.pending && !retryDone && !places.places.every((p) => p.weather);
  useEffect(() => {
    if (!waiting) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      void apiFetch<MyWeatherPlaces>("/me/weather/places").then((res) => {
        if (!alive) return;
        if (res.ok) setLate(res.data);
        setRetryDone(true);
      });
    }, WEATHER_PROVIDER_TIMEOUT_MS + 2000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [waiting]);
  const cards = weatherCards(places.places, at);
  const navigate = useNavigate();
  return (
    <div className="wxm" data-testid="home-weather">
      {cards.length === 0 ? (
        <Button
          href="/app/meteo"
          onClick={(e) => {
            e.preventDefault();
            navigate("/app/meteo");
          }}
          variant="secondary"
          icon="place"
          data-testid="my-weather-choose"
        >
          {L.choosePlace}
        </Button>
      ) : (
        <div className={`wxm-row${cards.length > 1 ? " wxm-row--two" : ""}`}>
          {cards.map((card, i) => (
            <WeatherCardLink key={card.key} card={card} index={i} loading={waiting} />
          ))}
        </div>
      )}
      {!at && cards.length > 0 ? <UsePositionButton /> : null}
    </div>
  );
}
