// Abonnements d'une casquette (R9a) : `PUT|DELETE /me/page-follows/:targetKey`, les routes « suivre » existantes avec l'en-tête
// d'une page, les compteurs (personnes et pages), l'état « suivi » lu pour l'acteur. T6 : une page ne suit qu'une page ou un
// compte public. T14 : un passionné suivi par une page n'est ni prévenu ni compté.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs, resetPageFollows } from "../../../test/actor-call";
import { addMember, createPro, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  mediaProfiles,
  notifications,
  pageFollows,
  proFollows,
  profiles,
  proProfiles,
  providerProfiles,
  structureFollows,
  structures,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { followSets } from "./pageFollows";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  await resetPageFollows();
  resetRateLimits();
  useClock(new Date("2026-11-11T09:00:00Z"));
});

const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

/** Le monde du test : La Brasa (prestataire), un média, une structure, un pro, un passionné public et un privé. */
async function world() {
  const brasaHolder = await signUp("Brasa_Titulaire", { twoFactor: true });
  const mediaHolder = await signUp("Media_Titulaire", { twoFactor: true });
  const owner = await signUp("Orga_Owner", { twoFactor: true });
  const proOwner = await signUp("Pro_Owner");
  const kenji = await signUp("Kenji_66");
  const secret = await signUp("Secret_66");
  const damien = await signUp("Damien_66");
  await makePrivate(secret);
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: brasaHolder.id, type: "photographer", name: "La Brasa" })
    .returning();
  const [media] = await db.insert(mediaProfiles).values({ userId: mediaHolder.id, name: "Auto Sud Mag" }).returning();
  const structure = await createStructure(owner.id);
  const pro = await createPro(proOwner.id);
  return {
    brasaHolder,
    mediaHolder,
    owner,
    proOwner,
    kenji,
    secret,
    damien,
    brasa: brasa as NonNullable<typeof brasa>,
    media: media as NonNullable<typeof media>,
    structure,
    pro,
  };
}

const rows = () => db.select().from(pageFollows);

