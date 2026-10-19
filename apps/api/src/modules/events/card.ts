// Carte d'événement (liste, carte, recherche) : sortie commune du service des événements et de l'Explorer (lot 29).
import type { EventCard } from "@orasso/shared";

import type { structures } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { EventRow } from "./repo";

export type StructureRow = typeof structures.$inferSelect;

/**
 * Vignette d'un événement (lot 47) : l'affiche générée, sinon l'affiche perso jusqu'à ce que les cartes dessinent le
 * gabarit « Minimal » (lots 44 et 56). Même règle partout où l'API expose `posterUrl`.
 */
export const eventPosterUrl = (e: Pick<EventRow, "posterPostKey" | "posterKey">) =>
  storage.url(e.posterPostKey ?? e.posterKey);

export function card(
  e: EventRow,
  s: Pick<StructureRow, "id" | "slug" | "name" | "logoKey">,
  remaining: number | null,
): EventCard {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    format: e.format,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    city: e.city,
    department: e.department,
    lat: e.lat,
    lng: e.lng,
    posterUrl: eventPosterUrl(e),
    status: e.status,
    outlook: e.outlook,
    structure: { id: s.id, slug: s.slug, name: s.name, logoUrl: storage.url(s.logoKey) },
    capacity: e.capacity,
    remaining,
  };
}
