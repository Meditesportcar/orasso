// Décompte des places d'une carte d'événement (lot R8r : la règle du site passe ici, l'appli et le site la partagent).
// Complet = plus aucune place (`remaining <= 0`), même quand des journées ont leur propre limite : `capacity` n'est alors
// pas l'effectif, donc « Complet » seul, sans nombre. Non complet : « 58 places exposants sur 60 » (sans capacité
// générale, ou si elle est plus petite que le reste : « 3 places exposants »). Sans limite (`remaining` nul) : pas de jauge.
import { explorerV2Labels as L } from "../labels/explorer.fr";

export type EventSeats = {
  /** Plus aucune place : la carte porte la puce « Liste d'attente ». */
  full: boolean;
  text: string;
  /** Part prise (0 → 1) pour la jauge ; `null` quand l'effectif n'est pas fiable (sans limite, capacité générale absente). */
  taken: number | null;
};

export function seatsOf(event: { capacity: number | null; remaining: number | null }): EventSeats {
  if (event.remaining === null) return { full: false, text: L.seatsFree, taken: null };
  const left = Math.max(0, event.remaining);
  // Complet : la jauge est pleine, même si la capacité générale n'est pas l'effectif (journées limitées).
  if (left === 0) return { full: true, text: L.seatsFullShort, taken: 1 };
  const reliable = event.capacity !== null && event.capacity > 0 && left <= event.capacity;
  return {
    full: false,
    text: reliable ? L.seatsLeft(left, event.capacity as number) : L.seatsLeftOpen(left),
    taken: reliable ? Math.min(1, Math.max(0, ((event.capacity as number) - left) / (event.capacity as number))) : null,
  };
}
