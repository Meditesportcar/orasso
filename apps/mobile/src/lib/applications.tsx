// Candidatures de l'utilisateur, partagées par l'Accueil, l'onglet Accès et la feuille « Retenu » : rechargées à
// l'ouverture de l'appli, au retour au premier plan et toutes les minutes. À chaque chargement avec du réseau, les
// kits « jour J » des places retenues sont mis à jour (donc la veille de l'événement aussi).
import type { MyApplication } from "@orasso/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { api } from "./endpoints";
import { syncKits } from "./kits";
import { kvGetJson, kvSetJson } from "./kv";
import { useSession } from "./session";

type ApplicationsValue = {
  upcoming: MyApplication[] | null;
  past: MyApplication[] | null;
  loading: boolean;
  /** Valeurs lues dans le cache : l'API n'a pas répondu. */
  offline: boolean;
  reload: () => Promise<void>;
  /** Candidature qui vient d'être retenue et pas encore annoncée : ouvre la feuille « Retenu ». */
  announcement: MyApplication | null;
  dismissAnnouncement: () => void;
  /** Une réponse de l'API déjà connue (candidature envoyée) : insérée sans attendre le rechargement. */
  markAnnounced: (applicationIds: string[]) => void;
};

const Ctx = createContext<ApplicationsValue | null>(null);
const UPCOMING_KEY = "applications.upcoming";
const PAST_KEY = "applications.past";
const ANNOUNCED_KEY = "announced";

const persistAnnounced = (ids: Set<string> | null) => kvSetJson(ANNOUNCED_KEY, [...(ids ?? [])]);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  const [upcoming, setUpcoming] = useState<MyApplication[] | null>(null);
  const [past, setPast] = useState<MyApplication[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [announcement, setAnnouncement] = useState<MyApplication | null>(null);
  const announced = useRef<Set<string> | null>(null);
  const pseudo = me?.profile.pseudo ?? "";

  const detectAnnouncement = useCallback(async (apps: MyApplication[]) => {
    const stored = await kvGetJson<string[]>(ANNOUNCED_KEY);
    const accepted = apps.filter((a) => a.status === "accepted");
    if (!stored) {
      // Premier chargement sur cet appareil : les places déjà retenues ne sont pas des nouveautés.
      announced.current = new Set(accepted.map((a) => a.id));
      await persistAnnounced(announced.current);
      return;
    }
    announced.current ??= new Set(stored);
    const fresh = accepted.find((a) => !announced.current?.has(a.id));
    if (fresh) setAnnouncement((current) => current ?? fresh);
  }, []);

  const reload = useCallback(async () => {
    if (status !== "in") return;
    try {
      const [up, ps] = await Promise.all([api.applications("upcoming"), api.applications("past")]);
      setUpcoming(up);
      setPast(ps);
      setOffline(false);
      void kvSetJson(UPCOMING_KEY, up);
      void kvSetJson(PAST_KEY, ps);
      await detectAnnouncement(up);
      void syncKits([...up, ...ps.filter((a) => a.status === "accepted")], pseudo);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [status, pseudo, detectAnnouncement]);

  // Cache d'abord (visible hors ligne), puis l'API.
  useEffect(() => {
    if (status !== "in") {
      setUpcoming(null);
      setPast(null);
      setAnnouncement(null);
      announced.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const [cachedUp, cachedPast] = await Promise.all([
        kvGetJson<MyApplication[]>(UPCOMING_KEY),
        kvGetJson<MyApplication[]>(PAST_KEY),
      ]);
      if (cancelled) return;
      setUpcoming((current) => current ?? cachedUp);
      setPast((current) => current ?? cachedPast);
      await reload();
    })();
    const timer = setInterval(() => void reload(), 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [status, reload]);

  const value = useMemo<ApplicationsValue>(
    () => ({
      upcoming,
      past,
      loading,
      offline,
      reload,
      announcement,
      dismissAnnouncement: () => {
        if (announcement) {
          announced.current ??= new Set();
          announced.current.add(announcement.id);
          void persistAnnounced(announced.current);
        }
        setAnnouncement(null);
      },
      markAnnounced: (ids) => {
        announced.current ??= new Set();
        for (const id of ids) announced.current.add(id);
        void persistAnnounced(announced.current);
      },
    }),
    [upcoming, past, loading, offline, reload, announcement],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApplications(): ApplicationsValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useApplications doit être utilisé dans un <ApplicationsProvider>.");
  return value;
}
