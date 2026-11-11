// Lot R8c1, tour 3 (relecture Codex) : curseur sans publication invisible, synchronisation hors ligne sans carte perdue,
// classement stable quand des flammes sont retirées, nouveautés qui ne s'arrêtent pas aux 60 premières publications à moi.

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, createStructure, resetDb, seedReference, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { feedPostReactions, structures } from "../../db/schema";
import { decodeCursor } from "./cursor";
import { dbPost, fil, flames, follow, HOUR, person, postIds, seen, view, walk } from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  await seedReference();
});

const at = (minutes: number) => new Date(clock.now.getTime() - minutes * 60_000);

describe("tour 3", () => {
  it("le curseur ne porte jamais une publication invisible (page suspendue, supprimée) : état de la page vérifié avant le LIMIT", async () => {
    const author = await person("Auteur_Tail");
    const orga = await person("Orga_Tail");
    const bad = await createStructure(orga.id);
    const gone = await createStructure(orga.id);
    const me = await person("Lecteur_Tail");
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, bad.id));
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, gone.id));
    // 296 publications visibles, 6 invisibles datées au milieu de la fin de la fenêtre, puis des visibles plus anciennes.
    const visible: string[] = [];
    const invisible: string[] = [];
    for (let i = 0; i < 310; i++) {
      const date = at(1 + i);
      if (i >= 296 && i < 302) {
        invisible.push(await dbPost(orga, date, { persona: "organizer", structureId: i % 2 ? bad.id : gone.id }));
      } else visible.push(await dbPost(author, date));
    }
    const res = await fil(me);
    expect(res.next).toBeTruthy();
    const cursor = decodeCursor(res.next as string);
    const keys = [...(cursor?.x ?? []), ...(cursor?.phase === 1 ? [{ id: cursor.frontier }] : [])];
    for (const k of keys) for (const id of invisible) expect(k.id).not.toContain(id);
    expect(JSON.stringify(res.json)).not.toContain(invisible[0]);
    expect((cursor?.x.length ?? 0) > 0).toBe(true);
  }, 120_000);

  it("une ouverture reçue tard (heure d'avant le parcours) ne fait perdre aucune carte au parcours en cours", async () => {
    const author = await person("Auteur_Synchro");
    const me = await person("Lecteur_Synchro");
    const all: string[] = [];
    for (let i = 0; i < 50; i++) all.push(await dbPost(author, at(1 + i)));
    // 40 cartes vues (zone B), 10 neuves (zone A).
    await view(me, all.slice(10));
    clock.advance(60_000);
    const first = await fil(me, "?filter=nearby");
    expect(first.items.length).toBe(20);
    // Synchronisation hors ligne reçue après le début du parcours : « ouverte » avec une heure d'avant `ref`.
    clock.advance(60_000);
    const early = new Date(clock.now.getTime() - 20 * HOUR).toISOString();
    await seen(
      me,
      all.slice(30).map((p) => ({ id: `feed_post:${p}`, action: "open" as const, at: early })),
    );
    const got = [...postIds(first.items)];
    let cursor = first.next;
    while (cursor) {
      const page = await fil(me, `?filter=nearby&cursor=${cursor}`);
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    expect(new Set(got).size).toBe(50);
    expect(got.length).toBe(50);
  });

  it("des flammes retirées entre deux pages : le parcours repart (reset), aucune carte servie deux fois", async () => {
    const author = await person("Auteur_Retrait");
    const me = await person("Lecteur_Retrait");
    const fan = await person("Fan_Retrait");
    const posts: string[] = [];
    for (let i = 0; i < 60; i++) posts.push(await dbPost(author, at(5 + i)));
    for (const p of posts.slice(0, 30)) await flames(p, [fan], at(1));
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    // Les flammes sont retirées : les scores changent, la frontière du curseur ne tient plus.
    await db.delete(feedPostReactions).where(eq(feedPostReactions.userId, fan.id));
    const second = await fil(me, `?cursor=${first.next}`);
    expect(second.status).toBe(200);
    expect(second.json.reset).toBe(true);
    const got = [...postIds(second.items)];
    let cursor = second.next;
    while (cursor) {
      const page = await fil(me, `?cursor=${cursor}`);
      expect(page.json.reset).toBeUndefined();
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    expect(got.length).toBe(60);
    expect(new Set(got).size).toBe(60);
    // Sans changement de flammes, aucun reset.
    const pages = await walk(me, "for_you");
    expect(pages.flat().length).toBe(60);
  }, 120_000);

  it("fresh : 60 publications à moi devant une publication suivie nouvelle : le compte est 1, pas 0", async () => {
    const author = await person("Auteur_Neuf3");
    const me = await person("Lecteur_Neuf3");
    await follow(me, author);
    const since = at(300);
    await dbPost(author, at(200));
    for (let i = 0; i < 70; i++) await dbPost(me, at(1 + i));
    for (const filter of ["for_you", "following", "nearby"]) {
      const res = await call(me, "GET", `/fil/fresh?filter=${filter}&since=${encodeURIComponent(since.toISOString())}`);
      expect(res.json.count, filter).toBe(1);
    }
  }, 120_000);
});
