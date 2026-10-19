import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { battle, olive } from "../../motion";
import {
  battleDuration,
  battlePath,
  battlePathD,
  curvatureSign,
  driftOrbit,
  orbitPathD,
  poseAt,
  slipSamples,
  tandem,
} from "./path";

const W = 390;
const H = 844;
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);
const isOutside = (x: number, y: number, m = 0) => x < -m || x > W + m || y < -m || y > H + m;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe("driftOrbit : le drift autour du O", () => {
  it("cercle de rayon r (écrasé de squash), départ en bas, un tour pour t = 1", () => {
    const start = driftOrbit(0, 90);
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(90);
    const quarter = driftOrbit(0.25, 90, 0.8);
    expect(quarter.x).toBeCloseTo(-90);
    expect(quarter.y).toBeCloseTo(0);
    const lap = driftOrbit(1, 90, 0.8);
    expect(lap.x).toBeCloseTo(start.x);
    expect(lap.y).toBeCloseTo(0.8 * 90);
    for (let t = 0; t < 1; t += 0.05) {
      const p = driftOrbit(t, 90, 0.78);
      expect((p.x / 90) ** 2 + (p.y / (90 * 0.78)) ** 2).toBeCloseTo(1);
    }
  });
  it("le nez pointe vers l'intérieur : dérive positive, cap entre la tangente et le centre", () => {
    for (let t = 0; t < 1; t += 0.03) {
      const p = driftOrbit(t, 100);
      const next = driftOrbit(t + 0.001, 100);
      const tangent = Math.atan2(next.y - p.y, next.x - p.x);
      expect(wrap(p.heading - tangent)).toBeCloseTo(olive.slip, 2);
      expect(p.slip).toBe(olive.slip);
      // Le centre (0, 0) est du côté où le nez tourne : le produit vectoriel tangente × nez a le signe de tangente × centre.
      const toCenter = Math.atan2(-p.y, -p.x);
      expect(Math.sign(wrap(toCenter - tangent))).toBe(Math.sign(wrap(p.heading - tangent)));
    }
  });
  it("contre-braquage des roues avant de −18°", () => {
    expect((driftOrbit(0.3, 80).steer * 180) / Math.PI).toBeCloseTo(-18);
  });
  it("chemin SVG du tour : départ en bas, deux arcs", () => {
    expect(orbitPathD(90, 0.8)).toBe("M0 72A90 72 0 1 1 0 -72A90 72 0 1 1 0 72Z");
  });
});

describe("battlePath : la meute du fond", () => {
  it("déterministe par seed, différente d'une seed à l'autre", () => {
    const a = battlePath(42, W, H);
    const b = battlePath(42, W, H);
    expect(b.xs).toEqual(a.xs);
    expect(b.bs).toEqual(a.bs);
    expect(battlePath(43, W, H).xs).not.toEqual(a.xs);
  });
  it("entre hors écran et ressort hors écran", () => {
    for (const seed of SEEDS) {
      const p = battlePath(seed, W, H);
      expect(isOutside(p.xs[0] ?? 0, p.ys[0] ?? 0, 10), `seed ${seed} : entrée`).toBe(true);
      const last = p.xs.length - 1;
      expect(isOutside(p.xs[last] ?? 0, p.ys[last] ?? 0, 30), `seed ${seed} : sortie`).toBe(true);
    }
  });
  it("2 à 6 virages, gauche-droite surtout", () => {
    let alternations = 0;
    let sameWay = 0;
    for (const seed of SEEDS) {
      const p = battlePath(seed, W, H);
      // Virages = suites de courbure non nulle et de même signe avant la courbe finale.
      const turns: number[] = [];
      for (let i = 0; i < p.finalFrom; i++) {
        const k = Math.sign(p.ks[i] ?? 0);
        if (k !== 0 && (i === 0 || Math.sign(p.ks[i - 1] ?? 0) !== k || turns.length === 0)) turns.push(k);
      }
      expect(turns.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(turns.length, `seed ${seed}`).toBeLessThanOrEqual(6);
      for (let j = 1; j < turns.length; j++) {
        if (turns[j] !== turns[j - 1]) alternations++;
        else sameWay++;
      }
    }
    expect(alternations).toBeGreaterThan(sameWay);
  });
  it("jamais de ligne droite sur les 20 derniers % de la trajectoire", () => {
    for (const seed of SEEDS) {
      const p = battlePath(seed, W, H);
      const from = Math.floor(p.ks.length * 0.8);
      const straight = p.ks.slice(from).filter((k) => k === 0).length;
      expect(straight, `seed ${seed}`).toBe(0);
      expect(p.finalFrom).toBeLessThanOrEqual(from);
    }
  });
  it("la dérive a le signe de la courbure (le nez vers l'intérieur du virage)", () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const p = battlePath(seed, W, H);
      let run = 0;
      for (let i = 1; i < p.ks.length; i++) {
        const k = Math.sign(p.ks[i] ?? 0);
        run = k !== 0 && k === Math.sign(p.ks[i - 1] ?? 0) ? run + 1 : 0;
        // Une fois la caisse installée dans le virage (60 px), la dérive suit le sens du virage.
        if (run >= 30) expect(Math.sign(p.bs[i] ?? 0), `seed ${seed}, point ${i}`).toBe(k);
      }
      const t = (p.finalFrom + (p.ks.length - p.finalFrom) * 0.9) / p.ks.length;
      const pose = poseAt(p, t * p.length);
      expect(Math.sign(pose.slip)).toBe(curvatureSign(p, t));
      expect(Math.sign(pose.steer)).toBe(-curvatureSign(p, t));
    }
  });
  it("curvatureSign : 0 sur l'entrée droite, ±1 dans la courbe finale", () => {
    const p = battlePath(7, W, H);
    expect(curvatureSign(p, 0)).toBe(0);
    expect(Math.abs(curvatureSign(p, 0.99))).toBe(1);
  });
});

