// Luminosité du QR (lot M4, tour 2) : elle suit le souhait (focus, appli active), les opérations passent dans l'ordre,
// une augmentation en attente est annulée par un passage en arrière-plan.
import { describe, expect, it, vi } from "vitest";

import { type BrightnessApi, createBrightnessController, createBrightnessHolders } from "./brightness";

/** Une promesse qu'on résout à la main. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Un faux module : il note les appels ; `get` peut être retenu pour simuler une lecture lente. */
function fakeApi(opts: { android?: boolean; level?: number } = {}) {
  const calls: string[] = [];
  let pendingGet: ReturnType<typeof deferred<number>> | null = null;
  let pendingSet: ReturnType<typeof deferred<void>> | null = null;
  const setStarted = deferred<void>();
  const api: BrightnessApi = {
    get: async () => {
      calls.push("get");
      if (pendingGet) return pendingGet.promise;
      return opts.level ?? 0.4;
    },
    set: async (value) => {
      if (value === 1) setStarted.resolve();
      if (pendingSet && value === 1) await pendingSet.promise;
      calls.push(`set:${value}`);
    },
    ...(opts.android
      ? {
          restoreSystem: async () => {
            calls.push("system");
          },
        }
      : {}),
  };
  return {
    api,
    calls,
    holdGet: () => {
      pendingGet = deferred<number>();
      return pendingGet;
    },
    holdSet: () => {
      pendingSet = deferred<void>();
      return pendingSet;
    },
    setStarted: setStarted.promise,
  };
}

describe("luminosité du QR", () => {
  it("monte au maximum quand c'est voulu, rend la valeur d'avant (iPhone) ou le réglage du téléphone (Android)", async () => {
    const ios = fakeApi({ level: 0.4 });
    const c1 = createBrightnessController(async () => ios.api);
    await c1.want(true);
    await c1.want(false);
    expect(ios.calls).toEqual(["get", "set:1", "set:0.4"]);

    const android = fakeApi({ android: true });
    const c2 = createBrightnessController(async () => android.api);
    await c2.want(true);
    await c2.want(false);
    expect(android.calls).toEqual(["get", "set:1", "system"]);
  });

  it("perte du focus (« Sur la carte ») puis retour : rendue, puis remontée depuis la nouvelle valeur", async () => {
    const fake = fakeApi({ level: 0.3 });
    const c = createBrightnessController(async () => fake.api);
    await c.want(true);
    await c.want(false);
    await c.want(true);
    expect(fake.calls).toEqual(["get", "set:1", "set:0.3", "get", "set:1"]);
  });

  it("passage en arrière-plan pendant la lecture de la valeur d'avant : jamais remontée ensuite", async () => {
    const fake = fakeApi({ android: true });
    const held = fake.holdGet();
    const c = createBrightnessController(async () => fake.api);
    const raising = c.want(true);
    // L'appli passe en arrière-plan alors que `get` est parti et n'a pas répondu.
    await vi.waitFor(() => expect(fake.calls).toEqual(["get"]));
    const restoring = c.want(false);
    held.resolve(0.5);
    await raising;
    await restoring;
    expect(fake.calls).toEqual(["get"]);
  });

  it("rendre attend l'augmentation en cours : l'ordre est toujours augmenter puis rendre", async () => {
    const fake = fakeApi({ android: true });
    const held = fake.holdSet();
    const c = createBrightnessController(async () => fake.api);
    const raising = c.want(true);
    // `set(1)` est parti : on quitte pendant qu'il est en cours.
    await fake.setStarted;
    const restoring = c.want(false);
    held.resolve();
    await raising;
    await restoring;
    expect(fake.calls).toEqual(["get", "set:1", "system"]);
  });

  it("souhaits répétés : une seule opération ; module absent (ancien APK) : rien ne casse", async () => {
    const fake = fakeApi();
    const c = createBrightnessController(async () => fake.api);
    await c.want(true);
    await c.want(true);
    await c.want(false);
    await c.want(false);
    expect(fake.calls).toEqual(["get", "set:1", "set:0.4"]);

    const none = createBrightnessController(async () => null);
    await expect(none.want(true)).resolves.toBeUndefined();
    await expect(none.want(false)).resolves.toBeUndefined();
    const broken = createBrightnessController(() => Promise.reject(new Error("Cannot find native module")));
    await expect(broken.want(true)).resolves.toBeUndefined();
  });
});

describe("deux écrans QR empilés (tour 2)", () => {
  it("une seule valeur d'avant : le second ne lit pas 100 %, la sortie du dernier rend la valeur d'avant", async () => {
    const fake = fakeApi({ level: 0.35 });
    const holders = createBrightnessHolders(createBrightnessController(async () => fake.api));
    const a = Symbol("a");
    const b = Symbol("b");
    await holders.hold(a, true);
    // B s'ouvre par-dessus A : B prend la main avant que A ne la rende.
    await holders.hold(b, true);
    await holders.hold(a, false);
    expect(fake.calls).toEqual(["get", "set:1"]);
    await holders.hold(b, false);
    expect(fake.calls).toEqual(["get", "set:1", "set:0.35"]);
  });
});
