// Le O vivant, version site (lot 39) : mêmes noms et même rôle que src/native/olive (OpeningBattle, OLoader,
// SendProgress, SendBurst, EmptyState, StampDrop, CenterTabO) et les meutes du fond « battle » (BattleLayer, posé par
// Ground). SVG animé : SMIL (animateMotion) pour le drift le long d'une trajectoire, CSS (Olive.css) pour le reste.
// La géométrie vient du même module que le natif (native/olive/path.ts, brandArt.carTop) : même tracé des deux côtés.
// Réduction des animations : pas de drift ni de meute ; la voiture est garée et tout apparaît en fondu `fast`.

import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { battle, duration, olive } from "../../motion";
import { brandArt } from "../../native/brandArt";
import {
  type BattlePath,
  battleDuration,
  battlePath,
  battlePathD,
  orbitPathD,
  type PackCar,
  seededRandom,
  slipSamples,
  tandem,
} from "../../native/olive/path";
import { useIsGroundQuiet } from "../../native/olive/quiet";
import { useReducedMotion } from "../theme";
import type { BrandTone } from "./Brand";
import { cx } from "./cx";

const { carTop, carSkew } = brandArt;
const oTransform = `translate(${brandArt.oOffset} 0)`;
const carTransform = `translate(${brandArt.oOffset} 0) translate(${carSkew.cx} ${carSkew.cy}) skewX(${carSkew.angle}) translate(${-carSkew.cx} ${-carSkew.cy})`;
const [monoX, monoY, monoW] = brandArt.viewBox;
const O_CENTER = { x: monoX + monoW / 2, y: monoY + monoW / 2 };
const ORBIT = { radius: 92, squash: 0.78 };
const CAR_UNITS = 30;
const STAGE = 260;
const STAGE_COMPACT = 200;
const [, , carBoxW] = carTop.box;
const slipDeg = (olive.slip * 180) / Math.PI;
const ms = (n: number) => `${Math.round(n)}ms`;

const useSvgId = (prefix: string) => `${prefix}${useId().replaceAll(":", "")}`;

