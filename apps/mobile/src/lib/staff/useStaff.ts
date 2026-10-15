// Accès des écrans du mode staff à la liste locale et à la file (runtime.ts), avec rafraîchissement à chaque
// changement (synchro, lecture, envoi).
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useSession } from "../session";
import type { PendingAction, StaffState } from "./model";
import { actionsOf, getVersion, openEvent, stateOf, subscribe } from "./runtime";

export const useStaffVersion = () => useSyncExternalStore(subscribe, getVersion, getVersion);

export type StaffEventView = {
  userId: string | null;
  /** `undefined` : lecture de la base ; `null` : rien de synchronisé sur ce téléphone pour ce compte. */
  state: StaffState | null | undefined;
  /** Base locale indisponible (ne devrait arriver que sur un navigateur sans isolation). */
  error: string | null;
};

export function useStaffEvent(eventId: string): StaffEventView {
  const { me } = useSession();
  const userId = me?.user.id ?? null;
  useStaffVersion();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    openEvent(eventId, userId)
      .then(() => alive && setLoaded(true))
      .catch(() => {
        if (!alive) return;
        setError("Stockage du téléphone indisponible : le mode staff hors ligne ne peut pas démarrer.");
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [eventId, userId]);

  const state = stateOf(eventId);
  return { userId, state: state ?? (loaded ? null : undefined), error };
}

/** Les actions de ce compte pour un événement (file et réponses du serveur), relues à chaque changement. */
export function useStaffActions(userId: string | null, eventId?: string): PendingAction[] {
  const version = useStaffVersion();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const load = useCallback(async () => {
    if (!userId) return [];
    try {
      return await actionsOf(userId, eventId);
    } catch {
      return [];
    }
  }, [userId, eventId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relance la lecture après chaque changement
  useEffect(() => {
    let alive = true;
    void load().then((list) => alive && setActions(list));
    return () => {
      alive = false;
    };
  }, [load, version]);
  return actions;
}
