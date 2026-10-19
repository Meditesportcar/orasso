// Anciens chemins d'onglet (lot 40) : `/acces` (devenu Sorties) et `/moi` (devenu l'onglet Profil) restent valables
// pour les liens profonds, les notifications et les écrans qui y renvoient. On ouvre l'onglet de la casquette active
// s'il existe, sinon celui de la casquette de base (on y bascule), en gardant les paramètres (`?avis=…`).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { usePersona } from "@/lib/persona";
import { tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";

export function TabRedirect({ route }: { route: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const { status } = useSession();
  const { ready, persona, base, choose } = usePersona();

  const done = useRef(false);

  useEffect(() => {
    if (!ready || status !== "in" || done.current) return;
    done.current = true;
    const query = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ).toString();
    const suffix = query ? `?${query}` : "";
    const own = tabHref(persona.kind, route);
    if (own) router.replace(`${own}${suffix}` as never);
    else choose(base, `${tabHref(base.kind, route) ?? "/"}${suffix}`);
  }, [ready, status, persona, base, route, params, router, choose]);

  return null;
}
