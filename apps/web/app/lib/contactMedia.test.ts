// « Contacter <média> » (site, lot R9i tour 2) : l'appel est borné par un délai ; une réponse qui ne vient jamais est abandonnée, l'erreur
// est dite et le bouton redevient actif. (`apiFetch` abandonne la requête au `timeoutMs` demandé : `api.client.ts` ; ici il est simulé.)
import { CONTACT_MEDIA_FALLBACK_MESSAGE, type ContactMediaResult, createContactMediaFlow } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  CONTACT_MEDIA_TIMEOUT_MS,
  contactMediaCall,
  createContactMediaController,
  navigationLeavesPage,
  type RouterLike,
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

// Le contrôleur câblé au routeur (`createContactMediaController`, celui du site) face à un routeur simulé : la navigation vers une autre page
// (chargeurs en cours) est l'état `loading` ; l'ancien écran reste monté pendant ce temps. Ni la réponse de « Contacter » ni le chargement
// de la destination ne sont immédiats : on les rend l'un et l'autre à la main, dans l'ordre qui a fait échouer l'ancien code. Le câblage
// du crochet au routeur (clic, retour arrière) est prouvé en navigateur par `lotr9i-site.spec.ts`.
describe("« Contacter <média> » : une navigation choisie ensuite", () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };
  const HERE = "/app/albums/x";
  function screen(settleTimeoutMs?: number) {
    const state: RouterLike["state"] = { location: { pathname: HERE }, navigation: { state: "idle" } };
    const listeners = new Set<() => void>();
    const router: RouterLike = {
      state,
      subscribe: (l) => {
        listeners.add(l);
        return () => void listeners.delete(l);
      },
    };
    const log = { busy: [] as boolean[], errors: [] as (string | null)[], opened: [] as string[] };
    const controller = createContactMediaController({
      router,
      navigate: (to) => log.opened.push(to),
      onError: (m) => log.errors.push(m),
      setBusy: (b) => log.busy.push(b),
      settleTimeoutMs,
    });
    // Le routeur change d'état ; `notify` : les abonnés sont prévenus (sinon la réponse lit l'état sans avoir été prévenue : fenêtre de
    // `startTransition`, où l'état rendu dit encore « au repos »).
    const loading = (pathname: string, notify = true) => {
      state.navigation = { state: "loading", location: { pathname } };
      if (notify) for (const l of [...listeners]) l();
    };
    const idle = (at = state.location.pathname) => {
      state.navigation = { state: "idle" };
      state.location = { pathname: at };
      for (const l of [...listeners]) l();
    };
    return { log, controller, loading, idle, listeners };
  }
  it("repos : la conversation s'ouvre", async () => {
    const t = screen();
    await t.controller.open(async () => ({ ok: true, conversationId: "c1" }), HERE);
    expect(t.log.opened).toEqual(["/app/messages/c1"]);
    expect(t.listeners.size).toBe(0);
  });
  it("les deux réponses en retard : la destination choisie ensuite n'est pas remplacée, le bouton est libre, aucune erreur", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.loading("/app/evenements/autre");
    contact.resolve({ ok: true, conversationId: "tard" });
    await p;
    t.idle("/app/evenements/autre");
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy.at(-1)).toBe(false);
    expect(t.listeners.size).toBe(0);
  });
  it("fenêtre de startTransition : le routeur charge une autre page sans avoir prévenu, la réponse le lit dans le routeur", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.loading("/app/evenements/autre", false);
    contact.resolve({ ok: true, conversationId: "tard" });
    await p;
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy.at(-1)).toBe(false);
  });
  it("adresse déjà atteinte (la page a changé avant la réponse) : rien ne s'ouvre", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.idle("/app/messages");
    contact.resolve({ ok: true, conversationId: "tard" });
    await p;
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
  });
  it("même adresse en rechargement à la réponse : on attend le retour au repos, puis la conversation s'ouvre", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.loading(HERE);
    contact.resolve({ ok: true, conversationId: "c2" });
    await p;
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    t.idle();
    // La navigation part après la fin de la mise à jour du routeur (jamais depuis son propre abonné).
    expect(t.log.opened).toEqual([]);
    await Promise.resolve();
    expect(t.log.opened).toEqual(["/app/messages/c2"]);
    expect(t.listeners.size).toBe(0);
  });
  it("retour au repos, puis annulation avant la micro-tâche : aucune navigation", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.loading(HERE);
    contact.resolve({ ok: true, conversationId: "c5" });
    await p;
    t.idle();
    // La micro-tâche de navigation est placée ; l'annulation (changement de compte) passe avant elle.
    t.controller.cancel();
    await Promise.resolve();
    expect(t.log.opened).toEqual([]);
  });
  it("même adresse en rechargement qui ne finit pas : l'erreur de reprise est dite au délai, rien ne s'ouvre", async () => {
    const t = screen(20);
    const p = t.controller.open(async () => ({ ok: true, conversationId: "c3" }), HERE);
    t.loading(HERE);
    await p;
    await new Promise((r) => setTimeout(r, 60));
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors.at(-1)).toBe(CONTACT_MEDIA_FALLBACK_MESSAGE);
    expect(t.listeners.size).toBe(0);
  });
  it("en attente du repos, un départ vers une autre adresse annule l'ouverture sans rien dire", async () => {
    const t = screen();
    const p = t.controller.open(async () => ({ ok: true, conversationId: "c4" }), HERE);
    t.loading(HERE);
    await p;
    t.loading("/app/evenements/autre");
    t.idle("/app/evenements/autre");
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.listeners.size).toBe(0);
  });
  it("changement de compte (cancel) : la réponse de l'ancien compte n'ouvre rien, ne dit rien, le bouton est libre", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const p = t.controller.open(() => contact.promise, HERE);
    t.controller.cancel();
    contact.resolve({ ok: true, conversationId: "ancien-compte" });
    await p;
    expect(t.log.opened).toEqual([]);
    expect(t.log.errors).toEqual([null]);
    expect(t.log.busy).toEqual([true, false]);
    expect(t.listeners.size).toBe(0);
  });
  it("un second appel pendant le premier est ignoré, sans toucher à ses écoutes", async () => {
    const t = screen();
    const contact = deferred<ContactMediaResult>();
    const first = t.controller.open(() => contact.promise, HERE);
    expect(await t.controller.open(async () => ({ ok: true, conversationId: "deux" }), HERE)).toBe(false);
    t.loading("/app/evenements/autre");
    contact.resolve({ ok: true, conversationId: "un" });
    await first;
    expect(t.log.opened).toEqual([]);
  });
  it("seule une autre adresse annule : un rechargement de la même page ne coupe pas l'appel", () => {
    expect(navigationLeavesPage({ state: "loading", pathname: "/app/albums/x" }, "/app/albums/x")).toBe(false);
    expect(navigationLeavesPage({ state: "idle", pathname: null }, "/app/albums/x")).toBe(false);
    expect(navigationLeavesPage({ state: "loading", pathname: "/app/messages" }, "/app/albums/x")).toBe(true);
    expect(navigationLeavesPage({ state: "submitting", pathname: "/app/messages" }, "/app/albums/x")).toBe(true);
  });
});
