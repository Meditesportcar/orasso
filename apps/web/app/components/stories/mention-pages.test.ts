// Lot R7h, tour 4 : les pages « Voir plus » sont relues à la même profondeur à la revalidation.
import type { StoryMentionItem, StoryMentions } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { type FetchPage, rereadPages } from "./mention-pages";

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
