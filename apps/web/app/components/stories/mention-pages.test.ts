// Lot R7h, tour 4 : les pages « Voir plus » sont relues à la même profondeur à la revalidation.
import type { StoryMentionItem, StoryMentions } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { type FetchPage, MentionPager, type PageResult, type PagerState, rereadPages } from "./mention-pages";

const item = (id: string, copyId: string | null = null): StoryMentionItem =>
  ({ storyId: id, copyId, authorName: id }) as StoryMentionItem;

/** Trois pages au-delà de la première : c1 -> [a1, a2] (suite c2), c2 -> [b1, b2] (suite c3), c3 -> [z1]. */
function server(db: Record<string, StoryMentionItem[]>): FetchPage {
  const next: Record<string, string | null> = { c1: "c2", c2: "c3", c3: null };
  return async (cursor) => ({
    ok: true,
    data: { items: db[cursor] ?? [], nextCursor: next[cursor] ?? null, count: 5 } as StoryMentions,
  });
}

describe("relecture des pages « Voir plus »", () => {
  it("une modification distante sur la deuxième page apparaît à la revalidation (plus d'« Ajouter »)", async () => {
    const db: Record<string, StoryMentionItem[]> = {
      c1: [item("a1"), item("a2")],
      c2: [item("b1"), item("b2")],
      c3: [item("z1")],
    };
    const fetchPage = server(db);
    const first = await rereadPages(fetchPage, "c1", 2, () => true);
    expect(first).toMatchObject({ ok: true, depth: 2, next: "c3" });
    expect(first?.ok && first.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
    // Un autre responsable repartage b2 : ni le compteur ni la première page ne changent.
    db.c2 = [item("b1"), item("b2", "copie-b2")];
    const again = await rereadPages(fetchPage, "c1", 2, () => true);
    expect(again?.ok && again.items.map((m) => m.copyId)).toEqual([null, null, null, "copie-b2"]);
    expect(again).toMatchObject({ depth: 2, next: "c3" });
  });

  it("s'arrête quand l'API n'a plus de suite, et rend la profondeur réellement lue", async () => {
    const out = await rereadPages(
      server({ c1: [item("a1")], c2: [item("b1")], c3: [item("z1")] }),
      "c1",
      5,
      () => true,
    );
    expect(out).toMatchObject({ ok: true, depth: 3, next: null });
  });

  it("une lecture dépassée n'applique rien", async () => {
    let live = true;
    const fetchPage: FetchPage = async (c) => {
      live = false;
      return server({ c1: [item("a1")] })(c);
    };
    expect(await rereadPages(fetchPage, "c1", 1, () => live)).toBeNull();
  });

  it("une page en échec rend l'erreur sans rien appliquer", async () => {
    const fetchPage: FetchPage = async () => ({ ok: false, error: { message: "Service indisponible" } });
    expect(await rereadPages(fetchPage, "c1", 1, () => true)).toEqual({ ok: false, error: "Service indisponible" });
  });

  it("n'affiche jamais deux fois la même mention", async () => {
    const out = await rereadPages(
      server({ c1: [item("a1"), item("a2")], c2: [item("a2"), item("b1")] }),
      "c1",
      2,
      () => true,
    );
    expect(out?.ok && out.items.map((m) => m.storyId)).toEqual(["a1", "a2", "b1"]);
  });
});

// Lot R7h, tour 5 : le pager (le cœur du hook) sérialise relecture et « Voir plus », et jette les lectures périmées.
const firstPage = (ids: string[], next: string | null): StoryMentions =>
  ({ items: ids.map((i) => item(i)), nextCursor: next, count: 9 }) as StoryMentions;

/** Une page dont la réponse est rendue à la main : permet d'ordonner les réponses. */
function deferred() {
  let resolve!: (r: PageResult) => void;
  const promise = new Promise<PageResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const page = (ids: string[], next: string | null, copies: Record<string, string> = {}): PageResult => ({
  ok: true,
  data: {
    items: ids.map((i) => item(i, copies[i] ?? null)),
    nextCursor: next,
    count: 9,
  } as StoryMentions,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("pager des mentions (hook)", () => {
  it("« Voir plus » pendant la relecture est ignoré : la relecture s'applique (plus d'« Ajouter » périmé)", async () => {
    const reread = deferred();
    const calls: string[] = [];
    let mode: "more" | "reread" = "more";
    const fetchPage: FetchPage = async (c) => {
      calls.push(c);
      if (mode === "reread") return reread.promise;
      return page(["b1", "b2"], "c3");
    };
    const states: PagerState[] = [];
    const pager = new MentionPager(fetchPage, (s) => states.push(s));
    pager.sync(firstPage(["a1"], "c2"));
    await pager.more(); // profondeur 1 : b1, b2
    expect(pager.state.depth).toBe(1);
    // Revalidation : relecture lancée (busy), puis clic sur « Voir plus » pendant la relecture.
    mode = "reread";
    pager.sync(firstPage(["a0", "a1"], "c2")); // une mention de plus en tête : la première page a changé
    expect(pager.state.busy).toBe(true);
    await pager.more();
    expect(calls).toEqual(["c2", "c2"]); // aucun nouvel appel pour le clic
    reread.resolve(page(["b1", "b2"], "c3", { b2: "copie-b2" }));
    await flush();
    expect(pager.state.busy).toBe(false);
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBe("copie-b2");
    expect(pager.state.depth).toBe(1);
  });

  it("son propre « Ajouter » puis « Retirer » en page 2, première page inchangée : la page est relue à chaque geste", async () => {
    let copy: string | null = null;
    const fetchPage: FetchPage = async () => page(["b1", "b2"], null, copy ? { b2: copy } : {});
    const pager = new MentionPager(fetchPage, () => undefined);
    const first = firstPage(["a1"], "c2");
    pager.sync(first);
    await pager.more(); // profondeur 1 : b1, b2 (b2 sans copie)
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
    // L'organisateur ajoute b2 : la page revient avec la même première page (tri par date de publication).
    copy = "copie-b2";
    pager.sync(firstPage(["a1"], "c2")); // revalidation ordinaire : rien (première page identique)
    await flush();
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
    pager.sync(firstPage(["a1"], "c2"), true); // retour d'un geste : relecture forcée
    await flush();
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBe("copie-b2");
    // Puis il la retire : même première page, relecture forcée, la ligne revient à « Ajouter ».
    copy = null;
    pager.sync(firstPage(["a1"], "c2"), true);
    await flush();
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
  });

  it("un geste revenu pendant le premier « Voir plus » (première page identique) : la réponse est relue aussitôt", async () => {
    const slow = deferred();
    let copy: string | null = "copie-b2";
    const calls: string[] = [];
    let first = true;
    const fetchPage: FetchPage = async (c) => {
      calls.push(c);
      if (first) {
        first = false;
        return slow.promise;
      }
      return page(["b1", "b2"], null, copy ? { b2: copy } : {});
    };
    const pager = new MentionPager(fetchPage, () => undefined);
    pager.sync(firstPage(["a1"], "c2"));
    const pending = pager.more(); // profondeur zéro, réponse retardée
    // Pendant ce temps, l'organisateur retire la copie de b2 depuis « Ma story » : même première page, relecture forcée.
    copy = null;
    pager.sync(firstPage(["a1"], "c2"), true);
    expect(pager.state.busy).toBe(true);
    // La réponse lue avant le retrait arrive, avec la copie supprimée.
    slow.resolve(page(["b1", "b2"], null, { b2: "copie-b2" }));
    await pending;
    await flush();
    expect(calls).toEqual(["c2", "c2"]);
    expect(pager.state.busy).toBe(false);
    expect(pager.state.depth).toBe(1);
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
  });

  it("un geste dont la lecture des mentions échoue (première page absente) : la relecture forcée attend la page suivante", async () => {
    let copy: string | null = null;
    let calls = 0;
    const fetchPage: FetchPage = async () => {
      calls++;
      return page(["b1", "b2"], null, copy ? { b2: copy } : {});
    };
    const pager = new MentionPager(fetchPage, () => undefined);
    pager.sync(firstPage(["a1"], "c2"));
    await pager.more(); // profondeur 1, b2 sans copie
    copy = "copie-b2"; // l'ajout réussit dans l'API…
    pager.sync(null, true); // …mais la lecture des mentions de ce chargement échoue
    await flush();
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBeNull();
    pager.sync(firstPage(["a1"], "c2"), false); // l'adresse nettoyée recharge une première page identique
    await flush();
    expect(pager.state.items.find((m) => m.storyId === "b2")?.copyId).toBe("copie-b2");
    expect(calls).toBe(2);
    pager.sync(firstPage(["a1"], "c2"), false); // la dette est payée : plus de relecture
    await flush();
    expect(calls).toBe(2);
    expect(pager.state.busy).toBe(false);
  });

  it("une première page qui change pendant le premier « Voir plus » (profondeur zéro) jette la réponse et reprend du nouveau curseur", async () => {
    const old = deferred();
    const calls: string[] = [];
    const fetchPage: FetchPage = async (c) => {
      calls.push(c);
      return c === "ancien" ? old.promise : page(["n3", "n4"], null);
    };
    const pager = new MentionPager(fetchPage, () => undefined);
    pager.sync(firstPage(["a1", "a2"], "ancien"));
    const pending = pager.more();
    expect(pager.state.busy).toBe(true);
    // De nouvelles mentions ont décalé les pages : nouvelle première page, nouveau curseur.
    pager.sync(firstPage(["n1", "n2"], "nouveau"));
    expect(pager.state.busy).toBe(false);
    expect(pager.next).toBe("nouveau");
    old.resolve(page(["vieille-page"], null));
    await pending;
    expect(pager.state.items).toEqual([]); // l'ancienne deuxième page n'est jamais acceptée
    expect(pager.state.depth).toBe(0);
    await pager.more();
    expect(calls).toEqual(["ancien", "nouveau"]);
    expect(pager.state.items.map((m) => m.storyId)).toEqual(["n3", "n4"]);
  });

  it("une revalidation sans changement ne jette pas un « Voir plus » en cours (profondeur zéro)", async () => {
    const slow = deferred();
    const pager = new MentionPager(
      () => slow.promise,
      () => undefined,
    );
    pager.sync(firstPage(["a1"], "c1"));
    const pending = pager.more();
    pager.sync(firstPage(["a1"], "c1")); // même contenu
    expect(pager.state.busy).toBe(true);
    slow.resolve(page(["b1"], null));
    await pending;
    expect(pager.state.items.map((m) => m.storyId)).toEqual(["b1"]);
  });
});

describe("revalidations regroupées pendant une relecture (tour 6)", () => {
  it("une première page identique ne relance pas la relecture", async () => {
    const calls: string[] = [];
    const fetchPage: FetchPage = async (c) => {
      calls.push(c);
      return page(["b1"], null);
    };
    const pager = new MentionPager(fetchPage, () => undefined);
    pager.sync(firstPage(["a1"], "c2"));
    await pager.more();
    pager.sync(firstPage(["a1"], "c2"));
    pager.sync(firstPage(["a1"], "c2"));
    await flush();
    expect(calls).toEqual(["c2"]);
    expect(pager.state.busy).toBe(false);
  });

  it("plusieurs revalidations avant la fin d'une relecture lente : elle aboutit, une seule relecture de plus, « Voir plus » redevient actif", async () => {
    const gates: Array<ReturnType<typeof deferred>> = [];
    let slow = false;
    const calls: string[] = [];
    const fetchPage: FetchPage = async (c) => {
      calls.push(c);
      if (!slow) return page(["b1"], "c3");
      const g = deferred();
      gates.push(g);
      return g.promise;
    };
    const pager = new MentionPager(fetchPage, () => undefined);
    pager.sync(firstPage(["a1"], "c2"));
    await pager.more(); // profondeur 1
    slow = true;
    pager.sync(firstPage(["a0", "a1"], "c2")); // lance la relecture
    pager.sync(firstPage(["a9", "a0", "a1"], "c2")); // regroupées : ne redémarrent pas la relecture
    pager.sync(firstPage(["a8", "a9", "a0", "a1"], "c2"));
    expect(gates).toHaveLength(1);
    expect(pager.state.busy).toBe(true);
    gates[0]?.resolve(page(["b1"], "c3"));
    await flush();
    expect(gates).toHaveLength(2); // une seule relecture de plus, sur la dernière première page
    expect(pager.state.busy).toBe(true);
    gates[1]?.resolve(page(["b1"], "c3", { b1: "copie" }));
    await flush();
    expect(pager.state.busy).toBe(false);
    expect(pager.state.items.find((m) => m.storyId === "b1")?.copyId).toBe("copie");
    expect(calls).toEqual(["c2", "c2", "c2"]);
    void pager.more();
    await flush();
    expect(gates).toHaveLength(3); // « Voir plus » est de nouveau actif (curseur c3)
  });
});
