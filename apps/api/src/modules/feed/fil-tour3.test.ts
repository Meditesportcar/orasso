// Lot R8c1, tour 3 (relecture Codex) : curseur sans publication invisible, synchronisation hors ligne sans carte perdue,
// classement stable quand des flammes sont retirées, nouveautés qui ne s'arrêtent pas aux 60 premières publications à moi.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { call, createStructure, resetDb, seedReference, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { feedPostReactions, feedSeen, feedSeenFloor, profiles, structures } from "../../db/schema";
import { decodeCursor } from "./cursor";
import { dbPost, fil, flames, follow, HOUR, ids, person, postIds, seen, view, walk } from "./fil-test-helpers";

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

  it("tour 4 : plafond de 5 000 vues atteint en plein parcours : aucune carte perdue ni doublée, aucune carte évincée ne revient en zone A", async () => {
    const author = await person("Auteur_Plafond4");
    const me = await person("Lecteur_Plafond4");
    const posts: string[] = [];
    for (let i = 0; i < 25; i++) posts.push(await dbPost(author, at(360 + i)));
    // Leurs vues sont les plus anciennes du compte ; 5 000 autres vues (autres cartes) sont plus récentes.
    await db.insert(feedSeen).values(posts.map((p) => ({ userId: me.id, cardId: `feed_post:${p}`, seenAt: at(300) })));
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'lineup:' || gen_random_uuid()::text, ${at(60).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 5000) g`);
    clock.advance(60_000);
    const first = await fil(me, "?filter=nearby");
    expect(first.items.length).toBe(20);
    expect(first.items.every((c) => c.seen)).toBe(true);
    // Une nouvelle vue fait dépasser le plafond : les 25 vues les plus anciennes sont évincées.
    await view(me, [await dbPost(author, at(0))]);
    expect((await db.select().from(feedSeen).where(eq(feedSeen.userId, me.id))).length).toBe(4000);
    expect((await db.select().from(feedSeenFloor).where(eq(feedSeenFloor.userId, me.id))).length).toBe(1);
    clock.advance(60_000);
    // La borne n'est pas dans l'empreinte : le parcours continue sans reset, rien n'est perdu ni doublé.
    const second = await fil(me, `?filter=nearby&cursor=${first.next}`);
    expect(second.json.reset).toBeUndefined();
    const got = [...postIds(first.items), ...postIds(second.items)];
    let cursor = second.next;
    while (cursor) {
      const page = await fil(me, `?filter=nearby&cursor=${cursor}`);
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    // Au parcours suivant : les 25 cartes évincées restent « déjà vues » (zone B), la nouvelle est en zone A.
    const all = (await walk(me, "nearby")).flat();
    const byId = new Map(all.map((c) => [postIds([c])[0], c.seen]));
    for (const p of posts) expect(byId.get(p), p).toBe(true);
    expect(new Set(got).size).toBe(got.length);
    expect(got.length).toBe(25);
    expect(all.length).toBe(26);
  }, 120_000);

  it("tour 4 : une flamme retirée plus bas que la frontière ne renvoie pas le lecteur en haut", async () => {
    const author = await person("Auteur_Bas4");
    const me = await person("Lecteur_Bas4");
    const fan = await person("Fan_Bas4");
    const posts: string[] = [];
    for (let i = 0; i < 60; i++) posts.push(await dbPost(author, at(5 + i * 30)));
    await flames(posts[59] as string, [fan], at(1));
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    expect(postIds(first.items)).not.toContain(posts[59]);
    await db.delete(feedPostReactions).where(eq(feedPostReactions.userId, fan.id));
    const second = await fil(me, `?cursor=${first.next}`);
    expect(second.json.reset).toBeUndefined();
    expect(second.items.length).toBe(20);
  }, 120_000);

  it("tour 4 : « Moins de ce genre » : fresh ne lit pas les publications (aucune requête sur feed_posts)", async () => {
    const author = await person("Auteur_Moins4");
    const me = await person("Lecteur_Moins4");
    await follow(me, author);
    for (let i = 0; i < 70; i++) await dbPost(author, at(1 + i));
    await db
      .update(profiles)
      .set({ feedLessKinds: ["feed_post"] })
      .where(eq(profiles.userId, me.id));
    const original = pool.query.bind(pool);
    const texts: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: espion de requêtes
    (pool as any).query = (...args: unknown[]) => {
      texts.push(JSON.stringify(args[0]));
      // biome-ignore lint/suspicious/noExplicitAny: voir ci-dessus
      return (original as any)(...args);
    };
    try {
      const res = await call(
        me,
        "GET",
        `/fil/fresh?filter=following&since=${encodeURIComponent(at(300).toISOString())}`,
      );
      expect(res.json.count).toBe(0);
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: remise en place
      (pool as any).query = original;
    }
    expect(texts.filter((t) => t.includes('from "feed_posts"')).length).toBe(0);
  }, 120_000);

  it("tour 5 : au plafond, des envois de vues successifs pendant un parcours ne le font pas repartir et la borne reste stable", async () => {
    const author = await person("Auteur_Palier5");
    const me = await person("Lecteur_Palier5");
    const posts: string[] = [];
    for (let i = 0; i < 45; i++) posts.push(await dbPost(author, at(60 + i)));
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'lineup:' || gen_random_uuid()::text, ${at(120).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 5000) g`);
    clock.advance(60_000);
    // Premier envoi : au-delà du plafond, rognage par palier (4 000) ; la borne est posée une fois.
    await view(me, [await dbPost(author, at(0))]);
    const floor0 = (await db.select().from(feedSeenFloor).where(eq(feedSeenFloor.userId, me.id)))[0]?.floorAt;
    expect(floor0).toBeTruthy();
    clock.advance(60_000);
    const first = await fil(me, "?filter=nearby");
    const got = [...postIds(first.items)];
    let cursor = first.next;
    for (let n = 0; cursor; n++) {
      // Entre deux pages, le lecteur envoie un lot de vues (les cartes déjà affichées).
      clock.advance(5_000);
      await view(me, got.slice(-5));
      const page = await fil(me, `?filter=nearby&cursor=${cursor}`);
      expect(page.json.reset, `page ${n}`).toBeUndefined();
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    expect(new Set(got).size).toBe(got.length);
    expect(got.length).toBe(46);
    const floor1 = (await db.select().from(feedSeenFloor).where(eq(feedSeenFloor.userId, me.id)))[0]?.floorAt;
    expect(floor1?.getTime()).toBe(floor0?.getTime());
  }, 120_000);

  it("tour 6 : « Pour toi » : une carte consommée avec des flammes que la borne fait passer en zone B ne renvoie pas en haut", async () => {
    const author = await person("Auteur_Palier6");
    const me = await person("Lecteur_Palier6");
    const fan = await person("Fan_Palier6");
    const posts: string[] = [];
    // Une carte ancienne avec des flammes (elle passera sous la borne), puis 30 récentes.
    const flamed = await dbPost(author, at(100));
    await flames(flamed, [fan], at(1));
    posts.push(flamed);
    for (let i = 0; i < 30; i++) posts.push(await dbPost(author, at(5 + i)));
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'lineup:' || gen_random_uuid()::text, ${at(10).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 5000) g`);
    clock.advance(60_000);
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    expect(postIds(first.items)).toContain(flamed);
    // Dépassement réel du plafond entre deux pages : rognage à 4 000, la borne passe au-dessus de la carte aux flammes.
    // (Datée de l'instant du premier parcours : elle en fait partie, vue puis rangée en zone B.)
    const extra = await dbPost(author, at(0));
    await view(me, [extra]);
    const floor = (await db.select().from(feedSeenFloor).where(eq(feedSeenFloor.userId, me.id)))[0]?.floorAt;
    expect(floor && floor.getTime() > at(100).getTime()).toBe(true);
    clock.advance(60_000);
    const got = [...postIds(first.items)];
    let cursor = first.next;
    while (cursor) {
      const page = await fil(me, `?cursor=${cursor}`);
      expect(page.json.reset).toBeUndefined();
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    expect(new Set(got)).toEqual(new Set([...posts, extra]));
  }, 120_000);

  it("tour 7 : dates énormes ou futures dans le curseur : ramenées ou 400, jamais 500", async () => {
    const author = await person("Auteur_Date7");
    const me = await person("Lecteur_Date7");
    await follow(me, author);
    for (let i = 0; i < 30; i++) await dbPost(author, at(5 + i));
    const raw = Buffer.from((await fil(me)).next as string, "base64url");
    expect(decodeCursor(raw.toString("base64url"))?.phase).toBe(1);
    // Disposition : version, phase, zone, ref (6), fp (6), masque (2), offset (4), nx (1), [x], sc (6), floorAt (6), …
    const nx = raw[1 + 1 + 1 + 6 + 6 + 2 + 4] as number;
    const keysEnd = 1 + 1 + 1 + 6 + 6 + 2 + 4 + 1 + nx * 23;
    const floorAt = keysEnd + 6;
    const withU48 = (offset: number, value: number) => {
      const b = Buffer.from(raw);
      b.writeUIntBE(value, offset, 6);
      return b.toString("base64url");
    };
    const refMs = raw.readUIntBE(3, 6);
    // floorAt dans le futur ou énorme : ramené à ref, jamais d'erreur.
    for (const v of [refMs + 86_400_000, 2 ** 48 - 1]) {
      const c = withU48(floorAt, v);
      const decoded = decodeCursor(c);
      expect(decoded?.phase === 1 && decoded.floorAt).toBe(refMs);
      expect((await fil(me, `?cursor=${c}`)).status).toBe(200);
    }
    // ref énorme (au-delà de l'an 9999) : curseur invalide, 400 propre.
    const bigRef = withU48(3, 2 ** 48 - 1);
    expect((await fil(me, `?cursor=${bigRef}`)).status).toBe(400);
    // Ancre énorme en phase 2 (zone A puis B) : 400.
    const second = await fil(me, `?filter=nearby&cursor=${(await fil(me, "?filter=nearby")).next}`);
    expect(second.status).toBe(200);
    const a = Buffer.from(((await fil(me, "?filter=nearby")).next as string) ?? "", "base64url");
    if (a.length > 0) {
      const anchorAt = a.length - 23; // dernière clé : ancre (date 6 octets + carte 17)
      const b = Buffer.from(a);
      b.writeUIntBE(2 ** 48 - 1, anchorAt, 6);
      expect((await fil(me, `?filter=nearby&cursor=${b.toString("base64url")}`)).status).toBe(400);
    }
  }, 120_000);

  it("tour 8 : « Pour toi » : une carte populaire vue (zone B) dont la ligne est évincée entre deux pages ne renvoie pas en haut", async () => {
    const author = await person("Auteur_Zb8");
    const me = await person("Lecteur_Zb8");
    const fan = await person("Fan_Zb8");
    const posts: string[] = [];
    for (let i = 0; i < 25; i++) posts.push(await dbPost(author, at(5 + i)));
    const popular = await dbPost(author, at(200));
    await flames(popular, [fan], at(1));
    // Sa vue est la plus ancienne du compte ; 5 000 autres vues plus récentes.
    await db.insert(feedSeen).values({ userId: me.id, cardId: `feed_post:${popular}`, seenAt: at(300) });
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'lineup:' || gen_random_uuid()::text, ${at(10).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 4999) g`);
    clock.advance(60_000);
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    expect(postIds(first.items)).not.toContain(popular);
    // Dépassement réel du plafond : sa ligne part.
    await view(me, [await dbPost(author, at(0))]);
    expect(
      (
        await db
          .select()
          .from(feedSeen)
          .where(eq(feedSeen.cardId, `feed_post:${popular}`))
      ).length,
    ).toBe(0);
    clock.advance(60_000);
    const got = [...postIds(first.items)];
    let cursor = first.next;
    while (cursor) {
      const page = await fil(me, `?cursor=${cursor}`);
      expect(page.json.reset).toBeUndefined();
      expect(page.items.length).toBe(new Set(ids(page.items)).size);
      got.push(...postIds(page.items));
      cursor = page.next;
    }
    for (const p of posts) expect(got).toContain(p);
  }, 120_000);

  it("tour 8 : un rognage entre deux pages ne fait jamais servir deux fois la même carte dans une réponse", async () => {
    const author = await person("Auteur_Dup8");
    const me = await person("Lecteur_Dup8");
    for (let i = 0; i < 25; i++) await dbPost(author, at(5 + i));
    const old = await dbPost(author, at(100));
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'lineup:' || gen_random_uuid()::text, ${at(10).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 5000) g`);
    clock.advance(60_000);
    const first = await fil(me);
    expect(first.items.length).toBe(20);
    // Plafond dépassé : la borne passe au-dessus de la carte de 100 min, servie en zone A avec l'ancienne borne.
    await view(me, [await dbPost(author, at(0))]);
    clock.advance(60_000);
    const second = await fil(me, `?cursor=${first.next}`);
    expect(second.json.reset).toBeUndefined();
    expect(second.items.length).toBe(new Set(ids(second.items)).size);
    const all = [...postIds(first.items), ...postIds(second.items)];
    expect(all).toContain(old);
    let cursor = second.next;
    while (cursor) {
      const page = await fil(me, `?cursor=${cursor}`);
      expect(page.items.length).toBe(new Set(ids(page.items)).size);
      cursor = page.next;
    }
  }, 120_000);
});
