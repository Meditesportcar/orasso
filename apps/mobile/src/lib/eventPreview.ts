// Ouverture instantanée de la fiche d'un événement (lot M3, fluidité ; retour 20 de Damien : « ~3 s de fond gris ») :
// au toucher d'une carte, la carte connue (affiche, titre, date, lieu) est rangée ici et la fiche est demandée à l'API
// sans attendre l'écran. La fiche s'ouvre tout de suite avec la carte, ses squelettes, et reprend la requête déjà
// partie. Mémoire seulement (pas de trousseau) : rien de privé, et une carte vieille de plus de `PREVIEW_TTL_MS` ne sert
// plus d'aperçu.
import type { EventCard, EventPublic } from "@orasso/shared";

import { api } from "./api";

/** Une requête partie depuis plus longtemps n'est pas reprise (la fiche relance la sienne). */
export const PREFETCH_TTL_MS = 15_000;
/** Une carte plus vieille n'est plus montrée en aperçu. */
export const PREVIEW_TTL_MS = 10 * 60_000;

/** Où était l'affiche touchée, en coordonnées de la fenêtre : la fiche la fait grandir de là jusqu'à son en-tête. */
export type PosterRect = { x: number; y: number; width: number; height: number };

type Preview = { card: EventCard; at: number; rect: PosterRect | null };
const previews = new Map<string, Preview>();
const prefetches = new Map<string, { promise: Promise<EventPublic>; at: number }>();

/** Range la carte touchée (et la place de son affiche) pour l'aperçu de la fiche. */
export function rememberEventCard(card: EventCard, rect: PosterRect | null = null, now = Date.now()) {
  previews.set(card.slug, { card, at: now, rect });
}

/** La carte connue d'un événement, pour l'ouvrir tout de suite. */
export function eventPreview(slug: string, now = Date.now()): Preview | null {
  const preview = previews.get(slug);
  if (!preview || now - preview.at > PREVIEW_TTL_MS) return null;
  return preview;
}

/** La place de l'affiche touchée, lue une seule fois (la transition ne se rejoue pas au retour sur la fiche). */
export function takePosterRect(slug: string): PosterRect | null {
  const preview = previews.get(slug);
  if (!preview?.rect) return null;
  const rect = preview.rect;
  previews.set(slug, { ...preview, rect: null });
  return rect;
}

/** Lance la lecture de la fiche dès le toucher. `load` remplaçable (tests). */
export function prefetchEvent(
  slug: string,
  load: (slug: string) => Promise<EventPublic> = (s) => api.eventBySlug(s),
  now = Date.now(),
) {
  const current = prefetches.get(slug);
  if (current && now - current.at <= PREFETCH_TTL_MS) return;
  const promise = load(slug);
  // Une erreur ici sera revue par la fiche (qui relance sa propre requête) : pas de rejet non géré.
  promise.catch(() => prefetches.delete(slug));
  prefetches.set(slug, { promise, at: now });
}

/** La lecture déjà partie pour cette fiche (une seule fois), ou `null`. */
export function takePrefetchedEvent(slug: string, now = Date.now()): Promise<EventPublic> | null {
  const current = prefetches.get(slug);
  prefetches.delete(slug);
  if (!current || now - current.at > PREFETCH_TTL_MS) return null;
  return current.promise;
}

/** Recette et tests : tout oublier. */
export function clearEventPreviews() {
  previews.clear();
  prefetches.clear();
}
