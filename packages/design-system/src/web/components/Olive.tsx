// Le O vivant, version site (lot 39) : mêmes noms et même rôle que src/native/olive (OpeningBattle, OLoader,
// SendProgress, SendBurst, EmptyState, StampDrop, CenterTabO) et les meutes du fond « battle » (BattleLayer, posé par
// Ground). SVG animé : SMIL (animateMotion) pour le drift le long d'une trajectoire, CSS (Olive.css) pour le reste.
// Lot C8 : le fond « battle » et le O vivant du hero (LiveO) passent en canvas, avec la fumée de l'artefact (smoke.ts).
// La géométrie vient du même module que le natif (native/olive/path.ts, brandArt.carTop) : même tracé des deux côtés.
// Réduction des animations : pas de drift ni de meute ; la voiture est garée et tout apparaît en fondu `fast`.

import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { battle, duration, olive, smoke } from "../../motion";
import { brandArt } from "../../native/brandArt";
import { useOliveScreenActive } from "../../native/olive/activity";
import {
  type BattlePath,
  battlePath,
  driftOrbit,
  orbitPathD,
  type PackCar,
  poseAt,
  seededRandom,
  tandem,
} from "../../native/olive/path";
import { useIsGroundQuiet } from "../../native/olive/quiet";
import { useReducedMotion } from "../theme";
import type { BrandTone } from "./Brand";
import { cx } from "./cx";
import {
  ARTIFACT_RATE,
  cssColor,
  drawCar,
  fitCanvas,
  MarkRing,
  rearWheel,
  SmokePool,
  smokeCap,
  smokeRate,
  smokeSprite,
} from "./smoke";

const { carTop, carSkew } = brandArt;
const oTransform = `translate(${brandArt.oOffset} 0)`;
const carTransform = `translate(${brandArt.oOffset} 0) translate(${carSkew.cx} ${carSkew.cy}) skewX(${carSkew.angle}) translate(${-carSkew.cx} ${-carSkew.cy})`;
const [monoX, monoY, monoW] = brandArt.viewBox;
const O_CENTER = { x: monoX + monoW / 2, y: monoY + monoW / 2 };
const ORBIT = { radius: 92, squash: 0.78 };
const CAR_UNITS = 36;
const CAR_UNITS_COMPACT = 64;
const COMPACT_MAX = 32;
const STAGE = 260;
const STAGE_COMPACT = 200;
const RING = { rx: 80, ry: 64 };
/** L'anneau en chemin : départ en haut, sens horaire (il se remplit comme une aiguille). */
const RING_D = `M0 ${-RING.ry}A${RING.rx} ${RING.ry} 0 1 1 0 ${RING.ry}A${RING.rx} ${RING.ry} 0 1 1 0 ${-RING.ry}`;

/** Le O vivant bouge : page visible et écran affiché (OliveActivityProvider). */
function useWebOliveActive(): boolean {
  const screen = useOliveScreenActive();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return screen && visible;
}
const [, , carBoxW] = carTop.box;
const slipDeg = (olive.slip * 180) / Math.PI;
const ms = (n: number) => `${Math.round(n)}ms`;

const useSvgId = (prefix: string) => `${prefix}${useId().replaceAll(":", "")}`;

/** La voiture vue de dessus (64 × 28, nez vers +x), peinte par Olive.css aux jetons (caisse : --car-body). */
export function CarTopArt({
  steer = 0,
  spoiler = false,
  className,
}: {
  steer?: number;
  spoiler?: boolean;
  className?: string;
}) {
  const rect = (r: { x: number; y: number; width: number; height: number; rx: number }, key?: string) => (
    <rect key={key} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />
  );
  return (
    <g className={cx("o-car", className)}>
      <g className="o-car__smoke">
        {carTop.smoke.map((s) => (
          <circle key={s.cx} cx={s.cx} cy={s.cy} r={s.r} opacity={0.12 * s.opacity} />
        ))}
      </g>
      <g className="o-car__wheel">
        {carTop.rearWheels.map((w) => rect(w, `r${w.cy}`))}
        {carTop.frontWheels.map((w) => (
          <g key={`f${w.cy}`} transform={`rotate(${steer} ${w.cx} ${w.cy})`}>
            {rect(w)}
          </g>
        ))}
      </g>
      <path className="o-car__body" d={carTop.body} />
      {spoiler && <g className="o-car__body">{rect(carTop.spoiler)}</g>}
      <path className="o-car__glass" d={carTop.glass} />
      <g className="o-car__light">{carTop.headlights.map((r) => rect(r, `h${r.y}`))}</g>
      <g className="o-car__brake">{carTop.brakeLights.map((r) => rect(r, `b${r.y}`))}</g>
    </g>
  );
}

/** La voiture du logo, de profil, penchée de 10°, vitres découpées (couleur du kit). */
function BrandCar({ id }: { id: string }) {
  return (
    <>
      <mask id={`${id}w`} maskUnits="userSpaceOnUse" x={-250} y={-50} width={500} height={200}>
        <rect x={-250} y={-50} width={500} height={200} fill="white" />
        <path
          transform={carTransform}
          d={brandArt.windowPath}
          fill="black"
          stroke="black"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </mask>
      <g mask={`url(#${id}w)`}>
        <g transform={carTransform} fill={brandArt.car}>
          {brandArt.carRects.map((r) => (
            <rect key={r.x} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} />
          ))}
        </g>
      </g>
    </>
  );
}

