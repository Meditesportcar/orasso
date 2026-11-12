// « Ouvert depuis une carte » (lot R8c2, tour 5) : toute navigation qui part d'une carte du Fil (fiche, profil, publication,
// commentaires…) note `open` pour cette carte avant de naviguer ; un simple défilement n'en note jamais. Le Fil pose l'identifiant
// de la carte dans un contexte ; hors du Fil (profil, fiche) il n'y en a pas et rien n'est noté. Jamais pour « Sponsorisé »
// (`noteSeen` refuse son identifiant).
import { useRouter } from "expo-router";
import { createContext, useContext, useMemo } from "react";

import { noteSeen } from "./seenTracker";

export const CardIdContext = createContext<string | null>(null);

/** Note `open` pour la carte courante du Fil (sans effet ailleurs). */
export function useNoteOpen(): () => void {
  const id = useContext(CardIdContext);
  return useMemo(() => () => (id ? noteSeen(id, "open") : undefined), [id]);
}

/** Comme `useRouter`, mais `push` note d'abord `open` pour la carte courante. */
export function useCardRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const note = useNoteOpen();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        note();
        router.push(...args);
      },
    }),
    [router, note],
  );
}
