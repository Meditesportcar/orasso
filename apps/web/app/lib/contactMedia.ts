import { type ContactMediaResult, type OpenConversationResult, parseAuthorKey } from "@orasso/shared";

import { apiFetch } from "./api.client";

/** Délai de l'appel « Contacter <média> » : au-delà, la requête est abandonnée et l'écran dit l'erreur (reprise possible). */
export const CONTACT_MEDIA_TIMEOUT_MS = 15_000;

/** L'appel de « Contacter <média> » (lot R9i) : ne lève jamais ; `null` si la clé du média est illisible. */
export function contactMediaCall(
  mediaKey: string,
  // `apiFetch` est un module « client » (absent du rendu serveur et des tests) : injecté pour les tests.
  fetcher: typeof apiFetch = apiFetch,
): (() => Promise<ContactMediaResult>) | null {
  const id = parseAuthorKey(mediaKey)?.id;
  if (!id) return null;
  return async () => {
    const res = await fetcher<OpenConversationResult>(`/media/${encodeURIComponent(id)}/conversation`, {
      method: "POST",
      timeoutMs: CONTACT_MEDIA_TIMEOUT_MS,
    });
    return res.ok ? { ok: true, conversationId: res.data.id } : { ok: false, message: res.error.message };
  };
}

/** L'état de la navigation du routeur (`useNavigation()`) : `pathname` est celui de la page visée (`null` à l'arrêt). */
export type NavigationSnapshot = { state: "idle" | "loading" | "submitting"; pathname: string | null };

/**
 * Une navigation vers une autre adresse vient de commencer : l'ancien écran reste monté pendant que les chargeurs de la page suivante
 * tournent, mais l'opération « Contacter » qu'il a lancée n'a plus lieu d'être (sa réponse ne doit pas remplacer le choix de l'utilisateur).
 */
export function navigationLeavesPage(nav: NavigationSnapshot, currentPath: string): boolean {
  return nav.state !== "idle" && nav.pathname !== null && nav.pathname !== currentPath;
}

/** `navigate` gardé : n'ouvre la conversation que si le routeur est au repos au moment de la réponse (lu à cet instant, pas au rendu). */
export function guardedNavigate(read: () => NavigationSnapshot, navigate: (to: string) => void) {
  return (conversationId: string) => {
    if (read().state !== "idle") return;
    navigate(`/app/messages/${conversationId}`);
  };
}
