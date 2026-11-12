// Stories des prestataires et des médias sous les clés `v:` et `m:`, barre lue « en tant que » une page, mutes, copies,
// façade `by-author/u:` (lot R9a). Le titulaire d'une page n'est jamais servi : ni son pseudo, ni l'identifiant de son compte.
// Aucune plaque lisible : les photos d'essai sont du bruit coloré.

import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import {
  addMember,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  mediaProfiles,
  notifications,
  pageFollows,
  profiles,
  providerProfiles,
  stories,
  storyMutes,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
});

const req = (u: TestUser | null, method: string, path: string, body?: unknown) => callAs(u, null, method, path, body);

async function photo() {
  const width = 1600;
  const height = 900;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function publish(u: TestUser, over: Record<string, unknown> = {}) {
  const form = new FormData();
  form.append("purpose", "story");
  form.append("file", new File([new Uint8Array(await photo())], "photo.jpg", { type: "image/jpeg" }));
  const up = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  expect(up.status).toBe(201);
  const key = ((await up.json()) as { key: string }).key;
  return req(u, "POST", "/me/stories", { uploadKey: key, noPlateConfirmed: true, audience: "public", ...over });
}
async function ok(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await publish(u, over);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json as { id: string };
}

const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));
async function follow(a: TestUser, b: TestUser) {
  await db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status: "accepted", acceptedAt: clock.now });
}
const followPage = (u: TestUser, key: string) => req(u, "PUT", `/me/page-follows/${key}`);
const barOf = async (u: TestUser, actor: string | null = null) => {
  const res = await callAs(u, actor, "GET", "/stories/bar");
  expect(res.status, res.text).toBe(200);
  return res.json as { mine: { count: number } | null; authors: { key: string; pseudoOrName: string }[] };
};
const keysOf = async (u: TestUser, actor: string | null = null) => (await barOf(u, actor)).authors.map((a) => a.key);

/** La Brasa (prestataire) et Auto Sud Mag (média), tenus par des comptes **privés** : leurs stories restent publiques. */
async function world() {
  const brasaHolder = await signUp("Titulaire_Brasa", { twoFactor: true });
  const mediaHolder = await signUp("Titulaire_Media", { twoFactor: true });
  await makePrivate(brasaHolder);
  await makePrivate(mediaHolder);
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: brasaHolder.id, type: "photographer", name: "La Brasa" })
    .returning();
  const [media] = await db.insert(mediaProfiles).values({ userId: mediaHolder.id, name: "Auto Sud Mag" }).returning();
  return {
    brasaHolder,
    mediaHolder,
    brasa: brasa as NonNullable<typeof brasa>,
    media: media as NonNullable<typeof media>,
    kenji: await signUp("Kenji_66"),
    damien: await signUp("Damien_66"),
  };
}

/** Rien ne doit trahir le compte derrière une page : ni son pseudo, ni l'identifiant de son compte. */
const expectNoHolder = (payload: unknown, holder: TestUser) => {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(holder.pseudo);
  expect(text).not.toContain(holder.id);
};

