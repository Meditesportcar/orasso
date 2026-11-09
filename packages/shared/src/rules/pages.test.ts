import { describe, expect, it } from "vitest";

import { collectPages } from "./pages";

/** `total` candidats servis par pages de `size`, la page `failAt` (numéro à partir de 0) échoue. */
function source(total: number, size: number, failAt?: number) {
  return async (cursor: number) => {
    if (failAt !== undefined && cursor / size === failAt) throw new Error("coupure");
    const items = Array.from({ length: Math.min(size, total - cursor) }, (_, i) => cursor + i);
    const next = cursor + size < total ? cursor + size : null;
    return { items, next };
  };
}

describe("collectPages", () => {
  it("continue au-delà de 50 pages (6 000 candidats) sans rien tronquer", async () => {
    const r = await collectPages(source(6_000, 100));
    expect(r.complete).toBe(true);
    expect(r.items).toHaveLength(6_000);
  });

  it("l'échec de la première page n'est pas une liste vide complète", async () => {
    const r = await collectPages(source(500, 100, 0));
    expect(r).toEqual({ items: [], complete: false });
  });

  it("l'échec d'une page suivante garde les pages lues mais dit que c'est partiel", async () => {
    const r = await collectPages(source(500, 100, 3));
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(300);
  });

  it("une vraie liste vide est complète", async () => {
    expect(await collectPages(source(0, 100))).toEqual({ items: [], complete: true });
  });

  it("une pagination qui ne finit pas s'arrête à la garde, en partiel", async () => {
    const r = await collectPages(async (c) => ({ items: [c], next: c + 1 }), 5);
    expect(r.complete).toBe(false);
    expect(r.items).toHaveLength(5);
  });
});
