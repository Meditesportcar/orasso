// La fumée et les voitures en canvas (lot C8, D33 : artefact DA v2, classe `Drift` et moteur du fond `parts`). Même
// dessin que l'artefact (dégradé radial couleur `--ink-muted` → transparent, voitures en rectangles arrondis), mais
// pensé pour les téléphones modestes : bouffées dans un pool plafonné et recyclé (tableaux typés, aucune allocation par
// image), dégradé pré-rendu une fois dans une petite toile (pas de `createRadialGradient` ni de `filter: blur` par
// image), traces regroupées par tranches d'opacité (quelques `stroke()` par image au lieu d'un par segment).

import { smoke } from "../../motion";

export type SmokeSpec = { readonly [K in keyof (typeof smoke)["battle"]]: number };

/** Bouffées que l'artefact fait naître par seconde et par roue (fond : 70 % des images à 60 i/s ; O : 85 %). */
export const ARTIFACT_RATE = { battle: 0.7 * 60, orbit: 0.85 * 60 } as const;

/** Appareil modeste : petit écran ou peu de cœurs. On y garde moitié moins de bouffées vivantes. */
export function isLowEnd(): boolean {
  if (typeof window === "undefined") return false;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return window.innerWidth < 600 || cores <= 4;
}

/**
 * Nombre de bouffées vivantes au plus, pour tout le canvas : `smoke.webCap` sur un appareil modeste (téléphone), le
 * double sur un ordinateur (il couvre alors le débit de l'artefact autour du O : 2 voitures × 2 roues × 51/s × 1,3).
 */
export function smokeCap(): number {
  return isLowEnd() ? smoke.webCap : smoke.webCap * 2;
}

/**
 * Débit par roue tenu par le plafond (`cap` bouffées vivantes au plus pour `wheels` roues qui fument), et le facteur
 * qui compense les bouffées en moins (plafonné à `smoke.density`) : plus opaques et plus larges à la naissance, pour
 * garder une traînée continue (pas de chapelet de points) et la même densité à l'œil.
 */
export function smokeRate(base: number, spec: SmokeSpec, cap: number, wheels: number): { rate: number; boost: number } {
  const rate = Math.min(base, cap / ((spec.life / 1000) * Math.max(1, wheels)));
  return { rate, boost: Math.min(smoke.density, base / Math.max(1e-6, rate)) };
}

/** Couleur d'une variable CSS lue sur `el` (repli si absente : rendu serveur, tests). */
export function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

const SPRITE = 64;

/** Le dégradé radial de l'artefact (couleur au centre → transparent), pré-rendu une fois par couleur. */
export function smokeSprite(color: string): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = SPRITE;
  c.height = SPRITE;
  const g = c.getContext("2d");
  if (!g) return null;
  const half = SPRITE / 2;
  const gr = g.createRadialGradient(half, half, 0, half, half, half);
  gr.addColorStop(0, color);
  gr.addColorStop(1, "transparent");
  g.fillStyle = gr;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

