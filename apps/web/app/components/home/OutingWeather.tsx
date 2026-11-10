import { Icon, weatherIcons } from "@orasso/design-system/web";
import { type OutingWeather, outingWeatherLine } from "@orasso/shared";

// Lot R8e1 (maquette R8.8 `.r8wx`) : la météo de l'événement est une ligne de la carte « Prochaine sortie », séparée du reste
// par un trait en pointillés, avec le bandeau de l'événement « Incertain » dessous. Mêmes mots que l'appli (`rules/outingWeather.ts`).
export function OutingWeatherLine({ weather }: { weather: OutingWeather }) {
  const line = outingWeatherLine(weather, new Date());
  return (
    <div className="hm-owx">
      <section className="hm-owx__line" aria-label={line.aria} data-testid="home-outing-weather">
        <Icon name={weatherIcons[weather.summary.code]} size={26} />
        <span className="hm-owx__text">
          <b>
            {line.lead}
            <span className="hm-owx__temp">{line.temp}</span>
            {line.tail}
          </b>
          <small data-testid="home-outing-weather-sub">{line.sub}</small>
        </span>
      </section>
      {line.banner ? (
        <p className="hm-owx__banner" data-testid="home-outing-weather-banner">
          <Icon name="info" size={14} />
          <span>{line.banner}</span>
        </p>
      ) : null}
    </div>
  );
}