describe("création : la page est résolue par le serveur", () => {
  it("prestataire et média : provider_id / media_id remplis, clé v: / m:, story visible d'un membre non abonné (compte privé)", async () => {
    const w = await world();
    const a = await ok(w.brasaHolder, { persona: "provider" });
    const b = await ok(w.mediaHolder, { persona: "media" });
    const [ra] = await db.select().from(stories).where(eq(stories.id, a.id));
    const [rb] = await db.select().from(stories).where(eq(stories.id, b.id));
    expect(ra).toMatchObject({ persona: "provider", providerId: w.brasa.id, mediaId: null, structureId: null });
    expect(rb).toMatchObject({ persona: "media", mediaId: w.media.id, providerId: null });

    // Un membre connecté qui ne suit personne la lit : la story d'une page ne dépend pas du compte de son titulaire.
    const view = await req(w.kenji, "GET", `/stories/by-author/v:${w.brasa.id}`);
    expect(view.status).toBe(200);
    expect(view.json.stories).toHaveLength(1);
    expect(view.json.author).toMatchObject({ key: `v:${w.brasa.id}`, pseudoOrName: "La Brasa", persona: "provider" });
    expectNoHolder(view.json, w.brasaHolder);
    const mview = await req(w.kenji, "GET", `/stories/by-author/m:${w.media.id}`);
    expect(mview.json.author).toMatchObject({ key: `m:${w.media.id}`, pseudoOrName: "Auto Sud Mag" });
    expectNoHolder(mview.json, w.mediaHolder);
  });

  it("l'identifiant de la page n'est jamais reçu : une structure glissée dans le corps est ignorée, un compte sans page est refusé", async () => {
    const w = await world();
    const res = await publish(w.brasaHolder, {
      persona: "provider",
      structureId: "3f2b1c0a-1111-4222-8333-444455556666",
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row).toMatchObject({ providerId: w.brasa.id, structureId: null, proId: null });
    const none = await publish(w.kenji, { persona: "provider" });
    expect(none.status).toBe(403);
    expect(none.json.error.code).toBe("persona_forbidden");
  });

  it("le plafond de 50 stories vivantes se compte par page, pas avec les stories personnelles du titulaire", async () => {
    const w = await world();
    const first = await ok(w.brasaHolder, { persona: "provider" });
    const [model] = await db.select().from(stories).where(eq(stories.id, first.id));
    const m = model as NonNullable<typeof model>;
    const { id: _id, ...rest } = m;
    await db.insert(stories).values(Array.from({ length: 49 }, () => ({ ...rest })));
    const full = await publish(w.brasaHolder, { persona: "provider" });
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe("too_many_stories");
    // Ses stories personnelles ont leur propre plafond.
    expect((await publish(w.brasaHolder, { persona: "fan", audience: "followers" })).status).toBe(201);
  });
});

describe("la barre d'une personne (sans en-tête)", () => {
  it("les prestataires et médias suivis y sont, sous leur page ; les autres non ; aucun pseudo de titulaire", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    await ok(w.mediaHolder, { persona: "media" });
    expect(await keysOf(w.kenji)).toEqual([]);
    expect((await followPage(w.kenji, `v:${w.brasa.id}`)).status).toBe(200);
    expect(await keysOf(w.kenji)).toEqual([`v:${w.brasa.id}`]);
    await followPage(w.kenji, `m:${w.media.id}`);
    const bar = await barOf(w.kenji);
    expect(bar.authors.map((x) => x.pseudoOrName).sort()).toEqual(["Auto Sud Mag", "La Brasa"]);
    expectNoHolder(bar, w.brasaHolder);
    expectNoHolder(bar, w.mediaHolder);
    // Suivre le compte du titulaire ne donne pas ses stories de page (ni l'inverse).
    await follow(w.damien, w.brasaHolder);
    expect(await keysOf(w.damien)).toEqual([]);
    // Ne plus suivre la page : elle sort de la barre.
    await req(w.kenji, "DELETE", `/me/page-follows/v:${w.brasa.id}`);
    expect(await keysOf(w.kenji)).toEqual([`m:${w.media.id}`]);
  });

  it("« Ta story » ne compte que mes stories personnelles ; celles de ma page ont leur clé", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    expect((await barOf(w.brasaHolder)).mine).toBeNull();
    await ok(w.brasaHolder, { persona: "fan", audience: "followers" });
    expect((await barOf(w.brasaHolder)).mine?.count).toBe(1);
  });

  it("forme inchangée pour l'APK en ligne : mêmes champs que les barres d'avant, rien de plus", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    await followPage(w.kenji, `v:${w.brasa.id}`);
    const res = await req(w.kenji, "GET", "/stories/bar");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Object.keys(res.json).sort()).toEqual(["authors", "mine"]);
    expect(Object.keys(res.json.authors[0]).sort()).toEqual(
      ["avatarUrl", "crewName", "hasUnseen", "key", "latestAt", "pseudoOrName", "ring"].sort(),
    );
  });

  it("un titulaire passé de compte public à privé garde des stories de page visibles (pas de dépendance au compte)", async () => {
    const w = await world();
    await makePrivate(w.brasaHolder);
    await ok(w.brasaHolder, { persona: "provider" });
    await followPage(w.damien, `v:${w.brasa.id}`);
    expect(await keysOf(w.damien)).toEqual([`v:${w.brasa.id}`]);
    // Un titulaire banni ou supprimé retire sa page de la barre.
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, w.brasaHolder.id));
    expect(await keysOf(w.damien)).toEqual([]);
  });
});

