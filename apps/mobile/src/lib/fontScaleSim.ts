/**
 * Lot R6-police : la police système agrandie, simulée dans la version web, en recette seulement.
 *
 * react-native-web ne lit pas la police du système : `fontScale` vaut toujours 1 et les tailles de texte ne grossissent
 * pas. Pour voir l'appli comme sur le téléphone de Damien (police agrandie, échelle 1,3), une recette pose
 * `localStorage["orasso.recette.echellePolice"] = "1.3"` avant de charger la page. Alors, et seulement sur le web en
 * recette (`RECETTE` : Metro ou `scripts/appli-compilee.mjs`, jamais l'APK, qui n'est pas du web) :
 * - `useWindowDimensions().fontScale`, `Dimensions.get(…).fontScale` et `PixelRatio.getFontScale()` valent l'échelle ;
 * - chaque `Text` et `TextInput` multiplie son corps, son interligne et son interlettrage par l'échelle, plafonnée par
 *   `maxFontSizeMultiplier` et ignorée si `allowFontScaling={false}`, comme Android.
 * Sans la clé (ou à 1), rien n'est touché : aucune différence de rendu.
 */
import { Dimensions, Platform, StyleSheet, Text, TextInput } from "react-native";
import { RECETTE } from "./recette";

export const FONT_SCALE_KEY = "orasso.recette.echellePolice";

function readScale(): number {
  if (!RECETTE || Platform.OS !== "web" || typeof window === "undefined") return 1;
  try {
    const n = Number(window.localStorage.getItem(FONT_SCALE_KEY));
    return Number.isFinite(n) && n > 1 && n <= 3 ? n : 1;
  } catch {
    return 1;
  }
}

type Dims = { fontScale: number; height: number; scale: number; width: number };
type TextLike = { allowFontScaling?: boolean; maxFontSizeMultiplier?: number | null; style?: unknown };
type ForwardRefLike = { render: (props: TextLike, ref: unknown) => unknown };

function install(scale: number) {
  // Dimensions : même objet rendu tant que les dimensions ne changent pas (pas de rendu en trop).
  const seen = new WeakMap<Dims, Dims>();
  const withScale = (d: Dims): Dims => {
    let out = seen.get(d);
    if (!out) {
      out = { ...d, fontScale: scale };
      seen.set(d, out);
    }
    return out;
  };
  const dims = Dimensions as unknown as {
    get: (k: string) => Dims;
    addEventListener: (t: string, h: (e: { window: Dims; screen: Dims }) => void) => { remove: () => void };
    removeEventListener?: (t: string, h: unknown) => void;
  };
  const get = dims.get.bind(Dimensions);
  dims.get = (k) => withScale(get(k));
  const add = dims.addEventListener.bind(Dimensions);
  const remove = dims.removeEventListener?.bind(Dimensions);
  const wrapped = new Map<unknown, (e: { window: Dims; screen: Dims }) => void>();
  dims.addEventListener = (t, h) => {
    const w = (e: { window: Dims; screen: Dims }) => h({ window: withScale(e.window), screen: withScale(e.screen) });
    wrapped.set(h, w);
    const sub = add(t, w);
    return { remove: () => sub.remove() };
  };
  if (remove) dims.removeEventListener = (t, h) => remove(t, wrapped.get(h) ?? h);

  // Texte : corps, interligne et interlettrage multipliés, comme Android (`allowFontScaling`, `maxFontSizeMultiplier`).
  const scaleText = (component: unknown) => {
    const c = component as ForwardRefLike;
    if (typeof c?.render !== "function") return;
    const render = c.render;
    c.render = (props, ref) => {
      if (props.allowFontScaling === false) return render(props, ref);
      const flat = StyleSheet.flatten(props.style as never) as Record<string, unknown> | undefined;
      if (!flat) return render(props, ref);
      const cap = props.maxFontSizeMultiplier;
      const k = typeof cap === "number" && cap >= 1 ? Math.min(scale, cap) : scale;
      const extra: Record<string, number> = {};
      for (const key of ["fontSize", "lineHeight", "letterSpacing"] as const) {
        const v = flat[key];
        if (typeof v === "number") extra[key] = v * k;
      }
      return render({ ...props, style: [props.style, extra] }, ref);
    };
  };
  scaleText(Text);
  scaleText(TextInput);
}

const SCALE = readScale();
if (SCALE > 1) install(SCALE);

/** L'échelle simulée (1 hors recette). */
export const SIMULATED_FONT_SCALE = SCALE;
