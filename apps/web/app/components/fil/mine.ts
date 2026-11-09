// Ma publication, juste après l'envoi (lot R7e2, tour 2) : l'API ne met jamais mes propres publications dans
// « Abonnements ». « Publier au Fil » garde la réponse de l'envoi dans l'onglet (sessionStorage) et le Fil la remet en tête
// de la liste affichée (`withMyPublished` : dédoublonnée si la relecture la rend), 24 h au plus (`pinnedPublished`). Chaque
// publication garde l'identifiant du compte qui l'a envoyée : celles d'un autre compte (même onglet) ne sont jamais montrées,
// et un changement de pseudo n'y change rien.
import { type FeedCard, type FeedPostView, publishedCard } from "@orasso/shared";

const KEY = "orasso:fil:mes-publications";
const MAX = 5;

type Store = Pick<Storage, "getItem" | "setItem">;
type Entry = { userId: string; post: FeedPostView };

function tabStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readPosts(store: Store | null): Entry[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? "[]");
    // Les entrées sans identifiant de compte (ancien format) sont écartées : on ne sait pas à qui elles sont.
    return Array.isArray(parsed)
      ? (parsed as Partial<Entry>[]).filter(
          (e): e is Entry => typeof e?.userId === "string" && typeof e.post?.id === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writePosts(store: Store | null, posts: Entry[]): void {
  try {
    store?.setItem(KEY, JSON.stringify(posts.slice(0, MAX)));
  } catch {
    // Stockage refusé (navigation privée, quota) : la publication se retrouve à la relecture, rien de plus.
  }
}

/** Garde la publication qui vient de partir (la plus récente d'abord). */
export function rememberPublished(userId: string, post: FeedPostView, store: Store | null = tabStore()): void {
  writePosts(store, [{ userId, post }, ...readPosts(store).filter((e) => e.post.id !== post.id)]);
}

/** Mes publications de cette session, en cartes, seulement celles de ce compte (par identifiant, jamais par pseudo). */
export function readPublished(userId: string, store: Store | null = tabStore()): FeedCard[] {
  return readPosts(store)
    .filter((e) => e.userId === userId)
    .map((e) => publishedCard(e.post));
}

/** Une publication supprimée ne reste pas en tête. */
export function forgetPublished(id: string, store: Store | null = tabStore()): void {
  writePosts(
    store,
    readPosts(store).filter((e) => `feed_post:${e.post.id}` !== id && e.post.id !== id),
  );
}
