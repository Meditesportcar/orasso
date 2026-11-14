// Partie B1, tour 7 : l'aide commune de rechargement (Crew, puis « Tes photos »). Rechargement en GET marqué dans l'adresse, compteur
// (3e rechargement en moins de 20 s refusé), repli sans stockage, un seul comptage par rechargement lancé, décision « autre compte ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api.client";
import {
  AFTER_RELOAD_PARAM,
  beginSharedRequest,
  createConfirmer,
  deriveConfirmation,
  fetchMe,
  isAfterReload,
  isForeign,
  ME_TIMEOUT_MS,
  type MeKnowledge,
  type MeResult,
  markSharedLayout,
  mayReload,
  nextAnnounced,
  noteForeignAnnouncement,
  publishSharedMe,
  recordMe,
  reloadAutomatically,
  reloadManually,
  resetSharedMe,
  type SessionConfirmation,
  sharedConfirmation,
  sharedConfirmedMe,
  subscribeShared,
  unknownMe,
} from "./sessionReload";

// `/me` : le module `api.client` est remplacé (il fait un vrai `fetch`) ; chaque test lit ses appels.
vi.mock("./api.client", () => ({ apiFetch: vi.fn() }));

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

// Partie B1, tours 8 à 11 : la confirmation du compte. Tour 11 : un seul modèle, le dernier compte rendu par `/me` (`MeKnowledge.me`) ;
// l'état se déduit (`deriveConfirmation`) et un changement d'`owner` ou d'`afterReload` ne remet jamais « ok » de lui-même. Le paquet web
// n'a pas d'environnement DOM : `useSessionConfirmation` n'est qu'un état `MeKnowledge`, ce vérificateur et ces fonctions pures.

const me = (id: string): MeResult => ({ ok: true, data: { user: { id } } });

/** Un état local comme `useState` : `apply` lui passe la réponse de `/me`. */
function localKnowledge() {
  const box = { k: unknownMe() };
  return {
    box,
    apply: (res: MeResult) => {
      box.k = recordMe(box.k, res);
    },
  };
}
const confirmation = (k: MeKnowledge, owner: string, afterReload: boolean): SessionConfirmation =>
  deriveConfirmation(k, owner, afterReload);

