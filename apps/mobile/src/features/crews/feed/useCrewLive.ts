// La page du crew en direct (lot R6a) : un écran s'abonne au canal `crew:<id>` tant qu'il est monté (connexion partagée
// de `lib/realtime.ts`). Les signaux sont regroupés (une relecture par seconde au plus) ; la reconnexion (réseau, retour
// de l'arrière-plan) relit tout ce qui est ouvert. Le canal ne porte aucune donnée : l'écran relit par les routes.
import {
  type CrewLiveBatcher,
  type CrewLiveNeeds,
  createCrewLiveBatcher,
  crewChannel,
  parseCrewSignal,
} from "@orasso/shared";
import { useEffect, useRef } from "react";

import { useChannel } from "@/lib/realtime";

export function useCrewLive(
  crewId: string | null,
  run: (needs: CrewLiveNeeds) => Promise<void> | void,
  opts: {
    /** Droit perdu (retiré du crew, crew dissous) : l'écran relit ce qu'il montre. */
    onRevoked?: () => void;
    /** Relire aussi au premier abonnement (ce qui a pu changer entre la lecture de l'écran et l'abonnement). */
    refreshOnFirstSubscribe?: boolean;
  } = {},
) {
  const runRef = useRef(run);
  runRef.current = run;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const batcher = useRef<CrewLiveBatcher | null>(null);
  const subscribedOnce = useRef(false);
  useEffect(() => {
    if (!crewId) return;
    subscribedOnce.current = false;
    const b = createCrewLiveBatcher((needs) => runRef.current(needs));
    batcher.current = b;
    return () => {
      b.dispose();
      if (batcher.current === b) batcher.current = null;
    };
  }, [crewId]);
  useChannel(
    crewId ? crewChannel(crewId) : null,
    (event) => {
      if (!crewId) return;
      const signal = parseCrewSignal(event.type, event.payload, crewId);
      if (signal) batcher.current?.push(signal);
    },
    () => {
      const first = !subscribedOnce.current;
      subscribedOnce.current = true;
      if (!first || optsRef.current.refreshOnFirstSubscribe) batcher.current?.push("all");
    },
    () => optsRef.current.onRevoked?.(),
  );
}
