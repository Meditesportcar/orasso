// Les dessins des tutos (lot C3), portés du code de l'artefact : photos de voitures (`jPhoto`, crédit JohnGRD),
// QR statique (`qrSvg(4242)`), tampon du passeport (`stampSvg`), carte du 66 (`mapSvg('mini')`), épingle, voiture vue de
// dessus (`topCar`) et le parking où la Supra se gare (`parkSvg`, diapo 4 de l'exposant).
import { textStyles, useTheme } from "@orasso/design-system/native";
import { useEffect, useMemo, useState } from "react";
import { Image, type LayoutChangeEvent, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
  TextPath,
} from "react-native-svg";

import { FILL, SWATCH, useArt } from "./art";

/* ---------- Photos (artefact : `JPH`, photos de JohnGRD Photographie, en démonstration en attendant celles de Damien) ---------- */

const PHOTOS = {
  supra: require("../../../assets/artefact/supra.jpg"),
  s2000: require("../../../assets/artefact/s2000.jpg"),
  e30: require("../../../assets/artefact/e30.jpg"),
  rx7: require("../../../assets/artefact/rx7.jpg"),
} as const;
export type PhotoKey = keyof typeof PHOTOS;

/**
 * La source d'une photo sans sa taille d'origine : sur le web, une image du paquet garde sinon ses 900 × 600 px en
 * style en ligne, par-dessus la taille demandée (la photo débordait de sa vignette).
 */
function sourceOf(m: PhotoKey) {
  const resolved = Image.resolveAssetSource?.(PHOTOS[m]);
  return resolved?.uri ? { uri: resolved.uri } : PHOTOS[m];
}

/** Le logo de MéditeSportCar (`--msc-logo` de l'artefact). */
export const MSC_LOGO = require("../../../assets/artefact/msc-logo.png");

/** `.jph` : la photo en couverture, le crédit en bas à gauche (masqué sous 160 × 70 px). */
export function Photo({ m, style }: { m: PhotoKey; style?: StyleProp<ViewStyle> }) {
  const a = useArt();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View style={[styles.photo, { backgroundColor: SWATCH.reader }, style]} onLayout={onLayout}>
      <Image source={sourceOf(m)} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
      {box.w > 160 && box.h > 70 ? (
        <Text style={[styles.credit, { color: a.paper }]} accessible={false}>
          © JohnGRD Photographie
        </Text>
      ) : null}
    </View>
  );
}

/** `.orglogo.msc-l` : le logo rond de MéditeSportCar sur la nuit. */
export function MscLogo({ size = 36 }: { size?: number }) {
  const a = useArt();
  return (
    <View
      style={[
        styles.msc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: a.night,
          boxShadow: `inset 0 0 0 1px ${a.line}`,
        },
      ]}
      accessibilityLabel="MéditeSportCar"
    >
      <Image source={MSC_LOGO} style={{ width: size * 0.8, height: size * 0.8 }} resizeMode="contain" />
    </View>
  );
}

/* ---------- Géométrie du logo (artefact : `P_O`, `SKEW`) ---------- */

const P_O =
  "M69.19 101.74Q49.85 101.74 36.12 96.66Q22.38 91.57 15.04 81.98Q7.7 72.38 7.7 58.87Q7.7 47.38 11.41 37.57Q15.12 27.76 21.8 20.35Q31.69 9.59 47.02 3.92Q62.35 -1.74 81.54 -1.74Q100.87 -1.74 114.61 3.42Q128.34 8.58 135.68 18.17Q143.02 27.76 143.02 41.42Q143.02 53.05 139.17 63.01Q135.32 72.97 128.34 80.38Q118.6 90.84 103.27 96.29Q87.94 101.74 69.19 101.74ZM56.2 29L102.2 29C110.49 29 116.02 35.72 114.56 44L112.44 56C110.98 64.28 103.08 71 94.8 71L48.8 71C40.51 71 34.98 64.28 36.44 56L38.56 44C40.02 35.72 47.92 29 56.2 29Z";
