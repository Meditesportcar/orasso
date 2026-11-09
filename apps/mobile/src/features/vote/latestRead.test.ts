import { describe, expect, it } from "vitest";

import { createLatestRead } from "./latestRead";

describe("résultat de la dernière lecture de la grille", () => {
  it("une lecture qui échoue puis une qui réussit : réussi", () => {
    const r = createLatestRead();
    r.start().settle(false);
    expect(r.failed()).toBe(true);
    r.start().settle(true);
    expect(r.failed()).toBe(false);
  });

  it("deux lectures concurrentes : B (canal) échoue, A (ancienne) réussit après : la grille reste à relire", () => {
    const r = createLatestRead();
    const a = r.start();
    const b = r.start();
    b.settle(false);
    a.settle(true); // acceptée par personne : `useApi` l'ignore
    expect(r.failed()).toBe(true);
  });

  it("A (canal) échoue pendant que B (manuelle, plus récente) attend : la grille reste à relire, puis B échoue aussi", () => {
    const r = createLatestRead();
    const a = r.start();
    const b = r.start();
    a.settle(false);
    expect(r.failed()).toBe(true);
    b.settle(false);
    expect(r.failed()).toBe(true);
  });

  it("A échoue, B (plus récente) réussit ensuite : la grille est à jour", () => {
    const r = createLatestRead();
    const a = r.start();
    const b = r.start();
    a.settle(false);
    b.settle(true);
    expect(r.failed()).toBe(false);
  });

  it("un message de grille la met à relire jusqu'au succès d'une lecture partie après", () => {
    const r = createLatestRead();
    r.start().settle(true);
    r.invalidate();
    expect(r.failed()).toBe(true);
    const c = r.start();
    expect(r.failed()).toBe(true);
    c.settle(true);
    expect(r.failed()).toBe(false);
  });

  it("une lecture partie avant le message de grille n'efface pas « à relire » (données d'avant le changement)", () => {
    const r = createLatestRead();
    const c = r.start();
    r.invalidate();
    c.settle(true);
    expect(r.failed()).toBe(true);
    r.start().settle(true);
    expect(r.failed()).toBe(false);
  });

  it("l'ancienne lecture qui échoue après une récente réussie n'efface pas le succès", () => {
    const r = createLatestRead();
    const a = r.start();
    const b = r.start();
    b.settle(true);
    a.settle(false);
    expect(r.failed()).toBe(false);
  });
});
