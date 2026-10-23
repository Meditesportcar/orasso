// Session de l'utilisateur : jeton Better Auth dans le trousseau sécurisé, profil (`/api/me`) gardé pour l'affichage
// hors ligne, secret du QR de compte reçu à la connexion.
import type { Me } from "@orasso/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { clearAccountQrSecret, saveAccountQrSecret } from "./accountQrStore";
import { api, authApi } from "./api";
import { ApiRequestError, setSessionToken } from "./http";
import "./eventDraftStore"; // enregistre le nettoyage des fichiers de brouillon à chaque purge de compte
import { resetAnnouncements } from "@/ui/Announce";
import { clearEventPreviews } from "./eventPreview";
import { clearKits } from "./kits";
import { bindCacheScope, kvDel, kvGet, kvGetJson, kvSet, kvSetJson, purgeCaches } from "./kv";
import { leavePush, registerThisDevice, setPushAccount, watchPendingPush } from "./push";
import { realtime } from "./realtime";
import { purgeAllStaff } from "./staff/runtime";

type Status = "loading" | "out" | "in";

type SessionValue = {
  status: Status;
  me: Me | null;
  /** Les données viennent du cache : l'API n'a pas répondu. */
  offline: boolean;
  /** `"two_factor"` : le compte a la double authentification, il faut le code (`verifyTwoFactor`). */
  signIn: (email: string, password: string) => Promise<"in" | "two_factor">;
  verifyTwoFactor: (code: string, opts: { backup: boolean; trustDevice: boolean }) => Promise<void>;
  signUp: (input: Parameters<typeof authApi.signUp>[0]) => Promise<void>;
  signOut: () => Promise<void>;
  /** Recharge `/api/me` (compteurs, grade, points). */
  refreshMe: () => Promise<Me | null>;
  /** Better Auth a remplacé la session (mot de passe changé, double authentification activée ou désactivée) : nouveau jeton. */
  adoptToken: (token: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const TOKEN_KEY = "session-token";
const ME_KEY = "me";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [offline, setOffline] = useState(false);
  const started = useRef(false);
  /** Cookie de l'étape « code » de Better Auth, entre la connexion et la saisie du code. */
  const pendingTwoFactor = useRef<string | null>(null);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    try {
      const fresh = await api.me();
      // Les caches de lecture passent sous ce compte avant que les écrans ne les lisent.
      await bindCacheScope(fresh.user.id);
      setPushAccount(fresh.user.id);
      setMe(fresh);
      setOffline(false);
      void kvSetJson(ME_KEY, fresh);
      return fresh;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        // Lot M6, tour 4 : session révoquée ou expirée, l'appareil quitte aussi les push du compte.
        await leavePush({ withSession: false });
        await clearSession();
        setStatus("out");
        setMe(null);
        return null;
      }
      // Pas de réseau : on garde le dernier profil connu.
      const cached = await kvGetJson<Me>(ME_KEY);
      if (cached) {
        await bindCacheScope(cached.user.id);
        setPushAccount(cached.user.id);
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
    // Lot M6, tour 4 : un retrait push resté en attente (déconnexion sans réseau) se rejoue dès que possible.
    watchPendingPush();
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
      signIn: async (email, password) => {
        const result = await authApi.signIn(email, password);
        if ("twoFactor" in result) {
          pendingTwoFactor.current = result.twoFactor.cookie;
          return "two_factor";
        }
        await open(result.token);
        return "in";
      },
      verifyTwoFactor: async (code, { backup, trustDevice }) => {
        const token = await authApi.verifyTwoFactor({ code, backup, trustDevice, cookie: pendingTwoFactor.current });
        pendingTwoFactor.current = null;
        await open(token);
      },
      signUp: async (input) => open(await authApi.signUp(input)),
      signOut: async () => {
        // Lot M6, tours 3 et 4 : l'appareil quitte les push de ce compte (système et API), tant que la session est
        // valide ; sans réseau, le retrait reste en attente et se rejoue.
        await leavePush({ withSession: true });
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
      adoptToken: async (token) => {
        setSessionToken(token);
        await kvSet(TOKEN_KEY, token);
        // Lot M6, tour 4 : l'ancienne session est révoquée et l'inscription push avec elle : on la refait sur la nouvelle.
        void registerThisDevice();
      },
    }),
    [status, me, offline, open, loadMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Efface tout ce qui appartient au compte sur cet appareil (jeton, profil, QR de compte, kits jour J, listes du mode
 * staff avec les coordonnées du super staff, caches de lecture de l'appli). Seules les lectures du staff pas encore
 * envoyées restent, pour ce compte.
 */
async function clearSession() {
  setSessionToken(null);
  setPushAccount(null);
  realtime.stop();
  await Promise.all([
    kvDel(TOKEN_KEY),
    kvDel(ME_KEY),
    clearAccountQrSecret(),
    clearKits(),
    kvDel("announced"),
    kvDel("staff-events"),
    purgeCaches(),
    purgeAllStaff(),
  ]);
  // Lot M3, tour 2 : les fiches lues d'avance et les aperçus ne survivent pas au compte.
  clearEventPreviews();
  // Lot M6, tour 2 : les annonces en attente (bandeau) non plus.
  resetAnnouncements();
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans un <SessionProvider>.");
  return value;
}