const SKEW = "translate(75.5 50) skewX(-10) translate(-75.5 -50)";

/* ---------- QR statique (artefact : `qrSvg(4242)`) ---------- */

function seeded(n: number) {
  let s = (n * 9301 + 49297) % 233280 || 7;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const QR_PATH = (() => {
  const N = 29;
  const r = seeded(4242);
  let d = "";
  const finder = (x: number, y: number) => {
    d += `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  };
  const inF = (x: number, y: number) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
  const inC = (x: number, y: number) => x > 10 && x < 18 && y > 10 && y < 18;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (inF(x, y) || inC(x, y)) continue;
      if (r() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  finder(0, 0);
  finder(N - 7, 0);
  finder(0, N - 7);
  return d;
})();

/** Le QR d'exemple, le O d'Orasso au centre (encre nuit, voiture moutarde). */
export function Qr({ size, label }: { size: number; label?: string }) {
  const a = useArt();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? "Code QR"}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="-1 -1 31 31">
        <Path d={QR_PATH} fill={a.night} fillRule="evenodd" />
        <G transform="translate(11.2 11.6) scale(.044)">
          <G transform="translate(-7.7 0)">
            <Path d={P_O} fill={a.night} fillRule="evenodd" />
            <G transform={SKEW}>
              <Rect x={42.5} y={36} width={66} height={28} rx={11.2} fill={a.accent} />
            </G>
          </G>
        </G>
      </Svg>
    </View>
  );
}

/* ---------- Tampon du passeport (artefact : `stampSvg`, sans le grain : pas de feTurbulence en natif) ---------- */

function strSeed(str: string) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 100000) + 1;
}

export function Stamp({ spec, size }: { spec: string; size: number }) {
  const a = useArt();
  const [fmt = "", dep = "", name = "", date = "", seedS = "0"] = spec.split("|");
  const id = useMemo(() => `st${strSeed(spec)}`, [spec]);
  const r = seeded(strSeed(spec) + (Number(seedS) || 0) * 97);
  const rot = (r() * 28 - 14).toFixed(1);
  const op = 0.78 + r() * 0.16;
  const ink = dep === "66" ? a.ink66 : a.ink;
  const ring = fmt !== "expo" && fmt !== "coffee";
  const label = textStyles.label.fontFamily;
  const digits = textStyles.numberNarrow.fontFamily;
  const words = name.toUpperCase();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <Path id={`${id}p`} d="M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0" />
      </Defs>
      <G transform={`rotate(${rot} 60 60)`} opacity={op}>
        {fmt === "expo" ? (
          <>
            <Rect x={12} y={26} width={96} height={68} rx={6} fill="none" stroke={ink} strokeWidth={4} />
            <Rect x={18} y={32} width={84} height={56} rx={3} fill="none" stroke={ink} strokeWidth={1.5} />
          </>
        ) : fmt === "nocturne" ? (
          <>
            <Path d="M42 14H78L106 42V78L78 106H42L14 78V42Z" fill="none" stroke={ink} strokeWidth={4} />
            <Path d="M47 22H73L98 47V73L73 98H47L22 73V47Z" fill="none" stroke={ink} strokeWidth={1.5} />
            <Path d="M78 30a12 12 0 1 0 8 20a10 10 0 1 1-8-20z" fill={ink} />
          </>
        ) : (
          <>
            <Circle cx={60} cy={60} r={52} fill="none" stroke={ink} strokeWidth={4} />
            <Circle cx={60} cy={60} r={34} fill="none" stroke={ink} strokeWidth={1.5} />
          </>
        )}
        {ring ? (
          <SvgText fill={ink} fontFamily={label} fontSize={9.5} letterSpacing={1.6}>
            <TextPath href={`#${id}p`} startOffset="2%">{`${words} · ${dep} ·`}</TextPath>
          </SvgText>
        ) : (
          <SvgText x={60} y={46} textAnchor="middle" fill={ink} fontFamily={label} fontSize={8.5} letterSpacing={1}>
            {words.length > 18 ? `${words.slice(0, 18)}.` : words}
          </SvgText>
        )}
        <SvgText x={60} y={ring ? 66 : 68} textAnchor="middle" fill={ink} fontFamily={digits} fontSize={ring ? 22 : 24}>
          {date.slice(0, 5)}
        </SvgText>
        <SvgText
          x={60}
          y={ring ? 78 : 82}
          textAnchor="middle"
          fill={ink}
          fontFamily={label}
          fontSize={8}
          letterSpacing={1.5}
        >
          {`20${date.slice(6)}`}
        </SvgText>
      </G>
    </Svg>
  );
}

