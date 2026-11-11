// Lot R8c1 : cartes vues du Fil — `POST /me/fil/seen`, vie privée (donnée de lecture privée), purge à 30 jours, compte supprimé,
// et nombre de requêtes d'une page (aucune requête par carte).
import { FEED_SEEN_BATCH_MAX } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { feedPostReactions, feedPosts, feedSeen } from "../../db/schema";
import { accountService } from "../account/service";
import { dbPost, fil, follow, HOUR, person, postIds, seen, view } from "./fil-test-helpers";
import { feedSeenService, SEEN_MAX_PER_USER, SEEN_TRIM_TO, SEEN_TTL_MS, seenWithoutInteraction } from "./seen";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  await seedReference();
});

const hoursAgo = (h: number) => new Date(clock.now.getTime() - h * HOUR);
const UUID = "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b";
const rowsOf = (userId: string) => db.select().from(feedSeen).where(eq(feedSeen.userId, userId));

describe("POST /me/fil/seen", () => {
  it("retient les cartes vues ; une session est exigée ; 204 sans corps", async () => {
    const me = await person("Lecteur_Seen");
    const author = await person("Auteur_Seen");
    const post = await dbPost(author, hoursAgo(1));
    expect(
      (await call(null, "POST", "/me/fil/seen", { cards: [{ id: `feed_post:${post}`, action: "view" }] })).status,
    ).toBe(401);
    const res = await seen(me, [{ id: `feed_post:${post}`, action: "view" }]);
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    const rows = await rowsOf(me.id);
    expect(rows.map((r) => r.cardId)).toEqual([`feed_post:${post}`]);
    expect(rows[0]?.interactedAt).toBeNull();
  });

  it("`open` et `share` posent l'interaction ; un renvoi ne déplace ni la première vue ni la première interaction ; les heures sont celles de la réception", async () => {
    const me = await person("Lecteur_Idem");
    const id = `feed_post:${UUID}`;
    const t0 = clock.now.getTime();
    // L'heure de l'appareil (`at`) n'est pas ce qui date : une synchronisation tardive ne change pas le passé du parcours.
    const early = new Date(t0 - 5 * HOUR).toISOString();
    await seen(me, [{ id, action: "view", at: early }]);
    clock.advance(60_000);
    await seen(me, [{ id, action: "view" }]);
    let [row] = await rowsOf(me.id);
    expect(row?.seenAt.getTime()).toBe(t0);
    expect(row?.interactedAt).toBeNull();
    clock.advance(60_000);
    await seen(me, [{ id, action: "share", at: early }]);
    clock.advance(60_000);
    await seen(me, [
      { id, action: "open" },
      { id, action: "view" },
    ]);
    row = (await rowsOf(me.id))[0];
    expect(row?.seenAt.getTime()).toBe(t0);
    expect(row?.interactedAt?.getTime()).toBe(t0 + 120_000);
    // Un lot qui répète la même carte : une seule ligne, l'interaction la plus forte gagne.
    const other = `event_recommended:${UUID}`;
    expect(
      (
        await seen(me, [
          { id: other, action: "view" },
          { id: other, action: "open" },
        ])
      ).status,
    ).toBe(204);
    const o = (await rowsOf(me.id)).filter((r) => r.cardId === other);
    expect(o.length).toBe(1);
    expect(o[0]?.interactedAt).not.toBeNull();
  });

  it("`at` est validée (ISO) et acceptée loin dans le passé ou le futur sans erreur : la zone se joue sur l'heure de réception", async () => {
    const me = await person("Lecteur_Bornes");
    const res = await seen(me, [
      { id: `feed_post:${UUID}`, action: "view", at: new Date(clock.now.getTime() - 40 * HOUR).toISOString() },
      { id: `lineup:${UUID}`, action: "view", at: new Date(clock.now.getTime() + 5 * HOUR).toISOString() },
    ]);
    expect(res.status).toBe(204);
    const rows = await rowsOf(me.id);
    expect(rows.every((r) => r.seenAt.getTime() === clock.now.getTime())).toBe(true);
  });

  it("refuse : « sponsored », un genre inconnu, un identifiant mal formé, une action inconnue, 0 ou 51 cartes", async () => {
    const me = await person("Lecteur_Refus");
    const good = { id: `feed_post:${UUID}`, action: "view" as const };
    for (const bad of [
      { id: `sponsored:${UUID}`, action: "view" },
      { id: `sponsored:${UUID}:4`, action: "view" },
      { id: `inconnu:${UUID}`, action: "view" },
      { id: `feed_post:pas-un-uuid`, action: "view" },
      { id: UUID, action: "view" },
      { id: `feed_post:${UUID}`, action: "like" },
      { id: `feed_post:${UUID}`, action: "view", at: "hier" },
    ]) {
      expect((await call(me, "POST", "/me/fil/seen", { cards: [bad] })).status, JSON.stringify(bad)).toBe(400);
      expect((await call(me, "POST", "/me/fil/seen", { cards: [good, bad] })).status).toBe(400);
    }
    expect((await call(me, "POST", "/me/fil/seen", { cards: [] })).status).toBe(400);
    const fifty = Array.from({ length: FEED_SEEN_BATCH_MAX }, (_, i) => ({
      id: `feed_post:3f2b8c1e-5a47-4d0e-9b6a-${String(i).padStart(12, "0")}`,
      action: "view" as const,
    }));
    expect((await call(me, "POST", "/me/fil/seen", { cards: fifty })).status).toBe(204);
    const fiftyOne = [...fifty, { id: `feed_post:${UUID}`, action: "view" as const }];
    expect((await call(me, "POST", "/me/fil/seen", { cards: fiftyOne })).status).toBe(400);
    expect((await rowsOf(me.id)).length).toBe(50);
    expect((await call(me, "POST", "/me/fil/seen", { nimporte: 1 })).status).toBe(400);
  });

  it("l'identifiant est mis en minuscules ; une carte qui n'existe pas est retenue sans risque (donnée de la personne seule)", async () => {
    const me = await person("Lecteur_Casse");
    await seen(me, [{ id: `feed_post:${UUID.toUpperCase()}`, action: "view" }]);
    expect((await rowsOf(me.id)).map((r) => r.cardId)).toEqual([`feed_post:${UUID}`]);
  });

  it("garde 5 000 lignes au plus par compte : les plus anciennement vues partent", async () => {
    const me = await person("Lecteur_Plafond");
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'feed_post:' || gen_random_uuid()::text, ${hoursAgo(2).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, ${SEEN_MAX_PER_USER}) g`);
    expect((await rowsOf(me.id)).length).toBe(SEEN_MAX_PER_USER);
    const oldest = (
      await db.select({ at: sql<Date>`min(seen_at)` }).from(feedSeen).where(eq(feedSeen.userId, me.id))
    )[0];
    await seen(me, [{ id: `feed_post:${UUID}`, action: "view" }]);
    const rows = await rowsOf(me.id);
    // Par palier : au-delà de 5 000, retour à 4 000.
    expect(rows.length).toBe(SEEN_TRIM_TO);
    expect(rows.some((r) => r.cardId === `feed_post:${UUID}`)).toBe(true);
    expect(Math.min(...rows.map((r) => r.seenAt.getTime()))).toBeGreaterThan(new Date(oldest?.at as Date).getTime());
  });
});

describe("vie privée des cartes vues", () => {
  it("les cartes vues d'un autre ne changent rien à ma réponse ; aucune route ne les rend", async () => {
    const author = await person("Auteur_Intime");
    const me = await person("Moi_Intime");
    const other = await person("Autre_Intime");
    const posts = await Promise.all(Array.from({ length: 6 }, (_, i) => dbPost(author, hoursAgo(1 + i))));
    const before = await fil(me);
    await view(other, posts);
    await seen(other, [{ id: `feed_post:${posts[0]}`, action: "open" }]);
    clock.advance(60_000);
    const after = await fil(me);
    expect(after.items.map((c) => [c.id, c.seen])).toEqual(before.items.map((c) => [c.id, c.seen]));
    expect(after.items.every((c) => !c.seen)).toBe(true);
    // L'autre, lui, les voit en zone B.
    expect((await fil(other)).items.filter((c) => c.seen).length).toBe(5);
    // Aucune route ne rend des cartes vues : ni lecture dédiée, ni dans la publication, ni dans `fresh`.
    for (const path of [
      "/me/fil/seen",
      "/fil/seen",
      `/feed-posts/${posts[0]}`,
      "/fil/fresh?since=2020-01-01T00:00:00Z",
    ]) {
      const res = await call(me, "GET", path);
      expect(JSON.stringify(res.json ?? ""), path).not.toContain(other.id);
      expect(JSON.stringify(res.json ?? ""), path).not.toMatch(/seenAt|seen_at|interactedAt/);
    }
    // L'auteur ne voit rien non plus dans ses publications.
    const mine = await call(author, "GET", "/me/feed-posts");
    expect(JSON.stringify(mine.json)).not.toMatch(/"seen"|seenAt|interacted/);
    // `seenWithoutInteraction` ne lit que les lignes de la personne demandée.
    expect(
      (
        await seenWithoutInteraction(
          me.id,
          posts.map((p) => `feed_post:${p}`),
          clock.now,
        )
      ).size,
    ).toBe(0);
    expect(
      (
        await seenWithoutInteraction(
          other.id,
          posts.map((p) => `feed_post:${p}`),
          clock.now,
        )
      ).size,
    ).toBe(5);
  });

  it("une flamme d'un autre ne rend pas la carte « vue » pour moi ; ma flamme annule le « vu » (lue dans les flammes)", async () => {
    const author = await person("Auteur_Flamme");
    const me = await person("Moi_Flamme");
    const post = await dbPost(author, hoursAgo(1));
    await view(me, [post]);
    clock.advance(60_000);
    expect((await fil(me)).items[0]?.seen).toBe(true);
    // Je mets une flamme : interaction (sans que `publish.ts` n'écrive dans `feed_seen`).
    clock.advance(1);
    await db
      .insert(feedPostReactions)
      .values({ postId: post, userId: me.id, createdAt: new Date(clock.now.getTime()) });
    clock.advance(60_000);
    expect((await fil(me)).items[0]?.seen).toBe(false);
    // Je retire ma flamme : elle ne compte plus comme interaction, la carte redevient « vue ».
    await db
      .delete(feedPostReactions)
      .where(and(eq(feedPostReactions.postId, post), eq(feedPostReactions.userId, me.id)));
    expect((await fil(me)).items[0]?.seen).toBe(true);
  });

  it("compte supprimé : ses cartes vues sont effacées ; celles des autres restent", async () => {
    const me = await person("Moi_Supprime");
    const other = await person("Autre_Reste");
    const author = await person("Auteur_Supprime");
    const post = await dbPost(author, hoursAgo(1));
    await view(me, [post]);
    await view(other, [post]);
    expect((await rowsOf(me.id)).length).toBe(1);
    await accountService.anonymize(me.id, null);
    expect((await rowsOf(me.id)).length).toBe(0);
    expect((await rowsOf(other.id)).length).toBe(1);
  });
});

describe("tâche feed.seen-purge", () => {
  it("efface les lignes de plus de 30 jours (`now` passé) et garde le reste", async () => {
    const me = await person("Lecteur_Purge");
    const day = 24 * HOUR;
    await db.insert(feedSeen).values([
      { userId: me.id, cardId: `feed_post:${UUID}`, seenAt: new Date(clock.now.getTime() - 31 * day) },
      { userId: me.id, cardId: `lineup:${UUID}`, seenAt: new Date(clock.now.getTime() - 29 * day) },
      { userId: me.id, cardId: `pro:${UUID}`, seenAt: new Date(clock.now.getTime() - 30 * day + 1000) },
    ]);
    const done = await feedSeenService.purge(clock.now);
    expect(done.expired).toBe(1);
    expect((await rowsOf(me.id)).map((r) => r.cardId).sort()).toEqual([`lineup:${UUID}`, `pro:${UUID}`]);
    // Avec un `now` plus tard, le reste part aussi.
    await feedSeenService.purge(new Date(clock.now.getTime() + SEEN_TTL_MS + 2 * day));
    expect((await rowsOf(me.id)).length).toBe(0);
  });

  it("20 000 lignes expirées : effacées par paquets, le compte exact est rendu, le reste est intact", async () => {
    const me = await person("Lecteur_Volume_Purge");
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'feed_post:' || gen_random_uuid()::text, ${hoursAgo(24 * 40).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, 20000) g`);
    await db.insert(feedSeen).values({ userId: me.id, cardId: `lineup:${UUID}`, seenAt: hoursAgo(24) });
    const done = await feedSeenService.purge(clock.now);
    expect(done.expired).toBe(20_000);
    expect((await rowsOf(me.id)).map((r) => r.cardId)).toEqual([`lineup:${UUID}`]);
  }, 60_000);

  it("ramène un compte à 5 000 lignes au plus", async () => {
    const me = await person("Lecteur_Purge_Max");
    const other = await person("Autre_Purge_Max");
    await db.execute(sql`insert into feed_seen (user_id, card_id, seen_at)
      select ${me.id}, 'feed_post:' || gen_random_uuid()::text, ${hoursAgo(2).toISOString()}::timestamptz - (g || ' seconds')::interval
      from generate_series(1, ${SEEN_MAX_PER_USER + 20}) g`);
    await db.insert(feedSeen).values({ userId: other.id, cardId: `lineup:${UUID}`, seenAt: hoursAgo(1) });
    const done = await feedSeenService.purge(clock.now);
    expect(done.trimmed).toBe(SEEN_MAX_PER_USER + 20 - SEEN_TRIM_TO);
    expect((await rowsOf(me.id)).length).toBe(SEEN_TRIM_TO);
    expect((await rowsOf(other.id)).length).toBe(1);
  });

  it("est planifiée chaque jour", async () => {
    const { handlers } = await import("../../jobs");
    expect(typeof handlers["feed.seen-purge"]).toBe("function");
  });
});

