// « Contacter <média> » (site, lot R9i tour 2) : l'appel est borné par un délai ; une réponse qui ne vient jamais est abandonnée, l'erreur
// est dite et le bouton redevient actif. (`apiFetch` abandonne la requête au `timeoutMs` demandé : `api.client.ts` ; ici il est simulé.)
import { type ContactMediaResult, createContactMediaFlow } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  CONTACT_MEDIA_TIMEOUT_MS,
  contactMediaCall,
  guardedNavigate,
  type NavigationSnapshot,
  navigationLeavesPage,
} from "./contactMedia";

const KEY = "m:11111111-1111-4111-8111-111111111111";
type Fetcher = NonNullable<Parameters<typeof contactMediaCall>[1]>;

describe("contactMediaCall", () => {
  it("une réponse qui ne se termine jamais : requête abandonnée au délai, erreur dite, bouton libre", async () => {
    const asked: { path: string; timeoutMs?: number }[] = [];
    // Comme `apiFetch` : sans `timeoutMs`, une connexion qui reste ouverte n'est jamais abandonnée (la promesse ne se termine pas) ;
    // avec, la requête est abandonnée et rend l'erreur de connexion.
    const fetcher = ((path: string, init: { timeoutMs?: number } = {}) => {
      asked.push({ path, timeoutMs: init.timeoutMs });
      return new Promise((resolve) => {
        if (init.timeoutMs)
          setTimeout(
            () =>
              resolve({
                ok: false,
                status: 0,
                error: { code: "internal", message: "Connexion impossible. Réessaie." },
              }),
            5,
          );
      });
    }) as unknown as Fetcher;
    const call = contactMediaCall(KEY, fetcher);
    expect(call).not.toBeNull();
    const busy: boolean[] = [];
    const errors: (string | null)[] = [];
    const navigated: string[] = [];
    await createContactMediaFlow().open(call as NonNullable<typeof call>, {
      setBusy: (b) => busy.push(b),
      onError: (m) => errors.push(m),
      navigate: (id) => navigated.push(id),
    });
    expect(asked).toEqual([{ path: `/media/${KEY.slice(2)}/conversation`, timeoutMs: CONTACT_MEDIA_TIMEOUT_MS }]);
    expect(busy).toEqual([true, false]);
    expect(errors.at(-1)).toBe("Connexion impossible. Réessaie.");
    expect(navigated).toEqual([]);
  });
  it("réponse reçue : l'identifiant de la conversation ; refus : le libellé de l'API", async () => {
    const ok = (async () => ({ ok: true, status: 200, data: { id: "c1" } })) as unknown as Fetcher;
    expect(await contactMediaCall(KEY, ok)?.()).toEqual({ ok: true, conversationId: "c1" });
    const refused = (async () => ({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "Refusé." },
    })) as unknown as Fetcher;
    expect(await contactMediaCall(KEY, refused)?.()).toEqual({ ok: false, message: "Refusé." });
  });
  it("clé de média illisible : pas d'appel", () => {
    expect(contactMediaCall("n'importe quoi")).toBeNull();
  });
});

// Le câblage de l'écran (`useContactMedia`) sans DOM : un routeur simulé, dont la navigation vers une autre page (chargeurs en cours) est
// l'état `loading` ; l'ancien écran reste monté pendant ce temps. Ni la réponse de « Contacter » ni le chargement de la destination ne
// sont immédiats : on les rend l'une et l'autre à la main, dans l'ordre qui a fait échouer l'ancien code (la réponse d'abord).
describe("« Contacter <média> » : une navigation choisie ensuite", () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };
  function screen(wired: boolean) {
    const router = { nav: { state: "idle", pathname: null } as NavigationSnapshot, here: "/app/albums/x" };
    const log = { busy: [] as boolean[], errors: [] as (string | null)[], opened: [] as string[] };
    const flow = createContactMediaFlow();
    const setBusy = (b: boolean) => log.busy.push(b);
    // L'effet de `useContactMedia` : dès qu'une navigation vers une autre adresse commence, l'opération est annulée.
    const goTo = (pathname: string) => {
      router.nav = { state: "loading", pathname };
      if (wired && navigationLeavesPage(router.nav, router.here)) flow.cancel(setBusy);
    };
    const arrived = () => {
      router.nav = { state: "idle", pathname: null };
    };
    const open = (call: () => Promise<ContactMediaResult>) =>
      flow.open(call, {
        setBusy,
        onError: (m) => log.errors.push(m),
        navigate: guardedNavigate(
          () => router.nav,
          (to) => log.opened.push(to),
        ),
      });
    return { router, log, goTo, arrived, open };
  }
  it("repos : la conversation s'ouvre", async () => {
    const t = screen(true);
    await t.open(async () => ({ ok: true, conversationId: "c1" }));
    expect(t.log.opened).toEqual(["/app/messages/c1"]);
  });
  it("les deux réponses en retard : la destination choisie ensuite n'est pas remplacée, le bouton est libre, aucune erreur", async () => {
    const t = screen(true);
    const contact = deferred<ContactMediaResult>();
    const destination = deferred<void>();
    const p = t.open(() => contact.promise);
    t.goTo("/app/evenements/autre");
    contact.resolve({ ok: true, conversationId: "tard" });
    await p;
    destination.resolve();
    await destination.promise;
    t.arrived();
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy.at(-1)).toBe(false);
  });
  it("même sans l'annulation, la navigation n'a pas lieu tant que le routeur charge une autre page", async () => {
    const t = screen(false);
    const contact = deferred<ContactMediaResult>();
    const p = t.open(() => contact.promise);
    t.goTo("/app/evenements/autre");
    contact.resolve({ ok: true, conversationId: "tard" });
    await p;
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy.at(-1)).toBe(false);
  });
  it("seule une autre adresse annule : un rechargement de la même page ne coupe pas l'appel", () => {
    expect(navigationLeavesPage({ state: "loading", pathname: "/app/albums/x" }, "/app/albums/x")).toBe(false);
    expect(navigationLeavesPage({ state: "idle", pathname: null }, "/app/albums/x")).toBe(false);
    expect(navigationLeavesPage({ state: "loading", pathname: "/app/messages" }, "/app/albums/x")).toBe(true);
    expect(navigationLeavesPage({ state: "submitting", pathname: "/app/messages" }, "/app/albums/x")).toBe(true);
  });
});
