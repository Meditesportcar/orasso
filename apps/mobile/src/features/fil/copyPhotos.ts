// Photos de la copie hors ligne du Fil (lot R8c2, tour 2) : quelles photos garder, et le nettoyage. Seule la **première photo**
// d'une publication de la copie (jamais une carte « Sponsorisé » ni un rendez-vous au spot : la copie n'en a pas) est gardée.
import { type FeedCard, type FeedFilter, feedFilters } from "@orasso/shared";

import { prunePhotos } from "@/lib/offlineCopy";

/** Adresses voulues par onglet : une photo reçue en ligne n'est gardée que si sa carte est dans une copie. */
const wanted = new Map<FeedFilter, Set<string>>();

/** La première photo de chaque publication des cartes de la copie. */
export function firstPhotoUrls(cards: readonly FeedCard[]): string[] {
  const out: string[] = [];
  for (const c of cards) {
    if (c.kind !== "feed_post") continue;
    const url = c.payload.post.photos[0]?.url;
    if (url) out.push(url);
  }
  return out;
}

/** La copie de cet onglet vient d'être écrite (ou relue) : ses photos sont voulues ; les autres sont nettoyées. */
export function setWantedPhotos(filter: FeedFilter, cards: readonly FeedCard[], prune = true): void {
  wanted.set(filter, new Set(firstPhotoUrls(cards)));
  if (!prune) return;
  // Un onglet jamais relu dans cette séance : on ne sait pas encore ce qu'il garde, aucun nettoyage d'orphelines.
  if (!feedFilters.every((f) => wanted.has(f))) {
    void prunePhotos(null);
    return;
  }
  void prunePhotos(new Set(feedFilters.flatMap((f) => [...(wanted.get(f) ?? [])])));
}

export const isWantedPhoto = (url: string): boolean => feedFilters.some((f) => wanted.get(f)?.has(url));

/** Un autre compte : rien n'est voulu. */
export const resetWantedPhotos = (): void => wanted.clear();