/** Le O (encre du thème, ou de la barre pour `dark`) et la voiture du logo dans son ouverture. */
function OArt({ id, clip = true }: { id: string; clip?: boolean }) {
  return (
    <>
      <path className="o-olive__o" transform={oTransform} d={brandArt.oPath} fillRule="evenodd" />
      {clip && (
        <clipPath id={`${id}h`}>
          <path transform={oTransform} d={brandArt.hole} />
        </clipPath>
      )}
      <g clipPath={clip ? `url(#${id}h)` : undefined}>
        <g className="o-olive__park">
          <BrandCar id={id} />
        </g>
      </g>
    </>
  );
}

const toneClass = (tone: BrandTone) => `o-olive--${tone}`;

/** Une voiture qui drifte autour du O (SMIL) : `ahead` en tour d'avance, `extra` unités de rayon en plus. */
function OrbitCar({
  ahead = 0,
  extra = 0,
  lead = true,
  units = CAR_UNITS,
}: {
  ahead?: number;
  extra?: number;
  lead?: boolean;
  units?: number;
}) {
  return (
    <g className={cx("o-olive__orbit", lead ? "o-car--lead" : "o-car--chase")}>
      <g>
        <animateMotion
          path={orbitPathD(ORBIT.radius + extra, ORBIT.squash)}
          dur={ms(olive.orbit)}
          begin={ms(-ahead * olive.orbit)}
          repeatCount="indefinite"
          rotate="auto"
        />
        <g transform={`rotate(${slipDeg}) scale(${units / carBoxW})`}>
          <CarTopArt steer={olive.steer} />
        </g>
      </g>
    </g>
  );
}

type ParkPhase = "loading" | "parking" | "parked";

/** loading → (done) parking pendant `olive.park` → parked, puis `onParked`. */
function useParkPhase(done: boolean, onParked: (() => void) | undefined, reduced: boolean): ParkPhase {
  const [phase, setPhase] = useState<ParkPhase>(done ? "parked" : "loading");
  const parked = useRef(onParked);
  parked.current = onParked;
  useEffect(() => {
    if (!done) {
      setPhase("loading");
      return;
    }
    setPhase((p) => (p === "parked" ? p : "parking"));
    const timer = setTimeout(
      () => {
        setPhase("parked");
        parked.current?.();
      },
      reduced ? 0 : olive.park,
    );
    return () => clearTimeout(timer);
  }, [done, reduced]);
  return phase;
}

export type OLoaderProps = {
  /** 72 px plein écran, 24 px dans un bouton. */
  size?: number;
  done?: boolean;
  onParked?: () => void;
  tone?: BrandTone;
  /** Avancement (0 → 1) : l'anneau moutarde autour du O se remplit (l'envoi). Absent : pas d'anneau. */
  progress?: number;
  /** Texte alternatif ; `null` : décoratif. */
  label?: string | null;
  className?: string;
};

/**
 * L'indicateur de chargement : la voiture drifte autour du O, puis se gare dedans quand `done`. Petites tailles
 * (bouton) : voiture presque moitié du O, à l'encre du O (Olive.css, `o-olive--compact`).
 */
export function OLoader({
  size = 72,
  done = false,
  onParked,
  tone = "auto",
  progress,
  label = "Chargement en cours",
  className,
}: OLoaderProps) {
  const reduced = useReducedMotion();
  const active = useWebOliveActive();
  const phase = useParkPhase(done, onParked, reduced);
  const id = useSvgId("ol");
  const compact = size <= COMPACT_MAX;
  const stage = compact ? STAGE_COMPACT : STAGE;
  const p = progress === undefined ? null : Math.max(0, Math.min(1, progress));
  return (
    <span
      className={cx("o-olive", toneClass(tone), compact && "o-olive--compact", `is-${phase}`, className)}
      {...(label ? { role: "progressbar", "aria-label": label } : { "aria-hidden": true })}
      style={{ width: size, height: size, ...(p === null ? null : { "--ring": p }) } as CSSProperties}
    >
      <svg
        width={size}
        height={size}
        viewBox={`${O_CENTER.x - stage / 2} ${O_CENTER.y - stage / 2} ${stage} ${stage}`}
        aria-hidden="true"
        focusable="false"
      >
        {p !== null && (
          <g transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}>
            <ellipse className="o-olive__ring-track" rx={RING.rx} ry={RING.ry} />
            <path className="o-olive__ring" d={RING_D} pathLength={100} />
          </g>
        )}
        <OArt id={id} />
        {!reduced && active && phase === "loading" && (
          <g transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}>
            <OrbitCar units={compact ? CAR_UNITS_COMPACT : CAR_UNITS} />
          </g>
        )}
      </svg>
    </span>
  );
}

export type OpeningBattleProps = {
  onDone?: () => void;
  /** Largeur du logotype composé, en px. */
  logoWidth?: number;
  /** Rejouer : changer la valeur relance la battle. */
  playKey?: unknown;
  className?: string;
};

