// Photos de la copie hors ligne du Fil (lot R8c2, tour 2) : quelles photos garder, et le nettoyage. Seule la **première photo**
// d'une publication de la copie (jamais une carte « Sponsorisé » ni un rendez-vous au spot : la copie n'en a pas) est gardée.
import { type FeedCard, type FeedFilter, feedCopyKey, feedFilters } from "@orasso/shared";

import { accountGuard } from "@/lib/kv";
import { deletePhoto, prunePhotos, readCopy, saveCopy } from "@/lib/offlineCopy";

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

/**
 * Que faire d'une réponse du serveur pour une photo : `show` (200), `forget` (401, 403, 404, 410 : l'accès est retiré, la photo
 * gardée est effacée et ne s'affiche plus), `fallback` (autre erreur : `CrewPhotoImage` dit pourquoi, jamais la photo gardée).
 * Seule une absence de réponse (requête rejetée) autorise la photo gardée.
 */
export function photoResponseAction(status: number): "show" | "forget" | "fallback" {
  if (status >= 200 && status < 300) return "show";
  return [401, 403, 404, 410].includes(status) ? "forget" : "fallback";
}

/** Une réponse du serveur reçue par le repli (`CrewPhotoImage`) : un refus (401, 403, 404, 410) efface aussi la photo gardée. */
export async function forgetIfRefused(url: string, status: number, account = accountGuard()): Promise<void> {
  if (photoResponseAction(status) === "forget") await deletePhoto(url, account);
}

/**
 * Une publication supprimée sort des copies gardées sur l'appareil. Le compte est capturé **avant** toute lecture et passé à
 * chaque lecture et écriture : si un autre compte devient courant entre les deux, rien n'est écrit sous lui.
 */
export async function dropFromCopies(id: string, account = accountGuard()): Promise<void> {
  for (const f of feedFilters) {
    const saved = await readCopy<{ filter: FeedFilter; items: FeedCard[] }>(feedCopyKey(f), account);
    const items = saved?.value.items;
    if (saved && Array.isArray(items) && items.some((c) => c.id === id) && account.current()) {
      const left = items.filter((c) => c.id !== id);
      setWantedPhotos(f, left);
      await saveCopy(feedCopyKey(f), { ...saved.value, items: left }, new Date(saved.savedAt), account);
    }
  }
}
