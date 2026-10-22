// Briques des écrans d'arrivée et des tutos (lot C3, D33) : reproduction des classes de l'artefact DA v2
// (`C:\Users\Dams\Orasso\.claude\prototype-v2\index.html`, écrans `s-splash`, `s-profil`, `s-dept`, `s-nom`, `s-tuto`).
// Les couleurs viennent des jetons du thème (une variable CSS de l'artefact = un jeton) ; les rares valeurs que
// l'artefact écrit en dur (pastilles d'avatar, papier des photos, fond du lecteur) sont réunies dans `SWATCH`, à passer
// en jetons au prochain re-gel du socle (journal des choix, lot C3).
import { Text, type TextProps, useTheme } from "@orasso/design-system/native";
import { type ReactNode, useMemo } from "react";
import { type StyleProp, StyleSheet, type TextStyle, View, type ViewStyle } from "react-native";

import { ArtIcon, type ArtIconName } from "./icons";

/** Une couleur à `alpha` de son opacité : `color-mix(in srgb, X n%, transparent)` de l'artefact. */
export function alpha(color: string, a: number): string {
  const hex = color.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    const base = hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+(base * a).toFixed(3)})`;
  }
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba?.[1]) {
    const [r = "0", g = "0", b = "0", o = "1"] = rgba[1].split(/[\s,/]+/).filter(Boolean);
    return `rgba(${r},${g},${b},${+(Number(o) * a).toFixed(3)})`;
  }
  return color;
}

/**
 * Les valeurs que l'artefact écrit en dur et que le socle C1 n'a pas passées en jetons (propres aux tutos) : trois
 * pastilles (`#3a3d44`, `#24418f`, `#5b554b`), papier et légende des photos du passeport, fond du lecteur, voile du bouton
 * lecture, gris du badge presse. Bleu, orange et bordeaux viennent des jetons (`useArt`).
 */
export const SWATCH = {
  graphite: "#3a3d44",
  navy: "#24418f",
  taupe: "#5b554b",
  photoPaper: "#f7f2e8",
  photoCaption: "#5b554b",
  reader: "#0b0c0e",
  nightMuted: "#aaa397",
  playScrim: "rgba(19,20,23,.65)",
} as const;

/** `position: absolute; inset: 0` (objet simple, à étaler dans un style). */
export const FILL = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const;

/** La palette de l'artefact (`:root` / `[data-theme=dark]`) lue dans les jetons du thème actif. */
export function useArt() {
  const { t, theme } = useTheme();
  return useMemo(() => {
    const c = t.color;
    const dark = theme !== "sable";
    return {
      dark,
      bg: c.ground,
      bg2: c.groundCenter,
      card: c.surface,
      card2: c.surfaceRaised,
      ink: c.ink,
      muted: c.inkMuted,
      faint: c.inkFaint,
      line: c.plateLine,
      poster: c.poster,
      posterInk: c.posterInk,
      posterMuted: c.posterMuted,
      accent: c.accent,
      accentInk: c.accentInk,
      accentText: c.accentText,
      accentSoft: alpha(c.accent, dark ? 0.16 : 0.26),
      win: c.win,
      wait: c.statusWaitlist,
      field: c.surfaceField,
      fieldLine: alpha(c.ink, dark ? 0.22 : 0.28),
      bar: c.bar,
      barInk: c.barInk,
      barMuted: c.barMuted,
      night: c.night,
      paper: c.photoInk,
      // Pastilles et vitrine : jetons du socle C1 (`avatar-2`, `vitrine-from`, `vitrine-to`, `avatar-ink`).
      avatarBlue: c.avatar2,
      vitrineFrom: c.vitrineFrom,
      vitrineTo: c.vitrineTo,
      avatarInk: c.avatarInk,
      mapLand: c.mapLand,
      mapLand2: c.mapLand2,
      mapSea: c.mapSea,
      mapRoad: c.mapRoad,
      mapLabel: c.mapLabel,
      mapMinor: alpha(c.ink, dark ? 0.18 : 0.22),
      ink66: c.stampInk66,
      shadow: t.shadow.shadowCard,
      shadowLg: t.shadow.shadowPoster,
      neon: t.shadow.neonAccent,
    };
  }, [t, theme]);
}
export type Art = ReturnType<typeof useArt>;

