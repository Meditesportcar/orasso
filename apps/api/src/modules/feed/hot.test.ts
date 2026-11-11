// Lot R8c1 : le rail « Ça plaît en ce moment » (périmètre de l'onglet, seuil de 3 flammes, 7 jours, jamais un compte privé, jamais
// la mienne, flammes de comptes en règle seulement, absent de « Pour toi »), et `GET /fil/fresh` (« Nouvelles publications »).
import { FEED_HOT_MAX, type FeedCard } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createStructure, resetDb, seedReference, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { profiles, structureFollows } from "../../db/schema";
import { DAY, dbPost, fil, flames, follow, HOUR, person, postIds } from "./fil-test-helpers";

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
const crowd = (n: number) =>
  Promise.all(Array.from({ length: n }, (_, i) => person(`Fan_${n}_${i}_${Math.random().toString(36).slice(2, 6)}`)));
const hotIds = (hot: FeedCard<"feed_post">[] | null) => postIds(hot ?? []);

describe("rail « Ça plaît en ce moment »", () => {
  it("« Abonnements » : les publications suivies à 3 flammes ou plus sur 7 jours, triées par flammes puis par date ; elles restent dans la liste", async () => {
    const me = await person("Lecteur_Rail");
    const author = await person("Auteur_Rail");
    await follow(me, author);
    const fans = await crowd(5);
    const two = await dbPost(author, hoursAgo(1));
    const three = await dbPost(author, hoursAgo(3));
    const five = await dbPost(author, hoursAgo(10));
    const threeNewer = await dbPost(author, hoursAgo(2));
    const old = await dbPost(author, hoursAgo(24 * 9));
    await flames(two, fans.slice(0, 2), hoursAgo(1));
    await flames(three, fans.slice(0, 3), hoursAgo(1));
    await flames(threeNewer, fans.slice(0, 3), hoursAgo(1));
    await flames(five, fans, hoursAgo(1));
    // Quatre flammes il y a plus de 7 jours : elles ne comptent plus.
    await flames(old, fans.slice(0, 4), hoursAgo(24 * 8));
    const res = await fil(me, "?filter=following");
    expect(hotIds(res.hot)).toEqual([five, threeNewer, three]);
    // Les cartes du rail restent aussi dans la liste ; la liste est par date.
    for (const id of [five, threeNewer, three]) expect(postIds(res.items)).toContain(id);
    expect(res.hot?.every((c) => c.kind === "feed_post")).toBe(true);
    expect(res.json.hot).toBeTruthy();
  });

  it("« Pour toi » n'a pas de rail ; les pages suivantes non plus", async () => {
    const me = await person("Lecteur_Sans_Rail");
    const author = await person("Auteur_Sans_Rail");
    await follow(me, author);
    const fans = await crowd(3);
    const posts = await Promise.all(Array.from({ length: 30 }, (_, i) => dbPost(author, hoursAgo(1 + i))));
    await flames(posts[0] as string, fans, hoursAgo(1));
    expect((await fil(me)).json.hot).toBeUndefined();
    const first = await fil(me, "?filter=following");
    expect(hotIds(first.hot)).toEqual([posts[0]]);
    const second = await fil(me, `?filter=following&cursor=${first.next}`);
    expect(second.status).toBe(200);
    expect(second.json.hot).toBeUndefined();
  });

  it("jamais un compte privé, même suivi ; jamais la mienne ; ses flammes comptent, mais le rail ne la montre pas", async () => {
    const me = await person("Lecteur_Prive");
    const priv = await person("Auteur_Ferme", { visibility: "private" });
    const open = await person("Auteur_Ouvert");
    await follow(me, priv);
    await follow(me, open);
    const fans = await crowd(4);
    const closedPost = await dbPost(priv, hoursAgo(1));
    const myPost = await dbPost(me, hoursAgo(1));
    const openPost = await dbPost(open, hoursAgo(1));
    for (const p of [closedPost, myPost, openPost]) await flames(p, fans, hoursAgo(1));
    for (const filter of ["following", "nearby"]) {
      const res = await fil(me, `?filter=${filter}`);
      expect(hotIds(res.hot), filter).toEqual([openPost]);
    }
    // Le compte privé suivi : sa publication est dans la liste d'« Abonnements », pas dans le rail.
    const following = await fil(me, "?filter=following");
    expect(postIds(following.items)).toContain(closedPost);
    expect(postIds(following.items)).toContain(myPost);
    // Un compte qui ne suit pas le compte privé ne la voit nulle part.
    const stranger = await person("Etranger_Rail");
    for (const filter of ["following", "nearby", "for_you"]) {
      const res = await fil(stranger, `?filter=${filter}`);
      expect(postIds([...res.items, ...(res.hot ?? [])]), filter).not.toContain(closedPost);
    }
    // Un compte qui devient privé sort du rail de tout le monde.
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, open.id));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([]);
  });

  it("les flammes de comptes bannis, suspendus ou supprimés ne comptent pas", async () => {
    const me = await person("Lecteur_Flammes");
    const author = await person("Auteur_Flammes");
    await follow(me, author);
    const fans = await crowd(3);
    const post = await dbPost(author, hoursAgo(1));
    await flames(post, fans, hoursAgo(1));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([post]);
    await db
      .update(profiles)
      .set({ bannedAt: new Date() })
      .where(eq(profiles.userId, fans[0]?.id as string));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([]);
    await db
      .update(profiles)
      .set({ bannedAt: null, suspendedUntil: hoursAgo(-5) })
      .where(eq(profiles.userId, fans[0]?.id as string));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([]);
    await db
      .update(profiles)
      .set({ suspendedUntil: null, deletedAt: new Date() })
      .where(eq(profiles.userId, fans[0]?.id as string));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([]);
    await db
      .update(profiles)
      .set({ deletedAt: null })
      .where(eq(profiles.userId, fans[0]?.id as string));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([post]);
  });

  it("« Autour de moi » : seulement le périmètre (départements proches) ; « Abonnements » : seulement ce que je suis ; 10 au plus", async () => {
    const me = await person("Lecteur_Perimetre", { departments: ["66"] });
    const near = await person("Auteur_Proche", { departments: ["66"] });
    const far = await person("Auteur_Loin", { departments: ["59"] });
    const fans = await crowd(3);
    const nearPost = await dbPost(near, hoursAgo(1), { department: "66" });
    const farPost = await dbPost(far, hoursAgo(1), { department: "59" });
    await flames(nearPost, fans, hoursAgo(1));
    await flames(farPost, fans, hoursAgo(1));
    expect(hotIds((await fil(me, "?filter=nearby")).hot)).toEqual([nearPost]);
    // Ni l'un ni l'autre n'est suivi : rail vide (mais présent) dans « Abonnements ».
    const following = await fil(me, "?filter=following");
    expect(following.json.hot).toEqual([]);
    // Dix au plus.
    const many = await Promise.all(Array.from({ length: 13 }, (_, i) => dbPost(near, hoursAgo(1 + i))));
    for (const p of many) await flames(p, fans, hoursAgo(1));
    expect((await fil(me, "?filter=nearby")).hot?.length).toBe(FEED_HOT_MAX);
  });

  it("une page suivie y entre ; une page suspendue ou une personne bannie non ; jamais de sponsorisé", async () => {
    const me = await person("Lecteur_Page_Rail");
    const orga = await person("Orga_Rail");
    const structure = await createStructure(orga.id);
    await db.insert(structureFollows).values({ structureId: structure.id, userId: me.id, source: "manual" });
    const fans = await crowd(3);
    const page = await dbPost(orga, hoursAgo(1), { persona: "organizer", structureId: structure.id });
    await flames(page, fans, hoursAgo(1));
    const res = await fil(me, "?filter=following");
    expect(hotIds(res.hot)).toEqual([page]);
    expect(res.hot?.[0]?.reason.code).toBe("following_structure");
    expect(res.hot?.every((c) => c.kind === "feed_post")).toBe(true);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, orga.id));
    expect(hotIds((await fil(me, "?filter=following")).hot)).toEqual([]);
  });

  it("« seen » du rail suit la même règle que la liste", async () => {
    const me = await person("Lecteur_Rail_Vu");
    const author = await person("Auteur_Rail_Vu");
    await follow(me, author);
    const fans = await crowd(3);
    const post = await dbPost(author, hoursAgo(1));
    await flames(post, fans, hoursAgo(1));
    expect((await fil(me, "?filter=following")).hot?.[0]?.seen).toBe(false);
    await call(me, "POST", "/me/fil/seen", { cards: [{ id: `feed_post:${post}`, action: "view" }] });
    clock.advance(60_000);
    const res = await fil(me, "?filter=following");
    expect(res.hot?.[0]?.seen).toBe(true);
    expect(res.items[0]?.seen).toBe(true);
  });
});

