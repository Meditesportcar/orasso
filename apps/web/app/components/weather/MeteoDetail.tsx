// Détail de « Ma météo » sur le site (lot R8m, maquette R8.8 `meteoDetail`) : mêmes blocs et mêmes mots que l'appli. Le ciel et la
// température, le ressenti, « Heure par heure » (six heures), « Vent », « Pluie », « Changer de lieu », « Second lieu » (masqué
// quand il y en a deux), « Retirer ce lieu », l'attribution du fournisseur. La recherche d'une ville et l'enregistrement sont
// des formulaires (tout marche sans JavaScript) ; seule la position demande le navigateur.
import { Button, Icon, weatherIcons } from "@orasso/design-system/web";
import {
  BUSINESS_TIMEZONE,
  type CitySuggestion,
  myWeatherTexts as L,
  type MyWeatherPlaces,
  type PlaceWeather,
  WEATHER_PLACES_MAX,
  type WeatherCard,
  wallTime,
  weatherCards,
  weatherCodeLabels,
  windCompass,
} from "@orasso/shared";
import { Form, useNavigate } from "react-router";

import { cardTitle, UsePositionButton } from "./MyWeatherBlock";
import { forgetMyPosition, useWeatherPosition } from "./position";

const hourOf = (iso: string) => wallTime(new Date(iso), BUSINESS_TIMEZONE).hour;

