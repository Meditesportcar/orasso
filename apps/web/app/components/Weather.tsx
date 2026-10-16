// Météo d'un événement (lot 28) : icône du kit, températures, pluie, vent et attribution du fournisseur. Les données
// viennent de l'API (cache en base) ; rien n'est demandé à un fournisseur depuis le navigateur.
import { Icon, weatherIcons } from "@orasso/design-system/web";
import { type DailyForecast, type EventWeather, weatherCodeLabels, weatherTexts } from "@orasso/shared";

export const temperatureRange = (d: Pick<DailyForecast, "tempMin" | "tempMax">) => {
  const lo = Math.round(d.tempMin);
  const hi = Math.round(d.tempMax);
  return lo === hi ? `${hi} °C` : `${lo}–${hi} °C`;
};

function details(d: DailyForecast): string {
  const rain =
    d.precipitationProbability !== null
      ? `${weatherTexts.rain} ${Math.round(d.precipitationProbability)} %`
      : d.precipitationMm >= 0.5
        ? `${weatherTexts.rain} ${d.precipitationMm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm`
        : null;
  return [rain, `${weatherTexts.wind} ${Math.round(d.windMaxKmh)} km/h`].filter(Boolean).join(" · ");
}

const dayName = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** Le bloc de la page événement et de la carte d'accès. `days` : les jours de l'événement s'il dure plus d'un jour. */
export function Weather({
  weather,
  title = weatherTexts.upcomingTitle,
  compact = false,
}: {
  weather: EventWeather;
  title?: string;
  compact?: boolean;
}) {
  const s = weather.summary;
  const label = weatherCodeLabels[s.code];
  return (
    <div className={`wx${compact ? " wx--compact" : ""}`} data-testid="weather" data-code={s.code}>
      {!compact && <div className="s-label o-t-label">{title}</div>}
      <div className="wx__main">
        <Icon name={weatherIcons[s.code]} size={compact ? 32 : 44} title={label} />
        <div>
          <div className="o-t-number wx__temp" data-testid="weather-temp">
            {temperatureRange(s)}
          </div>
          <div className="wx__label">{label}</div>
        </div>
      </div>
      <div className="o-t-caption s-muted" data-testid="weather-details">
        {details(s)}
      </div>
      {!compact && weather.days.length > 1 && (
        <ul className="wx__days">
          {weather.days.map((d) => (
            <li key={d.date}>
              <span className="o-t-label">{dayName(d.date)}</span>
              <Icon name={weatherIcons[d.code]} size={22} title={weatherCodeLabels[d.code]} />
              <span className="o-t-caption">{temperatureRange(d)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="o-t-caption s-muted" data-testid="weather-attribution">
        {weather.attribution}
      </div>
    </div>
  );
}
