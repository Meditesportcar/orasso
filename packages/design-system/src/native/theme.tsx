// Thèmes natifs : Béton par défaut, Sable ou Automatique au choix de l'utilisateur, jamais imposé (DA v2, lot 38).
// Automatique = Sable le jour, Béton après le coucher du soleil, au centre du premier département de l'utilisateur
// (Paris sinon, jamais le GPS) ; recalculé toutes les 60 s et au retour au premier plan. L'ancien « auto » (suivre le
// réglage de l'appareil) a changé de sens : une préférence « auto » déjà enregistrée suit désormais le soleil.
// Les jetons de chaque thème sont ceux de tokens.json + la surcouche v2 (voir ../tokens.ts) ; les composants lisent
// `useTheme().t`. La préférence n'est pas écrite sur le disque ici : l'appli la mémorise (initialPreference /
// onPreferenceChange).

import { isDaylight, type LatLng, SOLAR_FALLBACK } from "@orasso/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { type ColorTokenName, THEME_IDS, type ThemeId, tokens } from "../tokens";

export type ThemePreference = ThemeId | "auto";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "beton";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "beton" || value === "sable" || value === "auto" ? value : DEFAULT_THEME_PREFERENCE;
}

/** L'instant et la position du calcul solaire (centre du département, Paris par défaut). */
export type SolarContext = { now: Date; lat: number; lng: number };

/** Thème effectif d'une préférence ; « auto » = Sable entre le lever et le coucher du soleil, Béton sinon. */
export function resolveTheme(preference: ThemePreference, context: SolarContext): ThemeId {
  if (preference === "auto") return isDaylight(context.now, context.lat, context.lng) ? "sable" : "beton";
  return preference;
}

/** Recalcul du thème automatique : toutes les 60 s (et au retour au premier plan). */
export const SOLAR_REFRESH_MS = 60_000;

/** Tous les jetons d'un thème, prêts pour les styles React Native. */
export type ThemeTokens = {
  id: ThemeId;
  color: Record<ColorTokenName, string>;
  shadow: (typeof tokens.shadow)[ThemeId];
  groundFx: (typeof tokens.groundFx)[ThemeId];
  groundFxSite: (typeof tokens.groundFxSite)[ThemeId];
  grain: (typeof tokens.grain)[ThemeId];
  barFx: (typeof tokens.barFx)[ThemeId];
  barBrush: (typeof tokens.barBrush)[ThemeId];
  /** Épaisseur du filet sous l'en-tête : 1 px en Béton (à 45 %), 2 px plein en Sable (README AppBar). */
  barEdgeHeader: number;
};

function build(id: ThemeId): ThemeTokens {
  return {
    id,
    color: tokens.color[id] as Record<ColorTokenName, string>,
    shadow: tokens.shadow[id],
    groundFx: tokens.groundFx[id],
    groundFxSite: tokens.groundFxSite[id],
    grain: tokens.grain[id],
    barFx: tokens.barFx[id],
    barBrush: tokens.barBrush[id],
    barEdgeHeader: id === "beton" ? 1 : 2,
  };
}

export const themeTokens: Record<ThemeId, ThemeTokens> = {
  beton: build("beton"),
  sable: build("sable"),
};

export const { spacing, radius, geometry } = tokens;
/** Angles du système en degrés (jetons `geometry`). */
export const angle = {
  skew: Number.parseFloat(geometry.skew),
  skewTab: Number.parseFloat(geometry.skewTab),
  cut: Number.parseFloat(geometry.cut),
  band: Number.parseFloat(geometry.band),
} as const;

/** Vrai quand l'appareil demande moins d'animations (réglage système, suivi en direct). */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

type ThemeContextValue = {
  /** Préférence : beton, sable ou auto. */
  preference: ThemePreference;
  /** Thème effectivement appliqué. */
  theme: ThemeId;
  /** Jetons du thème effectif. */
  t: ThemeTokens;
  setPreference: (preference: ThemePreference) => void;
  /** Position du thème automatique (centre du premier département de l'utilisateur) ; `null` = Paris. */
  setPosition: (position: LatLng | null) => void;
  /** Réduction des animations : tout devient un fondu `fast`, le fond ne bouge plus. */
  reducedMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  initialPreference?: ThemePreference;
  /** Appelé quand l'utilisateur change de préférence : l'appli la mémorise. */
  onPreferenceChange?: (preference: ThemePreference) => void;
  /** Force la réduction des animations (recette) ; sinon le réglage système. */
  reducedMotion?: boolean;
  /** Position initiale du thème automatique ; Paris par défaut (l'appli la règle ensuite avec `setPosition`). */
  position?: LatLng | null;
  /** Horloge (recette, horloge simulée) ; `Date.now` par défaut. */
  now?: () => number;
  children: ReactNode;
};

/** L'instant courant, rafraîchi toutes les 60 s et au retour au premier plan, seulement quand `active`. */
function useSolarClock(active: boolean, now: () => number): number {
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!active) return;
    setTime(now());
    const timer = setInterval(() => setTime(now()), SOLAR_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setTime(now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [active, now]);
  return time;
}

export function ThemeProvider({
  initialPreference = DEFAULT_THEME_PREFERENCE,
  onPreferenceChange,
  reducedMotion,
  position: initialPosition = null,
  now = Date.now,
  children,
}: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [position, setPositionState] = useState<LatLng | null>(initialPosition);
  const system = useSystemReducedMotion();
  const time = useSolarClock(preference === "auto", now);
  const { lat, lng } = position ?? SOLAR_FALLBACK;
  const theme = resolveTheme(preference, { now: new Date(time), lat, lng });

  const setPosition = useCallback((next: LatLng | null) => {
    setPositionState((prev) => (prev?.lat === next?.lat && prev?.lng === next?.lng ? prev : next));
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      onPreferenceChange?.(next);
    },
    [onPreferenceChange],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      t: themeTokens[theme],
      setPreference,
      setPosition,
      reducedMotion: reducedMotion ?? system,
    }),
    [preference, theme, setPreference, setPosition, reducedMotion, system],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme doit être utilisé dans un <ThemeProvider>.");
  return value;
}

/** Applique un autre thème à une zone (démo des deux thèmes côte à côte, aperçu). */
export function ThemeScope({ theme, children }: { theme: ThemeId; children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, theme, t: themeTokens[theme], preference: theme }),
    [parent, theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export { THEME_IDS };
