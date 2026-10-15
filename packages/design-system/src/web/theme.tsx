// Thèmes web : Béton mouillé par défaut, Sable (clair) au choix ou en suivant le mode clair de l'appareil.
// Le thème est l'attribut `data-theme` de <html> (les variables CSS de tokens.css en dépendent).
// Sans flash au rendu serveur : la préférence est un cookie lu par le serveur (attribut posé dans le HTML) ;
// pour « auto », ThemeScript corrige l'attribut avant la première peinture.

import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ThemeId } from "../tokens";

export type ThemePreference = ThemeId | "auto";

export const THEME_STORAGE_KEY = "orasso-theme";
export const THEME_COOKIE = "orasso-theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "beton";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "beton" || value === "sable" || value === "auto" ? value : DEFAULT_THEME_PREFERENCE;
}

/** Thème effectif d'une préférence ; « auto » suit le mode clair de l'appareil (Sable) ou sombre (Béton). */
export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ThemeId {
  if (preference === "auto") return prefersLight ? "sable" : "beton";
  return preference;
}

/** Thème à écrire dans le HTML rendu côté serveur : « auto » ne peut pas être résolu, on part de Béton. */
export function serverTheme(preference: ThemePreference): ThemeId {
  return resolveTheme(preference, false);
}

/** Lit la préférence dans l'en-tête `Cookie` d'une requête (côté serveur). */
export function readThemeCookie(cookieHeader: string | null | undefined): ThemePreference {
  if (!cookieHeader) return DEFAULT_THEME_PREFERENCE;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === THEME_COOKIE) return parseThemePreference(decodeURIComponent(rest.join("=")));
  }
  return DEFAULT_THEME_PREFERENCE;
}

/** Script bloquant à placer dans <head> : pose `data-theme` avant la première peinture. */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=m?decodeURIComponent(m[1]):localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="beton"&&p!=="sable"&&p!=="auto")p="${DEFAULT_THEME_PREFERENCE}";var t=p==="auto"?(matchMedia("${LIGHT_QUERY}").matches?"sable":"beton"):p;document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export function ThemeScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: script statique, sans donnée utilisateur
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}

type ThemeContextValue = {
  /** Préférence mémorisée : beton, sable ou auto. */
  preference: ThemePreference;
  /** Thème effectivement appliqué. */
  theme: ThemeId;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersLight(): boolean {
  return typeof matchMedia === "function" && matchMedia(LIGHT_QUERY).matches;
}

function persist(preference: ThemePreference) {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: le serveur lit ce cookie pour poser le thème sans flash (l'API Cookie Store n'est pas universelle)
    document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Stockage indisponible (navigation privée) : la préférence vaut pour la session seulement.
  }
}

/**
 * Fournisseur de thème du site. `initialPreference` vient du cookie lu par le serveur (readThemeCookie) :
 * le premier rendu client est donc identique au rendu serveur.
 */
export function ThemeProvider({
  initialPreference = DEFAULT_THEME_PREFERENCE,
  children,
}: {
  initialPreference?: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [light, setLight] = useState(false);

  // Après l'hydratation : lire le mode de l'appareil et le suivre quand il change.
  useEffect(() => {
    setLight(prefersLight());
    const query = matchMedia(LIGHT_QUERY);
    const onChange = () => setLight(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(preference, light);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persist(next);
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme doit être utilisé dans un <ThemeProvider>.");
  return value;
}

/** Applique un thème à une zone seulement (démo des deux thèmes côte à côte, aperçu d'une structure). */
export function ThemeScope({
  theme,
  children,
  ...rest
}: { theme: ThemeId; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div data-theme={theme} {...rest}>
      {children}
    </div>
  );
}

/** Vrai quand l'appareil demande moins d'animations ; faux au rendu serveur. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
