// Ouverture instantanée de la fiche d'un événement (lot M3, fluidité ; retour 20 de Damien : « ~3 s de fond gris ») :
// au toucher d'une carte, la carte connue (affiche, titre, date, lieu) est rangée ici et la fiche est demandée à l'API
// sans attendre l'écran. La fiche s'ouvre tout de suite avec la carte, ses squelettes, et reprend la requête déjà
// partie. Mémoire seulement (pas de trousseau).
// Lot M3, tour 2 (vie privée) : la fiche lue est personnalisée (candidatures, consignes de retenu). Chaque aperçu et
// chaque lecture sont rangés sous le compte qui les a faits (`cacheScope()`, le même que les caches du trousseau) et
// ne servent qu'à lui ; tout est vidé à la déconnexion (`clearEventPreviews`, appelé par la session). La casquette n'y
// entre pas : l'API ne la reçoit pas, la réponse ne dépend que du compte. Mémoire bornée : entrées expirées retirées,
// au plus `MAX_PREFETCHES` lectures et `MAX_PREVIEWS` cartes.
import type { EventCard, EventPublic } from "@orasso/shared";

import { api } from "./api";
import { cacheScope } from "./kv";

/** Une requête partie depuis plus longtemps n'est pas reprise (la fiche relance la sienne). */
export const PREFETCH_TTL_MS = 15_000;
/** Une carte plus vieille n'est plus montrée en aperçu. */
export const PREVIEW_TTL_MS = 10 * 60_000;
export const MAX_PREFETCHES = 20;
export const MAX_PREVIEWS = 50;

/** Où était l'affiche touchée, en coordonnées de la fenêtre : la fiche la fait grandir de là jusqu'à son en-tête. */
export type PosterRect = { x: number; y: number; width: number; height: number };

type Preview = { card: EventCard; at: number; rect: PosterRect | null };
const previews = new Map<string, Preview>();
const prefetches = new Map<string, { promise: Promise<EventPublic>; at: number }>();

/** Clé d'une entrée : le compte lié (ou « invité ») et le slug. */
const keyOf = (slug: string) => `${cacheScope() ?? "-"}|${slug}`;

/** Retire les entrées expirées, puis les plus anciennes au-delà du plafond (une `Map` garde l'ordre d'insertion). */
function prune<T extends { at: number }>(map: Map<string, T>, ttl: number, max: number, now: number) {
  for (const [key, value] of map) if (now - value.at > ttl) map.delete(key);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Range la carte touchée (et la place de son affiche) pour l'aperçu de la fiche. */
export function rememberEventCard(card: EventCard, rect: PosterRect | null = null, now = Date.now()) {
  const key = keyOf(card.slug);
  previews.delete(key);
  previews.set(key, { card, at: now, rect });
  prune(previews, PREVIEW_TTL_MS, MAX_PREVIEWS, now);
}

/** La carte connue d'un événement (rangée par ce compte), pour l'ouvrir tout de suite. */
export function eventPreview(slug: string, now = Date.now()): Preview | null {
  const preview = previews.get(keyOf(slug));
  if (!preview || now - preview.at > PREVIEW_TTL_MS) return null;
  return preview;
}

/** La place de l'affiche touchée, lue une seule fois (la transition ne se rejoue pas au retour sur la fiche). */
export function takePosterRect(slug: string): PosterRect | null {
  const key = keyOf(slug);
  const preview = previews.get(key);
  if (!preview?.rect) return null;
  const rect = preview.rect;
  previews.set(key, { ...preview, rect: null });
  return rect;
}

/** Lance la lecture de la fiche dès le toucher. `load` remplaçable (tests). */
export function prefetchEvent(
  slug: string,
  load: (slug: string) => Promise<EventPublic> = (s) => api.eventBySlug(s),
  now = Date.now(),
) {
  prune(prefetches, PREFETCH_TTL_MS, MAX_PREFETCHES, now);
  const key = keyOf(slug);
  if (prefetches.has(key)) return;
  const promise = load(slug);
  // Une erreur ici sera revue par la fiche (qui relance sa propre requête) : pas de rejet non géré.
  promise.catch(() => prefetches.delete(key));
  prefetches.set(key, { promise, at: now });
  prune(prefetches, PREFETCH_TTL_MS, MAX_PREFETCHES, now);
}

/** La lecture déjà partie pour cette fiche, par ce compte (une seule fois), ou `null`. */
export function takePrefetchedEvent(slug: string, now = Date.now()): Promise<EventPublic> | null {
  const key = keyOf(slug);
  const current = prefetches.get(key);
  prefetches.delete(key);
  if (!current || now - current.at > PREFETCH_TTL_MS) return null;
  return current.promise;
}

/** Déconnexion (et tests) : tout oublier. */
export function clearEventPreviews() {
  previews.clear();
  prefetches.clear();
}

/** Tests : tailles courantes. */
export function previewSizes() {
  return { previews: previews.size, prefetches: prefetches.size };
}