/* ---------- Carte du 66 (artefact : `mapSvg('mini')`) ---------- */

const MINOR = (() => {
  let d = "";
  for (let i = 0; i < 34; i++) {
    const y = 250 + i * 16;
    d += `M40 ${y} L300 ${y - 46}`;
  }
  for (let i = 0; i < 26; i++) {
    const x = 40 + i * 12;
    d += `M${x} 250 L${x + 60} 800`;
  }
  return d;
})();
const COAST = "M330 0C318 120 334 200 312 300C300 360 318 420 304 470C296 520 312 560 300 620C292 680 318 740 312 800";
const TET = "M200 250C196 300 184 360 178 420C172 480 196 560 230 640C246 690 250 740 254 800";

/** La carte au style Orasso, cadrée sur Perpignan et Canet (remplit son parent, rognée comme `slice`). */
export function MapMini() {
  const a = useArt();
  const label = textStyles.label.fontFamily;
  const city = (x: number, y: number, t: string, s = 8) => (
    <SvgText
      key={t}
      x={x}
      y={y}
      fontFamily={label}
      fontSize={s}
      letterSpacing={s * 0.18}
      fill={a.mapLabel}
      textAnchor="middle"
    >
      {t}
    </SvgText>
  );
  return (
    <Svg width="100%" height="100%" viewBox="60 280 330 300" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <Pattern id="mmh" width={6} height={6} patternUnits="userSpaceOnUse">
          <Path d="M0 3h6" stroke={a.mapMinor} strokeWidth={1} />
        </Pattern>
        <ClipPath id="mmc">
          <Path d={`M0 0H330${COAST.slice(COAST.indexOf("C"))}H0Z`} />
        </ClipPath>
      </Defs>
      <Rect width={400} height={800} fill={a.mapSea} />
      <Rect width={400} height={800} fill="url(#mmh)" />
      <G clipPath="url(#mmc)">
        <Rect width={400} height={800} fill={a.mapLand} />
        <Path d="M0 520C80 500 120 560 200 600C240 620 260 660 300 700V800H0Z" fill={a.mapLand2} />
        <Path d={MINOR} stroke={a.mapMinor} strokeWidth={0.6} opacity={0.55} />
        <Path d="M250 200C270 190 290 210 286 240C282 270 262 280 252 262C244 246 238 214 250 200Z" fill={a.mapSea} />
        <Path d="M286 450C298 446 304 462 300 480C296 494 284 492 282 478C280 466 280 454 286 450Z" fill={a.mapSea} />
        <Path
          d="M40 440C90 436 130 420 170 428C210 436 250 418 300 420"
          fill="none"
          stroke={a.mapSea}
          strokeWidth={5}
        />
        <Path
          d="M60 470C110 450 150 440 205 432C240 428 268 420 292 414"
          fill="none"
          stroke={a.mapRoad}
          strokeWidth={2.4}
          opacity={0.75}
        />
        <Path d="M205 432C190 470 170 520 150 600" fill="none" stroke={a.mapRoad} strokeWidth={2} opacity={0.6} />
        <Path d="M205 432C230 480 260 530 300 612" fill="none" stroke={a.mapRoad} strokeWidth={2} opacity={0.6} />
        <Path d="M150 478C140 520 128 560 118 596" fill="none" stroke={a.mapRoad} strokeWidth={1.6} opacity={0.5} />
        <Path d={TET} fill="none" stroke={a.mapLand} strokeWidth={7} />
        <Path d={TET} fill="none" stroke={a.accent} strokeWidth={3} />
        <Path
          d="M40 300C120 340 200 330 300 360"
          fill="none"
          stroke={a.mapRoad}
          strokeWidth={1}
          strokeDasharray="6 5"
          opacity={0.5}
        />
      </G>
      <Path d={COAST} fill="none" stroke={a.mapRoad} strokeWidth={1.5} opacity={0.5} />
      {city(196, 412, "PERPIGNAN", 12)}
      {city(276, 398, "CANET", 9)}
      {city(166, 316, "RIVESALTES")}
      {city(140, 496, "THUIR")}
      {city(244, 494, "ELNE")}
      {city(262, 584, "ARGELÈS")}
      {city(118, 616, "CÉRET")}
      {city(352, 520, "MÉDITERRANÉE")}
    </Svg>
  );
}

