import { describe, expect, it } from "vitest";

import { emptyPagedList, pageFailed, pageLoaded, retryCursor } from "./pagedList";

const page = (items: string[], nextCursor: string | null, total = 30) => ({ items, total, nextCursor });

describe("liste lue page par page", () => {
  it("la première page remplace, la suivante s'ajoute", () => {
    const one = pageLoaded(emptyPagedList<string>(), undefined, page(["a", "b"], "c1"));
    const two = pageLoaded(one, "c1", page(["c"], null));
    expect(two.items).toEqual(["a", "b", "c"]);
    expect(two.next).toBeNull();
  });

  it("une actualisation de la première page en échec : « Réessayer » la refait (pas la page 2), et remplace la liste", () => {
    let list = pageLoaded(emptyPagedList<string>(), undefined, page(["a", "b"], "c1"));
    list = pageLoaded(list, "c1", page(["c"], "c2"));
    list = pageFailed(list, undefined);
    expect(list.items).toEqual(["a", "b", "c"]);
    expect(list.next).toBe("c2");
    expect(retryCursor(list)).toBeUndefined();
    list = pageLoaded(list, retryCursor(list), page(["a2", "b2"], "c1"));
    expect(list.items).toEqual(["a2", "b2"]);
    expect(list.failed).toBeNull();
  });

  it("une page suivante en échec : « Réessayer » redemande ce même curseur", () => {
    let list = pageLoaded(emptyPagedList<string>(), undefined, page(["a"], "c1"));
    list = pageFailed(list, "c1");
    expect(retryCursor(list)).toBe("c1");
    list = pageLoaded(list, retryCursor(list), page(["b"], null));
    expect(list.items).toEqual(["a", "b"]);
  });
});