describe("PUT|DELETE /me/page-follows/:targetKey : une personne", () => {
  it("suit un prestataire et un média ; idempotent ; les compteurs suivent", async () => {
    const w = await world();
    const put = await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    expect(put.status, put.text).toBe(200);
    expect(put.json).toEqual({ following: true, followersCount: 1 });
    expect(put.headers.get("cache-control")).toBe("private, no-store");
    // Une seconde fois : la même réponse, une seule ligne.
    expect((await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).json).toEqual({
      following: true,
      followersCount: 1,
    });
    expect(await rows()).toHaveLength(1);
    expect((await callAs(w.damien, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).json.followersCount).toBe(2);
    expect((await callAs(w.kenji, null, "PUT", `/me/page-follows/m:${w.media.id}`)).json).toEqual({
      following: true,
      followersCount: 1,
    });
    const del = await callAs(w.kenji, null, "DELETE", `/me/page-follows/v:${w.brasa.id}`);
    expect(del.json).toEqual({ following: false, followersCount: 1 });
    expect((await callAs(w.kenji, null, "DELETE", `/me/page-follows/v:${w.brasa.id}`)).json.following).toBe(false);
  });

  it("une personne, une structure, un pro : 400 qui renvoie aux routes existantes, rien d'écrit", async () => {
    const w = await world();
    for (const key of [`u:${w.damien.id}`, `s:${w.structure.id}`, `p:${w.pro.id}`]) {
      const res = await callAs(w.kenji, null, "PUT", `/me/page-follows/${key}`);
      expect(res.status, key).toBe(400);
      expect(res.json.error.message).toContain("utilise « Suivre »");
      expect((await callAs(w.kenji, null, "DELETE", `/me/page-follows/${key}`)).status, key).toBe(400);
    }
    expect(await rows()).toHaveLength(0);
  });

  it("sa propre page, une page supprimée, une page inconnue, une clé mal formée", async () => {
    const w = await world();
    const own = await callAs(w.brasaHolder, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    expect(own.status).toBe(400);
    expect(own.json.error.message).toContain("ta propre page");
    const unknown = await callAs(w.kenji, null, "PUT", "/me/page-follows/v:3f2b1c0a-1111-4222-8333-444455556666");
    expect(unknown.status).toBe(404);
    await db.update(mediaProfiles).set({ deletedAt: new Date() }).where(eq(mediaProfiles.id, w.media.id));
    expect((await callAs(w.kenji, null, "PUT", `/me/page-follows/m:${w.media.id}`)).status).toBe(404);
    for (const bad of ["v:abc", "x:1", "e:3f2b1c0a-1111-4222-8333-444455556666"]) {
      expect((await callAs(w.kenji, null, "PUT", `/me/page-follows/${bad}`)).status, bad).toBe(400);
    }
    expect(await rows()).toHaveLength(0);
  });

  it("sans session : 401", async () => {
    const w = await world();
    expect((await callAs(null, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(401);
  });

  it("limite de débit : 60 par heure et par compte", async () => {
    const w = await world();
    for (let i = 0; i < 60; i++) {
      expect((await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(200);
    }
    const over = await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    expect(over.status).toBe(429);
    // Un autre compte n'est pas touché ; et la limite est commune à PUT et DELETE.
    expect((await callAs(w.damien, null, "PUT", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(200);
    expect((await callAs(w.kenji, null, "DELETE", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(429);
  });
});

describe("PUT|DELETE /me/page-follows/:targetKey : une page", () => {
  it("La Brasa suit les quatre sortes de pages et un compte public ; rien dans les trois tables d'origine", async () => {
    const w = await world();
    const as = `v:${w.brasa.id}`;
    for (const key of [`s:${w.structure.id}`, `p:${w.pro.id}`, `m:${w.media.id}`, `u:${w.kenji.id}`]) {
      const res = await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/${key}`);
      expect(res.status, `${key} ${res.text}`).toBe(200);
      expect(res.json.following).toBe(true);
    }
    expect(await rows()).toHaveLength(4);
    expect((await rows()).every((r) => r.followerKind === "provider" && r.followerId === w.brasa.id)).toBe(true);
    expect(await db.select().from(structureFollows)).toHaveLength(0);
    expect(await db.select().from(proFollows)).toHaveLength(0);
    expect(await db.select().from(userFollows)).toHaveLength(0);
    // Une autre page de prestataire : une page suit une page.
    const other = await signUp("Autre_Presta");
    const [p2] = await db
      .insert(providerProfiles)
      .values({ userId: other.id, type: "photographer", name: "Sud Cars" })
      .returning();
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/v:${p2?.id}`)).status).toBe(200);
    const del = await callAs(w.brasaHolder, as, "DELETE", `/me/page-follows/v:${p2?.id}`);
    expect(del.json.following).toBe(false);
    expect(await rows()).toHaveLength(4);
  });

  it("T6 : un compte privé est refusé (422 follow_private_account), rien d'écrit", async () => {
    const w = await world();
    const res = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/u:${w.secret.id}`);
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("follow_private_account");
    expect(await rows()).toHaveLength(0);
  });

  it("elle-même, le compte qui la tient, une cible hors règle : refusés", async () => {
    const w = await world();
    const as = `v:${w.brasa.id}`;
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/v:${w.brasa.id}`)).status).toBe(400);
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/u:${w.brasaHolder.id}`)).status).toBe(400);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/s:${w.structure.id}`)).status).toBe(404);
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, w.pro.id));
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/p:${w.pro.id}`)).status).toBe(404);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, w.kenji.id));
    expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/u:${w.kenji.id}`)).status).toBe(404);
    expect(await rows()).toHaveLength(0);
  });

  it("une page qu'on ne tient pas : 403 persona_forbidden, rien d'écrit ; une structure sans second facteur : refusée", async () => {
    const w = await world();
    const res = await callAs(w.kenji, `v:${w.brasa.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("persona_forbidden");
    const co = await signUp("Co_Sans2fa");
    await addMember(w.structure.id, co.id, "co_organizer");
    const no2fa = await callAs(co, `s:${w.structure.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    expect(no2fa.status).toBe(403);
    expect(no2fa.json.error.code).toBe("two_factor_required");
    expect(await rows()).toHaveLength(0);
    // La structure avec son propriétaire (second facteur) : permis.
    const ok = await callAs(w.owner, `s:${w.structure.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    expect(ok.status).toBe(200);
    expect((await rows())[0]).toMatchObject({ followerKind: "structure", followerId: w.structure.id });
  });
});

describe("les routes « suivre » existantes", () => {
  it("avec l'en-tête d'une page : page_follows, jamais structure_follows ni pro_follows ni user_follows", async () => {
    const w = await world();
    const as = `v:${w.brasa.id}`;
    const s = await callAs(w.brasaHolder, as, "POST", `/structures/${w.structure.id}/follow`);
    expect(s.status).toBe(204);
    expect((await callAs(w.brasaHolder, as, "POST", `/pros/${w.pro.id}/follow`)).status).toBe(204);
    const u = await callAs(w.brasaHolder, as, "POST", `/users/${w.kenji.pseudo}/follow`);
    expect(u.status).toBe(200);
    expect(u.json).toEqual({ mine: "accepted" });
    expect(await db.select().from(structureFollows)).toHaveLength(0);
    expect(await db.select().from(proFollows)).toHaveLength(0);
    expect(await db.select().from(userFollows)).toHaveLength(0);
    expect(await rows()).toHaveLength(3);
    // Retirer, avec l'en-tête : les lignes de la page partent, jamais un abonnement de la personne.
    await db
      .insert(structureFollows)
      .values({ structureId: w.structure.id, userId: w.brasaHolder.id, source: "manual" });
    expect((await callAs(w.brasaHolder, as, "DELETE", `/structures/${w.structure.id}/follow`)).status).toBe(204);
    expect((await callAs(w.brasaHolder, as, "DELETE", `/pros/${w.pro.id}/follow`)).status).toBe(204);
    expect((await callAs(w.brasaHolder, as, "DELETE", `/users/${w.kenji.pseudo}/follow`)).json).toEqual({
      mine: "none",
    });
    expect(await rows()).toHaveLength(0);
    expect(await db.select().from(structureFollows)).toHaveLength(1);
  });

  it("l'en-tête d'une page sur le compte privé : 422 ; sur sa propre structure : 400", async () => {
    const w = await world();
    const as = `v:${w.brasa.id}`;
    const res = await callAs(w.brasaHolder, as, "POST", `/users/${w.secret.pseudo}/follow`);
    expect(res.status).toBe(422);
    expect(await db.select().from(userFollows)).toHaveLength(0);
    const orga = await callAs(w.owner, `s:${w.structure.id}`, "POST", `/structures/${w.structure.id}/follow`);
    expect(orga.status).toBe(400);
  });

  it("l'en-tête d'une page qu'on ne tient pas : 403 et aucun abonnement personnel pris par mégarde", async () => {
    const w = await world();
    const res = await callAs(w.kenji, `v:${w.brasa.id}`, "POST", `/structures/${w.structure.id}/follow`);
    expect(res.status).toBe(403);
    expect(await db.select().from(structureFollows)).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it("sans en-tête : inchangées (la table d'origine, la notification « te suit »)", async () => {
    const w = await world();
    expect((await callAs(w.damien, null, "POST", `/structures/${w.structure.id}/follow`)).status).toBe(204);
    expect((await callAs(w.damien, null, "POST", `/pros/${w.pro.id}/follow`)).status).toBe(204);
    const u = await callAs(w.damien, null, "POST", `/users/${w.kenji.pseudo}/follow`);
    expect(u.json).toEqual({ mine: "accepted" });
    expect(await db.select().from(structureFollows)).toHaveLength(1);
    expect(await db.select().from(proFollows)).toHaveLength(1);
    expect(await db.select().from(userFollows)).toHaveLength(1);
    expect(await rows()).toHaveLength(0);
    const news = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, w.kenji.id), eq(notifications.type, "user_followed")));
    expect(news).toHaveLength(1);
  });
});

describe("T14 : une page qui suit un passionné", () => {
  it("il n'est ni prévenu ni crédité d'un abonné, et la page n'entre pas dans sa liste d'abonnés", async () => {
    const w = await world();
    const before = await callAs(w.damien, null, "GET", `/users/${w.kenji.pseudo}`);
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "POST", `/users/${w.kenji.pseudo}/follow`);
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/u:${w.kenji.id}`);
    const news = await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id));
    expect(news.filter((n) => n.type === "user_followed" || n.type === "follow_request")).toHaveLength(0);
    const after = await callAs(w.damien, null, "GET", `/users/${w.kenji.pseudo}`);
    expect(after.json.followersCount).toBe(before.json.followersCount);
    const mine = await callAs(w.kenji, null, "GET", "/me/network");
    expect(mine.json.followers).toBe(0);
    const list = await callAs(w.kenji, null, "GET", "/me/followers");
    expect(JSON.stringify(list.json)).not.toContain("La Brasa");
    expect(list.json.items ?? []).toHaveLength(0);
    // Mais la page le suit bien : son état « suivi » lu pour la page.
    const seen = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", `/users/${w.kenji.pseudo}`);
    expect(seen.json.follow.mine).toBe("accepted");
    expect(seen.json.follow.followsMe).toBe(false);
    expect(seen.headers.get("cache-control")).toBe("private, no-store");
    // Lu sans en-tête, le profil est celui de la personne : elle ne le suit pas.
    const plain = await callAs(w.brasaHolder, null, "GET", `/users/${w.kenji.pseudo}`);
    expect(plain.json.follow.mine).toBe("none");
  });

  it("un compte privé : le bouton de la page n'est pas proposé", async () => {
    const w = await world();
    const seen = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", `/users/${w.secret.pseudo}`);
    expect(seen.status).toBe(200);
    expect(seen.json.follow.canFollow).toBe(false);
    expect(seen.json.follow.mine).toBe("none");
  });
});