describe("confirmation du compte (dernier compte rendu par /me)", () => {
  it("inconnu : « checking » avec la marque, « ok » sans (premier rendu serveur)", () => {
    expect(confirmation(unknownMe(), "A", true)).toBe("checking");
    expect(confirmation(unknownMe(), "A", false)).toBe("ok");
  });

  it("le compte confirmé la passe « ok » ; un autre compte : « mismatch » (la page se recharge, comptée)", async () => {
    const ok = localKnowledge();
    await createConfirmer(async () => me("A"))(ok.apply);
    expect(confirmation(ok.box.k, "A", true)).toBe("ok");
    const other = localKnowledge();
    await createConfirmer(async () => me("C"))(other.apply);
    expect(confirmation(other.box.k, "B", true)).toBe("mismatch");
    expect(
      isForeign({
        owner: "B",
        layoutUserId: "B",
        announced: undefined,
        confirmed: confirmation(other.box.k, "B", true),
      }),
    ).toBe(true);
  });

  it("401 (plus de session) : « mismatch »", async () => {
    const { box, apply } = localKnowledge();
    await createConfirmer(async () => ({ ok: false, status: 401 }))(apply);
    expect(confirmation(box.k, "B", true)).toBe("mismatch");
    expect(confirmation(box.k, "B", false)).toBe("mismatch");
  });

  it("panne réseau ou délai (status 0) et erreur serveur sans compte connu : « failed » (« Recharger la page »)", async () => {
    for (const status of [0, 500, 503]) {
      const { box, apply } = localKnowledge();
      await createConfirmer(async () => ({ ok: false, status }))(apply);
      expect(confirmation(box.k, "A", true), `status ${status}`).toBe("failed");
    }
  });

  it("une revérification qui échoue ne change pas un compte déjà connu (ok comme mismatch)", async () => {
    for (const [known, expected] of [
      ["A", "ok"],
      ["C", "mismatch"],
    ] as const) {
      const { box, apply } = localKnowledge();
      await createConfirmer(async () => me(known))(apply);
      await createConfirmer(async () => ({ ok: false, status: 0 }))(apply);
      expect(confirmation(box.k, "A", false)).toBe(expected);
    }
  });

  it("la réponse d'une vérification plus ancienne que la dernière est ignorée (seq)", async () => {
    const { box, apply } = localKnowledge();
    const resolvers: Array<(r: MeResult) => void> = [];
    const verify = createConfirmer(() => new Promise<MeResult>((resolve) => resolvers.push(resolve)));
    const first = verify(apply);
    const second = verify(apply);
    (resolvers[1] as (r: MeResult) => void)(me("A"));
    await second;
    (resolvers[0] as (r: MeResult) => void)(me("C"));
    await first;
    expect(confirmation(box.k, "A", true)).toBe("ok");
  });

  it("le délai de /me est de 10 s", () => {
    expect(ME_TIMEOUT_MS).toBe(10_000);
  });

  it("la vérification lit /me avec un délai de 10 s (sans lui, « Mise à jour… » à vie) et rend la réponse telle quelle", async () => {
    const reply = me("A");
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValueOnce(reply as never);
    expect(await fetchMe()).toBe(reply);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/me", { timeoutMs: 10_000 });
  });

  it("un /me abandonné au délai (status 0) donne « failed » avec la marque, jamais « checking » à vie", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      ok: false,
      status: 0,
      error: { code: "internal", message: "x" },
    } as never);
    const { box, apply } = localKnowledge();
    await createConfirmer(fetchMe)(apply);
    expect(confirmation(box.k, "A", true)).toBe("failed");
  });
});

