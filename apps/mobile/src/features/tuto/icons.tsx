// Les pictogrammes de l'artefact (`<symbol id="i-…">`, trait 2, bouts ronds) dont les tutos et l'arrivée ont besoin.
// Le jeu commun (`icons.ts` du système) est repris par le lot C1 : ces tracés sont les mêmes, à remplacer par lui à la
// fusion (journal des choix, lot C3).
import Svg, { Circle, Path, Rect } from "react-native-svg";

const PATHS = {
  scan: ["M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"],
  trophy: ["M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"],
  star: ["M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"],
  chart: ["M4 20V11h4v9zM10 20V5h4v15zM16 20v-6h4v6z"],
  truck: ["M2 17V7a1 1 0 0 1 1-1h11v11", "M14 10h4l3 3.5V17h-2", "M5 9h6v3H5z", "M4 6l1.2-2h8.6L15 6", "M8.3 17.5h6.9"],
  camera: ["M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"],
  drop: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  wifioff: [
    "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 9a15 15 0 0 1 4.4-2.6M12 20h.01",
  ],
  lock: ["M8 11V8a4 4 0 0 1 8 0v3"],
  wrench: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  cal: ["M3 10h18M8 3v4M16 3v4"],
  chr: ["M9 6l6 6-6 6"],
  chl: ["M15 6l-6 6 6 6"],
  user: ["M4 21c1-4 4.5-6 8-6s7 2 8 6"],
  check: ["M5 12l5 5 9-10"],
  send: ["M21 3L10 14M21 3l-7 18-4-7-7-4z"],
  ticket: [
    "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z",
    "M14.5 6.5v2M14.5 11v2M14.5 15.5v2",
  ],
  search: ["M20 20l-4-4"],
  bell: ["M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"],
  x: ["M6 6l12 12M18 6L6 18"],
  car: ["M3 16v-3.5L5.2 8A2 2 0 0 1 7 7h10a2 2 0 0 1 1.8 1l2.2 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"],
  flag: ["M5 21V4M5 4h11l-2 4 2 4H5"],
} as const;

/** Les pictogrammes de l'artefact : chaque nom = un `<symbol id="i-nom">`. */
export type ArtIconName = keyof typeof PATHS;

/** Ceux qui se remplissent (`.tz-star` : étoile pleine ; `.fillme` sinon vide). */
const CIRCLES: Partial<Record<ArtIconName, [number, number, number][]>> = {
  truck: [
    [6.5, 17.5, 1.8],
    [17, 17.5, 1.8],
  ],
  camera: [[12, 13.5, 3.5]],
  user: [[12, 8, 4]],
  search: [[11, 11, 7]],
  eye: [[12, 12, 3]],
  car: [
    [7.5, 16.5, 2],
    [16.5, 16.5, 2],
  ],
};

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
  const common = {
    fill: fill ?? "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "lock" ? <Rect x={5} y={11} width={14} height={10} rx={2} {...common} /> : null}
      {name === "cal" ? <Rect x={3} y={5} width={18} height={16} rx={2} {...common} /> : null}
      {PATHS[name].map((d) => (
        <Path key={d} d={d} {...common} />
      ))}
      {(CIRCLES[name] ?? []).map(([cx, cy, r]) => (
        <Circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r} {...common} fill="none" />
      ))}
    </Svg>
  );
}