describe("compteurs et état « suivi » des pages", () => {
  it("structure et fiche pro : abonnés = personnes + pages, isFollowing lu pour l'acteur, canSeePosts reste celui de la personne", async () => {
    const w = await world();
    await callAs(w.damien, null, "POST", `/structures/${w.structure.id}/follow`);
    await callAs(w.damien, null, "POST", `/pros/${w.pro.id}/follow`);
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "POST", `/structures/${w.structure.id}/follow`);
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "POST", `/pros/${w.pro.id}/follow`);

    const asDamien = await callAs(w.damien, null, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(asDamien.json.followersCount).toBe(2);
    expect(asDamien.json.isFollowing).toBe(true);
    // Kenji ne suit rien : sans en-tête, non ; avec l'en-tête de La Brasa (tenue par un autre compte), refusé.
    const asKenji = await callAs(w.kenji, null, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(asKenji.json).toMatchObject({ followersCount: 2, isFollowing: false });
    // La Brasa lit en tant que La Brasa : « suivi » ; sans en-tête, le compte du titulaire ne la suit pas en son nom.
    const asBrasa = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(asBrasa.json.isFollowing).toBe(true);
    expect(asBrasa.headers.get("cache-control")).toBe("private, no-store");
    expect((await callAs(w.brasaHolder, null, "GET", `/structures/by-slug/${w.structure.slug}`)).json.isFollowing).toBe(
      false,
    );
    expect((await callAs(w.kenji, `v:${w.brasa.id}`, "GET", `/structures/by-slug/${w.structure.slug}`)).status).toBe(
      403,
    );

    const proAsDamien = await callAs(w.damien, null, "GET", `/pros/by-slug/${w.pro.slug}`);
    expect(proAsDamien.json).toMatchObject({ followersCount: 2, isFollowing: true });
    // canSeePosts : l'abonnement d'une page n'ouvre rien à la personne qui lit (posts = null tant qu'elle ne suit pas).
    const proAsBrasa = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", `/pros/by-slug/${w.pro.slug}`);
    expect(proAsBrasa.json.isFollowing).toBe(true);
    expect(proAsBrasa.json.posts).toBeNull();
    expect((await callAs(w.damien, null, "GET", `/pros/by-slug/${w.pro.slug}`)).json.posts).not.toBeNull();
  });

  it("prestataire et média : followersCount et isFollowing sur GET /providers/:id et GET /media/:id", async () => {
    const w = await world();
    await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    await callAs(w.mediaHolder, `m:${w.media.id}`, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    await callAs(w.damien, null, "PUT", `/me/page-follows/m:${w.media.id}`);
    const forKenji = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(forKenji.status, forKenji.text).toBe(200);
    expect(forKenji.json).toMatchObject({ followersCount: 2, isFollowing: true });
    expect(await callAs(w.damien, null, "GET", `/providers/${w.brasa.id}`)).toMatchObject({
      json: { followersCount: 2, isFollowing: false },
    });
    // Lu en tant que le média : « suivi » est celui du média.
    const asMedia = await callAs(w.mediaHolder, `m:${w.media.id}`, "GET", `/providers/${w.brasa.id}`);
    expect(asMedia.json.isFollowing).toBe(true);
    expect(asMedia.headers.get("cache-control")).toBe("private, no-store");
    const mediaForDamien = await callAs(w.damien, null, "GET", `/media/${w.media.id}`);
    expect(mediaForDamien.json).toMatchObject({ followersCount: 1, isFollowing: true });
    const mediaAsBrasa = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", `/media/${w.media.id}`);
    expect(mediaAsBrasa.json).toMatchObject({ followersCount: 1, isFollowing: false });
  });

  it("seuls les abonnés en règle sont comptés : une page supprimée ou suspendue, un compte banni sortent du nombre", async () => {
    const w = await world();
    await callAs(w.kenji, null, "PUT", `/me/page-follows/m:${w.media.id}`);
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    await callAs(w.owner, `s:${w.structure.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    const count = async () => (await callAs(w.damien, null, "GET", `/media/${w.media.id}`)).json.followersCount;
    expect(await count()).toBe(3);
    await db.update(providerProfiles).set({ deletedAt: new Date() }).where(eq(providerProfiles.id, w.brasa.id));
    expect(await count()).toBe(2);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, w.structure.id));
    expect(await count()).toBe(1);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, w.kenji.id));
    expect(await count()).toBe(0);
  });
});

describe("followSets", () => {
  it("moi : les trois tables d'origine (personnes acceptées) et mes lignes page_follows", async () => {
    const w = await world();
    await db.insert(userFollows).values([
      { followerId: w.damien.id, followedId: w.kenji.id, status: "accepted", acceptedAt: new Date() },
      { followerId: w.damien.id, followedId: w.secret.id, status: "pending" },
    ]);
    await db.insert(structureFollows).values({ structureId: w.structure.id, userId: w.damien.id, source: "manual" });
    await db.insert(proFollows).values({ proId: w.pro.id, userId: w.damien.id });
    await callAs(w.damien, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    await callAs(w.damien, null, "PUT", `/me/page-follows/m:${w.media.id}`);
    const sets = await followSets({ kind: "user", id: w.damien.id, key: `u:${w.damien.id}` });
    expect([...sets.users]).toEqual([w.kenji.id]);
    expect([...sets.structures]).toEqual([w.structure.id]);
    expect([...sets.pros]).toEqual([w.pro.id]);
    expect([...sets.providers]).toEqual([w.brasa.id]);
    expect([...sets.medias]).toEqual([w.media.id]);
  });

  it("une page : ses seules lignes, filtrées à la lecture (compte privé, banni, page hors règle)", async () => {
    const w = await world();
    const as = `v:${w.brasa.id}`;
    const actor = { kind: "provider", id: w.brasa.id, key: as } as const;
    for (const key of [`s:${w.structure.id}`, `p:${w.pro.id}`, `m:${w.media.id}`, `u:${w.kenji.id}`]) {
      await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/${key}`);
    }
    // Les abonnements personnels du titulaire ne comptent pas pour la page.
    await db.insert(userFollows).values({ followerId: w.brasaHolder.id, followedId: w.damien.id, status: "accepted" });
    let sets = await followSets(actor);
    expect([...sets.users]).toEqual([w.kenji.id]);
    expect(sets.structures.size + sets.pros.size + sets.medias.size).toBe(3);
    // Un compte qui passe en privé sort tout seul (même si sa ligne n'était pas encore supprimée).
    await makePrivate(w.kenji);
    sets = await followSets(actor);
    expect(sets.users.size).toBe(0);
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, w.structure.id));
    await db.update(mediaProfiles).set({ deletedAt: new Date() }).where(eq(mediaProfiles.id, w.media.id));
    sets = await followSets(actor);
    expect(sets.structures.size + sets.medias.size).toBe(0);
    expect(sets.pros.size).toBe(1);
  });
});