describe("un changement d'owner ou d'afterReload ne remet jamais « ok » (tour 11)", () => {
  it("(a) session changée, chargeur retardé, /me retenu : jamais « ok » avant la réponse", async () => {
    // Page rechargée (marque) pour B : inconnu → « checking » ; /me retenu → toujours « checking », donc aucune navigation.
    const { box, apply } = localKnowledge();
    expect(confirmation(box.k, "B", true)).toBe("checking");
    let release: (r: MeResult) => void = () => {};
    const done = createConfirmer(() => new Promise<MeResult>((resolve) => (release = resolve)))(apply);
    // Le résultat du chargeur change (autre owner), toujours rien de connu : jamais « ok ».
    expect(confirmation(box.k, "B2", true)).toBe("checking");
    release(me("B2"));
    await done;
    expect(confirmation(box.k, "B2", true)).toBe("ok");
  });

  it("(b) scénario de Codex : /me dit C pendant que la navigation charge B, puis le résultat sans la marque arrive : « mismatch »", async () => {
    const { box, apply } = localKnowledge();
    await createConfirmer(async () => me("C"))(apply);
    // Page « pending » de B : mismatch. La navigation charge les données de B ; le résultat arrive SANS la marque (afterReload faux).
    expect(confirmation(box.k, "B", true)).toBe("mismatch");
    const after = confirmation(box.k, "B", false);
    expect(after).toBe("mismatch");
    expect(isForeign({ owner: "B", layoutUserId: "B", announced: undefined, confirmed: after })).toBe(true);
    // Une revérification qui échoue ne l'efface pas non plus.
    await createConfirmer(async () => ({ ok: false, status: 0 }))(apply);
    expect(confirmation(box.k, "B", false)).toBe("mismatch");
  });

  it("l'owner qui change compare à nouveau avec le dernier compte connu", async () => {
    const { box, apply } = localKnowledge();
    await createConfirmer(async () => me("A"))(apply);
    expect(confirmation(box.k, "A", false)).toBe("ok");
    expect(confirmation(box.k, "B", false)).toBe("mismatch");
    expect(confirmation(box.k, "B", true)).toBe("mismatch");
  });

  it("« failed » ne devient pas « ok » tant que la marque est là", async () => {
    const { box, apply } = localKnowledge();
    await createConfirmer(async () => ({ ok: false, status: 0 }))(apply);
    expect(confirmation(box.k, "A", true)).toBe("failed");
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
      // Le minuteur de blocage est armé : un seul minuteur en attente.
      expect(vi.getTimerCount()).toBe(1);
      mod.resetReloadLock();
      // Tour 12 : la restauration pose elle-même le fait (une notification) ; le minuteur est annulé (aucun en attente : sans
      // `clearStall()` il resterait un minuteur, ce que le seul décompte des notifications ne voyait pas).
      expect(vi.getTimerCount()).toBe(0);
      expect(stalled).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS * 2);
      expect(stalled).toHaveBeenCalledTimes(1);
      off();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("restauration pendant un rechargement, et bouton (tours 10 et 11)", () => {
  it("resetReloadLock dit si un rechargement était en cours", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    expect(mod.resetReloadLock()).toBe(false);
    mod.reloadAutomatically("crew");
    expect(mod.resetReloadLock()).toBe(true);
    expect(mod.resetReloadLock()).toBe(false);
  });

  it("page restaurée pendant un rechargement, `foreign` inchangé : reloadStalled est vrai (le bouton), sans nouvelle navigation", async () => {
    vi.resetModules();
    const { replaced } = stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    // « Mise à jour… » : discordance connue, rechargement lancé.
    let k = mod.recordMe(mod.unknownMe(), me("C"));
    mod.reloadAutomatically("crew");
    expect(replaced).toHaveLength(1);
    expect(mod.isReloadStalled()).toBe(false);
    // Ce que fait le crochet sur un `pageshow` persisté (l'événement réel est dans la recette lotfin-e-site, tour 11).
    mod.resetReloadLock();
    k = mod.recordMe(k, me("C"));
    expect(mod.deriveConfirmation(k, "A", false)).toBe("mismatch");
    expect(mod.isReloadStalled()).toBe(true);
    expect(replaced).toHaveLength(1);
  });

  it("une restauration sans rechargement en cours ne pose pas reloadStalled", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    expect(mod.resetReloadLock()).toBe(false);
    expect(mod.isReloadStalled()).toBe(false);
  });
});

describe("le bouton de secours est un fait du document (tour 12)", () => {
  it("(a) deux pageshow persistés successifs pendant une discordance : le bouton reste", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    mod.reloadAutomatically("crew");
    mod.resetReloadLock();
    expect(mod.isReloadStalled()).toBe(true);
    // 2e restauration : plus de rechargement en cours, le fait n'est pas effacé.
    expect(mod.resetReloadLock()).toBe(false);
    expect(mod.isReloadStalled()).toBe(true);
    const k = mod.recordMe(mod.unknownMe(), me("C"));
    expect(mod.deriveConfirmation(k, "A", false)).toBe("mismatch");
  });

  it("(b) minuteur expiré, puis owner/afterReload qui changent (chargeur retardé), discordance persistante : le bouton reste", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubWindow({ storage: true });
      const mod = await import("./sessionReload");
      const k = mod.recordMe(mod.unknownMe(), me("C"));
      mod.reloadAutomatically("crew");
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS);
      expect(mod.isReloadStalled()).toBe(true);
      // Le chargeur retardé donne un autre owner, puis une autre origine : rien de cela ne touche le fait du document.
      expect(mod.deriveConfirmation(k, "B", false)).toBe("mismatch");
      expect(mod.deriveConfirmation(k, "B", true)).toBe("mismatch");
      expect(mod.isReloadStalled()).toBe(true);
      // /me ne le touche pas non plus.
      mod.recordMe(k, me("C"));
      expect(mod.isReloadStalled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("(c) reloadStalled vrai, puis nouveau rechargement automatique : faux jusqu'à l'expiration du nouveau minuteur", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const { replaced } = stubWindow({ storage: true });
      const mod = await import("./sessionReload");
      mod.reloadAutomatically("crew");
      mod.resetReloadLock();
      expect(mod.isReloadStalled()).toBe(true);
      expect(mod.reloadAutomatically("crew")).toBe("started");
      expect(replaced).toHaveLength(2);
      expect(mod.isReloadStalled()).toBe(false);
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS - 1);
      expect(mod.isReloadStalled()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(mod.isReloadStalled()).toBe(true);
      // Le geste manuel le remet aussi à faux, puis le minuteur le reposera.
      mod.reloadManually("crew");
      expect(mod.isReloadStalled()).toBe(false);
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS);
      expect(mod.isReloadStalled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un appel de rechargement refusé ou ignoré (verrou posé) ne remet pas reloadStalled à faux", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      stubWindow({ storage: true });
      const mod = await import("./sessionReload");
      mod.reloadAutomatically("crew");
      vi.advanceTimersByTime(mod.RELOAD_STALL_MS);
      expect(mod.reloadAutomatically("crew")).toBe("started");
      expect(mod.isReloadStalled()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("les abonnés sont prévenus à chaque changement du fait, pas à chaque appel", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    const seen = vi.fn();
    const off = mod.onReloadStalled(seen);
    mod.reloadAutomatically("crew");
    mod.resetReloadLock();
    expect(seen).toHaveBeenCalledTimes(1);
    mod.resetReloadLock();
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it('(d) recordMe sur un état « failed » puis réponse me("A") pour owner A : « ok »', () => {
    const failed = recordMe(unknownMe(), { ok: false, status: 0 });
    expect(deriveConfirmation(failed, "A", true)).toBe("failed");
    const next = recordMe(failed, me("A"));
    expect(next.failed).toBe(false);
    expect(deriveConfirmation(next, "A", true)).toBe("ok");
  });
});

// B2a, tour 1 : la mise en page ne recharge pas et ne lit pas `/me` ; un seul compteur (celui de la page enfant) borne les rechargements.
describe("la mise en page sous la marque : un seul compteur", () => {
  it("sous un /me qui ne correspond pas de façon répétée : 2 rechargements au plus en 20 s, jamais un de plus par la mise en page", async () => {
    vi.resetModules();
    const { replaced, store } = stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    // La page enfant (portée `crew`) est seule à recharger : 2 départs, puis le refus.
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(mod.reloadAutomatically("crew"));
      mod.resetReloadLock();
    }
    expect(results).toEqual(["started", "started", "refused", "refused"]);
    expect(replaced).toHaveLength(2);
    // Aucun compteur propre à la mise en page.
    expect(store.has("orasso-reloads:layout")).toBe(false);
  });

  it("le source de la mise en page ne demande aucun rechargement et ne lit pas /me", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../layouts/app.tsx", import.meta.url), "utf8");
    expect(src).not.toContain("useReloadWhenForeign");
    expect(src).not.toContain("useSessionConfirmation");
    expect(src).toContain("useSharedConfirmation");
  });

  it("la mise en page déduit sa confirmation du /me de l'enfant : neutre tant qu'il n'a rien dit, puis ok ou mismatch", async () => {
    vi.resetModules();
    stubWindow({ storage: true });
    const mod = await import("./sessionReload");
    // Sans DOM : l'état partagé se lit par la même déduction que le hook (`deriveConfirmation`) ; ici, le contrat de la marque.
    expect(deriveConfirmation({ me: undefined, failed: false }, "C", true)).toBe("checking");
    expect(deriveConfirmation({ me: "C", failed: false }, "C", true)).toBe("ok");
    expect(deriveConfirmation({ me: "B", failed: false }, "C", true)).toBe("mismatch");
    expect(typeof mod.useSharedConfirmation).toBe("function");
    expect(typeof mod.resetSharedMe).toBe("function");
  });
});

// B2a, tour 2 : l'état partagé avec la mise en page, lu sans React (numéros de départ, annonces étrangères, repère de la mise en page).
describe("la confirmation partagée avec la mise en page (sans React)", () => {
  beforeEach(() => resetSharedMe());
  afterEach(() => resetSharedMe());

  it("publier puis lire : la mise en page retient un /me parti après son repère", () => {
    const since = markSharedLayout();
    expect(sharedConfirmation("B", true, since)).toBe("checking");
    publishSharedMe("B", beginSharedRequest());
    expect(sharedConfirmedMe(since)).toBe("B");
    expect(sharedConfirmation("B", true, since)).toBe("ok");
    expect(sharedConfirmation("C", true, since)).toBe("mismatch");
  });

  it("l'abonné n'est prévenu qu'une fois pour la même publication ; undefined est sans effet", () => {
    const seen = vi.fn();
    const off = subscribeShared(seen);
    const at = beginSharedRequest();
    publishSharedMe(undefined, at);
    expect(seen).not.toHaveBeenCalled();
    publishSharedMe("B", at);
    publishSharedMe("B", at);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    publishSharedMe("C", beginSharedRequest());
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("une réponse plus ancienne que celle retenue ne la remplace pas ; une plus récente, si", () => {
    const first = beginSharedRequest();
    const second = beginSharedRequest();
    publishSharedMe("C", second);
    publishSharedMe("B", first);
    expect(sharedConfirmedMe(0)).toBe("C");
    publishSharedMe("D", beginSharedRequest());
    expect(sharedConfirmedMe(0)).toBe("D");
  });

  it("resetSharedMe remet tout à zéro", () => {
    publishSharedMe("B", beginSharedRequest());
    resetSharedMe();
    expect(sharedConfirmedMe(0)).toBeUndefined();
    expect(sharedConfirmation("B", true, 0)).toBe("checking");
  });

  it("/me retenu, annonce de C, puis livraison de la réponse retardée de B : pas « ok »", () => {
    const since = markSharedLayout();
    const slow = beginSharedRequest(); // le /me de B part…
    noteForeignAnnouncement(); // …C s'annonce depuis une autre fenêtre…
    publishSharedMe("B", slow); // …la réponse de B arrive après.
    expect(sharedConfirmedMe(since)).toBeUndefined();
    expect(sharedConfirmation("B", true, since)).toBe("checking");
  });

  it("une annonce étrangère fait tomber une confirmation déjà retenue ; un /me parti après elle la rétablit", () => {
    const since = markSharedLayout();
    publishSharedMe("B", beginSharedRequest());
    expect(sharedConfirmation("B", true, since)).toBe("ok");
    const seen = vi.fn();
    const off = subscribeShared(seen);
    noteForeignAnnouncement();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(sharedConfirmation("B", true, since)).toBe("checking");
    publishSharedMe("B", beginSharedRequest());
    expect(sharedConfirmation("B", true, since)).toBe("ok");
    off();
  });

  it("une publication antérieure au chargeur (repère de la mise en page) est ignorée", () => {
    publishSharedMe("B", beginSharedRequest()); // l'ancien document de la page, avant le chargeur
    const since = markSharedLayout(); // le `loaderData` de la mise en page change (retour arrière côté client)
    expect(sharedConfirmedMe(since)).toBeUndefined();
    expect(sharedConfirmation("B", true, since)).toBe("checking");
    publishSharedMe("B", beginSharedRequest()); // un /me parti après le repère
    expect(sharedConfirmation("B", true, since)).toBe("ok");
  });

  it("un /me parti avant le repère mais livré après est ignoré", () => {
    const early = beginSharedRequest();
    const since = markSharedLayout();
    publishSharedMe("B", early);
    expect(sharedConfirmation("B", true, since)).toBe("checking");
  });
});