describe("GET /fil/fresh : « Nouvelles publications »", () => {
  const fresh = (u: TestUser | null, q: string) => call(u, "GET", `/fil/fresh${q}`);

  it("compte les cartes plus récentes que `since` de l'onglet, hors les miennes, plafonné à 20 ; no-store ; sans session : 401", async () => {
    const me = await person("Lecteur_Neuf");
    const author = await person("Auteur_Neuf");
    await follow(me, author);
    const since = hoursAgo(2);
    await dbPost(author, hoursAgo(5));
    for (let i = 0; i < 3; i++) await dbPost(author, hoursAgo(1 - i * 0.2));
    await dbPost(me, hoursAgo(0.5));
    const q = (filter: string, s = since) => `?filter=${filter}&since=${encodeURIComponent(s.toISOString())}`;
    const res = await fresh(me, q("following"));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ count: 3 });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // « Pour toi » compte les mêmes (mes publications exclues) ; « Autour de moi » aussi.
    expect((await fresh(me, q("for_you"))).json.count).toBe(3);
    expect((await fresh(me, q("nearby"))).json.count).toBe(3);
    // Plafond de 20.
    for (let i = 0; i < 25; i++) await dbPost(author, hoursAgo(1.5 - i * 0.01));
    expect((await fresh(me, q("following"))).json.count).toBe(20);
    // `since` plus vieux que 48 h : ramené à 48 h (une carte de 3 jours n'est jamais comptée).
    await dbPost(author, hoursAgo(72));
    const before = (await fresh(me, q("following", hoursAgo(24 * 10)))).json.count;
    expect(before).toBe(20);
    // `since` dans le futur : rien.
    expect((await fresh(me, q("following", new Date(clock.now.getTime() + DAY)))).json.count).toBe(0);
    // Une mauvaise date : 400 ; sans session : 401.
    expect((await fresh(me, "?filter=following&since=hier")).status).toBe(400);
    expect((await fresh(null, q("following"))).status).toBe(401);
  });

  it("ne compte jamais ce qu'on ne verrait pas (compte privé non suivi) ni un abonnement qu'on n'a pas", async () => {
    const me = await person("Lecteur_Neuf_Prive");
    const priv = await person("Auteur_Neuf_Prive", { visibility: "private" });
    const stranger = await person("Auteur_Neuf_Inconnu");
    const since = hoursAgo(2);
    await dbPost(priv, hoursAgo(1));
    await dbPost(stranger, hoursAgo(1));
    const q = (filter: string) => `?filter=${filter}&since=${encodeURIComponent(since.toISOString())}`;
    expect((await fresh(me, q("for_you"))).json.count).toBe(1);
    expect((await fresh(me, q("following"))).json.count).toBe(0);
  });
});
