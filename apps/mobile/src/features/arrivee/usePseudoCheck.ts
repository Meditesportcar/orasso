// Le pseudo est vérifié pendant la saisie : format, puis disponibilité auprès de l'API (lot 41, repris de l'ancien
// formulaire d'inscription).
import { pseudoSchema } from "@orasso/shared";
import { useEffect, useState } from "react";

import { authApi } from "@/lib/api";

export type PseudoState = "idle" | "checking" | "free" | "taken" | "invalid";

export function usePseudoCheck(pseudo: string): PseudoState {
  const [state, setState] = useState<PseudoState>("idle");
  useEffect(() => {
    if (pseudo.length === 0) {
      setState("idle");
      return;
    }
    if (!pseudoSchema.safeParse(pseudo).success) {
      setState("invalid");
      return;
    }
    setState("checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      authApi
        .pseudoAvailable(pseudo)
        .then((r) => !cancelled && setState(r.available ? "free" : "taken"))
        .catch(() => !cancelled && setState("idle"));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pseudo]);
  return state;
}

export const pseudoRule = "3 à 24 caractères : lettres, chiffres, « _ » ou « . ».";
