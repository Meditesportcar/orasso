// Le choix d'affichage des publications, retenu par compte dans le navigateur : la clé porte l'identifiant du compte, et toutes
// les clés partent avec la session (déconnexion), pour que l'identifiant d'un compte ne reste pas lisible pour le suivant.
import { PUBLICATIONS_VIEW_KEY } from "@orasso/shared";

type Store = Pick<Storage, "length" | "key" | "removeItem">;

export const viewChoiceKey = (userId: string) => `${PUBLICATIONS_VIEW_KEY}.${userId}`;

/** Efface le choix d'affichage de tous les comptes (déconnexion). */
export function purgeViewChoices(store: Store | null = localStore()): void {
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(`${PUBLICATIONS_VIEW_KEY}.`)) keys.push(k);
    }
    for (const k of keys) store.removeItem(k);
  } catch {
    // Stockage refusé : rien à effacer.
  }
}

function localStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
