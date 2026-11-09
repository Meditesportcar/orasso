// Rail « Autour du … ce mois-ci » et emplacement sponsorisé de l'Accueil (lot C2a) : logique pure, testée.
// L'emplacement sponsorisé n'est montré que s'il vient d'une réponse fraîche de l'API (celle qui l'a compté) : la réponse
// gardée sur le téléphone (cache, hors ligne) ne le porte jamais, sinon un emplacement d'hier, peut-être arrêté, serait
// montré sans être compté (plafond dépassé) et son clic échouerait.
// Le rendez-vous au spot (lot R7i, tour 2) suit la même règle, pour une autre raison : son lieu (nom, coordonnées) n'est
// jamais écrit sur le téléphone. Une copie relue le lendemain, hors réseau, ne montrerait qu'un lieu périmé que les invités
// ne doivent plus avoir ; le bloc « Au spot » ne vient donc que d'une réponse fraîche.
import type { EventCard, HomeData, HomeSponsored, HomeSpotMeetup } from "@orasso/shared";

const MONTH_MS = 31 * 24 * 3600 * 1000;

/**
 * La réponse à garder dans le cache (sans sponsorisé ni rendez-vous au spot) et, à part, ce que la réponse fraîche porte de l'un
 * et de l'autre.
 */
export function splitSponsored(fresh: HomeData): {
  cacheable: HomeData;
  sponsored: HomeSponsored | null;
  spotMeetup: HomeSpotMeetup | null;
} {
  return {
    cacheable: { ...fresh, sponsored: null, spotMeetup: null },
    sponsored: fresh.sponsored,
    spotMeetup: fresh.spotMeetup ?? null,
  };
}

/** Une copie déjà enregistrée (avant ce correctif) peut porter un lieu : on le retire à la lecture. `null` : rien à nettoyer. */
export function scrubSpot(data: HomeData): HomeData | null {
  return data.spotMeetup ? { ...data, spotMeetup: null } : null;
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
