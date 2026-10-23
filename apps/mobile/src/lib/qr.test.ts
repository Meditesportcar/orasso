// Lot M4 (maquette 5.1) : le O au centre du QR d'accès, seulement si le scan reste fiable. On fabrique l'image comme
// l'écran la dessine (modules sombres sur crème, carré central vide, O noir et voiture moutarde par-dessus) et on la
// décode avec un vrai lecteur (jsQR) : net, petit, flou, puis abîmé. Critère : le QR avec le O (correction H) se relit
// toujours net, et abîmé au moins aussi souvent que le QR d'avant (correction M, sans logo). Tirages pseudo-aléatoires
// à graine fixe : le test donne toujours le même résultat.
import { rotatingCodeForSlot } from "@orasso/shared";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { LOGO_AREA_MAX, QUIET_ZONE, qrMatrix, qrViewBox } from "./qr";

const CREAM = [243, 235, 221] as const;
const INK = [19, 20, 23] as const;
const MUSTARD = [233, 184, 36] as const;

/** Générateur à graine (mulberry32). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Render = { scale: number; logo: boolean; damage?: number; blur?: boolean; random?: () => number };

/**
 * L'image du QR à `scale` pixels par module. Le O du logo est approché par son contour : un anneau elliptique noir
 * (le O fait 1,36 fois sa hauteur en largeur) et la barre moutarde de la voiture au centre. `damage` : part de modules
 * inversés en plus (écran rayé, reflet), hors des trois repères d'angle ; `blur` : flou de l'appareil (moyenne 3 × 3).
 */
function render(text: string, { scale, logo: withLogo, damage = 0, blur = false, random = Math.random }: Render) {
  const m = qrMatrix(text, { logo: withLogo });
  const w = qrViewBox(m) * scale;
  const px = new Uint8ClampedArray(w * w * 4);
  const logo = m.logo;
  const finder = (x: number, y: number) => (x < 8 || x >= m.size - 8) && (y < 8 || (x < 8 && y >= m.size - 8));
  const flipped = new Set<number>();
  while (flipped.size < Math.round(damage * m.size * m.size)) {
    const k = Math.floor(random() * m.size * m.size);
    if (!finder(k % m.size, Math.floor(k / m.size))) flipped.add(k);
  }
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const mx = Math.floor(x / scale) - QUIET_ZONE;
      const my = Math.floor(y / scale) - QUIET_ZONE;
      const inside = mx >= 0 && my >= 0 && mx < m.size && my < m.size;
      const on = inside && m.dark(mx, my) !== flipped.has(my * m.size + mx);
      let color: readonly number[] = on ? INK : CREAM;
      if (logo) {
        // Centre et demi-côté du O en pixels (il laisse une demi-marge de module dans le carré vide).
        const c = (QUIET_ZONE + logo.start + logo.side / 2) * scale;
        const half = ((logo.side - 1) / 2) * scale;
        const dx = (x + 0.5 - c) / half;
        const dy = ((y + 0.5 - c) / half) * 1.36;
        const r = Math.hypot(dx, dy);
        if (r <= 1) color = r >= 0.62 ? INK : Math.abs(dy) < 0.5 && Math.abs(dx) < 0.55 ? MUSTARD : CREAM;
      }
      const i = (y * w + x) * 4;
      px[i] = color[0] ?? 0;
      px[i + 1] = color[1] ?? 0;
      px[i + 2] = color[2] ?? 0;
      px[i + 3] = 255;
    }
  }
  if (!blur) return { px, w };
  const soft = new Uint8ClampedArray(px.length);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 4; k++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= w) continue;
            sum += px[(yy * w + xx) * 4 + k] ?? 0;
            n++;
          }
        }
        soft[(y * w + x) * 4 + k] = sum / n;
      }
    }
  }
  return { px: soft, w };
}

const reads = (text: string, opts: Render) => {
  const { px, w } = render(text, opts);
  return jsQR(px, w, w, { inversionAttempts: "dontInvert" })?.data === text;
};

/** Des codes tournants OR2 réels (secret, n° d'événement, pass et créneau tirés à graine fixe). */
function codes(n: number, random: () => number) {
  return Array.from({ length: n }, (_, i) => {
    const secret = new Uint8Array(32).map(() => Math.floor(random() * 256));
    const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join("");
    const passId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
    return rotatingCodeForSlot(secret, { eventNo: 1 + i * 37, passId, slot: 88_000_000 + i });
  });
}

describe("QR d'accès avec le O au centre", () => {
  it("correction H, carré du logo sous 20 % de la surface", () => {
    const [code = ""] = codes(1, seeded(1));
    const m = qrMatrix(code, { logo: true });
    const side = m.logo?.side ?? 0;
    expect(side).toBeGreaterThan(0);
    expect((side * side) / (m.size * m.size)).toBeLessThanOrEqual(LOGO_AREA_MAX);
    // OR2 (69 caractères) en correction H : version 6, 41 modules ; en M (sans logo) : version 4.
    expect(m.version).toBe(6);
    expect(qrMatrix(code).version).toBe(4);
    expect(qrMatrix(code).logo).toBeNull();
  });

  it("chaque code se relit net, petit (3 px par module) et flou", () => {
    for (const code of codes(12, seeded(2))) {
      expect(reads(code, { scale: 6, logo: true }), "net").toBe(true);
      expect(reads(code, { scale: 3, logo: true }), "petit").toBe(true);
      expect(reads(code, { scale: 5, logo: true, blur: true }), "flou").toBe(true);
    }
  });

  it("abîmé, il se relit au moins aussi souvent que le QR d'avant (correction M, sans logo)", () => {
    for (const damage of [0.01, 0.02]) {
      const list = codes(40, seeded(3));
      const random = seeded(4 + damage * 100);
      let withLogo = 0;
      let before = 0;
      for (const code of list) {
        if (reads(code, { scale: 6, logo: true, damage, random })) withLogo++;
        if (reads(code, { scale: 6, logo: false, damage, random })) before++;
      }
      expect(withLogo, `abîmé à ${damage * 100} % : ${withLogo} avec le O, ${before} avant`).toBeGreaterThanOrEqual(
        before,
      );
    }
  });
});