type OpeningPhase = "battle" | "park" | "compose" | "done";
const ZOOM = 1.9;
const PARK_AT = olive.open - olive.park - duration.poster;
/** La voiture vue de dessus garée dans le O : sa caisse (60 unités) prend la longueur de la voiture du logo (66). */
const PARKED_SCALE = 66 / 60;
const [, , logoW, logoH] = brandArt.logoViewBox;

/** Les lettres du logotype sans le premier O, chacune découpée par le contour de la précédente (fichier de marque). */
function Letters({ id }: { id: string }) {
  const [, ...rest] = brandArt.letters;
  return (
    <>
      {brandArt.letters.slice(0, -1).map((letter, i) => (
        <mask
          key={letter.dx}
          id={`${id}m${i}`}
          maskUnits="userSpaceOnUse"
          x={-20}
          y={-20}
          width={logoW + 40}
          height={140}
        >
          <rect x={-20} y={-20} width={logoW + 40} height={140} fill="white" />
          <path
            transform={`translate(${letter.dx} 0)`}
            d={letter.d}
            fill="black"
            stroke="black"
            strokeWidth={brandArt.letterGap}
          />
        </mask>
      ))}
      <g className="o-opening__letters">
        {rest.map((letter, i) => (
          <g key={letter.dx} mask={`url(#${id}m${i})`} style={{ "--i": i } as CSSProperties}>
            <path transform={`translate(${letter.dx} 0)`} d={letter.d} />
          </g>
        ))}
      </g>
    </>
  );
}

/**
 * La battle en tandem (hero du site, ouverture) : le O agrandi, deux voitures en drift, la première se gare, le
 * logotype se compose ; `olive.open`, `onDone` à la fin.
 */
export function OpeningBattle({ onDone, logoWidth = 320, playKey, className }: OpeningBattleProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<OpeningPhase>(reduced ? "done" : "battle");
  const id = useSvgId("ob");
  const done = useRef(onDone);
  done.current = onDone;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logo = useRef<SVGSVGElement>(null);
  // Rejouer : l'horloge SMIL repart de zéro avec les minuteries (la voiture de tête se gare d'où elle est vraiment).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` remet l'horloge à zéro
  useLayoutEffect(() => {
    logo.current?.setCurrentTime?.(0);
  }, [playKey]);
  const clear = () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue la battle
  useEffect(() => {
    clear();
    if (reduced) {
      setPhase("done");
      timers.current = [setTimeout(() => done.current?.(), 0)];
      return clear;
    }
    setPhase("battle");
    timers.current = [
      setTimeout(() => setPhase("park"), PARK_AT),
      setTimeout(() => setPhase("compose"), PARK_AT + olive.park),
      setTimeout(() => {
        setPhase("done");
        done.current?.();
      }, olive.open),
    ];
    return clear;
  }, [reduced, playKey]);
  // Un clic (ou Entrée) passe l'ouverture : état final, puis `onDone`.
  const skip = () => {
    if (phase === "done") return;
    clear();
    setPhase("done");
    timers.current = [setTimeout(() => done.current?.(), duration.fast)];
  };
  const dx = logoWidth * (0.5 - O_CENTER.x / logoW);
  const height = (logoWidth * logoH) / logoW;
  // La voiture de tête au moment de se garer (tour connu : SMIL et minuterie partent ensemble), puis dans le O.
  const lead = driftOrbit(PARK_AT / olive.orbit + olive.tandemGap, ORBIT.radius, ORBIT.squash);
  const fromDeg = (Math.atan2(Math.sin(lead.heading), Math.cos(lead.heading)) * 180) / Math.PI;
  return (
    <button
      type="button"
      className={cx("o-opening", `is-${phase}`, className)}
      aria-label="Orasso"
      title={phase === "done" ? undefined : "Passer"}
      onClick={skip}
      style={
        {
          width: logoWidth,
          height,
          "--o-dx": `${dx}px`,
          "--o-zoom": ZOOM,
          "--park-x": `${lead.x}px`,
          "--park-y": `${lead.y}px`,
          "--park-a": `${fromDeg}deg`,
          "--park-s0": CAR_UNITS / carBoxW,
          "--park-s1": PARKED_SCALE,
        } as CSSProperties
      }
    >
      <svg
        ref={logo}
        className="o-opening__logo"
        width={logoWidth}
        height={height}
        viewBox={brandArt.logoViewBox.join(" ")}
        aria-hidden="true"
        focusable="false"
      >
        <Letters id={id} />
        <OArt id={id} />
        {!reduced && (phase === "battle" || phase === "park") && (
          <g
            key={String(playKey ?? "")}
            className="o-opening__cars"
            transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}
          >
            <OrbitCar ahead={0} extra={8} lead={false} />
            {phase === "battle" && <OrbitCar ahead={olive.tandemGap} />}
          </g>
        )}
        {!reduced && phase === "park" && (
          <g transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}>
            <g className="o-opening__parker o-car--lead">
              <CarTopArt />
            </g>
          </g>
        )}
      </svg>
    </button>
  );
}

