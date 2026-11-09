import type { HomeMyOutings } from "@orasso/shared";

/**
 * Le bloc tel qu'il est MAINTENANT (heure de l'appareil) : une place dont l'événement ou la journée est fini disparaît (une
 * réponse gardée ne montre pas une sortie terminée), et « En cours » se recalcule. `null` s'il ne reste rien.
 */
export function outingsAt(data: HomeMyOutings, now: Date): HomeMyOutings | null {
  const t = now.getTime();
  const items = data.items
    .filter((o) => new Date(o.endsAt).getTime() > t)
    .map((o) => ({ ...o, ongoing: new Date(o.startsAt).getTime() <= t }));
  if (!items.length) return null;
  return { items, total: Math.max(items.length, data.total - (data.items.length - items.length)) };
}
