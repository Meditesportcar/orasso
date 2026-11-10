// Décompte des places d'une carte d'événement du site (lot R8x, parité avec `seatsOf` de l'appli).
// Complet = plus aucune place (`remaining <= 0`), même quand des journées ont leur propre limite : `capacity` n'est alors
// pas l'effectif, donc « Complet » seul, sans nombre. Non complet : « 58 places exposants sur 60 » (sans capacité
// générale, ou si elle est plus petite que le reste : « 3 places exposants »).
import { type EventCard, explorerV2Labels as L } from "@orasso/shared";

export function seatsOf(event: Pick<EventCard, "capacity" | "remaining">): { full: boolean; text: string } {
  if (event.remaining === null) return { full: false, text: "Sans limite" };
  const left = Math.max(0, event.remaining);
  if (left === 0) return { full: true, text: L.seatsFullShort };
  const text =
    event.capacity !== null && left <= event.capacity ? L.seatsLeft(left, event.capacity) : L.seatsLeftOpen(left);
  return { full: false, text };
}
