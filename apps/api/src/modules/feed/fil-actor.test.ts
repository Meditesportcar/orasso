// Lot R9a, partie 2 : le Fil lu « en tant que » une page (`X-Orasso-Actor`). « Abonnements » = ce que la page suit et ses
// propres publications ; aucune publication d'un compte privé, même suivi par la personne derrière la page ; les sources
// personnelles ne rendent rien ; le curseur d'une autre casquette repart de la première page (`reset`) ; les cartes vues et la
// flamme restent ceux de la personne ; « ma sortie » = les événements de la casquette (T15).
import type { FeedCard } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import {
  addMember,
  createEvent,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { mediaProfiles, pageFollows, profiles, providerProfiles } from "../../db/schema";
import { DAY, dbPost, flames, follow, HOUR, person, postId, view } from "./fil-test-helpers";

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
const postIdsOf = (items: readonly FeedCard[]) => items.filter((c) => c.kind === "feed_post").map(postId);

/** Le monde : La Brasa (Sofia), Roues Libres 66 (Sarah), Sud Cars (Léo), Kenji public, Secret privé que Sofia suit en personne. */
async function world() {
  const sofia = await signUp("Sofia_66", { twoFactor: true });
  const sarah = await signUp("Sarah_66", { twoFactor: true });
  const leo = await signUp("Leo_66", { twoFactor: true });
  const kenji = await person("Kenji_66");
  const secret = await person("Secret_66", { visibility: "private" });
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: sofia.id, type: "photographer", name: "La Brasa", departments: ["66"] })
    .returning();
  const [sud] = await db
    .insert(mediaProfiles)
    .values({ userId: leo.id, name: "Sud Cars", departments: ["66"] })
    .returning();
  const structure = await createStructure(sarah.id);
  const brasaPage = brasa as NonNullable<typeof brasa>;
  const sudPage = sud as NonNullable<typeof sud>;
  const t = clock.now.getTime();
  const posts = {
    kenji: await dbPost(kenji, new Date(t - 5 * HOUR)),
    secret: await dbPost(secret, new Date(t - 4 * HOUR)),
    structure: await dbPost(sarah, new Date(t - 3 * HOUR), { persona: "organizer", structureId: structure.id }),
    media: await dbPost(leo, new Date(t - 2 * HOUR), { persona: "media", mediaId: sudPage.id }),
    brasa: await dbPost(sofia, new Date(t - 1 * HOUR), { persona: "provider", providerId: brasaPage.id }),
    sofia: await dbPost(sofia, new Date(t - 90 * 60_000)),
  };
  // La page suit la structure, le média et Kenji ; la personne, elle, suit Secret (compte privé, abonnement accepté).
  await db.insert(pageFollows).values([
    { followerKind: "provider", followerId: brasaPage.id, targetKind: "structure", targetId: structure.id },
    { followerKind: "provider", followerId: brasaPage.id, targetKind: "media", targetId: sudPage.id },
    { followerKind: "provider", followerId: brasaPage.id, targetKind: "user", targetId: kenji.id },
  ]);
  await follow(sofia, secret);
  return {
    sofia,
    sarah,
    leo,
    kenji,
    secret,
    brasa: brasaPage,
    sud: sudPage,
    structure,
    posts,
    as: `v:${brasaPage.id}`,
  };
}

