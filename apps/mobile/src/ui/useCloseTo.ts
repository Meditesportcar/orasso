// Lot M7, tour 2 (relecture Codex) : le ✕ d'une page masquée d'un groupe d'onglets (Publier, bannissements, notes,
// modèles). Les groupes Pro et Organisateur gardent le retour par défaut des onglets (le premier onglet) : `back()`
// ramenait au Scanner ou aux Événements. Le ✕ revient donc à l'écran qui a ouvert la page, donné par `?retour=` (un
// écran de la pile, retrouvé par `dismissTo`), sinon à l'onglet qui la range.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { appReturn } from "@/lib/closeTo";

export function useCloseTo(tab: string): () => void {
  const router = useRouter();
  const { retour } = useLocalSearchParams<{ retour?: string }>();
  return useCallback(() => {
    const back = appReturn(retour);
    if (back) router.dismissTo(back as never);
    else router.navigate(tab as never);
  }, [router, retour, tab]);
}
