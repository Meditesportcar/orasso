// « Réduire les animations » dans l'appli (lot 40, Mon profil › Préférences) : une préférence de l'appareil (kv
// `reduceMotion`), en plus du réglage du système. Activée, elle force la réduction partout (`ThemeProvider` du système
// de design, prop `reducedMotion`) : fondu de 120 ms, aucun glissement. Désactivée, le réglage du système décide.
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { kvSet } from "./kv";

export const REDUCE_MOTION_KEY = "reduceMotion";

/** Relit la préférence mémorisée (« 1 » = réduire). */
export function parseReduceMotion(raw: string | null): boolean {
  return raw === "1";
}

type MotionPref = { reduceMotion: boolean; setReduceMotion: (on: boolean) => void };

const MotionPrefContext = createContext<MotionPref | null>(null);

export function MotionPrefProvider({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const pref = useMemo<MotionPref>(
    () => ({
      reduceMotion: value,
      setReduceMotion: (on) => {
        onChange(on);
        void kvSet(REDUCE_MOTION_KEY, on ? "1" : "0");
      },
    }),
    [value, onChange],
  );
  return <MotionPrefContext.Provider value={pref}>{children}</MotionPrefContext.Provider>;
}

export function useMotionPref(): MotionPref {
  const value = useContext(MotionPrefContext);
  if (!value) throw new Error("useMotionPref doit être utilisé dans un <MotionPrefProvider>.");
  return value;
}