/** La voiture vue de dessus (64 × 28, nez vers +x), peinte par Olive.css aux jetons (caisse : --car-body). */
export function CarTopArt({ steer = 0, spoiler = false, className }: { steer?: number; spoiler?: boolean; className?: string }) {
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
function OrbitCar({ ahead = 0, extra = 0, lead = true }: { ahead?: number; extra?: number; lead?: boolean }) {
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
        <g transform={`rotate(${slipDeg}) scale(${CAR_UNITS / carBoxW})`}>
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
  /** Texte alternatif ; `null` : décoratif. */
  label?: string | null;
  className?: string;
};

/** L'indicateur de chargement : la voiture drifte autour du O, puis se gare dedans quand `done`. */
export function OLoader({
  size = 72,
  done = false,
  onParked,
  tone = "auto",
  label = "Chargement en cours",
  className,
}: OLoaderProps) {
  const reduced = useReducedMotion();
  const phase = useParkPhase(done, onParked, reduced);
  const id = useSvgId("ol");
  const stage = size <= 32 ? STAGE_COMPACT : STAGE;
  return (
    <span
      className={cx("o-olive", toneClass(tone), `is-${phase}`, className)}
      role={label ? "progressbar" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`${O_CENTER.x - stage / 2} ${O_CENTER.y - stage / 2} ${stage} ${stage}`}
        aria-hidden="true"
        focusable="false"
      >
        <OArt id={id} />
        {!reduced && phase === "loading" && (
          <g transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}>
            <OrbitCar />
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
const [, , logoW, logoH] = brandArt.logoViewBox;

/** Les lettres du logotype sans le premier O, chacune découpée par le contour de la précédente (fichier de marque). */
function Letters({ id }: { id: string }) {
  const [, ...rest] = brandArt.letters;
  return (
    <>
      {brandArt.letters.slice(0, -1).map((letter, i) => (
        <mask key={letter.dx} id={`${id}m${i}`} maskUnits="userSpaceOnUse" x={-20} y={-20} width={logoW + 40} height={140}>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `playKey` rejoue la battle
  useEffect(() => {
    if (reduced) {
      setPhase("done");
      const timer = setTimeout(() => done.current?.(), 0);
      return () => clearTimeout(timer);
    }
    setPhase("battle");
    const timers = [
      setTimeout(() => setPhase("park"), PARK_AT),
      setTimeout(() => setPhase("compose"), PARK_AT + olive.park),
      setTimeout(() => {
        setPhase("done");
        done.current?.();
      }, olive.open),
    ];
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [reduced, playKey]);
  const dx = logoWidth * (0.5 - O_CENTER.x / logoW);
  const height = (logoWidth * logoH) / logoW;
  return (
    <span
      className={cx("o-opening", `is-${phase}`, className)}
      role="img"
      aria-label="Orasso"
      style={{ width: logoWidth, height, "--o-dx": `${dx}px`, "--o-zoom": ZOOM } as CSSProperties}
    >
      <svg
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
          <g key={String(playKey ?? "")} className="o-opening__cars" transform={`translate(${O_CENTER.x} ${O_CENTER.y})`}>
            <OrbitCar ahead={0} extra={8} lead={false} />
            <OrbitCar ahead={olive.tandemGap} />
          </g>
        )}
      </svg>
    </span>
  );
}

export type SendProgressProps = { progress: number; onParked?: () => void; className?: string };

/** L'envoi : la voiture avance sur la route au rythme de l'envoi, se gare dans le O à 100 %. */
export function SendProgress({ progress, onParked, className }: SendProgressProps) {
  const reduced = useReducedMotion();
  const p = Math.max(0, Math.min(1, progress));
  const [complete, setComplete] = useState(p >= 1);
  useEffect(() => {
    if (p < 1) {
      setComplete(false);
      return;
    }
    const timer = setTimeout(() => setComplete(true), reduced ? 0 : duration.base);
    return () => clearTimeout(timer);
  }, [p, reduced]);
  const phase = useParkPhase(complete, onParked, reduced);
  const id = useSvgId("sp");
  return (
    <div
      className={cx("o-send", `is-${phase}`, className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      style={{ "--p": p } as CSSProperties}
    >
      <div className="o-send__track">
        <i className="o-send__road" />
        <i className="o-send__done" />
        {!reduced && (
          <svg className="o-send__car" viewBox={carTop.viewBox.join(" ")} aria-hidden="true" focusable="false">
            <g className="o-car--lead">
              <CarTopArt />
            </g>
          </svg>
        )}
      </div>
      <span className="o-olive o-olive--auto o-send__o">
        <svg viewBox={brandArt.viewBox.join(" ")} aria-hidden="true" focusable="false">
          <OArt id={id} />
        </svg>
      </span>
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
          setTimeout(() => finish.current?.(), reduced ? 0 : duration.poster);
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
      <svg viewBox="-30 -50 200 200" width={size} height={size} focusable="false">
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

// --- Le fond « battle » -----------------------------------------------------------------------------------------

type Pack = { key: number; path: BattlePath; d: string; cars: PackCar[]; speed: number; w: number; h: number };
const between = (random: () => number, [a, b]: readonly [number, number]) => a + random() * (b - a);
const SLIP_SAMPLES = 24;

/** Une voiture de la meute : animateMotion le long de la trajectoire, dérive échantillonnée. */
function PackCarArt({ pack, car, index }: { pack: Pack; car: PackCar; index: number }) {
  const total = pack.path.length / pack.speed;
  const begin = `${(car.lag / pack.speed).toFixed(3)}s`;
  const slips = slipSamples(pack.path, SLIP_SAMPLES);
  const times = slips.map((_, i) => (i / (SLIP_SAMPLES - 1)).toFixed(3)).join(";");
  return (
    <g className={cx("o-ground__car", index === 0 || index === 2 ? "o-car--lead" : "o-car--chase")} visibility="hidden">
      <set attributeName="visibility" to="visible" begin={begin} />
      <animateMotion path={pack.d} dur={`${total.toFixed(3)}s`} begin={begin} rotate="auto" fill="freeze" />
      <g transform={`translate(0 ${car.side}) scale(${battle.carLength / carBoxW})`}>
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={slips.join(";")}
            keyTimes={times}
            dur={`${total.toFixed(3)}s`}
            begin={begin}
            fill="freeze"
          />
          <CarTopArt />
        </g>
      </g>
    </g>
  );
}

/**
 * Les meutes du fond « battle » : une paire (parfois un train de trois) toutes les `battle.gap`. Entre deux meutes, rien
 * n'est animé. Arrêtées quand la page est cachée, qu'une feuille est ouverte (GroundQuiet), avec `still` ou la
 * réduction des animations.
 */
export function BattleLayer({ still = false }: { still?: boolean }) {
  const reduced = useReducedMotion();
  const quiet = useIsGroundQuiet();
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(true);
  const [pack, setPack] = useState<Pack | null>(null);
  const running = !still && !reduced && !quiet && visible;

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    if (!running) {
      setPack(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let key = 0;
    const spawn = () => {
      const box = host.current?.getBoundingClientRect();
      const seed = Math.floor(Math.random() * 2147483647);
      const random = seededRandom(seed ^ 0x5bd1e995);
      if (!box || box.width < 10 || box.height < 10) {
        timer = setTimeout(spawn, between(random, battle.gap));
        return;
      }
      const path = battlePath(seed, box.width, box.height);
      const train = random() < battle.trainChance;
      const cars = tandem(path, train ? battle.spacing.train : battle.spacing.pair, train ? 3 : 2);
      const speed = between(random, battle.speed);
      key++;
      setPack({ key, path, d: battlePathD(path), cars, speed, w: box.width, h: box.height });
      timer = setTimeout(() => {
        setPack(null);
        timer = setTimeout(spawn, between(random, battle.gap));
      }, battleDuration(path, cars, speed));
    };
    timer = setTimeout(spawn, battle.firstDelay);
    return () => {
      if (timer) clearTimeout(timer);
      setPack(null);
    };
  }, [running]);

  // Chaque meute est un nouveau <svg> : on remet son horloge SMIL à zéro (sinon il hérite du temps du document).
  useLayoutEffect(() => {
    if (pack) svg.current?.setCurrentTime?.(0);
  }, [pack]);

  return (
    <div ref={host} className="o-ground__battle" aria-hidden="true">
      {pack && running && (
        <svg
          key={pack.key}
          ref={svg}
          width={pack.w}
          height={pack.h}
          viewBox={`0 0 ${pack.w} ${pack.h}`}
          focusable="false"
        >
          {pack.cars.map((car, i) => (
            <PackCarArt key={`${pack.key}-${car.lag}`} pack={pack} car={car} index={i} />
          ))}
        </svg>
      )}
    </div>
  );
}
