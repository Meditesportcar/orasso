// Bloc « Ma météo » de l'Accueil du site (lot R8m, maquette R8.8 `meteoBlock`) : mêmes cartes et mêmes mots que l'appli, une carte
// par lieu (deux au plus), « Utiliser ma position » sans position donnée. Toucher une carte ouvre le détail.
import { Button, Icon, weatherIcons } from "@orasso/design-system/web";
import {
  myWeatherTexts as L,
  type MyWeatherPlaces,
  type WeatherCard,
  weatherCards,
  weatherCodeLabels,
} from "@orasso/shared";
import { useEffect } from "react";

import { askMyPosition, refreshMyPosition, useWeatherPosition } from "./position";

/** Le nom du lieu et sa source, tels que la carte les écrit. */
export function cardTitle(card: Pick<WeatherCard, "kind" | "label">): string {
  return L.place(card.label, card.kind === "position" ? "position" : card.kind === "city" ? "city" : "saved");
}

export function WeatherCardLink({ card, index }: { card: WeatherCard; index: number }) {
  const w = card.weather;
  const title = cardTitle(card);
  return (
    <a
      className="wxm-card"
      href={`/app/meteo?card=${index}`}
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
        </>
      ) : (
        <small className="o-t-caption">{L.unavailable}</small>
      )}
    </a>
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
  // Retour sur la page : la météo de la position gardée en mémoire est relue (rien n'est redemandé à l'appareil).
  useEffect(() => {
    void refreshMyPosition();
  }, []);
  const cards = weatherCards(myWeather.places, at);
  return (
    <div className="wxm" data-testid="home-weather">
      {cards.length === 0 ? (
        <Button href="/app/meteo" variant="secondary" icon="place" data-testid="my-weather-choose">
          {L.choosePlace}
        </Button>
      ) : (
        <div className={`wxm-row${cards.length > 1 ? " wxm-row--two" : ""}`}>
          {cards.map((card, i) => (
            <WeatherCardLink key={card.key} card={card} index={i} />
          ))}
        </div>
      )}
      {!at && cards.length > 0 ? <UsePositionButton /> : null}
    </div>
  );
}