describe("nombre de requêtes d'une page", () => {
  it("2 000 publications et 500 cartes vues : le nombre de requêtes d'une page est borné, jamais une par carte", async () => {
    const me = await person("Lecteur_Volume");
    const author = await person("Auteur_Volume");
    await follow(me, author);
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: crypto.randomUUID(),
      authorId: author.id,
      department: "66",
      createdAt: new Date(clock.now.getTime() - (1 + i * 3) * 60_000),
    }));
    await db.insert(feedPosts).values(rows);
    await db.execute(sql`insert into feed_post_photos (post_id, storage_key, width, height, position, no_plate_confirmed)
      select id, 'private/feed/' || id::text || '/' || md5(id::text) || '.webp', 1080, 1350, 0, true from feed_posts`);
    // 500 vues, les plus récentes (elles forment la zone B ; la zone A est derrière : le pire cas pour la zone A).
    await db
      .insert(feedSeen)
      .values(
        rows
          .slice(0, 500)
          .map((r) => ({ userId: me.id, cardId: `feed_post:${r.id}`, seenAt: new Date(clock.now.getTime() - 60_000) })),
      );
    const original = pool.query.bind(pool);
    let count = 0;
    // biome-ignore lint/suspicious/noExplicitAny: compteur de requêtes autour de `pool.query`
    (pool as any).query = (...args: unknown[]) => {
      count++;
      // biome-ignore lint/suspicious/noExplicitAny: voir ci-dessus
      return (original as any)(...args);
    };
    try {
      const timings: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const filter of ["for_you", "nearby", "following"]) {
        count = 0;
        const t0 = Date.now();
        const res = await fil(me, `?filter=${filter}`);
        timings[filter] = Date.now() - t0;
        counts[filter] = count;
        expect(res.status, filter).toBe(200);
        expect(res.items.length, filter).toBe(20);
      }
      console.info("requêtes par page (2 000 publications, 500 vues)", counts, "durées (ms)", timings);
      for (const filter of Object.keys(counts)) expect(counts[filter] as number, filter).toBeLessThanOrEqual(40);
      // La zone B (les 500 vues), troisième page.
      let cursor: string | null = null;
      let pages = 0;
      let maxCount = 0;
      const all: string[] = [];
      do {
        count = 0;
        const res: Awaited<ReturnType<typeof fil>> = await fil(
          me,
          `?filter=following${cursor ? `&cursor=${cursor}` : ""}`,
        );
        maxCount = Math.max(maxCount, count);
        all.push(...postIds(res.items));
        cursor = res.next;
        pages++;
      } while (cursor && pages < 6);
      console.info("requêtes par page suivante (max)", maxCount);
      expect(maxCount).toBeLessThanOrEqual(60);
      expect(new Set(all).size).toBe(all.length);
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: remise en place
      (pool as any).query = original;
    }
  }, 120_000);
});