export type SendProgressProps = { progress: number; onParked?: () => void; size?: number; className?: string };

/**
 * L'envoi (décision de Damien, prototype v39) : la voiture drifte autour du O, l'anneau moutarde se remplit avec le
 * pourcentage, puis à 100 % l'anneau se ferme et la voiture se gare dans le O.
 */
export function SendProgress({ progress, onParked, size = 96, className }: SendProgressProps) {
  const reduced = useReducedMotion();
  const p = Math.max(0, Math.min(1, progress));
  const [complete, setComplete] = useState(p >= 1);
  useEffect(() => {
    if (p < 1) {
      setComplete(false);
      return;
    }
    // L'anneau finit de se remplir (`base`) avant que la voiture se gare.
    const timer = setTimeout(() => setComplete(true), reduced ? 0 : duration.base);
    return () => clearTimeout(timer);
  }, [p, reduced]);
  return (
    <div
      className={cx("o-send", className)}
      role="progressbar"
      aria-label="Envoi en cours"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
    >
      <OLoader size={size} progress={p} done={complete} onParked={onParked} label={null} />
    </div>
  );
}

export type SendBurstProps = { onDone?: () => void; size?: number; playKey?: unknown; className?: string };

/** Candidature envoyée : un tour de drift, la voiture se gare, le O s'allume. */
export function SendBurst({ onDone, size = 120, playKey, className }: SendBurstProps) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(reduced);
  const [lit, setLit] = useState(false);
  const finish = useRef(onDone);
  finish.current = onDone;
  const after = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (after.current) clearTimeout(after.current);
    },
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue l'envoi
  useEffect(() => {
    setLit(false);
    setDone(reduced);
    if (reduced) return;
    const timer = setTimeout(() => setDone(true), olive.orbit);
    return () => clearTimeout(timer);
  }, [reduced, playKey]);
  return (
    <span className={cx("o-burst", lit && "is-lit", className)}>
      <OLoader
        key={String(playKey ?? "")}
        size={size}
        done={done}
        label="Candidature envoyée"
        onParked={() => {
          setLit(true);
          if (after.current) clearTimeout(after.current);
          after.current = setTimeout(() => finish.current?.(), reduced ? 0 : duration.poster);
        }}
      />
    </span>
  );
}

export type EmptyStateProps = {
  title: string;
  text?: string;
  action?: ReactNode;
  width?: number;
  playKey?: unknown;
  className?: string;
};

const SPOT = "M60 33h38a12 12 0 0 1 12 12v10a12 12 0 0 1-12 12H60a12 12 0 0 1-12-12V45a12 12 0 0 1 12-12z";

/** Liste vide : la place libre en pointillés dans le O, la voiture attend dehors. */
export function EmptyState({ title, text, action, width = 180, playKey, className }: EmptyStateProps) {
  const id = useSvgId("es");
  return (
    <div className={cx("o-empty", className)}>
      <svg
        key={String(playKey ?? "")}
        className="o-olive o-olive--auto o-empty__art"
        width={width}
        viewBox="-95 -25 237 150"
        aria-hidden="true"
        focusable="false"
      >
        <path className="o-olive__o" transform={oTransform} d={brandArt.oPath} fillRule="evenodd" />
        <path className="o-empty__spot" transform={carTransform} d={SPOT} />
        <g className="o-empty__car">
          <BrandCar id={id} />
        </g>
      </svg>
      <div className="o-empty__text">
        <p className="o-t-title o-empty__title">{title}</p>
        {text ? <p className="o-t-body o-empty__body">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}

export type StampShape = "o" | "round" | "square";
export type StampDropProps = {
  ink?: string;
  shape?: StampShape;
  seed?: number;
  size?: number;
  onDone?: () => void;
  playKey?: unknown;
  className?: string;
};

/** Le tampon du passeport : le O frappe la page, l'encre bave un peu. Même graine, même tampon. */
export function StampDrop({ ink, shape = "round", seed = 1, size = 96, onDone, playKey, className }: StampDropProps) {
  const reduced = useReducedMotion();
  const random = seededRandom(seed);
  const jitter = (random() - 0.5) * 8;
  const bleed = { x: (random() - 0.5) * 3, y: (random() - 0.5) * 3, s: 1.03 + random() * 0.03 };
  const finish = useRef(onDone);
  finish.current = onDone;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue le tampon
  useEffect(() => {
    const timer = setTimeout(() => finish.current?.(), reduced ? 0 : duration.poster);
    return () => clearTimeout(timer);
  }, [reduced, playKey]);
  const art = (
    <>
      {shape === "round" && <circle cx={67.7} cy={50} r={92} className="o-stamp__ring" />}
      {shape === "square" && <rect x={-22} y={-34} width={180} height={168} rx={26} className="o-stamp__ring" />}
      <path transform={oTransform} d={brandArt.oPath} fillRule="evenodd" />
    </>
  );
  return (
    <span
      key={String(playKey ?? "")}
      className={cx("o-stamp-drop", className)}
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          "--stamp-ink": ink ?? "var(--stamp-ink-default)",
          "--stamp-angle": `${-8 + jitter}deg`,
          "--bleed-x": `${bleed.x}px`,
          "--bleed-y": `${bleed.y}px`,
          "--bleed-s": bleed.s,
        } as CSSProperties
      }
    >
      <svg viewBox="-30 -50 200 200" width={size} height={size} aria-hidden="true" focusable="false">
        <g className="o-stamp-drop__bleed">{art}</g>
        <g>{art}</g>
      </svg>
    </span>
  );
}

