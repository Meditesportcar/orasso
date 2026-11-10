// Identifiants d'idempotence des réponses aux stories, gardés en mémoire du navigateur pour le compte courant (lot R8s) : un
// aller-retour par un profil (la visionneuse est démontée) ne perd pas un texte d'issue incertaine. Jamais écrits sur le disque ;
// rien n'est gardé au rendu serveur. Purgés dès que le compte change ou disparaît (déconnexion, autre compte connecté dans
// n'importe quelle fenêtre : l'annonce de session), sans attendre qu'une visionneuse s'ouvre.
import { createReplyKeys } from "@orasso/shared";

import { listenSession } from "./sessionChannel";

let held: { userId: string; keys: ReturnType<typeof createReplyKeys> } | null = null;

export function replyKeysFor(userId: string): ReturnType<typeof createReplyKeys> {
  if (typeof window === "undefined") return createReplyKeys(() => crypto.randomUUID());
  if (!held || held.userId !== userId) held = { userId, keys: createReplyKeys(() => crypto.randomUUID()) };
  return held.keys;
}

/** Le compte dont les identifiants sont gardés (aucun = `null`). */
export function heldReplyKeysUser(): string | null {
  return held?.userId ?? null;
}

/** Branche la purge sur l'annonce de session : un compte différent (ou aucun) vide le magasin. Rend l'arrêt. */
export function watchReplyKeysSession(listen: typeof listenSession = listenSession): () => void {
  return listen((other) => {
    if (held && held.userId !== other) held = null;
  });
}

if (typeof window !== "undefined") watchReplyKeysSession();