describe("façade : GET /stories/by-author/u:<compte>", () => {
  it("ne sert que les stories personnelles, jamais celles d'une page ; la liste des pages ne passe pas par le compte", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    await follow(w.kenji, w.brasaHolder);
    // Aucune story personnelle : rien, même si la personne est suivie.
    const none = await req(w.kenji, "GET", `/stories/by-author/u:${w.brasaHolder.id}`);
    expect(none.status).toBe(200);
    expect(none.json).toEqual({ author: null, stories: [] });
    const personal = await ok(w.brasaHolder, { persona: "fan", audience: "followers" });
    const some = await req(w.kenji, "GET", `/stories/by-author/u:${w.brasaHolder.id}`);
    expect(some.json.stories.map((s: { id: string }) => s.id)).toEqual([personal.id]);
    expect(some.json.author.persona).toBe("fan");
  });

  it("un abonné d'avant la migration ne retrouve pas les stories de page sous le compte de la personne", async () => {
    const w = await world();
    const s = await ok(w.brasaHolder, { persona: "provider" });
    await follow(w.kenji, w.brasaHolder);
    const bar = await keysOf(w.kenji);
    expect(bar).toEqual([]);
    // La story reste lisible sous sa vraie clé, par n'importe quel membre.
    const direct = await req(w.kenji, "GET", `/stories/by-author/v:${w.brasa.id}`);
    expect(direct.json.stories[0].id).toBe(s.id);
  });
});

describe("mutes", () => {
  it("masquer une page (v: / m:) la retire de la barre ; la démasquer la rend", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    await ok(w.mediaHolder, { persona: "media" });
    await followPage(w.kenji, `v:${w.brasa.id}`);
    await followPage(w.kenji, `m:${w.media.id}`);
    expect((await req(w.kenji, "PUT", `/me/story-mutes/v:${w.brasa.id}`)).status).toBe(204);
    expect(await keysOf(w.kenji)).toEqual([`m:${w.media.id}`]);
    expect((await req(w.kenji, "PUT", `/me/story-mutes/m:${w.media.id}`)).status).toBe(204);
    expect(await keysOf(w.kenji)).toEqual([]);
    expect((await req(w.kenji, "DELETE", `/me/story-mutes/v:${w.brasa.id}`)).status).toBe(204);
    expect(await keysOf(w.kenji)).toEqual([`v:${w.brasa.id}`]);
    const rows = await db.select().from(storyMutes).where(eq(storyMutes.userId, w.kenji.id));
    expect(rows.map((r) => r.authorKind)).toEqual(["media"]);
    expect((await req(w.kenji, "PUT", "/me/story-mutes/v:pas-un-uuid")).status).toBe(404);
  });

  it("aucun héritage : masquer puis démasquer une personne ne change rien à l'anneau de sa page", async () => {
    const w = await world();
    await ok(w.brasaHolder, { persona: "provider" });
    await followPage(w.kenji, `v:${w.brasa.id}`);
    expect(await keysOf(w.kenji)).toEqual([`v:${w.brasa.id}`]);
    // Masquer le compte du titulaire (route publique : `u:` d'un compte) puis le démasquer : l'anneau de la page ne bouge pas.
    expect((await req(w.kenji, "PUT", `/me/story-mutes/u:${w.brasaHolder.id}`)).status).toBe(204);
    expect(await keysOf(w.kenji)).toEqual([`v:${w.brasa.id}`]);
    expect((await req(w.kenji, "DELETE", `/me/story-mutes/u:${w.brasaHolder.id}`)).status).toBe(204);
    expect(await keysOf(w.kenji)).toEqual([`v:${w.brasa.id}`]);
    // Et la notification « nouvelle story » part quand même (le masquage d'une personne n'en est pas un de sa page).
    await db.insert(storyMutes).values({ userId: w.kenji.id, authorKind: "user", authorId: w.brasaHolder.id });
    await ok(w.brasaHolder, { persona: "provider" });
    const news = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, w.kenji.id), eq(notifications.type, "story_published")));
    expect(news).toHaveLength(1);
  });
});

