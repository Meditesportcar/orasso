// Les pictogrammes de l'artefact (`<symbol id="i-…">`) dont les tutos et l'arrivée ont besoin. Depuis le socle C1, ceux
// que le jeu commun (`icons.ts`) contient viennent de lui ; ne restent ici que les symboles de l'artefact qu'il n'a pas
// (lecteur, graphique, goutte, hors ligne, clé, chevron droit, voiture des tuiles) — journal des choix, lot C3.
import { Icon, type IconName } from "@orasso/design-system/native";
import Svg, { Circle, Path } from "react-native-svg";

/** Symboles de l'artefact → icône du socle (même tracé, ou le plus proche). */
const SOCLE = {
  trophy: "trophy",
  star: "star",
  truck: "truck",
  camera: "camera",
  lock: "lock",
  check: "check",
  send: "send",
  ticket: "ticket",
  search: "search",
  bell: "bell",
  eye: "eye",
  flag: "flag",
  x: "close",
  cal: "calendar",
  user: "profile",
  chl: "back",
} as const satisfies Record<string, IconName>;

/** Les symboles propres aux tutos (absents du jeu commun). */
const PATHS = {
  scan: ["M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"],
  chart: ["M4 20V11h4v9zM10 20V5h4v15zM16 20v-6h4v6z"],
  drop: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  wifioff: [
    "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 9a15 15 0 0 1 4.4-2.6M12 20h.01",
  ],
  wrench: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  chr: ["M9 6l6 6-6 6"],
  car: ["M3 16v-3.5L5.2 8A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1l2.2 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"],
} as const;

const CIRCLES: Partial<Record<keyof typeof PATHS, [number, number, number][]>> = {
  car: [
    [7.5, 16.5, 2],
    [16.5, 16.5, 2],
  ],
};

/** Les pictogrammes de l'artefact : chaque nom = un `<symbol id="i-nom">`. */
export type ArtIconName = keyof typeof SOCLE | keyof typeof PATHS;

export function ArtIcon({
  name,
  size = 20,
  color,
  fill,
  strokeWidth = 2,
}: {
  name: ArtIconName;
  size?: number;
  color: string;
  /** Remplissage (étoile pleine des avis). */
  fill?: string;
  strokeWidth?: number;
}) {
  if (name in SOCLE)
    return (
      <Icon
        name={SOCLE[name as keyof typeof SOCLE]}
        size={size}
        color={color}
        strokeWidth={strokeWidth}
        filled={fill !== undefined}
      />
    );
  const local = name as keyof typeof PATHS;
  const common = {
    fill: fill ?? "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {PATHS[local].map((d) => (
        <Path key={d} d={d} {...common} />
      ))}
      {(CIRCLES[local] ?? []).map(([cx, cy, r]) => (
        <Circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r} {...common} fill="none" />
      ))}
    </Svg>
  );
}