describe("tandem : le poursuivant à distance constante", () => {
  it("même trajectoire, écart constant le long de la trajectoire, décalé sur le côté", () => {
    const p = battlePath(1234, W, H);
    const [lead, chase] = tandem(p, battle.spacing.pair);
    expect(lead?.lag).toBe(0);
    expect(chase?.lag).toBe(battle.spacing.pair);
    for (let s = battle.spacing.pair; s < p.length; s += 37) {
      const a = poseAt(p, s);
      const b = poseAt(p, s - (chase?.lag ?? 0));
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      expect(d).toBeLessThanOrEqual(battle.spacing.pair + 0.01);
      expect(d).toBeGreaterThan(battle.spacing.pair * 0.75);
    }
    expect(tandem(p, battle.spacing.train, 3)).toHaveLength(3);
  });
  it("durée : le dernier poursuivant finit la trajectoire", () => {
    const p = battlePath(5, W, H);
    const cars = tandem(p, 40);
    expect(battleDuration(p, cars, 200)).toBeCloseTo(((p.length + 40) / 200) * 1000);
  });
});

describe("chemins SVG du site", () => {
  it("polyligne commençant par M, échantillons de dérive en degrés", () => {
    const p = battlePath(99, W, H);
    const d = battlePathD(p);
    expect(d.startsWith("M")).toBe(true);
    expect(d.split("L").length).toBeGreaterThan(20);
    const samples = slipSamples(p, 24);
    expect(samples).toHaveLength(24);
    for (const v of samples) expect(Math.abs(v)).toBeLessThanOrEqual(46);
  });
});

describe("worklets : les fonctions du fil graphique sont marquées", () => {
  // Mémoire du projet : un callback du fil graphique sans "worklet" plante l'appli au démarrage (Loader.tsx).
  const dir = import.meta.dirname;
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
  it('chaque useAnimatedStyle / useAnimatedProps / useFrameCallback des variantes commence par "worklet"', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(dir, file), "utf8");
      for (const m of text.matchAll(
        /use(AnimatedStyle|AnimatedProps|FrameCallback)\(\s*\(([^)]*)\)\s*=>\s*\{\s*([^\n]*)/g,
      )) {
        if (!m[3]?.startsWith('"worklet"')) offenders.push(`${file} : ${m[0].slice(0, 60)}`);
      }
      // Pas de forme abrégée « () => ({ … }) » : elle ne peut pas porter la directive.
      for (const m of text.matchAll(/use(AnimatedStyle|AnimatedProps|FrameCallback)\(\s*\([^)]*\)\s*=>\s*\(/g))
        offenders.push(`${file} : ${m[0]}`);
      // Callbacks de fin d'animation (withTiming(…, …, cb)) : pas de rappel vers JS depuis le fil graphique.
      if (/runOnJS|scheduleOnRN/.test(text)) offenders.push(`${file} : rappel vers JS`);
    }
    expect(offenders).toEqual([]);
  });
  it("les fonctions de path.ts appelées image par image sont des worklets", () => {
    const text = readFileSync(resolve(dir, "path.ts"), "utf8");
    for (const name of ["driftOrbit", "poseAt", "curvatureSign"]) {
      expect(text).toMatch(new RegExp(`export function ${name}\\([^)]*\\)[^{]*\\{\\s*"worklet";`));
    }
  });
});
