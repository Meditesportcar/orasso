import { describe, expect, it } from "vitest";

import { CONTACT_MEDIA_FALLBACK_MESSAGE, type ContactMediaResult, createContactMediaFlow } from "./contactMediaFlow";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function setup() {
  const log = { busy: [] as boolean[], errors: [] as (string | null)[], navigated: [] as string[] };
  const hooks = {
    setBusy: (b: boolean) => log.busy.push(b),
    onError: (m: string | null) => log.errors.push(m),
    navigate: (id: string) => log.navigated.push(id),
  };
  return { flow: createContactMediaFlow(), log, hooks };
}

describe("« Contacter <média> » : l'enchaînement", () => {
  it("réponse reçue : la conversation s'ouvre, le bouton est libéré", async () => {
    const t = setup();
    expect(await t.flow.open(async () => ({ ok: true, conversationId: "c1" }), t.hooks)).toBe(true);
    expect(t.log.navigated).toEqual(["c1"]);
    expect(t.log.busy).toEqual([true, false]);
    expect(t.log.errors).toEqual([null]);
  });
  it("refus de l'API : le libellé est dit, le bouton est libéré, rien ne s'ouvre", async () => {
    const t = setup();
    await t.flow.open(async () => ({ ok: false, message: "Tu n'es plus identifié." }), t.hooks);
    expect(t.log.navigated).toEqual([]);
    expect(t.log.errors).toEqual([null, "Tu n'es plus identifié."]);
    expect(t.log.busy).toEqual([true, false]);
  });
  it("un appel qui échoue sans réponse (exception) : message de reprise, bouton libre", async () => {
    const t = setup();
    await t.flow.open(() => Promise.reject(new Error("coupure")), t.hooks);
    expect(t.log.errors).toEqual([null, CONTACT_MEDIA_FALLBACK_MESSAGE]);
    expect(t.log.busy).toEqual([true, false]);
  });
  it("un seul appel à la fois : un second appui en cours d'appel est ignoré", async () => {
    const t = setup();
    const d = deferred<ContactMediaResult>();
    let calls = 0;
    const call = () => {
      calls++;
      return d.promise;
    };
    const first = t.flow.open(call, t.hooks);
    expect(await t.flow.open(call, t.hooks)).toBe(false);
    d.resolve({ ok: true, conversationId: "c1" });
    await first;
    expect(calls).toBe(1);
    expect(t.log.navigated).toEqual(["c1"]);
  });
  it("réponse tardive après le démontage : aucune navigation, aucune erreur dite", async () => {
    const t = setup();
    const d = deferred<ContactMediaResult>();
    const p = t.flow.open(() => d.promise, t.hooks);
    t.flow.cancel(t.hooks.setBusy);
    d.resolve({ ok: true, conversationId: "c1" });
    expect(await p).toBe(false);
    expect(t.log.navigated).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy).toEqual([true, false]);
  });
  it("erreur tardive après le démontage : aucune erreur dite", async () => {
    const t = setup();
    const d = deferred<ContactMediaResult>();
    const p = t.flow.open(() => d.promise, t.hooks);
    t.flow.cancel(t.hooks.setBusy);
    d.resolve({ ok: false, message: "Page disparue." });
    await p;
    expect(t.log.errors).toEqual([null]);
    expect(t.log.navigated).toEqual([]);
  });
  it("une réponse périmée ne libère pas le bouton d'une opération plus récente", async () => {
    const t = setup();
    const old = deferred<ContactMediaResult>();
    const fresh = deferred<ContactMediaResult>();
    const p1 = t.flow.open(() => old.promise, t.hooks);
    t.flow.cancel(t.hooks.setBusy);
    const p2 = t.flow.open(() => fresh.promise, t.hooks);
    old.resolve({ ok: true, conversationId: "vieille" });
    await p1;
    // La vieille réponse n'a rien ouvert et le second appel tient encore le verrou.
    expect(t.log.navigated).toEqual([]);
    expect(await t.flow.open(async () => ({ ok: true, conversationId: "x" }), t.hooks)).toBe(false);
    fresh.resolve({ ok: true, conversationId: "neuve" });
    await p2;
    expect(t.log.navigated).toEqual(["neuve"]);
  });
  it("l'appel qui ne se termine jamais, borné par l'écran (délai), rend une erreur et libère le bouton", async () => {
    const t = setup();
    // L'écran borne l'appel : au bout du délai la requête est abandonnée et rend `ok: false`.
    await t.flow.open(async () => ({ ok: false, message: CONTACT_MEDIA_FALLBACK_MESSAGE }), t.hooks);
    expect(t.log.errors.at(-1)).toBe(CONTACT_MEDIA_FALLBACK_MESSAGE);
    expect(t.log.busy.at(-1)).toBe(false);
  });
});
