import { describe, expect, it } from "vitest";

import { createLineupPager } from "./lineupPages";

/** Une lecture qu'on résout à la main (réponse lente). */
function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("pages du plateau (lot R4b, tour 2)", () => {
  it("garde une page arrivée à temps", async () => {
    const pager = createLineupPager(() => "kenji");
    const page = await pager.more(async () => ({ cars: ["a"], nextCursor: null }));
    expect(page).toEqual({ cars: ["a"], nextCursor: null });
  });

  it("jette une page lente arrivée après un changement de catégorie", async () => {
    const pager = createLineupPager(() => "kenji");
    const slow = deferred<{ cars: string[]; nextCursor: number | null }>();
    const pending = pager.more(() => slow.promise);
    pager.reset();
    slow.resolve({ cars: ["japonaise"], nextCursor: 60 });
    expect(await pending).toBeNull();
  });

  it("jette une page lente arrivée après une déconnexion (aucun pseudo remis à l'écran)", async () => {
    let account: string | null = "kenji";
    const pager = createLineupPager(() => account);
    const slow = deferred<{ cars: string[]; nextCursor: number | null }>();
    const pending = pager.more(() => slow.promise);
    account = null;
    slow.resolve({ cars: ["Pilote_063"], nextCursor: null });
    expect(await pending).toBeNull();
  });
});