function Now({ card, weather }: { card: WeatherCard; weather: PlaceWeather }) {
  const now = weather.now;
  return (
    <>
      <div className="wxm-big" data-testid="meteo-now">
        <Icon name={weatherIcons[now.code]} size={40} />
        <b className="o-t-number wxm-big__num">{`${Math.round(now.temp)}°`}</b>
        <span className="wxm-big__text">
          <strong>{weatherCodeLabels[now.code]}</strong>
          <small className="o-t-caption">
            {L.detailLine(now.feelsLike, now.windKmh, now.precipitationProbability)}
          </small>
        </span>
      </div>

      {weather.hours.length > 0 ? (
        <>
          <h2 className="o-t-label">{L.hourByHour}</h2>
          <ul className="wxm-hours" data-testid="meteo-hours">
            {weather.hours.map((h) => (
              <li
                key={h.time}
                className="wxm-hour"
                aria-label={`${L.hourLabel(hourOf(h.time))}, ${weatherCodeLabels[h.code]}, ${Math.round(h.temp)} degrés`}
              >
                <small className="o-t-caption">{L.hourLabel(hourOf(h.time))}</small>
                <Icon name={weatherIcons[h.code]} size={22} />
                <b className="o-t-number">{`${Math.round(h.temp)}°`}</b>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="wxm-same">
        <div data-testid="meteo-wind">
          <Icon name="weatherWind" size={18} />
          <span>
            <b>{L.wind}</b> {L.windDetail(now.windKmh, now.gustKmh)}
          </span>
          {now.windDirection !== undefined ? <i>{windCompass(now.windDirection)}</i> : <i />}
        </div>
        <div data-testid="meteo-rain">
          <Icon name="drop" size={18} />
          <span>
            <b>{L.rain}</b> {L.rainDetail(now.precipitationProbability)}
          </span>
          <i>{L.rainAmount(weather.today.precipitationMm)}</i>
        </div>
      </div>
      <p className="o-t-caption s-muted" data-testid="meteo-attribution">
        {weather.attribution}
      </p>
    </>
  );
}

function PlacePanel({
  mode,
  card,
  cardIndex,
  q,
  cities,
}: {
  mode: "change" | "add";
  card: WeatherCard | null;
  cardIndex: number;
  q: string;
  cities: CitySuggestion[] | null;
}) {
  return (
    <section
      className="wxm-panel"
      aria-label={mode === "change" ? L.changePlace : L.secondPlace}
      data-testid="place-panel"
    >
      <h2 className="o-t-label">{mode === "change" ? L.changePlace : L.secondPlace}</h2>
      <Form method="get" className="wxm-search" role="search">
        <input type="hidden" name="card" value={cardIndex} />
        <input type="hidden" name="lieu" value={mode === "change" ? "changer" : "second"} />
        <label className="o-t-caption" htmlFor="place-search">
          {L.searchPlaceholder}
        </label>
        <input
          id="place-search"
          name="q"
          defaultValue={q}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="words"
          data-testid="place-search"
        />
        <Button type="submit" variant="secondary" icon="search" data-testid="place-search-submit">
          {L.searchPlaceholder}
        </Button>
      </Form>
      {q.trim().length < 2 ? <p className="o-t-caption s-muted">{L.searchHint}</p> : null}
      {cities && cities.length === 0 ? (
        <p className="o-t-caption s-muted" data-testid="place-search-empty">
          {L.searchEmpty}
        </p>
      ) : null}
      {cities && cities.length > 0 ? (
        <ul className="wxm-results">
          {cities.map((city, i) => (
            <li key={`${city.label}-${city.lat}-${city.lng}`}>
              <Form method="post" onSubmit={() => mode === "change" && forgetMyPosition()}>
                <input type="hidden" name="op" value={mode === "change" ? "change" : "add"} />
                <input type="hidden" name="slot" value={card?.slot ?? ""} />
                <input type="hidden" name="label" value={city.label.replace(/ \(\w+\)$/, "")} />
                <input type="hidden" name="lat" value={city.lat} />
                <input type="hidden" name="lng" value={city.lng} />
                <Button type="submit" variant="plate" icon="place" data-testid={`place-result-${i}`}>
                  {city.label}
                </Button>
              </Form>
            </li>
          ))}
        </ul>
      ) : null}
      {mode === "change" ? (
        <div className="wxm-gps">
          <UsePositionButton />
          <p className="o-t-caption s-muted">{L.positionNote}</p>
        </div>
      ) : null}
    </section>
  );
}

export function MeteoDetail({
  places,
  index,
  sheet,
  q,
  cities,
  error,
}: {
  places: MyWeatherPlaces | null;
  index: number;
  sheet: "change" | "add" | null;
  q: string;
  cities: CitySuggestion[] | null;
  error: string | null;
}) {
  const { at } = useWeatherPosition();
  const cards = places ? weatherCards(places.places, at) : [];
  const cardIndex = index >= 0 && index < cards.length ? index : 0;
  const card = cards[cardIndex] ?? null;
  const canAdd = cards.length < WEATHER_PLACES_MAX;
  const here = (lieu: "changer" | "second") => `?card=${cardIndex}&lieu=${lieu}`;
  // Navigation sans rechargement : la position donnée (gardée en mémoire de la page) n'est pas oubliée.
  const navigate = useNavigate();
  const go = (to: string) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    navigate(to);
  };
  return (
    <div className="s-stack" data-testid="meteo-detail">
      {card ? <p className="o-t-caption s-muted">{cardTitle(card)}</p> : null}
      {error ? (
        <p className="s-error" role="alert">
          {error}
        </p>
      ) : null}
      {!places ? <p className="s-error">{L.unavailable}</p> : null}
      {card?.weather ? (
        <Now card={card} weather={card.weather} />
      ) : card ? (
        <p className="s-muted" data-testid="meteo-unavailable">
          {L.unavailable}
        </p>
      ) : places ? (
        <p data-testid="meteo-empty">
          <strong>{L.choosePlace}</strong>
        </p>
      ) : null}

      {places ? (
        <div className="wxm-actions">
          <Button
            href={here("changer")}
            onClick={go(here("changer"))}
            variant="secondary"
            icon="place"
            data-testid="meteo-change"
          >
            {L.changePlace}
          </Button>
          {canAdd && card ? (
            <Button
              href={here("second")}
              onClick={go(here("second"))}
              variant="secondary"
              icon="add"
              data-testid="meteo-second"
            >
              {L.secondPlace}
            </Button>
          ) : null}
        </div>
      ) : null}
      {card?.kind === "saved" && card.slot !== null ? (
        <Form method="post">
          <input type="hidden" name="op" value="remove" />
          <input type="hidden" name="slot" value={card.slot} />
          <Button type="submit" variant="secondary" icon="trash" data-testid="meteo-remove">
            {L.removePlace}
          </Button>
        </Form>
      ) : null}
      {sheet ? <PlacePanel mode={sheet} card={card} cardIndex={cardIndex} q={q} cities={cities} /> : null}
    </div>
  );
}
