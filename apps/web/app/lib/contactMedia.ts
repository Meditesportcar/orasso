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
