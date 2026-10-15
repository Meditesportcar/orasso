// Thèmes natifs : Béton par défaut, Sable au choix ou en suivant le réglage de l'appareil (clair → Sable).
// Les jetons de chaque thème sont ceux de tokens.json (voir ../tokens.ts) ; les composants lisent `useTheme().t`.
// La préférence n'est pas écrite sur le disque ici : l'appli la mémorise (initialPreference / onPreferenceChange).

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import { type ColorTokenName, THEME_IDS, type ThemeId, tokens } from "../tokens";

export type ThemePreference = ThemeId | "auto";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "beton";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "beton" || value === "sable" || value === "auto" ? value : DEFAULT_THEME_PREFERENCE;
}

/** Thème effectif d'une préférence ; « auto » suit le mode clair de l'appareil (Sable) ou sombre (Béton). */
export function resolveTheme(preference: ThemePreference, scheme: string | null | undefined): ThemeId {
  if (preference === "auto") return scheme === "light" ? "sable" : "beton";
  return preference;
}

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
  children: ReactNode;
};

export function ThemeProvider({
  initialPreference = DEFAULT_THEME_PREFERENCE,
  onPreferenceChange,
  reducedMotion,
  children,
}: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const scheme = useColorScheme();
  const system = useSystemReducedMotion();
  const theme = resolveTheme(preference, scheme);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      onPreferenceChange?.(next);
    },
    [onPreferenceChange],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, t: themeTokens[theme], setPreference, reducedMotion: reducedMotion ?? system }),
    [preference, theme, setPreference, reducedMotion, system],
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