/** L'épingle moutarde de la carte (44 × 54). */
export function Pin() {
  const a = useArt();
  return (
    <Svg width={44} height={54} viewBox="0 0 44 54">
      <Path d="M22 52s-18-16-18-30a18 18 0 0 1 36 0c0 14-18 30-18 30z" fill={a.accent} />
      <Circle cx={22} cy={22} r={7} fill={a.accentInk} />
    </Svg>
  );
}

/* ---------- Voiture vue de dessus (artefact : `topCar`) ---------- */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Une voiture vue de dessus, centrée sur (0, 0), le nez vers +x. `beams` : phares ; `brake` : feux stop animés. */
function TopCar({ c, beams, brake }: { c: string; beams?: boolean; brake?: SharedValue<number> }) {
  const L = 58;
  const W = 27;
  const wheels: [number, number][] = [];
  for (const x of [L * 0.3, -L * 0.3]) for (const y of [-W / 2 - 2, W / 2 - 2]) wheels.push([x, y]);
  return (
    <G>
      <Ellipse cx={1.5} cy={2.5} rx={r1(L * 0.53)} ry={r1(W * 0.56)} fill="rgba(0,0,0,.2)" />
      {beams ? (
        <Path
          d={`M${r1(L / 2 - 2)} ${r1(-W * 0.34)}L${r1(L / 2 + 78)} ${r1(-W * 1.05)}L${r1(L / 2 + 78)} ${r1(W * 1.05)}L${r1(L / 2 - 2)} ${r1(W * 0.34)}Z`}
          fill="url(#tpBeam)"
        />
      ) : null}
      {wheels.map(([x, y]) => (
        <Rect key={`${x}${y}`} x={r1(x - 5)} y={r1(y)} width={10} height={4} rx={1.5} fill={SWATCH.reader} />
      ))}
      <Rect x={r1(L * 0.1)} y={r1(-W / 2 - 2.2)} width={4} height={3.4} rx={1.2} fill={c} />
      <Rect x={r1(L * 0.1)} y={r1(W / 2 - 1.2)} width={4} height={3.4} rx={1.2} fill={c} />
      <Rect x={r1(-L / 2)} y={r1(-W / 2)} width={L} height={W} rx={r1(W * 0.38)} fill={c} />
      <Rect
        x={r1(L * 0.04)}
        y={r1(-W * 0.38)}
        width={r1(L * 0.2)}
        height={r1(W * 0.76)}
        rx={r1(W * 0.12)}
        fill="rgba(10,12,16,.85)"
      />
      <Rect
        x={r1(-L * 0.36)}
        y={r1(-W * 0.34)}
        width={r1(L * 0.13)}
        height={r1(W * 0.68)}
        rx={r1(W * 0.1)}
        fill="rgba(10,12,16,.85)"
      />
      <Rect
        x={r1(-L * 0.18)}
        y={r1(-W * 0.4)}
        width={r1(L * 0.2)}
        height={r1(W * 0.8)}
        rx={r1(W * 0.1)}
        fill="rgba(255,255,255,.18)"
      />
      <Rect x={r1(L / 2 - 3.2)} y={r1(-W * 0.38)} width={2.6} height={5} rx={1} fill="#fff4cf" />
      <Rect x={r1(L / 2 - 3.2)} y={r1(W * 0.38 - 5)} width={2.6} height={5} rx={1} fill="#fff4cf" />
      {brake ? (
        <>
          <BrakeLight x={r1(-L / 2 - 0.6)} y={r1(-W * 0.4)} t={brake} />
          <BrakeLight x={r1(-L / 2 - 0.6)} y={r1(W * 0.4 - 6)} t={brake} />
        </>
      ) : null}
    </G>
  );
}

