import { describe, expect, it } from "vitest";

import { purgeViewChoices, viewChoiceKey } from "./viewChoice";

function fakeStore(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("choix d'affichage des publications", () => {
  it("la clé est propre au compte", () => {
    expect(viewChoiceKey("a")).not.toBe(viewChoiceKey("b"));
  });
  it("la déconnexion efface les clés de tous les comptes, et seulement elles", () => {
    const s = fakeStore({ [viewChoiceKey("a")]: "one", [viewChoiceKey("b")]: "grid", "orasso.theme": "sable" });
    purgeViewChoices(s);
    expect([...s.data.keys()]).toEqual(["orasso.theme"]);
  });
});