describe("« Abonnements » en casquette", () => {
  it("ce que la page suit et ses publications ; jamais un compte privé suivi par la personne, ni ses publications de passionné", async () => {
    const w = await world();
    const asPage = await filAs(w.sofia, w.as, "?filter=following");
    expect(asPage.status, asPage.text).toBe(200);
    expect(new Set(postIdsOf(asPage.items))).toEqual(
      new Set([w.posts.kenji, w.posts.structure, w.posts.media, w.posts.brasa]),
    );
    expect(asPage.items.find((c) => c.kind === "feed_post" && postId(c) === w.posts.brasa)).toBeDefined();
    // Le Fil de la personne, sans en-tête : le privé qu'elle suit, ses publications, aucun lien de la page.
    const asPerson = await filAs(w.sofia, null, "?filter=following");
    const mine = new Set(postIdsOf(asPerson.items));
    expect(mine.has(w.posts.secret)).toBe(true);
    expect(mine.has(w.posts.sofia)).toBe(true);
    expect(mine.has(w.posts.structure)).toBe(false);
    expect(asPage.headers.get("cache-control")).toBe("private, no-store");
  });

  it("aucune publication d'un compte privé dans les trois onglets ni dans le rail, alors que la personne le suit", async () => {
    const w = await world();
    const fans = await Promise.all([1, 2, 3].map((n) => person(`Fan${n}_66`)));
    await flames(w.posts.secret, fans, new Date(clock.now.getTime() - HOUR));
    await db.insert(pageFollows).values({
      followerKind: "provider",
      followerId: w.brasa.id,
      targetKind: "user",
      targetId: w.secret.id,
    });
    for (const filter of ["for_you", "nearby", "following"]) {
      const res = await filAs(w.sofia, w.as, `?filter=${filter}`);
      expect(res.status, filter).toBe(200);
      expect(postIdsOf(res.items), filter).not.toContain(w.posts.secret);
      expect((res.hot ?? []).map(postId), filter).not.toContain(w.posts.secret);
    }
  });

  it("le rail ne contient jamais une publication de la page elle-même", async () => {
    const w = await world();
    const fans = await Promise.all([1, 2, 3].map((n) => person(`Fan${n}_66`)));
    await flames(w.posts.brasa, fans, new Date(clock.now.getTime() - HOUR));
    await flames(w.posts.kenji, fans, new Date(clock.now.getTime() - HOUR));
    const res = await filAs(w.sofia, w.as, "?filter=following");
    expect((res.hot ?? []).map(postId)).toEqual([w.posts.kenji]);
  });

  it("une page qui ne suit plus personne : plus que ses propres publications", async () => {
    const w = await world();
    await db.delete(pageFollows);
    const res = await filAs(w.sofia, w.as, "?filter=following");
    expect(postIdsOf(res.items)).toEqual([w.posts.brasa]);
  });

  it("un compte suivi qui passe en privé sort de « Abonnements » tout seul", async () => {
    const w = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.kenji.id));
    const res = await filAs(w.sofia, w.as, "?filter=following");
    expect(postIdsOf(res.items)).not.toContain(w.posts.kenji);
  });
});

describe("sans en-tête, et le curseur d'une autre casquette", () => {
  it("sans en-tête (ou u:<moi>) : le même Fil qu'avant", async () => {
    const w = await world();
    for (const filter of ["for_you", "nearby", "following"]) {
      const plain = await filAs(w.sofia, null, `?filter=${filter}`);
      const me = await filAs(w.sofia, `u:${w.sofia.id}`, `?filter=${filter}`);
      expect(
        me.items.map((c) => c.id),
        filter,
      ).toEqual(plain.items.map((c) => c.id));
    }
  });

  it("un curseur pris sous une autre casquette : première page et reset, jamais un 400", async () => {
    const w = await world();
    for (let i = 0; i < 25; i++) await dbPost(w.kenji, new Date(clock.now.getTime() - (10 + i) * HOUR));
    const first = await filAs(w.sofia, null, "?filter=for_you");
    expect(first.next).toBeTruthy();
    const cross = await filAs(w.sofia, w.as, `?filter=for_you&cursor=${encodeURIComponent(first.next as string)}`);
    expect(cross.status, cross.text).toBe(200);
    expect(cross.json.reset).toBe(true);
    const asPage = await filAs(w.sofia, w.as, "?filter=for_you");
    expect(asPage.next).toBeTruthy();
    expect(asPage.json.reset).toBeUndefined();
    const back = await filAs(w.sofia, null, `?filter=for_you&cursor=${encodeURIComponent(asPage.next as string)}`);
    expect(back.status).toBe(200);
    expect(back.json.reset).toBe(true);
    // Le même curseur sous la même casquette continue sans reset.
    const same = await filAs(w.sofia, w.as, `?filter=for_you&cursor=${encodeURIComponent(asPage.next as string)}`);
    expect(same.status).toBe(200);
    expect(same.json.reset).toBeUndefined();
  });

  it("une casquette qu'on ne tient pas : 403 persona_forbidden", async () => {
    const w = await world();
    const res = await filAs(w.kenji, w.as, "?filter=following");
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("persona_forbidden");
  });
});