export type CenterTabOProps = { active: boolean; size?: number; tone?: BrandTone };

/** Le O de l'onglet central : voiture garée sur l'onglet actif, sortie ailleurs. */
export function CenterTabO({ active, size = 30, tone = "dark" }: CenterTabOProps) {
  const id = useSvgId("ct");
  const first = useRef(true);
  const [moved, setMoved] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque changement d'onglet (pas le premier rendu) anime
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setMoved(true);
  }, [active]);
  return (
    <span
      className={cx("o-olive", toneClass(tone), "o-center-o", active ? "is-parked" : "is-out", moved && "is-moved")}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={brandArt.viewBox.join(" ")} aria-hidden="true" focusable="false">
        <OArt id={id} />
      </svg>
    </span>
  );
}

// --- Moteur canvas commun (lot C8) -----------------------------------------------------------------------------

/** L'élément est à l'écran (IntersectionObserver ; sans lui, toujours vrai). */
function useInView(ref: { current: Element | null }): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setInView(entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** L'onglet est visible (`visibilitychange`). */
function useDocVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** Couleurs lues sur l'hôte (thème courant) et dégradé de fumée pré-rendu, refait seulement si la couleur change. */
class Paint {
  ink = "";
  accent = "";
  night = "";
  smoke = "";
  sprite: HTMLCanvasElement | null = null;
  private at = -1;
  read(el: Element, t: number, ink?: string): void {
    if (this.at >= 0 && t - this.at < 0.5) return;
    this.at = t;
    this.ink = ink ?? cssColor(el, "--ink", this.ink);
    this.accent = cssColor(el, "--accent", this.accent);
    this.night = cssColor(el, "--night", this.night);
    const s = cssColor(el, "--ink-muted", this.smoke);
    if (s && (s !== this.smoke || !this.sprite)) {
      this.smoke = s;
      this.sprite = smokeSprite(s);
    }
  }
  reset(): void {
    this.at = -1;
  }
}

// --- Le O vivant du hero (artefact : `liveO`, classe `Drift`) ---------------------------------------------------

const LIVE = olive.live;
/** Orbite de l'artefact, en unités du O (le O fait 135,3 unités de large, 150 avec sa marge de viewBox). */
const LIVE_ORBIT = { rx: 92, ry: 72 };
const LIVE_UNITS = 150;
const TRAIL = 34;
const TAU = Math.PI * 2;
type LiveCar = { off: number; b: number; dr: number; lead: boolean };
const LIVE_CARS: Record<"drift" | "tandem", LiveCar[]> = {
  drift: [{ off: 0, b: 0.66, dr: 0, lead: true }],
  tandem: [
    { off: 0, b: 0.62, dr: 0, lead: true },
    { off: -1, b: 0.78, dr: 8, lead: false },
  ],
};

/** État du moteur du O vivant : horloge propre (en pause hors écran), cycle course → sortie → pause. */
class LiveEngine {
  T = 0;
  th = Math.PI / 2;
  phase: "loop" | "exit" | "rest" = "loop";
  loopAt = 0;
  exitAt: number | null = null;
  fade = [1, 1];
  trails: Float32Array[] = [0, 1, 2, 3].map(() => new Float32Array(TRAIL * 2));
  trailLen = [0, 0, 0, 0];
  emit = [0, 0, 0, 0];
  pool: SmokePool;
  paint = new Paint();
  cx = 0;
  cy = 0;
  w = 0;
  h = 0;
  constructor(
    readonly mode: "drift" | "tandem",
    readonly k: number,
    cap: number,
    readonly random: () => number = Math.random,
  ) {
    this.pool = new SmokePool(cap);
  }

  start(): void {
    this.phase = "loop";
    this.loopAt = this.T;
    this.th = Math.PI / 2;
    this.exitAt = null;
    this.fade = [1, 1];
    this.trailLen = [0, 0, 0, 0];
    this.pool.clear();
  }

  /** Une image : avance de `dt` s et peint. Renvoie vrai quand il ne reste rien à peindre (pause entre deux tours). */
  frame(ctx: CanvasRenderingContext2D, dt: number, u: number, onPark: () => void): boolean {
    const spec = smoke.orbit;
    const { k, random } = this;
    this.T += dt;
    if (this.phase === "loop" && this.T - this.loopAt >= LIVE.run / 1000) this.phase = "exit";
    this.th += (TAU / (LIVE.lap / 1000)) * dt;
    const cars = LIVE_CARS[this.mode];
    // Fumée : elle avance avant les nouvelles bouffées (artefact).
    this.pool.step(dt, spec.grow * u * k, spec.life / 1000);
    const { rate, boost } = smokeRate(ARTIFACT_RATE.orbit, spec, this.pool.cap, cars.length * 2);
    const sprite = this.paint.sprite;
    if (sprite) this.pool.draw(ctx, sprite, spec.alpha * Math.sqrt(boost));
    // Traces : 34 derniers points par roue, opacité croissante vers la voiture.
    ctx.lineCap = "round";
    ctx.strokeStyle = this.paint.ink;
    ctx.lineWidth = Math.max(1, 2.2 * u);
    for (let t = 0; t < 4; t++) drawTrail(ctx, this.trails[t] as Float32Array, this.trailLen[t] ?? 0);
    const ms = this.T * 1000;
    const L = 34 * u * k;
    const W = 17 * u * k;
    cars.forEach((car, ci) => {
      const off = car.lead ? car.off : car.off - 0.12 * Math.sin(ms / 400);
      const th = this.th + off;
      const R1 = LIVE_ORBIT.rx + car.dr;
      const R2 = LIVE_ORBIT.ry + car.dr;
      const x = this.cx + R1 * Math.cos(th) * u;
      const y = this.cy + R2 * Math.sin(th) * u;
      const hd = Math.atan2(R2 * Math.cos(th), -R1 * Math.sin(th)) + car.b + 0.12 * Math.sin(ms / 260 + ci);
      if (this.phase !== "loop") {
        if (car.lead) {
          const ang = ((th % TAU) + TAU) % TAU;
          if (this.exitAt === null && ang > Math.PI * 0.92 && ang < Math.PI * 1.1) {
            this.exitAt = this.T;
            onPark();
          }
          if (this.exitAt !== null) this.fade[0] = Math.max(0, 1 - (this.T - this.exitAt) / 0.18);
        } else if (this.exitAt !== null) this.fade[1] = Math.max(0, (this.fade[1] ?? 0) - dt * 2.2);
      }
      const a = this.fade[ci] ?? 0;
      if (a <= 0) return;
      for (let wi = 0; wi < 2; wi++) {
        const [wx, wy] = rearWheel(x, y, hd, wi ? 1 : -1, L, W, spec);
        if (a > 0.5) {
          const slot = ci * 2 + wi;
          this.emit[slot] = (this.emit[slot] ?? 0) + rate * dt;
          while ((this.emit[slot] ?? 0) >= 1) {
            this.emit[slot] = (this.emit[slot] ?? 0) - 1;
            this.pool.spawn(
              wx,
              wy,
              (-Math.cos(hd) * spec.speed + (random() - 0.5) * spec.spread) * u,
              (-Math.sin(hd) * spec.speed + (random() - 0.5) * spec.spread) * u,
              spec.radius * u * k * boost,
            );
          }
          pushTrail(this, slot, wx, wy);
        }
      }
      drawCar(
        ctx,
        { x, y, heading: hd, color: car.lead ? this.paint.accent : this.paint.ink, night: this.paint.night },
        L,
        W,
        0.35,
        u,
        a,
      );
    });
    const done = this.phase !== "loop" && this.fade.every((f) => f <= 0) && this.pool.n === 0;
    if (done) this.phase = "rest";
    return done;
  }
}

function pushTrail(e: LiveEngine, slot: number, x: number, y: number): void {
  const tr = e.trails[slot] as Float32Array;
  let n = e.trailLen[slot] ?? 0;
  if (n >= TRAIL) {
    tr.copyWithin(0, 2);
    n = TRAIL - 1;
  }
  tr[n * 2] = x;
  tr[n * 2 + 1] = y;
  e.trailLen[slot] = n + 1;
}

/** Une trace : segment i à l'opacité (i / n) × 0,16 (artefact), regroupés en quatre tranches. */
function drawTrail(ctx: CanvasRenderingContext2D, tr: Float32Array, n: number): void {
  const bands = 4;
  for (let b = 0; b < bands; b++) {
    const from = Math.max(1, Math.floor((b / bands) * n));
    const to = Math.floor(((b + 1) / bands) * n);
    if (to <= from) continue;
    ctx.globalAlpha = ((from + to) / 2 / n) * 0.16;
    ctx.beginPath();
    ctx.moveTo(tr[(from - 1) * 2] ?? 0, tr[(from - 1) * 2 + 1] ?? 0);
    for (let i = from; i < to; i++) ctx.lineTo(tr[i * 2] ?? 0, tr[i * 2 + 1] ?? 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export type LiveOProps = {
  /** Largeur du O, en px (artefact : 170 dans le hero du site). */
  size?: number;
  /** `tandem` : deux voitures, l'une chasse l'autre ; `drift` : une seule. */
  mode?: "drift" | "tandem";
  /** Échelle des voitures et de la fumée (artefact : 0,9). */
  scale?: number;
  className?: string;
};

/**
 * Le O vivant du hero (artefact `liveO`) : battle en tandem autour du O pendant `olive.live.run`, avec fumée et
 * traces en canvas, puis la voiture du logo se gare ; `olive.live.rest` de pause et ça repart. L'hôte remplit son conteneur (la toile
 * le couvre, le O est centré dessus). Arrêté hors de l'écran et onglet caché ; mouvement réduit : une image figée.
 */
export function LiveO({ size = 170, mode = "tandem", scale = 0.9, className }: LiveOProps) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const oEl = useRef<HTMLSpanElement>(null);
  const engine = useRef<LiveEngine | null>(null);
  const [parked, setParked] = useState(false);
  const inView = useInView(host);
  const visible = useDocVisible();
  const screen = useOliveScreenActive();
  const id = useSvgId("lo");
  const running = !reduced && inView && visible && screen;

  useEffect(() => {
    const cv = canvas.current;
    const el = host.current;
    const o = oEl.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !el || !o || !ctx) return;
    const u = size / LIVE_UNITS;
    const measure = (e: LiveEngine) => {
      const hr = el.getBoundingClientRect();
      const or = o.getBoundingClientRect();
      e.w = hr.width;
      e.h = hr.height;
      e.cx = or.left + or.width / 2 - hr.left;
      e.cy = or.top + or.height / 2 - hr.top;
    };
    const begin = (e: LiveEngine) => {
      const d = fitCanvas(cv, e.w, e.h);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, e.w, e.h);
    };

    if (reduced) {
      // Mouvement réduit : la battle figée après 53 images (fumée et voitures immobiles), tirage déterministe.
      const e = new LiveEngine(mode, scale, smokeCap(), seededRandom(7));
      measure(e);
      e.paint.read(o, 0, getComputedStyle(o).color);
      setParked(false);
      begin(e);
      for (let i = 0; i < 53; i++) {
        ctx.clearRect(0, 0, e.w, e.h);
        e.frame(ctx, 1 / 60, u, () => {});
      }
      engine.current = null;
      return;
    }
    if (!running) return;

    let e = engine.current;
    if (!e || e.mode !== mode || e.k !== scale) {
      e = new LiveEngine(mode, scale, smokeCap());
      engine.current = e;
      e.start();
      setParked(false);
    }
    const eng = e;
    measure(eng);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure(eng));
    ro?.observe(el);
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      eng.paint.read(o, eng.T, getComputedStyle(o).color);
      begin(eng);
      const idle = eng.frame(ctx, dt, u, () => setParked(true));
      if (!idle) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Rien à peindre : pause (setTimeout, pas d'image) jusqu'au tour suivant.
      ctx.clearRect(0, 0, eng.w, eng.h);
      const wait = Math.max(0, (eng.exitAt ?? eng.T) + (LIVE.settle + LIVE.rest) / 1000 - eng.T);
      timer = setTimeout(() => {
        eng.T += wait;
        eng.start();
        setParked(false);
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }, wait * 1000);
    };
    if (eng.phase === "rest") {
      eng.phase = "loop";
      eng.start();
      setParked(false);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      ro?.disconnect();
    };
  }, [running, reduced, mode, scale, size]);

  return (
    <div ref={host} className={cx("o-live", className)} aria-hidden="true">
      <canvas ref={canvas} className="o-live__fx" />
      <span
        ref={oEl}
        className={cx("o-olive o-olive--auto o-live__o", parked || reduced ? "is-parked" : "is-out")}
        style={
          {
            width: size,
            height: size,
            "--live-out": ms(LIVE.out),
            "--live-park": ms(LIVE.parkIn),
          } as CSSProperties
        }
      >
        <svg width={size} height={size} viewBox={brandArt.viewBox.join(" ")} aria-hidden="true" focusable="false">
          <OArt id={id} />
        </svg>
      </span>
    </div>
  );
}