const ARect = Animated.createAnimatedComponent(Rect);
const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AG = Animated.createAnimatedComponent(G);

/** Valeur d'une animation SVG (`values` / `keyTimes`, linéaire) à l'instant `t` (s), qui commence à `begin` et dure `dur`. */
function keyed(t: number, begin: number, dur: number, times: readonly number[], values: readonly number[]) {
  "worklet";
  const k = (t - begin) / dur;
  if (k <= 0) return values[0] ?? 0;
  if (k >= 1) return values[values.length - 1] ?? 0;
  for (let i = 1; i < times.length; i++) {
    const t1 = times[i] ?? 1;
    if (k <= t1) {
      const t0 = times[i - 1] ?? 0;
      const v0 = values[i - 1] ?? 0;
      const v1 = values[i] ?? 0;
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (k - t0)) / (t1 - t0);
    }
  }
  return values[values.length - 1] ?? 0;
}

function BrakeLight({ x, y, t }: { x: number; y: number; t: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    "worklet";
    return { opacity: keyed(t.value, 1.65, 1.75, [0, 0.08, 0.85, 1], [0.3, 1, 1, 0.5]) };
  });
  return <ARect x={x} y={y} width={2.4} height={6} rx={1} fill="#ff3b2f" animatedProps={props} />;
}

/* ---------- Le parking (artefact : `parkSvg`) : la Supra suit le chemin jusqu'à sa place, zone JDM ---------- */

/** Le chemin de la Supra, échantillonné à pas de longueur égale (position et cap), pour `animateMotion rotate="auto"`. */
const MOTION = (() => {
  type Pt = { x: number; y: number };
  const pts: Pt[] = [];
  const line = (a: Pt, b: Pt, n: number) => {
    for (let i = 0; i < n; i++) pts.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  };
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number) => {
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const m = 1 - u;
      pts.push({
        x: m * m * m * p0.x + 3 * m * m * u * p1.x + 3 * m * u * u * p2.x + u * u * u * p3.x,
        y: m * m * m * p0.y + 3 * m * m * u * p1.y + 3 * m * u * u * p2.y + u * u * u * p3.y,
      });
    }
  };
  line({ x: -80, y: 138 }, { x: 70, y: 138 }, 150);
  cubic({ x: 70, y: 138 }, { x: 130, y: 138 }, { x: 160, y: 128 }, { x: 160, y: 92 }, 200);
  line({ x: 160, y: 92 }, { x: 160, y: 60 }, 32);
  pts.push({ x: 160, y: 60 });
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Pt;
    const q = pts[i - 1] as Pt;
    acc.push((acc[i - 1] ?? 0) + Math.hypot(p.x - q.x, p.y - q.y));
  }
  const total = acc[acc.length - 1] ?? 1;
  const N = 160;
  const xs: number[] = [];
  const ys: number[] = [];
  const as: number[] = [];
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const s = (total * i) / N;
    while (j < acc.length - 2 && (acc[j + 1] ?? 0) < s) j++;
    const p = pts[j] as Pt;
    const q = pts[j + 1] as Pt;
    const seg = (acc[j + 1] ?? 0) - (acc[j] ?? 0) || 1;
    const k = (s - (acc[j] ?? 0)) / seg;
    xs.push(p.x + (q.x - p.x) * k);
    ys.push(p.y + (q.y - p.y) * k);
    as.push((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI);
  }
  return { xs, ys, as, N };
})();

