// Partie B1, tour 7 : l'aide commune de rechargement (Crew, puis « Tes photos »). Rechargement en GET marqué dans l'adresse, compteur
// (3e rechargement en moins de 20 s refusé), repli sans stockage, un seul comptage par rechargement lancé, décision « autre compte ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AFTER_RELOAD_PARAM,
  isAfterReload,
  isForeign,
  mayReload,
  nextAnnounced,
  reloadAutomatically,
  reloadManually,
} from "./sessionReload";

function stubWindow(opts: { storage: boolean; search?: string; hash?: string }) {
  const replaced: string[] = [];
  const store = new Map<string, string>();
  const win = {
    name: "",
    location: {
      pathname: "/app/crew",
      search: opts.search ?? "?crew=drift",
      hash: opts.hash ?? "",
      replace: (url: string) => replaced.push(url),
    },
  };
  vi.stubGlobal("window", win);
  if (opts.storage) {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  } else {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("bloqué");
      },
      removeItem: () => {
        throw new Error("bloqué");
      },
    });
  }
  return { win, replaced, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("isAfterReload", () => {
  it("lit la marque du rechargement automatique dans l'adresse", () => {
    expect(isAfterReload(new URL(`http://x/app/crew?crew=a&${AFTER_RELOAD_PARAM}=1`))).toBe(true);
    expect(isAfterReload(new URL("http://x/app/crew?crew=a"))).toBe(false);
    expect(isAfterReload(new URL(`http://x/app/crew?${AFTER_RELOAD_PARAM}=0`))).toBe(false);
  });
});

describe("compteur de rechargements", () => {
  beforeEach(() => {
    stubWindow({ storage: true });
  });

  it("deux rechargements en moins de 20 s passent, le troisième est refusé ; au-delà de 20 s le compteur repart", () => {
    expect(mayReload("crew", 1_000)).toBe(true);
    expect(mayReload("crew", 2_000)).toBe(true);
    expect(mayReload("crew", 3_000)).toBe(false);
    // Les deux premiers sont sortis de la fenêtre de 20 s.
    expect(mayReload("crew", 22_500)).toBe(true);
  });

  it("une portée ne compte pas pour une autre", () => {
    expect(mayReload("crew", 1_000)).toBe(true);
    expect(mayReload("crew", 2_000)).toBe(true);
    expect(mayReload("photos", 3_000)).toBe(true);
  });
});

describe("sans stockage", () => {
  it("un seul rechargement en moins de 20 s, marqué dans window.name", () => {
    const { win } = stubWindow({ storage: false });
    expect(mayReload("crew", 1_000)).toBe(true);
    expect(win.name).toContain("orasso-reload:");
    expect(mayReload("crew", 5_000)).toBe(false);
    expect(mayReload("crew", 21_500)).toBe(true);
  });
});

describe("rechargement en GET", () => {
  it("location.replace avec la marque, sans fragment, jamais reload() (un POST de document ne se renvoie pas)", async () => {
    vi.resetModules();
    const { replaced, win } = stubWindow({ storage: true, search: "?crew=drift&publier=1", hash: "#haut" });
    const reload = vi.fn();
    (win.location as unknown as { reload: () => void }).reload = reload;
    const mod = await import("./sessionReload");
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(replaced).toEqual([`/app/crew?crew=drift&publier=1&${AFTER_RELOAD_PARAM}=1`]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("un second appel pendant un rechargement lancé ne le recompte pas", async () => {
    vi.resetModules();
    const { replaced, store } = stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(replaced).toHaveLength(1);
    expect(JSON.parse(store.get("orasso-reloads:crew") ?? "[]")).toHaveLength(1);
  });

  it("au troisième rechargement en moins de 20 s : refusé, rien ne part", async () => {
    vi.resetModules();
    const { replaced, store } = stubWindow({ storage: true });
    const now = Date.now();
    store.set("orasso-reloads:crew", JSON.stringify([now - 3_000, now - 1_000]));
    const mod = await import("./sessionReload");
    expect(mod.reloadAutomatically("crew")).toBe("refused");
    expect(replaced).toEqual([]);
  });

  it("« Recharger la page » remet le compteur à zéro, puis recharge en GET", async () => {
    vi.resetModules();
    const { replaced, store, win } = stubWindow({ storage: true });
    store.set("orasso-reloads:crew", JSON.stringify([Date.now(), Date.now()]));
    win.name = "orasso-reload:123";
    const mod = await import("./sessionReload");
    mod.reloadManually("crew");
    expect(store.has("orasso-reloads:crew")).toBe(false);
    expect(win.name).toBe("");
    expect(replaced).toEqual([`/app/crew?crew=drift&${AFTER_RELOAD_PARAM}=1`]);
  });

  it("reloadManually est exporté et utilisable", () => {
    expect(typeof reloadManually).toBe("function");
    expect(typeof reloadAutomatically).toBe("function");
  });
});

describe("les annonces de sa propre fenêtre", () => {
  it("nextAnnounced ignore une annonce de cette fenêtre, même d'un autre compte (self = true)", () => {
    expect(nextAnnounced(undefined, "B", true)).toBeUndefined();
    expect(nextAnnounced("C", "B", true)).toBe("C");
    expect(nextAnnounced(undefined, "B", false)).toBe("B");
    expect(nextAnnounced("B", null, false)).toBeNull();
  });

  it("une annonce de cette fenêtre d'un autre compte ne rend pas la page étrangère ; celle d'une autre fenêtre, oui", () => {
    const base = { owner: "A", layoutUserId: "A", confirmed: "ok" as const };
    expect(isForeign({ ...base, announced: nextAnnounced(undefined, "B", true) })).toBe(false);
    expect(isForeign({ ...base, announced: nextAnnounced(undefined, "B", false) })).toBe(true);
    expect(isForeign({ ...base, announced: nextAnnounced(undefined, null, false) })).toBe(true);
  });
});

describe("isForeign", () => {
  const base = { owner: "A", layoutUserId: "A", announced: undefined, confirmed: "ok" as const };
  it("même compte partout : pas étranger", () => {
    expect(isForeign(base)).toBe(false);
    expect(isForeign({ ...base, announced: "A" })).toBe(false);
  });
  it("la mise en page, une annonce ou /me disent un autre compte : étranger", () => {
    expect(isForeign({ ...base, layoutUserId: "B" })).toBe(true);
    expect(isForeign({ ...base, announced: "B" })).toBe(true);
    expect(isForeign({ ...base, confirmed: "mismatch" })).toBe(true);
  });
  it("vérification en cours ou en échec : pas « étranger » (la page est neutre pour une autre raison)", () => {
    expect(isForeign({ ...base, confirmed: "checking" })).toBe(false);
    expect(isForeign({ ...base, confirmed: "failed" })).toBe(false);
  });
});