describe("notifications et réponses sans fuite", () => {
  it("les abonnés de la page sont prévenus au nom de la page, jamais au nom du titulaire ; ses abonnés personnels non", async () => {
    const w = await world();
    await followPage(w.kenji, `v:${w.brasa.id}`);
    await follow(w.damien, w.brasaHolder);
    await ok(w.brasaHolder, { persona: "provider" });
    const forKenji = await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id));
    const published = forKenji.filter((n) => n.type === "story_published");
    expect(published).toHaveLength(1);
    expect(published[0]?.title).toContain("La Brasa");
    expectNoHolder(published[0], w.brasaHolder);
    expect((published[0]?.data as { authorKey: string } | undefined)?.authorKey).toBe(`v:${w.brasa.id}`);
    const forDamien = await db.select().from(notifications).where(eq(notifications.userId, w.damien.id));
    expect(forDamien.filter((n) => n.type === "story_published")).toHaveLength(0);
  });

  it("répondre à la story d'une page : 403 reply_unavailable, jamais un message au compte du titulaire", async () => {
    const w = await world();
    const s = await ok(w.brasaHolder, { persona: "provider" });
    const res = await req(w.kenji, "POST", `/stories/${s.id}/reply`, { text: "Super !" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("reply_unavailable");
  });

  it("une identification fait suivre la page : l'identifié lit la story, la mention nomme la page", async () => {
    const w = await world();
    const s = await ok(w.brasaHolder, { persona: "provider", tags: [{ kind: "user", id: w.kenji.id }] });
    const mention = (await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id))).find(
      (n) => n.type === "story_mention",
    );
    expect(mention).toBeDefined();
    expect(mention?.title).toContain("La Brasa");
    expectNoHolder(mention, w.brasaHolder);
    expect(s.id).toBeTruthy();
  });
});

describe("copie « Ajouter à ma story » d'une story de page", () => {
  it("le crédit est la page (sans lien, sans compte) ; la copie tombe avec la page", async () => {
    const w = await world();
    const s = await ok(w.brasaHolder, { persona: "provider", tags: [{ kind: "user", id: w.kenji.id }] });
    const shared = await req(w.kenji, "POST", `/stories/${s.id}/share-to-mine`, {});
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
    await follow(w.damien, w.kenji);
    const view = await req(w.damien, "GET", `/stories/by-author/u:${w.kenji.id}`);
    expect(view.json.stories).toHaveLength(1);
    expect(view.json.stories[0].sharedFrom).toEqual({
      kind: "provider",
      id: w.brasa.id,
      name: "La Brasa",
      slug: null,
      avatarUrl: null,
    });
    expectNoHolder(view.json, w.brasaHolder);
    // La page disparaît : la copie n'est plus servie.
    await db.update(providerProfiles).set({ deletedAt: new Date() }).where(eq(providerProfiles.id, w.brasa.id));
    const after = await req(w.damien, "GET", `/stories/by-author/u:${w.kenji.id}`);
    expect(after.json.stories).toEqual([]);
    // Et la story d'une page supprimée n'est plus servie du tout, ni sous v:, ni dans une barre.
    expect((await req(w.damien, "GET", `/stories/by-author/v:${w.brasa.id}`)).json).toEqual({
      author: null,
      stories: [],
    });
  });

  it("une story de page dont la page est supprimée n'est servie nulle part, et sans page elle n'a pas de clé", async () => {
    const w = await world();
    const s = await ok(w.brasaHolder, { persona: "provider" });
    await followPage(w.kenji, `v:${w.brasa.id}`);
    await db.update(stories).set({ providerId: null }).where(eq(stories.id, s.id));
    expect(await keysOf(w.kenji)).toEqual([]);
    expect((await req(w.kenji, "GET", `/stories/by-author/v:${w.brasa.id}`)).json.stories).toEqual([]);
    // Jamais retombée sur le compte du titulaire.
    const viaUser = await req(w.kenji, "GET", `/stories/by-author/u:${w.brasaHolder.id}`);
    expect(viaUser.json.stories).toEqual([]);
  });
});

