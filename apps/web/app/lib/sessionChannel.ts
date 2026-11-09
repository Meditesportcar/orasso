import { useEffect } from "react";

// Lot R7f2, tour 5 : le compte courant est annoncé aux autres fenêtres du même navigateur (BroadcastChannel ; repli : événement
// `storage`). Seul l'identifiant du compte (ou `null` : aucun compte) passe dans le canal, rien d'autre. Une visionneuse de
// stories ouverte dans une autre fenêtre visible se masque tout de suite et revérifie son compte.
const NAME = "orasso-session";

type Listener = (userId: string | null) => void;

function channel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
  } catch {
    return null;
  }
}

/** Annonce le compte courant (`null` = déconnecté) aux autres fenêtres. */
export function announceSession(userId: string | null): void {
  const c = channel();
  if (c) {
    c.postMessage({ userId });
    c.close();
    return;
  }
  try {
    // Repli : l'événement `storage` ne part que si la valeur change, d'où le nombre aléatoire (il ne porte aucune donnée).
    localStorage.setItem(NAME, JSON.stringify({ userId, n: Math.random() }));
    // L'événement part quand même chez les autres fenêtres : rien ne reste stocké (tour 6).
    localStorage.removeItem(NAME);
  } catch {
    // Stockage indisponible : les autres contrôles (retour du focus, de l'onglet) restent.
  }
}

/** Écoute les annonces des autres fenêtres ; rend la fonction d'arrêt. */
export function listenSession(listener: Listener): () => void {
  const c = channel();
  const fromMessage = (e: MessageEvent) => {
    const id = (e.data as { userId?: unknown } | null)?.userId;
    listener(typeof id === "string" ? id : null);
  };
  const fromStorage = (e: StorageEvent) => {
    if (e.key !== NAME || !e.newValue) return;
    try {
      const id = (JSON.parse(e.newValue) as { userId?: unknown }).userId;
      listener(typeof id === "string" ? id : null);
    } catch {
      // Valeur illisible : ignorée.
    }
  };
  c?.addEventListener("message", fromMessage);
  window.addEventListener("storage", fromStorage);
  return () => {
    c?.removeEventListener("message", fromMessage);
    c?.close();
    window.removeEventListener("storage", fromStorage);
  };
}

/** À mettre dans chaque mise en page : annonce le compte à chaque chargement de page (connecté ou non). */
export function useAnnounceSession(userId: string | null): void {
  useEffect(() => {
    announceSession(userId);
  }, [userId]);
}