// --- Le fond « battle » (artefact : moteur du fond, mode `battle`) ------------------------------------------------

const between = (random: () => number, [a, b]: readonly [number, number]) => a + random() * (b - a);
/** Traces du fond : sept secondes de vie, opacité 0,3 (artefact), plafond de segments selon l'appareil. */
const MARK_LIFE = 7;
const MARK_ALPHA = 0.3;
/** Une trace se dépose quand la dérive dépasse 20 % du plein (artefact `slip > .2`, plein à 0,45 rad). */
const MARK_SLIP = 0.2 * 0.45;

type PackRun = {
  path: BattlePath;
  cars: (PackCar & { lead: boolean; px: number; py: number; qx: number; qy: number; on: boolean })[];
  speed: number;
  at: number;
  end: number;
};

class BattleEngine {
  T = 0;
  pack: PackRun | null = null;
  nextAt = battle.firstDelay / 1000;
  pool: SmokePool;
  marks: MarkRing;
  paint = new Paint();
  emit: number[] = [];
  w = 0;
  h = 0;
  onScreen = 0;
  constructor(cap: number) {
    this.pool = new SmokePool(cap);
    this.marks = new MarkRing(cap * 6);
  }

  spawn(): void {
    const seed = Math.floor(Math.random() * 2147483647);
    const random = seededRandom(seed ^ 0x5bd1e995);
    if (this.w < 10 || this.h < 10) {
      this.nextAt = this.T + 0.5;
      return;
    }
    const path = battlePath(seed, this.w, this.h);
    const train = random() < battle.trainChance;
    const cars = tandem(path, train ? battle.spacing.train : battle.spacing.pair, train ? 3 : 2).map((c, i) => ({
      ...c,
      // Artefact : la première moutarde, puis encre et moutarde en alternance.
      lead: i === 0 || i % 2 === 0,
      px: Number.NaN,
      py: Number.NaN,
      qx: Number.NaN,
      qy: Number.NaN,
      on: false,
    }));
    const speed = between(random, battle.speed);
    const lag = cars.reduce((m, c) => Math.max(m, c.lag), 0);
    this.pack = { path, cars, speed, at: this.T, end: this.T + (path.length + lag) / speed };
    this.emit = cars.flatMap(() => [0, 0]);
  }

