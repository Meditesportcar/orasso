// Partie B1, tour 7 : l'aide commune de rechargement (Crew, puis « Tes photos »). Rechargement en GET marqué dans l'adresse, compteur
// (3e rechargement en moins de 20 s refusé), repli sans stockage, un seul comptage par rechargement lancé, décision « autre compte ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AFTER_RELOAD_PARAM,
  applyConfirmation,
  createConfirmer,
  freshConfirmation,
  isAfterReload,
  isForeign,
  ME_TIMEOUT_MS,
  type MeResult,
  mayReload,
  nextAnnounced,
  nextConfirmation,
  reloadAutomatically,
  reloadManually,
  type SessionConfirmation,
  setStalledOf,
  trackConfirmation,
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

// Partie B1, tour 8 : la confirmation du compte après un rechargement (`useSessionConfirmation` = un état local + ce vérificateur ;
// sans environnement DOM dans ce paquet, on teste le vérificateur lui-même, que le crochet appelle tel quel).

const me = (id: string): MeResult => ({ ok: true, data: { user: { id } } });

/** Un état local comme `useState` : `apply` lui passe la fonction de transition. */
function localState(initial: SessionConfirmation) {
  const box = { state: initial };
  return {
    box,
    apply: (next: (was: SessionConfirmation) => SessionConfirmation) => {
      box.state = next(box.state);
    },
  };
}

describe("confirmation du compte après un rechargement", () => {
  it("la page rechargée démarre « checking » (le crochet l'initialise ainsi), le compte confirmé la passe « ok »", async () => {
    const { box, apply } = localState("checking");
    await createConfirmer(async () => me("A"))("A", apply);
    expect(box.state).toBe("ok");
  });

  it("/me dit un autre compte : « mismatch » (la page se recharge, comptée)", async () => {
    const { box, apply } = localState("checking");
    await createConfirmer(async () => me("C"))("B", apply);
    expect(box.state).toBe("mismatch");
    // La décision de la page : étrangère, donc rechargement automatique compté.
    expect(isForeign({ owner: "B", layoutUserId: "B", announced: undefined, confirmed: box.state })).toBe(true);
  });

  it("401 (plus de session) : « mismatch »", async () => {
    const { box, apply } = localState("checking");
    await createConfirmer(async () => ({ ok: false, status: 401 }))("B", apply);
    expect(box.state).toBe("mismatch");
  });

  it("panne réseau ou délai (status 0) et erreur serveur : « failed » (« Recharger la page »)", async () => {
    for (const status of [0, 500, 503]) {
      const { box, apply } = localState("checking");
      await createConfirmer(async () => ({ ok: false, status }))("A", apply);
      expect(box.state, `status ${status}`).toBe("failed");
    }
  });

  it("une revérification silencieuse qui échoue ne masque pas une page déjà confirmée", async () => {
    const { box, apply } = localState("ok");
    await createConfirmer(async () => ({ ok: false, status: 0 }))("A", apply);
    expect(box.state).toBe("ok");
  });

  it("la réponse d'une vérification plus ancienne que la dernière est ignorée (seq)", async () => {
    const { box, apply } = localState("checking");
    const resolvers: Array<(r: MeResult) => void> = [];
    const verify = createConfirmer(() => new Promise<MeResult>((resolve) => resolvers.push(resolve)));
    const first = verify("A", apply);
    const second = verify("A", apply);
    // La seconde répond d'abord (« ok ») ; la première, tardive, dit un autre compte : elle ne doit rien changer.
    (resolvers[1] as (r: MeResult) => void)(me("A"));
    await second;
    (resolvers[0] as (r: MeResult) => void)(me("C"));
    await first;
    expect(box.state).toBe("ok");
  });

  it("nextConfirmation : un compte différent après « ok » repasse « mismatch »", () => {
    expect(nextConfirmation("ok", me("C"), "A")).toBe("mismatch");
    expect(nextConfirmation("failed", me("A"), "A")).toBe("ok");
  });

  it("le délai de /me est de 10 s", () => {
    expect(ME_TIMEOUT_MS).toBe(10_000);
  });
});

// Partie B1, tour 9 : la confirmation liée au propriétaire confirmé, et le verrou de rechargement levé à la restauration / au blocage.

