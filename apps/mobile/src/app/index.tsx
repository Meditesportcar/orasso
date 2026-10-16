import { Redirect } from "expo-router";
import { useEffect, useState } from "react";

import { kvGet } from "@/lib/kv";
import { usePersona } from "@/lib/persona";
import { homeOf } from "@/lib/personaModel";
import { useSession } from "@/lib/session";

// Point d'entrée : l'écran affiché dépend de la session (le fond reste vide le temps de la lire). Le premier
// lancement (3 écrans) n'est jamais revu : une fois vu, la connexion est l'écran d'accueil du déconnecté.
export default function Index() {
  const { status } = useSession();
  const { ready, persona } = usePersona();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    void kvGet("onboarded").then((v) => setOnboarded(v === "1"));
  }, []);
  if (status === "loading" || onboarded === null || !ready) return null;
  return <Redirect href={status === "in" ? homeOf(persona) : onboarded ? "/auth" : "/welcome"} />;
}
