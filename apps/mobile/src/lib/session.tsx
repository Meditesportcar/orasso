// Session de l'utilisateur : jeton Better Auth dans le trousseau sécurisé, profil (`/api/me`) gardé pour l'affichage
// hors ligne, secret du QR de compte reçu à la connexion.
import type { Me } from "@orasso/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { clearAccountQrSecret, saveAccountQrSecret } from "./accountQrStore";
import { api, authApi } from "./endpoints";
import { ApiRequestError, setSessionToken } from "./http";
import { clearKits } from "./kits";
import { kvDel, kvGet, kvGetJson, kvSet, kvSetJson } from "./kv";
import { purgeAllStaff } from "./staff/runtime";

type Status = "loading" | "out" | "in";

type SessionValue = {
  status: Status;
  me: Me | null;
  /** Les données viennent du cache : l'API n'a pas répondu. */
  offline: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, pseudo: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Recharge `/api/me` (compteurs, grade, points). */
  refreshMe: () => Promise<Me | null>;
};

const SessionContext = createContext<SessionValue | null>(null);

const TOKEN_KEY = "session-token";
const ME_KEY = "me";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const started = useRef(false);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    try {
      const fresh = await api.me();
      setMe(fresh);
      setOffline(false);
      void kvSetJson(ME_KEY, fresh);
      return fresh;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        await clearSession();
        setStatus("out");
        setMe(null);
        return null;
      }
      // Pas de réseau : on garde le dernier profil connu.
      const cached = await kvGetJson<Me>(ME_KEY);
      if (cached) {
        setMe(cached);
        setOffline(true);
      }
      return cached;
    }
  }, []);

  // Au lancement : jeton enregistré → profil ; sinon déconnecté.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const token = await kvGet(TOKEN_KEY);
      if (!token) {
        setStatus("out");
        return;
      }
      setSessionToken(token);
      const loaded = await loadMe();
      setStatus(loaded ? "in" : "out");
    })();
  }, [loadMe]);

  const open = useCallback(
    async (token: string) => {
      setSessionToken(token);
      await kvSet(TOKEN_KEY, token);
      const loaded = await loadMe();
      // Le secret du QR de compte arrive à la connexion : il fonctionnera ensuite hors ligne.
      try {
        await saveAccountQrSecret(await api.accountQrSecret());
      } catch {
        // Repris à l'ouverture du QR de compte.
      }
      setStatus(loaded ? "in" : "out");
    },
    [loadMe],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      me,
      offline,
      signIn: async (email, password) => open(await authApi.signIn(email, password)),
      signUp: async (email, password, pseudo) => open(await authApi.signUp(email, password, pseudo)),
      signOut: async () => {
        try {
          await authApi.signOut();
        } catch {
          // Hors ligne : la session locale est effacée quand même.
        }
        await clearSession();
        setMe(null);
        setStatus("out");
      },
      refreshMe: loadMe,
    }),
    [status, me, offline, open, loadMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Efface tout ce qui appartient au compte sur cet appareil (jeton, profil, QR de compte, kits jour J, listes du mode
 * staff avec les coordonnées du super staff). Seules les lectures du staff pas encore envoyées restent, pour ce compte.
 */
async function clearSession() {
  setSessionToken(null);
  await Promise.all([
    kvDel(TOKEN_KEY),
    kvDel(ME_KEY),
    clearAccountQrSecret(),
    clearKits(),
    kvDel("announced"),
    kvDel("staff-events"),
    purgeAllStaff(),
  ]);
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans un <SessionProvider>.");
  return value;
}