describe("confirmation liée au propriétaire (instance gardée montée)", () => {
  it("un autre owner redemande une confirmation tout de suite : « checking », jamais le « ok » de l'ancien", async () => {
    // Instance montée sur A, confirmée.
    let tracked = freshConfirmation("A", false);
    expect(tracked.state).toBe("ok");
    // Un nouveau résultat « pending » (afterReload) pour B arrive sans remontage : au rendu, « checking » (donc aucune navigation).
    tracked = trackConfirmation(tracked, "B", true);
    expect(tracked.state).toBe("checking");
    // /me est retenu : la page reste « checking » (la navigation n'a lieu que pour « ok »).
    let release: (r: MeResult) => void = () => {};
    const verify = createConfirmer(() => new Promise<MeResult>((resolve) => (release = resolve)));
    const done = verify("B", (next) => {
      tracked = applyConfirmation(tracked, "B", next);
    });
    expect(tracked.state).toBe("checking");
    // La réponse arrive : « ok ».
    release(me("B"));
    await done;
    expect(tracked.state).toBe("ok");
  });

  it("afterReload qui passe à vrai pour le même compte redemande aussi une confirmation ; rien ne change sinon", () => {
    const ok = freshConfirmation("A", false);
    expect(trackConfirmation(ok, "A", false)).toBe(ok);
    expect(trackConfirmation(ok, "A", true).state).toBe("checking");
  });

  it("la réponse d'une vérification faite pour l'ancien compte est ignorée", () => {
    const now = trackConfirmation(freshConfirmation("A", false), "B", true);
    expect(applyConfirmation(now, "A", () => "ok")).toBe(now);
    expect(applyConfirmation(now, "B", () => "ok").state).toBe("ok");
  });
});

describe("verrou global de rechargement", () => {
  it("document restauré (pageshow persisté) : le verrou est levé, un nouveau changement de compte navigue", async () => {
    vi.resetModules();
    const { replaced } = stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(replaced).toHaveLength(1);
    // Sans levée du verrou : « started » sans naviguer (le défaut corrigé).
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(replaced).toHaveLength(1);
    // Restauration depuis le cache de navigation.
    mod.resetReloadLock();
    expect(mod.reloadAutomatically("crew")).toBe("started");
    expect(replaced).toHaveLength(2);
    mod.resetReloadLock();
  });

  it("un rechargement qui n'a pas quitté la page au bout du délai : abonnés prévenus (bouton sous « Mise à jour… » ; le verrou reste posé", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const { replaced } = stubWindow({ storage: true });
      const mod = await import("./sessionReload");
      const stalled = vi.fn();
      const off = mod.onReloadStalled(stalled);
      mod.reloadAutomatically("crew");
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS - 1);
      expect(stalled).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(stalled).toHaveBeenCalledTimes(1);
      // Le délai dépasse celui de /me (10 s) : une navigation lente n'est pas dérangée, le verrou reste posé.
      expect(mod.RELOAD_STALL_MS).toBeGreaterThan(ME_TIMEOUT_MS);
      expect(mod.reloadAutomatically("crew")).toBe("started");
      expect(replaced).toHaveLength(1);
      // Le geste de l'utilisateur, lui, recharge.
      mod.reloadManually("crew");
      expect(replaced).toHaveLength(2);
      off();
      mod.resetReloadLock();
    } finally {
      vi.useRealTimers();
    }
  });

  it("la restauration annule le minuteur de blocage", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubWindow({ storage: true });
      const mod = await import("./sessionReload");
      const stalled = vi.fn();
      const off = mod.onReloadStalled(stalled);
      mod.reloadAutomatically("crew");
      mod.resetReloadLock();
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS * 2);
      expect(stalled).not.toHaveBeenCalled();
      off();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restauration pendant un rechargement, et bouton lié au compte (tour 10)", () => {
  it("resetReloadLock dit si un rechargement était en cours", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    expect(mod.resetReloadLock()).toBe(false);
    mod.reloadAutomatically("crew");
    expect(mod.resetReloadLock()).toBe(true);
    expect(mod.resetReloadLock()).toBe(false);
  });

  it("page restaurée pendant un rechargement, `foreign` inchangé : le bouton est affiché (stalled), sans nouvelle navigation", async () => {
    vi.resetModules();
    const { replaced } = stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    // « Mise à jour… » : discordance, rechargement lancé.
    let tracked = mod.freshConfirmation("A", false);
    tracked = mod.applyConfirmation(tracked, "A", () => "mismatch");
    mod.reloadAutomatically("crew");
    expect(replaced).toHaveLength(1);
    // Retour puis Avant : pageshow persisté. Le crochet applique exactement ceci.
    tracked = mod.setStalledOf(tracked, mod.resetReloadLock());
    tracked = mod.applyConfirmation(tracked, "A", (was) => mod.nextConfirmation(was, me("C"), "A"));
    expect(tracked.state).toBe("mismatch");
    expect(tracked.stalled).toBe(true);
    expect(replaced).toHaveLength(1);
    // Une restauration sans rechargement en cours ne montre pas le bouton.
    expect(mod.setStalledOf(tracked, mod.resetReloadLock()).stalled).toBe(false);
  });

  it("le bouton retombe quand le compte ou l'origine de la page change (même recalage que la confirmation)", () => {
    const slow = setStalledOf(freshConfirmation("A", false), true);
    expect(slow.stalled).toBe(true);
    expect(trackConfirmation(slow, "A", false)).toBe(slow);
    expect(trackConfirmation(slow, "B", false).stalled).toBe(false);
    expect(trackConfirmation(slow, "A", true).stalled).toBe(false);
    expect(setStalledOf(slow, true)).toBe(slow);
  });
});