describe("disparitions", () => {
  it("un compte qui passe en privé : les lignes des pages qui le suivaient sont supprimées dans la même transaction", async () => {
    const w = await world();
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/u:${w.kenji.id}`);
    await callAs(w.owner, `s:${w.structure.id}`, "PUT", `/me/page-follows/u:${w.kenji.id}`);
    await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    expect(await rows()).toHaveLength(3);
    const res = await callAs(w.kenji, null, "PATCH", "/me/profile", { visibility: "private" });
    expect(res.status, res.text).toBe(200);
    // Les pages ne le suivent plus ; son propre abonnement à une page reste.
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ followerKind: "user", followerId: w.kenji.id });
    // Repassé en public : rien ne revient tout seul.
    await callAs(w.kenji, null, "PATCH", "/me/profile", { visibility: "public" });
    expect(await rows()).toHaveLength(1);
  });

  it("le même passage en privé par /me/settings", async () => {
    const w = await world();
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/u:${w.kenji.id}`);
    const res = await callAs(w.kenji, null, "PATCH", "/me/settings", { visibility: "private" });
    expect(res.status, res.text).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it("compte supprimé : ses lignes partent dans les deux sens, celles de ses pages aussi", async () => {
    const w = await world();
    const { accountService } = await import("../account/service");
    await callAs(w.brasaHolder, `v:${w.brasa.id}`, "PUT", `/me/page-follows/u:${w.kenji.id}`);
    await callAs(w.kenji, null, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    await callAs(w.kenji, null, "PUT", `/me/page-follows/m:${w.media.id}`);
    await callAs(w.mediaHolder, `m:${w.media.id}`, "PUT", `/me/page-follows/v:${w.brasa.id}`);
    await callAs(w.owner, `s:${w.structure.id}`, "PUT", `/me/page-follows/m:${w.media.id}`);
    expect(await rows()).toHaveLength(5);
    // Kenji disparaît : ses deux lignes de suiveur et celle de la page qui le suivait.
    await accountService.anonymize(w.kenji.id, null);
    expect(await rows()).toHaveLength(2);
    // Le titulaire de La Brasa disparaît : les lignes de sa page (suiveuse ou suivie) partent aussi.
    await accountService.anonymize(w.brasaHolder.id, null);
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ followerKind: "structure", targetKind: "media" });
    // Le compteur du média ne compte plus que la structure.
    const media = await callAs(w.damien, null, "GET", `/media/${w.media.id}`);
    expect(media.json.followersCount).toBe(1);
  });
});

describe("sql de la base", () => {
  it("la base refuse « soi-même » et une personne qui suivrait une structure, un pro ou une personne (jamais deux vérités)", async () => {
    const w = await world();
    const bad = (values: typeof pageFollows.$inferInsert) => db.insert(pageFollows).values(values);
    await expect(
      bad({ followerKind: "provider", followerId: w.brasa.id, targetKind: "provider", targetId: w.brasa.id }),
    ).rejects.toThrow();
    for (const [kind, id] of [
      ["structure", w.structure.id],
      ["pro", w.pro.id],
      ["user", w.kenji.id],
    ] as const) {
      await expect(
        bad({ followerKind: "user", followerId: w.damien.id, targetKind: kind, targetId: id }),
      ).rejects.toThrow();
    }
    expect(Number((await db.execute(sql`select count(*) from page_follows`)).rows[0]?.count)).toBe(0);
  });
});