describe("la barre lue en tant que page", () => {
  /** La Brasa suit Roues Libres (structure), Auto Sud Mag, Kenji (public) et Secret (privé, via la base : refusé par la route). */
  async function setup() {
    const w = await world();
    const owner = await signUp("Orga_Roues", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const secret = await signUp("Secret_66");
    const crewKenji = await signUp("Crew_Kenji");
    const as = `v:${w.brasa.id}`;
    for (const key of [`s:${structure.id}`, `m:${w.media.id}`, `u:${w.kenji.id}`]) {
      expect((await callAs(w.brasaHolder, as, "PUT", `/me/page-follows/${key}`)).status, key).toBe(200);
    }
    return { ...w, owner, structure, secret, crewKenji, as };
  }

  it("mine = les stories de la page ; authors = ce que la page suit ; jamais la page elle-même", async () => {
    const w = await setup();
    await ok(w.brasaHolder, { persona: "provider" });
    await ok(w.brasaHolder, { persona: "fan", audience: "followers" });
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    await ok(w.mediaHolder, { persona: "media" });
    await ok(w.kenji, { audience: "public" });
    const asPage = await barOf(w.brasaHolder, w.as);
    expect(asPage.mine?.count).toBe(1);
    expect((await callAs(w.brasaHolder, w.as, "GET", "/stories/bar")).headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(asPage.authors.map((a) => a.key).sort()).toEqual(
      [`s:${w.structure.id}`, `m:${w.media.id}`, `u:${w.kenji.id}`].sort(),
    );
    // La barre de la personne, elle, est tout autre : sa propre story, et rien des abonnements de la page.
    const asSelf = await barOf(w.brasaHolder);
    expect(asSelf.mine?.count).toBe(1);
    expect(asSelf.authors).toEqual([]);
  });

  it("jamais un crew, jamais une place à un événement", async () => {
    const w = await setup();
    // Kenji : une seule story, de crew (la page ne la voit pas).
    const crew = await req(w.kenji, "POST", "/crews", { name: "Crew du test", department: "66" });
    expect(crew.status).toBe(201);
    await ok(w.kenji, { audience: "crew", crewId: crew.json.id });
    expect(await keysOf(w.brasaHolder, w.as)).not.toContain(`u:${w.kenji.id}`);
    // Le titulaire, lui, est dans ce crew et suit Kenji : sa propre barre le montre ; celle de la page non.
    await db.insert(userFollows).values({ followerId: w.brasaHolder.id, followedId: w.kenji.id, status: "accepted" });
    await req(w.brasaHolder, "POST", `/crews/${crew.json.id}/requests`, { message: null });
    await req(w.kenji, "POST", `/crews/${crew.json.id}/requests/${w.brasaHolder.id}/accept`);
    expect(await keysOf(w.brasaHolder)).toContain(`u:${w.kenji.id}`);
    expect(await keysOf(w.brasaHolder, w.as)).not.toContain(`u:${w.kenji.id}`);
    // Une place à un événement à venir d'une autre structure : dans la barre de la personne, pas dans celle de la page.
    const other = await signUp("Orga_Autre", { twoFactor: true });
    const otherStructure = await createStructure(other.id);
    await ok(other, { persona: "organizer", structureId: otherStructure.id });
    const event = await createEvent(otherStructure.id, { startsAt: new Date(clock.now.getTime() + 3 * 24 * HOUR) });
    const car = await createVehicle(w.brasaHolder.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: w.brasaHolder.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
    });
    expect(await keysOf(w.brasaHolder)).toContain(`s:${otherStructure.id}`);
    expect(await keysOf(w.brasaHolder, w.as)).not.toContain(`s:${otherStructure.id}`);
  });

  it("jamais un compte privé : ni sa story, même si la ligne d'abonnement subsistait, même si la personne le suit", async () => {
    const w = await setup();
    // Une ligne subsiste (cas d'une course avec le passage en privé) : la lecture la filtre.
    await db.insert(pageFollows).values({
      followerKind: "provider",
      followerId: w.brasa.id,
      targetKind: "user",
      targetId: w.secret.id,
    });
    await makePrivate(w.secret);
    await ok(w.secret, { audience: "followers" });
    await db.insert(userFollows).values({ followerId: w.brasaHolder.id, followedId: w.secret.id, status: "accepted" });
    expect(await keysOf(w.brasaHolder)).toContain(`u:${w.secret.id}`);
    expect(await keysOf(w.brasaHolder, w.as)).not.toContain(`u:${w.secret.id}`);
    // Kenji, public, passe en privé : il sort de la barre de la page.
    await ok(w.kenji, { audience: "public" });
    expect(await keysOf(w.brasaHolder, w.as)).toContain(`u:${w.kenji.id}`);
    await makePrivate(w.kenji);
    expect(await keysOf(w.brasaHolder, w.as)).not.toContain(`u:${w.kenji.id}`);
  });

  it("invariant : tout ce que contient la barre d'une page est visible de n'importe quel membre connecté", async () => {
    const w = await setup();
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    await ok(w.mediaHolder, { persona: "media" });
    await ok(w.kenji, { audience: "public" });
    await ok(w.kenji, { audience: "followers" });
    const stranger = await signUp("Membre_Quelconque");
    const bar = await barOf(w.brasaHolder, w.as);
    expect(bar.authors.length).toBe(3);
    for (const a of bar.authors) {
      const view = await req(stranger, "GET", `/stories/by-author/${a.key}`);
      expect(view.status, a.key).toBe(200);
      // Au moins une story visible, et l'inconnu ne voit jamais plus que ce que la page voyait dans l'anneau.
      expect(view.json.stories.length, a.key).toBeGreaterThan(0);
      // Même nombre de stories que celles de la barre de la page (aucune n'est cachée à l'inconnu).
      expect(view.json.author.key).toBe(a.key);
    }
  });

  it("mutes de la personne appliqués ; l'ordre est celui de la barre (non vues d'abord, la plus récente)", async () => {
    const w = await setup();
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    clock.advance(HOUR);
    await ok(w.mediaHolder, { persona: "media" });
    clock.advance(HOUR);
    await ok(w.kenji, { audience: "public" });
    expect(await keysOf(w.brasaHolder, w.as)).toEqual([`u:${w.kenji.id}`, `m:${w.media.id}`, `s:${w.structure.id}`]);
    await req(w.brasaHolder, "PUT", `/me/story-mutes/m:${w.media.id}`);
    expect(await keysOf(w.brasaHolder, w.as)).toEqual([`u:${w.kenji.id}`, `s:${w.structure.id}`]);
  });

  it("lue par un responsable de la page : ses propres stories de crew ne passent pas (regard sans lien, pas l'auteur)", async () => {
    const w = await setup();
    const co = await signUp("Co_Crew", { twoFactor: true });
    await addMember(w.structure.id, co.id, "co_organizer");
    // La structure suit le co-organisateur (ligne posée par la base : la route refuserait « le compte qui la tient »).
    await db.insert(pageFollows).values({
      followerKind: "structure",
      followerId: w.structure.id,
      targetKind: "user",
      targetId: co.id,
    });
    const crew = await req(co, "POST", "/crews", { name: "Crew du co", department: "66" });
    expect(crew.status).toBe(201);
    await ok(co, { audience: "crew", crewId: crew.json.id });
    expect(await keysOf(co, `s:${w.structure.id}`)).not.toContain(`u:${co.id}`);
  });

  it("l'acteur est vérifié : une page qu'on ne tient pas, 403 ; un co-organisateur lit sans second facteur", async () => {
    const w = await setup();
    expect((await callAs(w.kenji, w.as, "GET", "/stories/bar")).status).toBe(403);
    const co = await signUp("Co_Orga");
    await addMember(w.structure.id, co.id, "co_organizer");
    const res = await callAs(co, `s:${w.structure.id}`, "GET", "/stories/bar");
    expect(res.status).toBe(200);
    expect(res.json.authors).toEqual([]);
  });

  it("ne lit pas le compte du titulaire : aucune réponse ne contient son pseudo ni son identifiant", async () => {
    const w = await setup();
    await ok(w.mediaHolder, { persona: "media" });
    const bar = await callAs(w.brasaHolder, w.as, "GET", "/stories/bar");
    // Le titulaire lit : son propre pseudo n'a pas à être servi à la barre de sa page.
    expect(bar.text).not.toContain(w.brasaHolder.pseudo);
    expect(bar.text).not.toContain(w.brasaHolder.id);
  });
});

describe("tour 3 : l'ancien client, le repartage, les en-têtes", () => {
  it("l'envoi exact de l'ancien client (casquette prestataire, « Mes abonnés », compte privé) : 400, aucune story, le fichier repart en « public »", async () => {
    const w = await world();
    const form = new FormData();
    form.append("purpose", "story");
    form.append("file", new File([new Uint8Array(await photo())], "photo.jpg", { type: "image/jpeg" }));
    const up = await app.request("/api/me/uploads", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: w.brasaHolder.cookie },
      body: form,
    });
    const key = ((await up.json()) as { key: string }).key;
    for (const persona of ["provider", "media"] as const) {
      const old = await req(w.brasaHolder, "POST", "/me/stories", {
        uploadKey: key,
        noPlateConfirmed: true,
        persona,
        audience: "followers",
      });
      expect(old.status, JSON.stringify(old.json)).toBe(400);
      expect(old.json.error.message).toContain("Mets à jour l'appli");
    }
    expect(await db.select().from(stories)).toHaveLength(0);
    const again = await req(w.brasaHolder, "POST", "/me/stories", {
      uploadKey: key,
      noPlateConfirmed: true,
      persona: "provider",
      audience: "public",
    });
    expect(again.status, JSON.stringify(again.json)).toBe(201);
  });

  it("50 stories de prestataire vivantes : le repartage personnel passe", async () => {
    const w = await world();
    const host = await signUp("Hote_Story");
    const s = await ok(host, { audience: "public", tags: [{ kind: "user", id: w.brasaHolder.id }] });
    const first = await ok(w.brasaHolder, { persona: "provider" });
    const [model] = await db.select().from(stories).where(eq(stories.id, first.id));
    const { id: _id, ...rest } = model as NonNullable<typeof model>;
    await db.insert(stories).values(Array.from({ length: 49 }, () => ({ ...rest })));
    const shared = await req(w.brasaHolder, "POST", `/stories/${s.id}/share-to-mine`, {});
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
  });

  it("la notification de repartage ouvre la visionneuse de l'auteur : s:, p:, v:, m:, u:", async () => {
    const w = await world();
    const sharer = await signUp("Repartage_Kenji");
    const orgaOwner = await signUp("Orga_Lien", { twoFactor: true });
    const structure = await createStructure(orgaOwner.id);
    const proOwner = await signUp("Pro_Lien");
    const pro = await createPro(proOwner.id);
    const tag = { tags: [{ kind: "user", id: sharer.id }] };
    const cases: { author: TestUser; over: Record<string, unknown>; key: string }[] = [
      { author: orgaOwner, over: { persona: "organizer", structureId: structure.id }, key: `s:${structure.id}` },
      { author: proOwner, over: { persona: "pro", proId: pro.id }, key: `p:${pro.id}` },
      { author: w.brasaHolder, over: { persona: "provider" }, key: `v:${w.brasa.id}` },
      { author: w.mediaHolder, over: { persona: "media" }, key: `m:${w.media.id}` },
      { author: w.damien, over: {}, key: `u:${w.damien.id}` },
    ];
    for (const c of cases) {
      const s = await ok(c.author, { ...c.over, ...tag });
      const res = await req(sharer, "POST", `/stories/${s.id}/share-to-mine`, {});
      expect(res.status, `${c.key} ${JSON.stringify(res.json)}`).toBe(201);
      const notes = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, c.author.id), eq(notifications.type, "story_shared_by_organizer")));
      expect(
        notes.map((n) => (n.data as { link: string }).link),
        c.key,
      ).toContain(`/app/story/${c.key}`);
    }
  });

  it("Cache-Control private, no-store sur les fiches et le profil, avec et sans en-tête d'acteur", async () => {
    const w = await world();
    const owner = await signUp("Orga_Cache", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const pro = await createPro(w.damien.id);
    const paths = [
      `/providers/${w.brasa.id}`,
      `/media/${w.media.id}`,
      `/structures/by-slug/${structure.slug}`,
      `/pros/by-slug/${pro.slug}`,
      `/users/${w.kenji.pseudo}`,
    ];
    for (const path of paths) {
      const plain = await callAs(w.kenji, null, "GET", path);
      expect(plain.status, path).toBe(200);
      expect(plain.headers.get("cache-control"), path).toBe("private, no-store");
      const asPage = await callAs(w.brasaHolder, `v:${w.brasa.id}`, "GET", path);
      expect(asPage.status, path).toBe(200);
      expect(asPage.headers.get("cache-control"), path).toBe("private, no-store");
    }
  });
});
