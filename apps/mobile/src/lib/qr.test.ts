// Lot M4 (maquette 5.1) : le O au centre du QR d'accès, seulement si le scan reste fiable. On fabrique l'image comme
// l'écran la dessine (modules sombres sur crème, carré central vide, O noir et voiture moutarde par-dessus) et on la
// décode avec un vrai lecteur (jsQR). Tirages pseudo-aléatoires à graine fixe : le test donne toujours le même résultat.
// Tour 2 (relecture Opus, décision du coordinateur) : la comparaison se fait **à taille d'écran égale** (le QR occupe la
// même largeur à l'écran, avec ou sans logo). La correction H demande plus de modules (version 6 contre 4) : chaque
// module est plus petit, et au moindre flou (pare-brise, plein soleil, main qui bouge) le QR avec le O ne se relit plus.
// Le logo est donc **désactivé** (`logo={false}` partout) ; le code et ce test restent pour le réessayer sur le scanner
// staff du Pixel et du Xiaomi (C7).
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

type Render = { width: number; logo: boolean; damage?: number; blur?: number; random?: () => number };

/**
 * L'image du QR sur `width` pixels de côté, zone calme comprise (la même largeur d'écran avec ou sans logo : la taille
 * d'un module en découle). Le O du logo est approché par son contour : un anneau elliptique noir (le O fait 1,36 fois
 * sa hauteur en largeur) et la barre moutarde de la voiture au centre. `damage` : part de modules inversés en plus
 * (écran rayé, reflet), hors des trois repères d'angle ; `blur` : rayon du flou de l'appareil (moyenne d'un carré de
 * 2 × blur + 1 pixels).
 */
function render(text: string, { width: w, logo: withLogo, damage = 0, blur = 0, random = Math.random }: Render) {
  const m = qrMatrix(text, { logo: withLogo });
  const scale = w / qrViewBox(m);
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
      const mx = Math.floor((x + 0.5) / scale) - QUIET_ZONE;
      const my = Math.floor((y + 0.5) / scale) - QUIET_ZONE;
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
        for (let dy = -blur; dy <= blur; dy++) {
          for (let dx = -blur; dx <= blur; dx++) {
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

/** Largeur d'écran du QR vue par la caméra du staff, en pixels : la même pour les deux versions. */
const SCREEN = 180;

describe("QR d'accès et logo O (désactivé)", { timeout: 60_000 }, () => {
  it("correction H, carré du logo sous 20 % de la surface ; sans logo, correction M", () => {
    const [code = ""] = codes(1, seeded(1));
    const m = qrMatrix(code, { logo: true });
    const side = m.logo?.side ?? 0;
    expect(side).toBeGreaterThan(0);
    expect((side * side) / (m.size * m.size)).toBeLessThanOrEqual(LOGO_AREA_MAX);
    // OR2 (69 caractères) en correction H : version 6, 41 modules ; en M (sans logo) : version 4, 33 modules.
    expect(m.version).toBe(6);
    expect(qrMatrix(code).version).toBe(4);
    expect(qrMatrix(code).logo).toBeNull();
  });

  it("à taille d'écran égale, net : les deux se relisent", () => {
    for (const code of codes(12, seeded(2))) {
      expect(reads(code, { width: SCREEN, logo: false }), "sans logo").toBe(true);
      expect(reads(code, { width: SCREEN, logo: true }), "avec le O").toBe(true);
    }
  });

  it("à taille d'écran égale et flou : le QR sans logo se relit toujours, celui avec le O moins souvent (désactivé)", () => {
    const list = codes(30, seeded(3));
    let withLogo = 0;
    let without = 0;
    for (const code of list) {
      if (reads(code, { width: SCREEN, logo: true, blur: 2 })) withLogo++;
      if (reads(code, { width: SCREEN, logo: false, blur: 2 })) without++;
    }
    // Le QR affiché aujourd'hui (sans logo) passe partout ; le O ne reviendra que s'il fait aussi bien sur les
    // téléphones du staff.
    expect(without, `flou : ${without}/30 sans logo`).toBe(list.length);
    // Mesure (jsQR, 180 px, flou de 5 px) : 0/30 avec le O contre 30/30 sans.
    expect(withLogo, `flou : ${withLogo}/30 avec le O, ${without}/30 sans`).toBeLessThan(without);
  });

  it("abîmé à taille d'écran égale : le QR sans logo tient au moins aussi bien", () => {
    const list = codes(30, seeded(4));
    const random = seeded(5);
    let withLogo = 0;
    let without = 0;
    for (const code of list) {
      if (reads(code, { width: SCREEN, logo: true, damage: 0.01, random })) withLogo++;
      if (reads(code, { width: SCREEN, logo: false, damage: 0.01, random })) without++;
    }
    expect(without, `abîmé : ${without}/30 sans logo, ${withLogo}/30 avec le O`).toBeGreaterThanOrEqual(withLogo);
  });
});
