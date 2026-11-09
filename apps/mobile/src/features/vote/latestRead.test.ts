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

  it("l'ancienne lecture qui échoue après une récente réussie n'efface pas le succès", () => {
    const r = createLatestRead();
    const a = r.start();
    const b = r.start();
    b.settle(true);
    a.settle(false);
    expect(r.failed()).toBe(false);
  });
});