  /** Une image. Renvoie vrai quand plus rien n'est à peindre (entre deux meutes). */
  frame(ctx: CanvasRenderingContext2D, dt: number): boolean {
    const spec = smoke.battle;
    this.T += dt;
    if (!this.pack && this.T >= this.nextAt) this.spawn();
    ctx.lineCap = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.paint.ink;
    this.marks.draw(ctx, dt, MARK_LIFE, MARK_ALPHA);
    this.pool.step(dt, spec.grow, spec.life / 1000);
    const pack = this.pack;
    const wheels = Math.max(2, this.onScreen * 2);
    const { rate, boost } = smokeRate(ARTIFACT_RATE.battle, spec, this.pool.cap, wheels);
    const sprite = this.paint.sprite;
    if (sprite) this.pool.draw(ctx, sprite, spec.alpha * Math.sqrt(boost));
    let on = 0;
    if (pack) {
      const L = battle.carLength;
      const W = battle.carWidth;
      pack.cars.forEach((car, ci) => {
        const s = (this.T - pack.at) * pack.speed - car.lag;
        car.on = s >= 0 && s <= pack.path.length;
        if (!car.on) return;
        on++;
        const pose = poseAt(pack.path, s, car.side);
        const slip = Math.abs(pose.slip);
        for (let wi = 0; wi < 2; wi++) {
          const [wx, wy] = rearWheel(pose.x, pose.y, pose.heading, wi ? 1 : -1, L, W, spec);
          const slot = ci * 2 + wi;
          if (slip > spec.minSlip) {
            this.emit[slot] = (this.emit[slot] ?? 0) + rate * dt;
            while ((this.emit[slot] ?? 0) >= 1) {
              this.emit[slot] = (this.emit[slot] ?? 0) - 1;
              this.pool.spawn(
                wx,
                wy,
                -Math.cos(pose.heading) * spec.speed + (Math.random() - 0.5) * spec.spread,
                -Math.sin(pose.heading) * spec.speed + (Math.random() - 0.5) * spec.spread,
                spec.radius * boost,
              );
            }
          }
          const px = wi ? car.qx : car.px;
          const py = wi ? car.qy : car.py;
          if (slip > MARK_SLIP && !Number.isNaN(px)) this.marks.push(px, py, wx, wy);
          if (wi) {
            car.qx = wx;
            car.qy = wy;
          } else {
            car.px = wx;
            car.py = wy;
          }
        }
        drawCar(
          ctx,
          { ...pose, color: car.lead ? this.paint.accent : this.paint.ink, night: this.paint.night },
          L,
          W,
          0.3,
          1,
        );
      });
      if (this.T >= pack.end) {
        this.pack = null;
        this.nextAt = this.T + between(Math.random, battle.gap) / 1000;
      }
    }
    this.onScreen = on;
    return !this.pack && this.pool.n === 0 && this.marks.n === 0;
  }
}

