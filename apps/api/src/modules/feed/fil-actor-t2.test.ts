// Lot R9a, partie 2, tour 2 : le regard public de la page jusque dans les aperçus de commentaires, la flamme de la personne,
// un rail qui ne dépend pas de la personne, et le changement de casquette combiné à un autre onglet.
import type { FeedCard } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import { addMember, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { mediaProfiles, pageFollows, providerProfiles } from "../../db/schema";
import { dbPost, flames, follow, HOUR, person, postId } from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date("2026-11-12T12:00:00Z"));
});

const filAs = async (u: TestUser, actor: string | null, query = "") => {
  const res = await callAs(u, actor, "GET", `/fil${query}`);
  return {
    ...res,
    items: (res.json?.items ?? []) as FeedCard[],
    hot: (res.json?.hot ?? null) as FeedCard<"feed_post">[] | null,
    next: (res.json?.nextCursor ?? null) as string | null,
  };
};

async function world() {
  const sofia = await signUp("Sofia_66", { twoFactor: true });
  const sarah = await signUp("Sarah_66", { twoFactor: true });
  const kenji = await person("Kenji_66");
  const secret = await person("Secret_66", { visibility: "private" });
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: sofia.id, type: "photographer", name: "La Brasa", departments: ["66"] })
    .returning();
  const structure = await createStructure(sarah.id);
  const brasaPage = brasa as NonNullable<typeof brasa>;
  const kenjiPost = await dbPost(kenji, new Date(clock.now.getTime() - 5 * HOUR));
  await follow(sofia, secret);
  await follow(sofia, kenji);
  await db.insert(pageFollows).values({
    followerKind: "provider",
    followerId: brasaPage.id,
    targetKind: "user",
    targetId: kenji.id,
  });
  return { sofia, sarah, kenji, secret, brasa: brasaPage, structure, kenjiPost, as: `v:${brasaPage.id}` };
}

describe("regard public de la page", () => {
  it("un commentaire d'un compte privé suivi par la personne n'apparaît pas dans le Fil en casquette (il apparaît sans)", async () => {
    const w = await world();
    const at = new Date(clock.now.getTime() - 60_000).toISOString();
    await db.execute(
      sql`insert into feed_post_comments (id, post_id, author_id, persona, text, client_id, created_at, updated_at)
        values (${crypto.randomUUID()}, ${w.kenjiPost}, ${w.secret.id}, 'fan', 'Commentaire privé visible des abonnés', ${crypto.randomUUID()}, ${at}, ${at})`,
    );
    await db.execute(sql`update feed_posts set comments_count = 1 where id = ${w.kenjiPost}`);
    const previewOf = (items: FeedCard[]) => {
      const card = items.find((c) => c.kind === "feed_post" && postId(c) === w.kenjiPost);
      return JSON.stringify(
        (card?.payload as { post: { lastComments: unknown } } | undefined)?.post.lastComments ?? null,
      );
    };
    const asPerson = await filAs(w.sofia, null, "?filter=for_you");
    expect(previewOf(asPerson.items)).toContain("Commentaire privé visible des abonnés");
    const asPage = await filAs(w.sofia, w.as, "?filter=for_you");
    expect(asPage.items.some((c) => c.kind === "feed_post" && postId(c) === w.kenjiPost)).toBe(true);
    expect(previewOf(asPage.items)).not.toContain("Commentaire privé");
  });

  it("la flamme de la personne reste visible en casquette (reactedByMe)", async () => {
    const w = await world();
    await db.execute(sql`insert into feed_post_reactions (post_id, user_id) values (${w.kenjiPost}, ${w.sofia.id})`);
    const asPage = await filAs(w.sofia, w.as, "?filter=for_you");
    const card = asPage.items.find((c) => c.kind === "feed_post" && postId(c) === w.kenjiPost);
    expect((card?.payload as { post: { reactedByMe: boolean } } | undefined)?.post.reactedByMe).toBe(true);
  });
});

describe("rail et curseur", () => {
  it("le rail ne dépend pas de la personne : la publication de l'un des deux responsables est dans le rail des deux", async () => {
    const w = await world();
    const co = await signUp("Co_Rail", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    const [coMedia] = await db
      .insert(mediaProfiles)
      .values({ userId: co.id, name: "Media du co", departments: ["66"] })
      .returning();
    const media = coMedia as NonNullable<typeof coMedia>;
    const mediaPost = await dbPost(co, new Date(clock.now.getTime() - 2 * HOUR), {
      persona: "media",
      mediaId: media.id,
    });
    await db.insert(pageFollows).values({
      followerKind: "structure",
      followerId: w.structure.id,
      targetKind: "media",
      targetId: media.id,
    });
    const fans = await Promise.all([1, 2, 3].map((n) => person(`Rail${n}_66`)));
    await flames(mediaPost, fans, new Date(clock.now.getTime() - HOUR));
    const key = `s:${w.structure.id}`;
    const owner = await filAs(w.sarah, key, "?filter=following");
    const second = await filAs(co, key, "?filter=following");
    expect((owner.hot ?? []).map(postId)).toContain(mediaPost);
    expect((second.hot ?? []).map(postId)).toEqual((owner.hot ?? []).map(postId));
  });

  it("changement de casquette et d'onglet à la fois : première page et reset, jamais un 400", async () => {
    const w = await world();
    for (let i = 0; i < 25; i++) await dbPost(w.kenji, new Date(clock.now.getTime() - (10 + i) * HOUR));
    const first = await filAs(w.sofia, null, "?filter=for_you");
    expect(first.next).toBeTruthy();
    const cross = await filAs(w.sofia, w.as, `?filter=following&cursor=${encodeURIComponent(first.next as string)}`);
    expect(cross.status, cross.text).toBe(200);
    expect(cross.json.reset).toBe(true);
  });
});
