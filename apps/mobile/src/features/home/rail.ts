// Rail « Autour du … ce mois-ci » et emplacement sponsorisé de l'Accueil (lot C2a) : logique pure, testée.
// L'emplacement sponsorisé n'est montré que s'il vient d'une réponse fraîche de l'API (celle qui l'a compté) : la réponse
// gardée sur le téléphone (cache, hors ligne) ne le porte jamais, sinon un emplacement d'hier, peut-être arrêté, serait
// montré sans être compté (plafond dépassé) et son clic échouerait.
import type { EventCard, HomeData, HomeSponsored } from "@orasso/shared";

const MONTH_MS = 31 * 24 * 3600 * 1000;

/** La réponse à garder dans le cache (sans sponsorisé) et le sponsorisé de cette réponse fraîche, à part. */
export function splitSponsored(fresh: HomeData): { cacheable: HomeData; sponsored: HomeSponsored | null } {
  return { cacheable: { ...fresh, sponsored: null }, sponsored: fresh.sponsored };
}

/** Les affiches du rail (le mois qui vient, sans l'événement de la carte, 8 au plus) et s'il faut montrer le rail. */
export function homeRail(
  events: readonly EventCard[],
  sponsored: HomeSponsored | null,
  heroSlug: string | null | undefined,
  now: Date,
): { events: EventCard[]; sponsored: HomeSponsored | null; visible: boolean } {
  const list = events
    .filter((e) => e.slug !== heroSlug)
    .filter((e) => new Date(e.startsAt).getTime() - now.getTime() < MONTH_MS)
    .slice(0, 8);
  return { events: list, sponsored, visible: list.length > 0 || sponsored !== null };
}
