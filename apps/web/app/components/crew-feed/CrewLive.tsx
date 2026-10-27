// La page du crew en direct sur le site (lot R6a, comme l'appli). Une seule connexion par page (`useChannel`, cookie de
// session) au canal `crew:<id>` : les signaux sont regroupés (une relecture par seconde au plus) puis distribués au fil
// et à la fenêtre des commentaires ; la page elle-même (onglets Sorties, Garage, Membres) se relit par son chargeur.
// Une reconnexion relit tout ; sans WebSocket (proxy, réseau d'entreprise), relecture toutes les 20 s, onglet visible.
// Le canal ne porte aucune donnée : chacun relit par les routes de l'API, qui appliquent ses droits.
// Tour 2 : un bloc dont la relecture échoue la rejette ; le besoin reste et repart après un délai croissant, et
// `useCrewLiveStale` le dit au fil (ligne discrète) jusqu'au succès. Après `revoked`, `useChannel` repasse à « non
// connecté » (les relectures de secours reprennent) et rouvre le canal.
import {
  CREW_LIVE_POLL_MS,
  type CrewLiveBatcher,
  type CrewLiveNeeds,
  createCrewLiveBatcher,
  crewChannel,
  parseCrewSignal,
} from "@orasso/shared";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useChannel } from "../../lib/useChannel";

type Listener = (needs: CrewLiveNeeds) => Promise<void> | void;
type Bus = { add: (fn: Listener) => () => void };

const LiveContext = createContext<Bus | null>(null);
const StaleContext = createContext(false);

export function CrewLiveProvider({ crewId, children }: { crewId: string | null; children: ReactNode }) {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const listeners = useRef(new Set<Listener>());
  const bus = useRef<Bus>({
    add: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  }).current;
  const batcher = useRef<CrewLiveBatcher | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    setStale(false);
    if (!crewId) return;
    const b = createCrewLiveBatcher(
      async (needs) => {
        const jobs: (Promise<void> | void)[] = [...listeners.current].map((fn) => fn(needs));
        if (needs.page) jobs.push(revalidate.current());
        await Promise.all(jobs);
      },
      { onStale: setStale },
    );
    batcher.current = b;
    return () => {
      b.dispose();
      if (batcher.current === b) batcher.current = null;
    };
  }, [crewId]);

  const { connected } = useChannel(crewId ? crewChannel(crewId) : null, (message) => {
    if (!crewId) return;
    // Retiré du crew ou crew dissous : la page se relit (elle montre la vitrine ou le crew dissous).
    if (message.type === "revoked" || message.type === "forbidden") {
      void revalidate.current();
      return;
    }
    const signal = parseCrewSignal(message.type, message.payload, crewId);
    if (signal) batcher.current?.push(signal);
  });

  // Abonnement confirmé : le premier relit le fil seul (ce qui a pu arriver entre la lecture et l'abonnement), une
  // reconnexion (ou un canal rouvert après `revoked`) relit tout (des signaux ont pu se perdre).
  const everConnected = useRef(false);
  useEffect(() => {
    if (!connected) return;
    if (everConnected.current) batcher.current?.push("all");
    else if (crewId) batcher.current?.push({ type: "post.created", crewId });
    everConnected.current = true;
  }, [connected, crewId]);

  // Pas de WebSocket : relecture de secours, seulement quand l'onglet est visible.
  useEffect(() => {
    if (!crewId || connected) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") batcher.current?.push("all");
    }, CREW_LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [crewId, connected]);

  return (
    <LiveContext.Provider value={bus}>
      <StaleContext.Provider value={stale}>{children}</StaleContext.Provider>
    </LiveContext.Provider>
  );
}

/** Un bloc de la page reçoit les relectures demandées par les signaux (rien hors d'une page de crew en direct). */
export function useCrewLiveNeeds(listener: Listener, enabled = true) {
  const bus = useContext(LiveContext);
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!bus || !enabled) return;
    return bus.add((needs) => ref.current(needs));
  }, [bus, enabled]);
}

/** Tour 2 : une relecture en direct a échoué et attend son nouvel essai. */
export function useCrewLiveStale(): boolean {
  return useContext(StaleContext);
}