/** Les bouffées vivantes : pool de taille fixe, la morte est remplacée par la dernière (aucune allocation). */
export class SmokePool {
  readonly cap: number;
  n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private r: Float32Array;
  private l: Float32Array;

  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.l = new Float32Array(cap);
  }

  /** Une bouffée naît ; plein : elle attend (renvoie faux). */
  spawn(x: number, y: number, vx: number, vy: number, r: number): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.r[i] = r;
    this.l[i] = 1;
    return true;
  }

  /** Avance de `dt` s : recul, croissance `grow` px/s, vie qui baisse en `life` s. */
  step(dt: number, grow: number, life: number): void {
    let i = 0;
    while (i < this.n) {
      const l = (this.l[i] ?? 0) - dt / life;
      if (l <= 0) {
        const last = --this.n;
        this.x[i] = this.x[last] ?? 0;
        this.y[i] = this.y[last] ?? 0;
        this.vx[i] = this.vx[last] ?? 0;
        this.vy[i] = this.vy[last] ?? 0;
        this.r[i] = this.r[last] ?? 0;
        this.l[i] = this.l[last] ?? 0;
        continue;
      }
      this.l[i] = l;
      this.x[i] = (this.x[i] ?? 0) + (this.vx[i] ?? 0) * dt;
      this.y[i] = (this.y[i] ?? 0) + (this.vy[i] ?? 0) * dt;
      this.r[i] = (this.r[i] ?? 0) + grow * dt;
      i++;
    }
  }

  /** Peint chaque bouffée : opacité vie × `alpha` (artefact : `l × .24` au fond, `l × .32` autour du O). */
  draw(ctx: CanvasRenderingContext2D, sprite: CanvasImageSource, alpha: number): void {
    for (let i = 0; i < this.n; i++) {
      const r = this.r[i] ?? 0;
      ctx.globalAlpha = Math.min(1, (this.l[i] ?? 0) * alpha);
      ctx.drawImage(sprite, (this.x[i] ?? 0) - r, (this.y[i] ?? 0) - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.n = 0;
  }
}

/** Les traces de pneus du fond : segments qui s'effacent en `life` s, tamponnés en anneau, peints par tranches. */
export class MarkRing {
  readonly cap: number;
  n = 0;
  private head = 0;
  private seg: Float32Array;
  private l: Float32Array;

  constructor(cap: number) {
    this.cap = cap;
    this.seg = new Float32Array(cap * 4);
    this.l = new Float32Array(cap);
  }

  push(ax: number, ay: number, bx: number, by: number): void {
    const i = this.head;
    this.seg[i * 4] = ax;
    this.seg[i * 4 + 1] = ay;
    this.seg[i * 4 + 2] = bx;
    this.seg[i * 4 + 3] = by;
    this.l[i] = 1;
    this.head = (i + 1) % this.cap;
    this.n = Math.min(this.cap, this.n + 1);
  }

  /** Avance et peint : opacité vie × `alpha`, regroupée en `BANDS` tranches (un `stroke()` par tranche). */
  draw(ctx: CanvasRenderingContext2D, dt: number, life: number, alpha: number): number {
    let alive = 0;
    for (let b = 0; b < BANDS; b++) {
      const lo = b / BANDS;
      const hi = (b + 1) / BANDS;
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < this.cap; i++) {
        const l = this.l[i] ?? 0;
        if (l <= lo || l > hi) continue;
        any = true;
        ctx.moveTo(this.seg[i * 4] ?? 0, this.seg[i * 4 + 1] ?? 0);
        ctx.lineTo(this.seg[i * 4 + 2] ?? 0, this.seg[i * 4 + 3] ?? 0);
      }
      if (any) {
        ctx.globalAlpha = hi * alpha;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.cap; i++) {
      const l = (this.l[i] ?? 0) - dt / life;
      this.l[i] = l > 0 ? l : 0;
      if (l > 0) alive++;
    }
    this.n = alive;
    return alive;
  }

  clear(): void {
    this.l.fill(0);
    this.n = 0;
    this.head = 0;
  }
}

const BANDS = 6;

/** Rectangle arrondi (repli si `roundRect` manque). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * La voiture vue de dessus de l'artefact : ombre portée (noire, décalée de 1,5 × 2,5 `unit`), caisse, pare-brise et
 * lunette à l'encre de nuit (`--night`, 85 %), toit éclairé (blanc, 18 %).
 */
export function drawCar(
  ctx: CanvasRenderingContext2D,
  car: { x: number; y: number; heading: number; color: string; night: string },
  L: number,
  W: number,
  shadow: number,
  unit: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.globalAlpha = alpha * shadow;
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.ellipse(1.5 * unit, 2.5 * unit, L * 0.56, W * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = car.color;
  rr(ctx, -L / 2, -W / 2, L, W, W * 0.38);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = car.night;
  rr(ctx, L * 0.04, -W * 0.38, L * 0.2, W * 0.76, W * 0.12);
  ctx.fill();
  rr(ctx, -L * 0.36, -W * 0.34, L * 0.13, W * 0.68, W * 0.1);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.18;
  ctx.fillStyle = "white";
  rr(ctx, -L * 0.18, -W * 0.4, L * 0.2, W * 0.8, W * 0.1);
  ctx.fill();
  ctx.restore();
}

/** Position d'une roue arrière (`side` −1 ou 1) : `wheelBack` de la longueur derrière, `wheelSide` de la largeur. */
export function rearWheel(
  x: number,
  y: number,
  heading: number,
  side: number,
  L: number,
  W: number,
  spec: SmokeSpec,
): [number, number] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [
    x - c * L * spec.wheelBack - s * W * spec.wheelSide * side,
    y - s * L * spec.wheelBack + c * W * spec.wheelSide * side,
  ];
}

/** Toile à la taille de son élément, densité d'écran bornée à 2 (artefact). Renvoie la densité. */
export function fitCanvas(cv: HTMLCanvasElement, w: number, h: number): number {
  const d = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(w * d);
  const H = Math.round(h * d);
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  return d;
}