/** Une courbe de Bézier cubique (x1, y1, x2, y2) évaluée en `x` (keySplines de l'artefact). */
function spline(x: number, x1: number, y1: number, x2: number, y2: number) {
  "worklet";
  let u = x;
  for (let i = 0; i < 8; i++) {
    const m = 1 - u;
    const bx = 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u - x;
    const dx = 3 * m * m * x1 + 6 * m * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(bx) < 1e-4 || dx === 0) break;
    u = Math.min(1, Math.max(0, u - bx / dx));
  }
  const m = 1 - u;
  return 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u;
}

/** Fraction du chemin à l'instant `t` (keyPoints 0;0;.51;.89;1, keyTimes 0;.307;.512;.819;1, keySplines, 3,3 s). */
function motionAt(t: number) {
  "worklet";
  const k = Math.min(1, Math.max(0, t / 3.3));
  if (k < 0.307) return 0;
  if (k < 0.512) return 0.51 * spline((k - 0.307) / 0.205, 0.3, 0.1, 0.7, 1);
  if (k < 0.819) return 0.51 + 0.38 * spline((k - 0.512) / 0.307, 0.25, 0.45, 0.6, 0.95);
  return 0.89 + 0.11 * spline((k - 0.819) / 0.181, 0.2, 0.7, 0.35, 1);
}

const PX = MOTION.xs;
const PY = MOTION.ys;
const PA = MOTION.as;
const PN = MOTION.N;

function poseAt(t: number) {
  "worklet";
  const f = motionAt(t) * PN;
  const i = Math.min(PN - 1, Math.floor(f));
  const k = f - i;
  const x = (PX[i] ?? 0) + ((PX[i + 1] ?? 0) - (PX[i] ?? 0)) * k;
  const y = (PY[i] ?? 0) + ((PY[i + 1] ?? 0) - (PY[i] ?? 0)) * k;
  const a = (PA[i] ?? 0) + ((PA[i + 1] ?? 0) - (PA[i] ?? 0)) * k;
  const extra = keyed(t, 0, 3.3, [0, 0.512, 0.645, 0.779, 0.89, 1], [0, 0, -32, -20, 4, 0]);
  return { x, y, a: a + extra };
}

