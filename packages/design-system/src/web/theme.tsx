// Thèmes web : Béton mouillé par défaut, Sable ou Automatique au choix de l'utilisateur, jamais imposé (DA v2, lot 38).
// Automatique = Sable le jour, Béton après le coucher du soleil, au centre du département lu dans le cookie
// `orasso-dept` (posé par l'espace connecté quand l'utilisateur a un secteur ; Paris sinon). L'ancien « auto » (suivre
// le mode clair de l'appareil) a changé de sens.
// Le thème est l'attribut `data-theme` de <html> (les variables CSS de tokens.css en dépendent).
// Sans flash au rendu serveur : la préférence est un cookie lu par le serveur (attribut posé dans le HTML) ;
// pour « auto », le serveur rend Béton et ThemeScript corrige l'attribut avant la première peinture.

import { departmentCentroids, isDaylight, isDaylightSource, type LatLng, SOLAR_FALLBACK } from "@orasso/shared";
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
/** Département de l'utilisateur (code) pour le thème automatique ; absent = Paris. */
export const DEPT_COOKIE = "orasso-dept";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Recalcul du thème automatique : toutes les 60 s et au retour sur l'onglet. */
export const SOLAR_REFRESH_MS = 60_000;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "beton";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "beton" || value === "sable" || value === "auto" ? value : DEFAULT_THEME_PREFERENCE;
}

/** L'instant et la position du calcul solaire. */
export type SolarContext = { now: Date; lat: number; lng: number };

/** Thème effectif d'une préférence ; « auto » = Sable entre le lever et le coucher du soleil, Béton sinon. */
export function resolveTheme(preference: ThemePreference, context: SolarContext): ThemeId {
  if (preference === "auto") return isDaylight(context.now, context.lat, context.lng) ? "sable" : "beton";
  return preference;
}

/** Thème à écrire dans le HTML rendu côté serveur : « auto » n'y est pas résolu, on part de Béton. */
export function serverTheme(preference: ThemePreference): ThemeId {
  return preference === "auto" ? "beton" : preference;
}

/** Position du thème automatique pour un code de département ; Paris si inconnu. */
export function departmentPosition(code: string | null | undefined): LatLng {
  return (code && departmentCentroids[code]) || SOLAR_FALLBACK;
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Lit la préférence dans l'en-tête `Cookie` d'une requête (côté serveur). */
export function readThemeCookie(cookieHeader: string | null | undefined): ThemePreference {
  if (!cookieHeader) return DEFAULT_THEME_PREFERENCE;
  return parseThemePreference(readCookie(cookieHeader, THEME_COOKIE));
}

/** Centres des départements, compacts, pour le script d'init : { "66": [42.6, 2.52], … }. */
const CENTROIDS_JSON = JSON.stringify(
  Object.fromEntries(Object.entries(departmentCentroids).map(([code, p]) => [code, [p.lat, p.lng]])),
);

/**
 * Script bloquant à placer dans <head> : pose `data-theme` avant la première peinture. Pour « auto », même règle
 * solaire que `resolveTheme` (`isDaylightSource`, testée contre `isDaylight`), au centre du département du cookie.
 */
export const themeInitScript = `(function(){try{var c=document.cookie,m=c.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=m?decodeURIComponent(m[1]):localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="beton"&&p!=="sable"&&p!=="auto")p="${DEFAULT_THEME_PREFERENCE}";var t=p;if(p==="auto"){var d=c.match(/(?:^|; )${DEPT_COOKIE}=([^;]*)/),C=${CENTROIDS_JSON},q=(d&&C[decodeURIComponent(d[1])])||[${SOLAR_FALLBACK.lat},${SOLAR_FALLBACK.lng}];t=(${isDaylightSource})(Date.now(),q[0],q[1])?"sable":"beton"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

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
  /** Département de l'utilisateur pour le thème automatique (cookie `orasso-dept`) ; `null` = Paris. */
  setDepartment: (code: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function writeCookie(name: string, value: string | null) {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: le serveur et le script d'init lisent ce cookie (l'API Cookie Store n'est pas universelle)
    document.cookie =
      value === null
        ? `${name}=; path=/; max-age=0; samesite=lax`
        : `${name}=${encodeURIComponent(value)}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Cookies indisponibles : la valeur vaut pour la page seulement.
  }
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
 * le premier rendu client est donc identique au rendu serveur (Béton pour « auto », corrigé après l'hydratation).
 */
export function ThemeProvider({
  initialPreference = DEFAULT_THEME_PREFERENCE,
  children,
}: {
  initialPreference?: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [department, setDepartmentState] = useState<string | null>(null);
  // null au rendu serveur et à l'hydratation : « auto » vaut Béton jusqu'au premier effet.
  const [time, setTime] = useState<number | null>(null);
  const auto = preference === "auto";

  // Après l'hydratation : lire le département du cookie, puis suivre l'heure (60 s, retour sur l'onglet).
  useEffect(() => {
    setDepartmentState(readCookie(document.cookie, DEPT_COOKIE));
  }, []);
  useEffect(() => {
    if (!auto) return;
    setTime(Date.now());
    const timer = setInterval(() => setTime(Date.now()), SOLAR_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTime(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auto]);

  const { lat, lng } = departmentPosition(department);
  const theme: ThemeId =
    auto && time === null ? "beton" : resolveTheme(preference, { now: new Date(time ?? 0), lat, lng });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persist(next);
  }, []);

  const setDepartment = useCallback((code: string | null) => {
    writeCookie(DEPT_COOKIE, code);
    setDepartmentState(code);
  }, []);

  const value = useMemo(
    () => ({ preference, theme, setPreference, setDepartment }),
    [preference, theme, setPreference, setDepartment],
  );
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