describe("sources personnelles, cartes vues, nouveautés", () => {
  it("ni souvenir ni rendez-vous au spot en casquette", async () => {
    const w = await world();
    for (const filter of ["for_you", "nearby", "following"]) {
      const res = await filAs(w.sofia, w.as, `?filter=${filter}`);
      expect(
        res.items.filter((c) => c.kind === "memory" || c.kind === "spot_meetup"),
        filter,
      ).toEqual([]);
    }
  });

  it("les cartes vues sont celles de la personne : vues sous la personne, rangées après sous la page", async () => {
    const w = await world();
    const before = await filAs(w.sofia, w.as, "?filter=following");
    expect(before.items.every((c) => !c.seen)).toBe(true);
    await view(w.sofia, [w.posts.kenji], new Date(clock.now.getTime() - 30 * 60_000));
    const after = await filAs(w.sofia, w.as, "?filter=following");
    const card = after.items.find((c) => c.kind === "feed_post" && postId(c) === w.posts.kenji);
    expect(card?.seen).toBe(true);
    // Un autre responsable d'une autre personne n'a rien vu : ses cartes vues ne sont pas partagées.
    const other = await signUp("Autre_Presta");
    expect((await filAs(other, null, "?filter=following")).items.some((c) => c.seen)).toBe(false);
  });

  it("GET /fil/fresh en casquette : les nouveautés du périmètre de la page, jamais ses publications", async () => {
    const w = await world();
    const since = new Date(clock.now.getTime() - 30 * 60_000).toISOString();
    clock.advance(10 * 60_000);
    await dbPost(w.kenji, new Date(clock.now.getTime() - 60_000));
    await dbPost(w.sofia, new Date(clock.now.getTime() - 50_000), { persona: "provider", providerId: w.brasa.id });
    await dbPost(w.secret, new Date(clock.now.getTime() - 40_000));
    const res = await callAs(w.sofia, w.as, "GET", `/fil/fresh?filter=following&since=${encodeURIComponent(since)}`);
    expect(res.status, res.text).toBe(200);
    expect(res.json.count).toBe(1);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("T15 : « ma sortie » est celle de la casquette", () => {
  it("structure : ses événements à venir ou en cours ; fiche pro et personne : rien", async () => {
    const w = await world();
    const event = await createEvent(w.structure.id, { startsAt: new Date(clock.now.getTime() + 3 * DAY) });
    const finished = await createEvent(w.structure.id, {
      startsAt: new Date(clock.now.getTime() - 3 * DAY),
      endsAt: new Date(clock.now.getTime() - 2 * DAY),
    });
    const tagged = await dbPost(w.kenji, new Date(clock.now.getTime() - HOUR), { eventId: event.id });
    const old = await dbPost(w.kenji, new Date(clock.now.getTime() - 2 * HOUR), { eventId: finished.id });
    const co = await signUp("Co_Orga", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    const reasonOf = (items: FeedCard[], id: string) =>
      items.find((c) => c.kind === "feed_post" && postId(c) === id)?.reason.code;
    await db.insert(pageFollows).values({
      followerKind: "structure",
      followerId: w.structure.id,
      targetKind: "user",
      targetId: w.kenji.id,
    });
    const asStructure = await filAs(co, `s:${w.structure.id}`, "?filter=following");
    expect(reasonOf(asStructure.items, tagged)).toBe("my_outing");
    expect(reasonOf(asStructure.items, old)).not.toBe("my_outing");
    // La personne (sans casquette) n'a pas cette sortie : aucune carte « ma sortie ».
    const asPerson = await filAs(co, null, "?filter=for_you");
    expect(asPerson.items.some((c) => c.reason.code === "my_outing")).toBe(false);
  });

  it("prestataire retenu : les événements où il est retenu seulement", async () => {
    const w = await world();
    const owner = await signUp("Orga_Lydia", { twoFactor: true });
    const structure2 = await createStructure(owner.id);
    const mine = await createEvent(structure2.id, { startsAt: new Date(clock.now.getTime() + 2 * DAY) });
    const other = await createEvent(structure2.id, { startsAt: new Date(clock.now.getTime() + 4 * DAY) });
    await db.execute(
      sql`insert into applications (event_id, user_id, kind, status, provider_profile_id, rules_accepted_at, follow_structure)
        values (${mine.id}, ${w.sofia.id}, 'provider', 'accepted', ${w.brasa.id}, now(), false)`,
    );
    const a = await dbPost(w.kenji, new Date(clock.now.getTime() - HOUR), { eventId: mine.id });
    const b = await dbPost(w.kenji, new Date(clock.now.getTime() - 2 * HOUR), { eventId: other.id });
    const res = await filAs(w.sofia, w.as, "?filter=following");
    const code = (id: string) => res.items.find((c) => c.kind === "feed_post" && postId(c) === id)?.reason.code;
    expect(code(a)).toBe("my_outing");
    expect(code(b)).not.toBe("my_outing");
  });
});

describe("deux responsables d'une même structure", () => {
  it("mêmes cartes, cartes vues séparées", async () => {
    const w = await world();
    const co = await signUp("Co_Deux", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    await db.insert(pageFollows).values({
      followerKind: "structure",
      followerId: w.structure.id,
      targetKind: "user",
      targetId: w.kenji.id,
    });
    const key = `s:${w.structure.id}`;
    const sarah = await filAs(w.sarah, key, "?filter=following");
    const second = await filAs(co, key, "?filter=following");
    expect(second.items.map((c) => c.id)).toEqual(sarah.items.map((c) => c.id));
    await view(w.sarah, [w.posts.kenji], new Date(clock.now.getTime() - 20 * 60_000));
    const sarahAfter = await filAs(w.sarah, key, "?filter=following");
    const coAfter = await filAs(co, key, "?filter=following");
    const seenIn = (r: typeof sarah) =>
      r.items.find((c) => c.kind === "feed_post" && postId(c) === w.posts.kenji)?.seen;
    expect(seenIn(sarahAfter)).toBe(true);
    expect(seenIn(coAfter)).toBe(false);
  });
});

describe("prestataires et médias suivis dans « Abonnements » de la personne", () => {
  it("la personne qui suit une page de prestataire voit ses publications dans « Abonnements »", async () => {
    const w = await world();
    const damien = await person("Damien_66");
    expect(postIdsOf((await filAs(damien, null, "?filter=following")).items)).toEqual([]);
    expect((await callAs(damien, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(200);
    expect((await callAs(damien, null, "PUT", `/me/page-follows/m:${w.sud.id}`)).status).toBe(200);
    const after = await filAs(damien, null, "?filter=following");
    expect(new Set(postIdsOf(after.items))).toEqual(new Set([w.posts.brasa, w.posts.media]));
    const card = after.items.find((c) => c.kind === "feed_post" && postId(c) === w.posts.brasa);
    expect(card?.reason.code).toBe("following_pro");
  });

  it("suivre une page change l'empreinte du parcours (reset d'un curseur en cours)", async () => {
    const w = await world();
    const damien = await person("Damien_67");
    for (let i = 0; i < 25; i++) await dbPost(w.kenji, new Date(clock.now.getTime() - (10 + i) * HOUR));
    await follow(damien, w.kenji);
    const first = await filAs(damien, null, "?filter=for_you");
    expect(first.next).toBeTruthy();
    await callAs(damien, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    const next = await filAs(damien, null, `?filter=for_you&cursor=${encodeURIComponent(first.next as string)}`);
    expect(next.json.reset).toBe(true);
  });
});
