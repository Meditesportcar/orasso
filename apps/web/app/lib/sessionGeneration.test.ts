import { describe, expect, it } from "vitest";

import { createSessionGeneration } from "./sessionGeneration";

describe("session changée pendant une pagination (P45)", () => {
  it("l'annonce d'un autre compte pendant une pagination retardée : la page est jetée", async () => {
    let user: string | null = "A";
    const gen = createSessionGeneration(() => user);
    // readMore : génération notée au départ, `busy` posé, puis la réponse arrive plus tard.
    const mine = gen.current();
    let busy: string | null = "on_site";
    let more = ["déjà lues"];
    const late = new Promise<string[]>((r) => setTimeout(() => r(["page de A"]), 5));
    // Pendant ce temps : B se connecte ailleurs. Ce que fait la page : vider, `busy` à nul.
    if (gen.announce("B")) {
      busy = null;
      more = [];
    }
    const page = await late;
    if (gen.isCurrent(mine)) more = [...more, ...page];
    expect(more).toEqual([]);
    expect(busy).toBeNull();
    user = "B";
  });

  it("A -> B -> A dans une page restée montée : la dernière annonce n'est pas ignorée", () => {
    let user: string | null = "A"; // le chargeur courant, mis à jour à chaque donnée
    const gen = createSessionGeneration(() => user);
    expect(gen.announce("B")).toBe(true);
    user = "B"; // la revalidation rend le chargeur de B
    const afterB = gen.current();
    expect(gen.announce("A")).toBe(true); // retour à A : différent du chargeur courant (B)
    expect(gen.isCurrent(afterB)).toBe(false);
  });

  it("la même annonce de A (hydratation) ne change rien", () => {
    const gen = createSessionGeneration(() => "A");
    const before = gen.current();
    expect(gen.announce("A")).toBe(false);
    expect(gen.isCurrent(before)).toBe(true);
  });

  it("un nouveau chargement invalide les lectures en vol", () => {
    const gen = createSessionGeneration(() => "A");
    const before = gen.current();
    gen.bump();
    expect(gen.isCurrent(before)).toBe(false);
  });
});
