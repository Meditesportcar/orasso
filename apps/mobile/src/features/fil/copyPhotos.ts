// Photos de la copie hors ligne du Fil (lot R8c2, tour 2) : quelles photos garder, et le nettoyage. Seule la **première photo**
// d'une publication de la copie (jamais une carte « Sponsorisé » ni un rendez-vous au spot : la copie n'en a pas) est gardée.
import { type FeedCard, type FeedFilter, feedCopyKey, feedFilters } from "@orasso/shared";

import { accountGuard } from "@/lib/kv";
import { deletePhoto, prunePhotos, readCopy, saveCopy } from "@/lib/offlineCopy";

/**
 * Adresses voulues par copie (onglet, et acteur : lot R9n, T20) : une photo reçue en ligne n'est gardée que si sa carte est dans
 * une copie. La clé est celle de la copie (`feedCopyKey`).
 */
const wanted = new Map<string, Set<string>>();
/** Les acteurs dont la copie existe sur cet appareil : la personne (`null`) et chacune de ses casquettes de page. */
let actors: (string | null)[] = [null];

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
export function setWantedPhotos(
  filter: FeedFilter,
  cards: readonly FeedCard[],
  prune = true,
  actor: string | null = null,
): void {
  wanted.set(feedCopyKey(filter, actor), new Set(firstPhotoUrls(cards)));
  if (!prune) return;
  // Une copie jamais relue dans cette séance : on ne sait pas encore ce qu'elle garde, aucun nettoyage d'orphelines.
  const keys = actors.flatMap((a) => feedFilters.map((f) => feedCopyKey(f, a)));
  if (!keys.every((key) => wanted.has(key))) {
    void prunePhotos(null);
    return;
  }
  void prunePhotos(new Set(keys.flatMap((key) => [...(wanted.get(key) ?? [])])));
}

export const isWantedPhoto = (url: string): boolean => [...wanted.values()].some((urls) => urls.has(url));

/** Un autre compte (ou d'autres casquettes) : rien n'est voulu ; `known` = les acteurs dont une copie peut exister. */
export const resetWantedPhotos = (known: readonly (string | null)[] = [null]): void => {
  wanted.clear();
  actors = [...known];
};

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
  // Lot R9n : la publication sort des copies de tous les acteurs (la personne et ses casquettes).
  for (const actor of actors) {
    for (const f of feedFilters) {
      const key = feedCopyKey(f, actor);
      const saved = await readCopy<{ filter: FeedFilter; items: FeedCard[] }>(key, account);
      const items = saved?.value.items;
      if (saved && Array.isArray(items) && items.some((c) => c.id === id) && account.current()) {
        const left = items.filter((c) => c.id !== id);
        setWantedPhotos(f, left, true, actor);
        await saveCopy(key, { ...saved.value, items: left }, new Date(saved.savedAt), account);
      }
    }
  }
}
