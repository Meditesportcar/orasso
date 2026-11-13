// `cachedSource` : un seul chargement même quand une demande a lu le cache AVANT l'écriture d'une autre et ne trouve ensuite plus
// son vol (terminé et retiré). Au début de son propre vol, elle relit la ligne et, si elle est fraîche, la rend sans rappeler la source.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { externalCache } from "../../db/schema";
import { cachedSource, setExternalFetch } from "./cache";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;

beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  useClock(new Date("2026-11-12T10:00:00Z"));
  // Sans appel réseau réel : les sources externes sont « actives » (un faux fetch), mais `load` ne l'utilise pas.
  setExternalFetch((() => Promise.reject(new Error("pas de réseau"))) as unknown as typeof fetch);
});
afterEach(() => {
  setExternalFetch(null);
  vi.restoreAllMocks();
});

describe("cachedSource : deux demandes, la seconde lit le cache juste avant l'écriture de la première", () => {
  it("un seul appel à `load`", async () => {
    const real = db.query.externalCache.findFirst.bind(db.query.externalCache);
    let reads = 0;
    let firstDone: () => void = () => undefined;
    const firstFinished = new Promise<void>((resolve) => {
      firstDone = resolve;
    });
    vi.spyOn(db.query.externalCache, "findFirst").mockImplementation(((...args: Parameters<typeof real>) => {
      reads += 1;
      // La première lecture de la seconde demande (la deuxième lecture) est faite avant l'écriture de la première (ligne absente),
      // mais ne revient qu'après la fin de la première : son vol est déjà terminé et retiré.
      if (reads === 2) return firstFinished.then(() => undefined);
      return real(...args);
    }) as typeof real);
    let loads = 0;
    const load = async () => {
      loads += 1;
      return ["lieu"];
    };
    const options = { key: "wash:66", ttlMs: 24 * HOUR, maxStaleMs: 7 * 24 * HOUR, load };
    const first = cachedSource(options).then((data) => {
      firstDone();
      return data;
    });
    const second = cachedSource(options);
    expect(await first).toEqual(["lieu"]);
    expect(await second).toEqual(["lieu"]);
    expect(loads).toBe(1);
  });

  it("une ligne périmée est toujours rechargée (la relecture ne sert que si elle est fraîche)", async () => {
    await db
      .insert(externalCache)
      .values({ key: "fuel:66", fetchedAt: new Date("2026-11-10T10:00:00Z"), data: ["ancien"] });
    let loads = 0;
    const data = await cachedSource({
      key: "fuel:66",
      ttlMs: 24 * HOUR,
      maxStaleMs: 7 * 24 * HOUR,
      load: async () => {
        loads += 1;
        return ["neuf"];
      },
    });
    expect(data).toEqual(["neuf"]);
    expect(loads).toBe(1);
  });
});