/**
 * Le fond « battle » (artefact) : une meute de deux voitures (parfois un train de trois) toutes les `battle.gap`, avec
 * la fumée et les traces de pneus, en canvas. Entre deux meutes, plus rien n'est peint (minuterie, pas d'image).
 * Arrêté hors de l'écran, onglet caché, feuille ouverte (GroundQuiet), avec `still` ou la réduction des animations.
 */
export function BattleLayer({ still = false }: { still?: boolean }) {
  const reduced = useReducedMotion();
  const quiet = useIsGroundQuiet();
  const screen = useOliveScreenActive();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<BattleEngine | null>(null);
  const inView = useInView(host);
  const visible = useDocVisible();
  const live = !still && !reduced && !quiet && screen;
  const running = live && inView && visible;

  useEffect(() => {
    if (!live) engine.current = null;
  }, [live]);

  useEffect(() => {
    const cv = canvas.current;
    const el = host.current;
    const ctx = cv?.getContext("2d");
    if (!running || !cv || !el || !ctx) return;
    if (!engine.current) engine.current = new BattleEngine(smokeCap());
    const eng = engine.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      eng.w = r.width;
      eng.h = r.height;
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    let shown = -1;
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      eng.paint.read(el, eng.T);
      const d = fitCanvas(cv, eng.w, eng.h);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, eng.w, eng.h);
      const idle = eng.frame(ctx, dt);
      if (eng.onScreen !== shown) {
        shown = eng.onScreen;
        el.dataset.cars = String(shown);
      }
      if (!idle) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const wait = Math.max(0, eng.nextAt - eng.T);
      timer = setTimeout(() => {
        eng.T = eng.nextAt;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }, wait * 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      ro?.disconnect();
    };
  }, [running]);

  return (
    <div ref={host} className="o-ground__battle" aria-hidden="true" data-cars="0">
      {live && <canvas ref={canvas} />}
    </div>
  );
}
