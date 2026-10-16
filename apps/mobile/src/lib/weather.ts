// Météo (lot 28) : fonctions pures de l'appli (sans réseau ni React Native, donc testables).
import type { EventWeather, WeatherSummary } from "@orasso/shared";

/**
 * Météo du kit « jour J » : la nouvelle réponse de l'API (`null` = pas de météo à afficher), sinon la dernière connue
 * (`undefined` = l'API n'a pas répondu). Les kits enregistrés avant le lot 28 portent l'ancienne forme (sans
 * `summary`) : ignorée.
 */
export function mergeWeather(fetched: EventWeather | null | undefined, previous: unknown): EventWeather | null {
  if (fetched !== undefined) return fetched;
  return previous && typeof previous === "object" && "summary" in previous ? (previous as EventWeather) : null;
}

/** « 14–21 °C », ou « 21 °C » quand le minimum et le maximum se confondent. */
export function temperatureRange(summary: Pick<WeatherSummary, "tempMin" | "tempMax">): string {
  const lo = Math.round(summary.tempMin);
  const hi = Math.round(summary.tempMax);
  return lo === hi ? `${hi} °C` : `${lo}–${hi} °C`;
}