/** Longueur d'une cubique (pour tracer les traces de pneus : `pathLength` n'existe pas en natif). */
function cubicLength(p: number[]) {
  let len = 0;
  let px = p[0] ?? 0;
  let py = p[1] ?? 0;
  for (let i = 1; i <= 60; i++) {
    const u = i / 60;
    const m = 1 - u;
    const x =
      m * m * m * (p[0] ?? 0) + 3 * m * m * u * (p[2] ?? 0) + 3 * m * u * u * (p[4] ?? 0) + u * u * u * (p[6] ?? 0);
    const y =
      m * m * m * (p[1] ?? 0) + 3 * m * m * u * (p[3] ?? 0) + 3 * m * u * u * (p[5] ?? 0) + u * u * u * (p[7] ?? 0);
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}
const MARK_A = cubicLength([70, 128, 122, 128, 148, 122, 150, 96]);
const MARK_B = cubicLength([70, 150, 140, 152, 178, 140, 172, 96]);

const ROWS: [number, number, number, Record<string, string>][] = [
  [-31, -90, 0.42, { "-1": "#24418f", 0: "#c9ccd1", 2: "#8f1d22", 3: "#ece8de", 5: "#3a3d44" }],
  [59, -90, 1, { "-1": "#ece8de", 0: "#8f1d22", 1: "#c9ccd1", 3: "#2a2c31", 5: "#24418f" }],
  [201, 90, 1, { "-1": "#8f1d22", 0: "#ece8de", 2: "#24418f", 3: "#3a3d44", 4: "#c9ccd1" }],
  [291, 90, 0.42, { 0: "#3a3d44", 1: "#8f1d22", 3: "#c9ccd1", 4: "#24418f", 6: "#ece8de" }],
];

/** La scène du parking, au cadre de son parent (320 × 260 unités, `meet`). Réduction : l'état final, immobile. */
export function ParkScene() {
  const a = useArt();
  const { reducedMotion } = useTheme();
  const t = useSharedValue(reducedMotion ? 7.5 : 0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` est stable
  useEffect(() => {
    if (reducedMotion) {
      t.value = 7.5;
      return;
    }
    t.value = 0;
    t.value = withDelay(0, withTiming(7.5, { duration: 7500, easing: Easing.linear }));
  }, [reducedMotion]);
  const label = textStyles.label.fontFamily;
  const s = box.w && box.h ? Math.min(box.w / 320, box.h / 260) : 0;
  const ox = (box.w - 320 * s) / 2;
  const oy = (box.h - 260 * s) / 2;

  const slotDash = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: -((t.value % 0.8) / 0.8) * 22, opacity: t.value < 3.3 ? 1 : 0 };
  });
  const slotFill = useAnimatedProps(() => {
    "worklet";
    return {
      fillOpacity: keyed(t.value, 3.3, 0.7, [0, 0.5, 1], [0.1, 0.5, 0.18]),
      strokeOpacity: t.value < 3.3 ? 0 : 1,
    };
  });
  const pulse = useAnimatedProps(() => {
    "worklet";
    const sc = keyed(t.value, 3.3, 0.75, [0, 1], [1, 1.4]);
    return {
      opacity: t.value < 3.3 ? 0 : keyed(t.value, 3.3, 0.75, [0, 1], [0.9, 0]),
      x: 160 - 25 * sc,
      y: 59 - 42 * sc,
      width: 50 * sc,
      height: 84 * sc,
    };
  });
  const route = useAnimatedProps(() => {
    "worklet";
    const on = keyed(t.value, 0.35, 0.35, [0, 1], [0, 0.95]);
    const off = keyed(t.value, 3.05, 0.4, [0, 1], [1, 0]);
    return { opacity: on * off, strokeDashoffset: -((t.value % 0.6) / 0.6) * 20 };
  });
  const markA = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: MARK_A * (1 - keyed(t.value, 1.7, 1.05, [0, 1], [0, 1])) };
  });
  const markB = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: MARK_B * (1 - keyed(t.value, 1.7, 1.05, [0, 1], [0, 1])) };
  });
  const marks = useAnimatedProps(() => {
    "worklet";
    return { opacity: keyed(t.value, 2.7, 4.5, [0, 0.35, 1], [0.26, 0.26, 0]) };
  });
  const car = useAnimatedStyle(() => {
    "worklet";
    const p = poseAt(t.value);
    return {
      transform: [
        { translateX: ox + p.x * s - 110 * s },
        { translateY: oy + p.y * s - 30 * s },
        { rotate: `${p.a}deg` },
      ],
    };
  });

  const lines: React.ReactNode[] = [];
  for (const [cy, , op] of ROWS) {
    for (let i = -2; i <= 7; i++)
      lines.push(
        <Line
          key={`l${cy}${i}`}
          x1={20 + i * 56}
          y1={cy - 45}
          x2={20 + i * 56}
          y2={cy + 45}
          stroke={a.faint}
          strokeWidth={2}
          opacity={0.5 * op}
        />,
      );
  }
  return (
    <View style={FILL} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Svg width="100%" height="100%" viewBox="0 0 320 260" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <RadialGradient id="tpSmoke">
            <Stop offset="0" stopColor="#b9b4aa" stopOpacity={0.55} />
            <Stop offset="0.6" stopColor="#b9b4aa" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#b9b4aa" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {lines}
        {[14, 246].map((y) => (
          <Line key={y} x1={-120} y1={y} x2={440} y2={y} stroke={a.faint} strokeWidth={2} opacity={0.42} />
        ))}
        <Line
          x1={-120}
          y1={130}
          x2={440}
          y2={130}
          stroke={a.faint}
          strokeWidth={2}
          strokeDasharray="12 10"
          opacity={0.35}
        />
        <SvgText x={300} y={120} fontFamily={label} fontSize={9} letterSpacing={1.6} fill={a.faint} textAnchor="end">
          ZONE JDM
        </SvgText>
        <SvgText x={300} y={150} fontFamily={label} fontSize={9} letterSpacing={1.6} fill={a.faint} textAnchor="end">
          ZONE EURO
        </SvgText>
        {/* Ta place : pointillés qui défilent, puis la place s'allume (3,3 s). */}
        <ARect
          x={135}
          y={17}
          width={50}
          height={84}
          rx={5}
          fill={a.accent}
          fillOpacity={0.1}
          stroke={a.accent}
          strokeWidth={2}
          strokeDasharray="6 5"
          animatedProps={slotDash}
        />
        <ARect
          x={135}
          y={17}
          width={50}
          height={84}
          rx={5}
          fill={a.accent}
          stroke={a.accent}
          strokeWidth={2}
          animatedProps={slotFill}
        />
        <SvgText
          x={160}
          y={99}
          textAnchor="middle"
          fontFamily={label}
          fontSize={8.5}
          letterSpacing={1.4}
          fill={a.accentText}
        >
          TA PLACE
        </SvgText>
        <ARect
          x={135}
          y={17}
          width={50}
          height={84}
          rx={5}
          fill="none"
          stroke={a.accent}
          strokeWidth={2}
          animatedProps={pulse}
        />
        <APath
          d="M-80 138L70 138C130 138 160 128 160 92L160 60"
          fill="none"
          stroke={a.accent}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeDasharray="1 9"
          animatedProps={route}
        />
        {ROWS.map(([cy, rot, op, cs]) => (
          <G key={`r${cy}`} opacity={op}>
            {Object.entries(cs).map(([i, c]) => (
              <G key={i} transform={`translate(${48 + Number(i) * 56} ${cy}) rotate(${rot})`}>
                <TopCar c={c} />
              </G>
            ))}
          </G>
        ))}
        <AG animatedProps={marks}>
          <APath
            d="M70 128C122 128 148 122 150 96"
            fill="none"
            stroke="#000"
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeDasharray={`${MARK_A} ${MARK_A}`}
            animatedProps={markA}
          />
          <APath
            d="M70 150C140 152 178 140 172 96"
            fill="none"
            stroke="#000"
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeDasharray={`${MARK_B} ${MARK_B}`}
            animatedProps={markB}
          />
        </AG>
        {(
          [
            [96, 151, 1.8],
            [124, 149, 2],
            [150, 140, 2.2],
            [168, 124, 2.4],
          ] as const
        ).map(([x, y, b]) => (
          <Smoke key={b} x={x} y={y} begin={b} t={t} />
        ))}
      </Svg>
      {s > 0 ? (
        <Animated.View style={[styles.car, { width: 220 * s, height: 60 * s }, car]} pointerEvents="none">
          <Svg width="100%" height="100%" viewBox="-110 -30 220 60">
            <Defs>
              <LinearGradient id="tpBeam" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="#fff1c4" stopOpacity={0.5} />
                <Stop offset="1" stopColor="#fff1c4" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <TopCar c="#e9e7e1" beams brake={t} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Smoke({ x, y, begin, t }: { x: number; y: number; begin: number; t: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    "worklet";
    return {
      opacity: t.value < begin ? 0 : keyed(t.value, begin, 1.3, [0, 0.25, 1], [0, 0.85, 0]),
      r: keyed(t.value, begin, 1.3, [0, 1], [6, 24]),
    };
  });
  return <ACircle cx={x} cy={y} r={6} fill="url(#tpSmoke)" animatedProps={props} />;
}

const styles = StyleSheet.create({
  photo: { overflow: "hidden" },
  // Taille imposée : sur le web, une image du paquet porte sa taille d’origine (900 × 600) si on ne la fixe pas.
  img: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  credit: {
    position: "absolute",
    left: 5,
    bottom: 4,
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.2,
    opacity: 0.8,
    textShadowColor: "rgba(0,0,0,.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  msc: { alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  car: { position: "absolute", left: 0, top: 0 },
});
