// Ma publication, juste après l'envoi (lot R7e2, tour 2) : l'API ne met jamais mes propres publications dans
// « Abonnements ». « Publier au Fil » garde la réponse de l'envoi dans l'onglet (sessionStorage) et le Fil la remet en tête
// de la liste affichée (`withMyPublished` : dédoublonnée si la relecture la rend). Les publications d'un autre pseudo
// (autre compte dans le même onglet) ne sont jamais montrées.
import { type FeedCard, type FeedPostView, publishedCard } from "@orasso/shared";

const KEY = "orasso:fil:mes-publications";
const MAX = 5;

type Store = Pick<Storage, "getItem" | "setItem">;

function tabStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readPosts(store: Store | null): FeedPostView[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as FeedPostView[]) : [];
  } catch {
    return [];
  }
}

function writePosts(store: Store | null, posts: FeedPostView[]): void {
  try {
    store?.setItem(KEY, JSON.stringify(posts.slice(0, MAX)));
  } catch {
    // Stockage refusé (navigation privée, quota) : la publication se retrouve à la relecture, rien de plus.
  }
}

/** Garde la publication qui vient de partir (la plus récente d'abord). */
export function rememberPublished(post: FeedPostView, store: Store | null = tabStore()): void {
  writePosts(store, [post, ...readPosts(store).filter((p) => p.id !== post.id)]);
}

/** Mes publications de cette session, en cartes, seulement celles de ce pseudo. */
export function readPublished(pseudo: string, store: Store | null = tabStore()): FeedCard[] {
  return readPosts(store)
    .filter((p) => p.author?.pseudo === pseudo)
    .map(publishedCard);
}

/** Une publication supprimée ne reste pas en tête. */
export function forgetPublished(id: string, store: Store | null = tabStore()): void {
  writePosts(
    store,
    readPosts(store).filter((p) => `feed_post:${p.id}` !== id && p.id !== id),
  );
}