/** Les styles de texte de l'artefact (`.t-poster`, `.t-label`, `.t-cap`, gras 800, chiffres 62 %, boutons). */
const presets = {
  poster: { variant: "posterL", style: { textTransform: "uppercase" } },
  label: { variant: "label", style: {} },
  cap: { variant: "caption", style: { lineHeight: 18 } },
  body: { variant: "body", style: {} },
  b: { variant: "number", style: { letterSpacing: 0 } },
  semi: { variant: "bodyStrong", style: {} },
  num: { variant: "numberNarrow", style: { letterSpacing: 0 } },
  btn: { variant: "button", style: {} },
} as const satisfies Record<string, { variant: TextProps["variant"]; style: TextStyle }>;

export type TKind = keyof typeof presets;

/** Un texte de l'artefact : `k` choisit la classe, `size` la taille (px), `lh` l'interligne (px). */
export function T({
  k,
  size,
  lh,
  color,
  style,
  children,
  ...rest
}: Omit<TextProps, "variant"> & { k: TKind; size?: number; lh?: number }) {
  const p = presets[k];
  const sized: TextStyle = {};
  if (size) {
    sized.fontSize = size;
    sized.lineHeight = lh ?? Math.round(size * (k === "poster" ? 0.98 : k === "num" ? 0.95 : 1.35));
  } else if (lh) sized.lineHeight = lh;
  return (
    <Text variant={p.variant} color={color} style={[p.style, sized, style]} {...rest}>
      {children}
    </Text>
  );
}

/** `.tag` : étiquette inclinée (−8°), pleine (`ink`), moutarde (`acc`) ou au trait (`line`). */
export function Tag({
  kind = "ink",
  icon,
  height = 22,
  size = 11,
  style,
  children,
}: {
  kind?: "ink" | "acc" | "line" | "wait";
  icon?: ArtIconName;
  height?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const a = useArt();
  const bg = kind === "acc" ? a.accent : kind === "ink" ? a.ink : kind === "wait" ? a.wait : "transparent";
  const fg = kind === "acc" ? a.accentInk : kind === "ink" ? a.bg : kind === "wait" ? a.paper : a.ink;
  return (
    <View
      style={[
        styles.tag,
        { height, backgroundColor: bg, paddingHorizontal: height > 26 ? 12 : 9 },
        kind === "line" ? { borderWidth: 1.5, borderColor: a.ink } : null,
        style,
      ]}
    >
      <View style={styles.unskew}>
        {icon ? <ArtIcon name={icon} size={16} color={fg} /> : null}
        <T k="label" size={size} lh={size + 2} color={fg} style={styles.tagText}>
          {children}
        </T>
      </View>
    </View>
  );
}

/** `.evc-date.mini` : jour, quantième en chiffres étroits, mois. */
export function DateMini({
  weekday,
  day,
  month,
  big = 30,
}: {
  weekday: string;
  day: string;
  month: string;
  big?: number;
}) {
  const a = useArt();
  return (
    <View style={styles.dateMini}>
      <T k="label" size={10.5} lh={13} color={a.muted} style={styles.dateSmall}>
        {weekday}
      </T>
      <T k="num" size={big} lh={Math.round(big * 0.85)} color={a.ink}>
        {day}
      </T>
      <T k="label" size={10.5} lh={13} color={a.muted} style={styles.dateSmall}>
        {month}
      </T>
    </View>
  );
}

/** Pastille de logo (`.pro-logo`, `.tz-logo`, `.tz-av`) : initiales en chiffres étroits sur une couleur. */
export function Badge({
  initials,
  color,
  size = 36,
  radius = 10,
  round = false,
  ink,
  font = 14,
}: {
  initials: string;
  color: string;
  size?: number;
  radius?: number;
  round?: boolean;
  ink?: string;
  font?: number;
}) {
  const a = useArt();
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: round ? size / 2 : radius, backgroundColor: color },
      ]}
    >
      <T k="num" size={font} lh={font + 2} color={ink ?? a.paper}>
        {initials}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "center",
    justifyContent: "center",
    borderRadius: 4,
    transform: [{ skewX: "-8deg" }],
  },
  unskew: { flexDirection: "row", alignItems: "center", gap: 5, transform: [{ skewX: "8deg" }] },
  tagText: { letterSpacing: 0.66 },
  dateMini: { alignItems: "center", paddingRight: 8, gap: 1 },
  dateSmall: { letterSpacing: 1.05 },
  badge: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
