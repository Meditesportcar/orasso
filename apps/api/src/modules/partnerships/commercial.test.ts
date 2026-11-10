// Lot R7m2 (D38, maquette R7.21) : « Collaboration commerciale » sur une story ou une publication du Fil. L'API pose la
// mention (tag `pro` ou `@slug` + partenariat ACTIF, ou choix explicite), ne la retire jamais, la garde après la fin du
// partenariat, l'imprime sur le fichier qui sort d'Orasso, la prête à la copie du pro, et prévient le pro.
// Aucune plaque lisible : les photos d'essai sont du bruit ou des aplats.

import { fromWallTime, mentionedSlugs, partnershipLabels } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPro, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  feedPosts,
  notifications,
  partnerships,
  profiles,
  proProfiles,
  stories,
  storyTags,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { notificationsService } from "../notifications/service";
import { dropCopiesOfTag } from "../stories/share";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
let proOwner: TestUser;
let pro: Awaited<ReturnType<typeof createPro>>;
let kenji: TestUser;
let viewer: TestUser;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
  proOwner = await signUp("Wrap_66");
  pro = await createPro(proOwner.id, { name: "Wrap 66", slug: "wrap-66", verifiedAt: new Date(0) });
  kenji = await signUp("Kenji_66");
  viewer = await signUp("Viewer_66");
});

async function req(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function flat(color: string, width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function upload(u: TestUser, purpose: "story" | "feed_post", data: Buffer) {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { key: string }).key;
}

/** Une story d'un aplat gris : deux stories de même contenu donnent le même fichier, sauf la mention. */
async function story(u: TestUser, over: Record<string, unknown> = {}) {
  const key = await upload(u, "story", await flat("#556070", 1600, 900));
  return req(u, "POST", "/me/stories", { uploadKey: key, noPlateConfirmed: true, audience: "public", ...over });
}
async function okStory(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await story(u, over);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json.id as string;
}

async function post(u: TestUser, over: Record<string, unknown> = {}) {
  const key = await upload(u, "feed_post", await flat("#556070", 800, 1000));
  return req(u, "POST", "/me/feed-posts", { photos: [{ uploadKey: key, noPlateConfirmed: true }], ...over });
}

const partnerOf = async (user: TestUser, status: "active" | "ended" = "active") => {
  await db.insert(partnerships).values({
    proId: pro.id,
    userId: user.id,
    message: "Covering offert",
    status,
    respondedAt: clock.now,
    ...(status === "ended" ? { endedAt: clock.now } : {}),
  });
};
const endPartnership = () => db.update(partnerships).set({ status: "ended", endedAt: clock.now });

/** La story lue par un autre membre (la mention est dans la réponse de lecture). */
async function read(u: TestUser, author: TestUser, id: string) {
  const res = await req(u, "GET", `/stories/by-author/u:${author.id}`);
  expect(res.status).toBe(200);
  return (res.json.stories as { id: string; commercialPartner: unknown }[]).find((s) => s.id === id);
}

const notifsOf = async (u: TestUser, type: string) => {
  await notificationsService.flush();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.type, type)));
};

describe("règle de pose : stories", () => {
  it("un pro partenaire identifié : la mention est posée, avec nom, adresse et logo (liste blanche)", async () => {
    await partnerOf(kenji);
    const id = await okStory(kenji, { tags: [{ kind: "pro", id: pro.id }] });
    const seen = await read(viewer, kenji, id);
    expect(seen?.commercialPartner).toEqual({ id: pro.id, name: "Wrap 66", slug: "wrap-66", logoUrl: null });
    expect(Object.keys(seen?.commercialPartner as object).sort()).toEqual(["id", "logoUrl", "name", "slug"]);
    const [row] = await db.select().from(stories).where(eq(stories.id, id));
    expect(row?.commercialPartnerId).toBe(pro.id);
  });

  it("la mention @slug dans la légende (casse indifférente) pose la mention sans identification", async () => {
    await partnerOf(kenji);
    const id = await okStory(kenji, { caption: "Covering par @Wrap-66 !" });
    expect((await read(viewer, kenji, id))?.commercialPartner).toMatchObject({ slug: "wrap-66" });
    expect(await db.select().from(storyTags).where(eq(storyTags.storyId, id))).toHaveLength(0);
  });

  it("une mention collée à un autre mot ne compte pas (@wrap-666, @wrap-66_x, a@wrap-66.fr)", async () => {
    await partnerOf(kenji);
    for (const caption of ["@wrap-666 super", "@wrap-66_x", "écris à a@wrap-66.fr", "wrap-66 sans arobase"]) {
      const id = await okStory(kenji, { caption });
      expect((await read(viewer, kenji, id))?.commercialPartner, caption).toBeNull();
      await db.delete(stories).where(eq(stories.id, id));
    }
    expect(mentionedSlugs("@wrap-66, @garage-2 et @wrap-66")).toEqual(["wrap-66", "garage-2"]);
  });

  it("un pro qui n'est pas partenaire (identifié ou cité) : rien", async () => {
    const id = await okStory(kenji, { tags: [{ kind: "pro", id: pro.id }], caption: "@wrap-66" });
    expect((await read(viewer, kenji, id))?.commercialPartner).toBeNull();
  });

  it("un partenariat en attente, refusé ou terminé : rien", async () => {
    for (const status of ["pending", "declined", "ended"] as const) {
      await db.delete(partnerships);
      await db.insert(partnerships).values({ proId: pro.id, userId: kenji.id, message: "x", status });
      const id = await okStory(kenji, { caption: "@wrap-66" });
      expect((await read(viewer, kenji, id))?.commercialPartner, status).toBeNull();
      await db.delete(stories).where(eq(stories.id, id));
    }
  });

  it("le partenaire d'un autre pro ne vaut rien pour ce pro, et un partenaire de quelqu'un d'autre ne compte pas", async () => {
    const other = await signUp("Autre_Pro");
    const otherPro = await createPro(other.id, { name: "Garage 2", slug: "garage-2" });
    await partnerOf(kenji);
    const id = await okStory(kenji, { tags: [{ kind: "pro", id: otherPro.id }], caption: "@garage-2" });
    expect((await read(viewer, kenji, id))?.commercialPartner).toBeNull();
    // Le partenariat de Kenji ne s'applique pas à Nina.
    const nina = await signUp("Nina_66");
    const ninaStory = await okStory(nina, { caption: "@wrap-66" });
    expect((await read(viewer, nina, ninaStory))?.commercialPartner).toBeNull();
  });

  it("choix explicite : n'importe quel pro publié ; fiche non publiée ou inconnue : 400 ; deux pros différents : 400", async () => {
    const explicit = await story(kenji, { commercialPartnerId: pro.id });
    expect(explicit.status).toBe(201);
    expect((await read(viewer, kenji, explicit.json.id))?.commercialPartner).toMatchObject({ slug: "wrap-66" });

    const draftOwner = await signUp("Brouillon_Pro");
    const draft = await createPro(draftOwner.id, { slug: "brouillon", publishedAt: null });
    expect((await story(kenji, { commercialPartnerId: draft.id })).status).toBe(400);
    expect((await story(kenji, { commercialPartnerId: "11111111-2222-4333-8444-555555555555" })).status).toBe(400);

    await partnerOf(kenji);
    const clash = await story(kenji, { caption: "@wrap-66", commercialPartnerId: draft.id });
    expect(clash.status).toBe(400);
    const clashOther = await story(kenji, { caption: "@wrap-66", commercialPartnerId: pro.id });
    expect(clashOther.status).toBe(201);
  });

  it("un compte privé qui cite son partenaire : l'identification est écartée, la mention reste posée", async () => {
    await partnerOf(kenji);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    const res = await story(kenji, { audience: "followers", tags: [{ kind: "pro", id: pro.id }] });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.skipped).toHaveLength(1);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row?.commercialPartnerId).toBe(pro.id);
  });

  it("publier au nom de sa propre fiche pro : jamais « collaboration » avec soi-même", async () => {
    await partnerOf(proOwner); // même fiche, par un partenariat absurde posé en base
    const id = await okStory(proOwner, { persona: "pro", proId: pro.id, caption: "@wrap-66" });
    expect((await read(viewer, proOwner, id))?.commercialPartner ?? null).toBeNull();
    const [row] = await db.select().from(stories).where(eq(stories.id, id));
    expect(row?.commercialPartnerId).toBeNull();
  });

  it("un contenu publié garde sa mention après la fin du partenariat ; le suivant n'en a plus", async () => {
    await partnerOf(kenji);
    const id = await okStory(kenji, { caption: "@wrap-66" });
    await endPartnership();
    expect((await read(viewer, kenji, id))?.commercialPartner).toMatchObject({ name: "Wrap 66" });
    const next = await okStory(kenji, { caption: "@wrap-66" });
    expect((await read(viewer, kenji, next))?.commercialPartner).toBeNull();
  });
});

describe("règle de pose : publications du Fil", () => {
  it("@slug dans la légende pose la mention ; elle est lue sur la publication (GET) et sur la carte du Fil", async () => {
    await partnerOf(kenji);
    const res = await post(kenji, { caption: "Nouvelle déco par @wrap-66" });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.commercialPartner).toEqual({ id: pro.id, name: "Wrap 66", slug: "wrap-66", logoUrl: null });
    const read1 = await req(viewer, "GET", `/feed-posts/${res.json.id}`);
    expect(read1.json.commercialPartner).toMatchObject({ name: "Wrap 66", slug: "wrap-66" });
    const fil = await req(viewer, "GET", "/fil?filter=for_you");
    const card = (
      fil.json.items as { kind: string; payload: { post?: { id: string; commercialPartner: unknown } } }[]
    ).find((c) => c.kind === "feed_post" && c.payload.post?.id === res.json.id);
    expect(card?.payload.post?.commercialPartner).toMatchObject({ slug: "wrap-66" });
  });

  it("non partenaire : rien ; explicite : posée ; sans mention : null", async () => {
    expect((await post(kenji, { caption: "@wrap-66" })).json.commercialPartner).toBeNull();
    expect((await post(kenji, { caption: "Sans pro" })).json.commercialPartner).toBeNull();
    const explicit = await post(kenji, { caption: "Avec eux", commercialPartnerId: pro.id });
    expect(explicit.json.commercialPartner).toMatchObject({ slug: "wrap-66" });
  });

  it("PATCH ne retire jamais la mention : 409 commercial_locked, partenariat actif comme fini", async () => {
    await partnerOf(kenji);
    const made = await post(kenji, { caption: "@wrap-66" });
    const id = made.json.id as string;
    const locked = await req(kenji, "PATCH", `/me/feed-posts/${id}`, { commercialPartnerId: null });
    expect(locked.status).toBe(409);
    expect(locked.json.error.code).toBe("commercial_locked");
    await endPartnership();
    expect((await req(kenji, "PATCH", `/me/feed-posts/${id}`, { commercialPartnerId: null })).status).toBe(409);
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, id));
    expect(row?.commercialPartnerId).toBe(pro.id);
    // Un autre champ, un autre pro, l'ordre d'un autre compte : jamais accepté.
    expect((await req(kenji, "PATCH", `/me/feed-posts/${id}`, { commercialPartnerId: pro.id })).status).toBe(400);
    expect((await req(kenji, "PATCH", `/me/feed-posts/${id}`, { caption: "x" })).status).toBe(400);
    expect((await req(viewer, "PATCH", `/me/feed-posts/${id}`, { commercialPartnerId: null })).status).toBe(404);
    expect((await req(null, "PATCH", `/me/feed-posts/${id}`, { commercialPartnerId: null })).status).toBe(401);
  });

  it("PATCH sur une publication sans mention : rien à retirer, rendue telle quelle", async () => {
    const made = await post(kenji, { caption: "Sans pro" });
    const res = await req(kenji, "PATCH", `/me/feed-posts/${made.json.id}`, { commercialPartnerId: null });
    expect(res.status).toBe(200);
    expect(res.json.commercialPartner).toBeNull();
  });
});

describe("notification partner_mention", () => {
  it("story : le pro cité par la légende est prévenu (Journal), lien vers la story ; pas de doublon avec l'identification", async () => {
    await partnerOf(kenji);
    const cited = await okStory(kenji, { caption: "@wrap-66" });
    const [one] = await notifsOf(proOwner, "partner_mention");
    expect(one).toBeDefined();
    expect(one?.data).toMatchObject({ storyId: cited, link: `/app/story/u:${kenji.id}` });
    expect(one?.body).toBe(partnershipLabels.notifications.mentionedStoryBody("Kenji_66"));
    expect(await notifsOf(proOwner, "story_mention")).toHaveLength(0);

    await db.delete(notifications);
    await okStory(kenji, { tags: [{ kind: "pro", id: pro.id }] });
    // Identifié : la notification d'identification suffit (elle porte déjà le bouton « Repartager »).
    expect(await notifsOf(proOwner, "story_mention")).toHaveLength(1);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
  });

  it("publication : le pro cité est prévenu ; sans partenariat ni mention, personne", async () => {
    await partnerOf(kenji);
    await post(kenji, { caption: "@wrap-66" });
    const [one] = await notifsOf(proOwner, "partner_mention");
    expect(one?.body).toBe(partnershipLabels.notifications.mentionedPostBody("Kenji_66"));
    await db.delete(notifications);
    await post(kenji, { caption: "rien" });
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
  });

  it("le pro ne se prévient pas lui-même", async () => {
    const res = await post(proOwner, { caption: "@wrap-66", commercialPartnerId: pro.id });
    expect(res.status).toBe(201);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
  });
});

describe("le pro cité reprend la story : la copie garde la mention", () => {
  it("cité par la légende seule (sans identification) : « Repartager » offert, copie au nom du pro avec la mention", async () => {
    await partnerOf(kenji);
    const id = await okStory(kenji, { caption: "@wrap-66" });
    const seen = await req(proOwner, "GET", `/stories/by-author/u:${kenji.id}`);
    const view = (
      seen.json.stories as { id: string; sharing: { options: { as: string; id: string }[] } | null }[]
    ).find((s) => s.id === id);
    expect(view?.sharing?.options).toEqual([expect.objectContaining({ as: "pro", id: pro.id, copyId: null })]);

    // Un autre pro, un passant : pas d'option, pas de partage.
    const other = await signUp("Autre_Pro");
    const otherPro = await createPro(other.id, { slug: "garage-2" });
    expect((await req(other, "POST", `/stories/${id}/share-to-mine`, { asProId: otherPro.id })).status).toBe(403);
    expect((await req(viewer, "POST", `/stories/${id}/share-to-mine`, { asProId: pro.id })).status).toBe(403);

    const shared = await req(proOwner, "POST", `/stories/${id}/share-to-mine`, { asProId: pro.id });
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
    const [copy] = await db.select().from(stories).where(eq(stories.id, shared.json.id));
    expect(copy).toMatchObject({ persona: "pro", proId: pro.id, commercialPartnerId: pro.id, audience: "public" });
    const lu = await req(viewer, "GET", `/stories/by-author/p:${pro.id}`);
    expect(lu.json.stories[0].commercialPartner).toMatchObject({ slug: "wrap-66" });
  });

  it("le retrait d'une identification ne fait pas tomber la copie d'un pro cité en collaboration commerciale", async () => {
    await partnerOf(kenji);
    const id = await okStory(kenji, { caption: "@wrap-66", tags: [{ kind: "pro", id: pro.id }] });
    const shared = await req(proOwner, "POST", `/stories/${id}/share-to-mine`, { asProId: pro.id });
    expect(shared.status).toBe(201);
    expect(await dropCopiesOfTag(db, id, "pro", pro.id)).toEqual([]);
    const [copy] = await db.select().from(stories).where(eq(stories.id, shared.json.id));
    expect(copy?.deletedAt).toBeNull();
  });
});

describe("la mention est imprimée sur le fichier qui sort", () => {
  async function exported(u: TestUser, path: string) {
    const res = await app.request(`/api${path}`, { headers: { origin: ORIGIN, cookie: u.cookie } });
    expect(res.status).toBe(200);
    return sharp(Buffer.from(await res.arrayBuffer()))
      .raw()
      .toBuffer({ resolveWithObject: true });
  }

  /** Boîte englobante des pixels qui diffèrent entre deux images de même taille, et leur nombre. */
  function diff(a: { data: Buffer; info: { width: number; height: number; channels: number } }, b: typeof a) {
    expect(a.info).toEqual(b.info);
    const { width, height, channels } = a.info;
    let n = 0;
    let box = { x0: width, y0: height, x1: -1, y1: -1 };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        if (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) > 24) {
          n++;
          box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
        }
      }
    }
    return { n, box, width, height };
  }

  it("story : une pastille « Collaboration commerciale · Wrap 66 » au-dessus de la signature, rien d'autre ne change", async () => {
    await partnerOf(kenji);
    const plain = await okStory(kenji, { caption: "sans" });
    const marked = await okStory(kenji, { caption: "@wrap-66" });
    const d = diff(
      await exported(kenji, `/stories/${plain}/export`),
      await exported(kenji, `/stories/${marked}/export`),
    );
    expect(d.n).toBeGreaterThan(800);
    // Dans le quart droit-bas, au-dessus de la signature (qui est à 250 px du bas), pas sur toute la largeur.
    expect(d.box.x1).toBeLessThanOrEqual(d.width - 44);
    expect(d.box.y1).toBeLessThan(d.height - 250);
    expect(d.box.x0).toBeGreaterThan(d.width * 0.05);
    expect(d.box.y0).toBeGreaterThan(d.height * 0.7);
  });

  it("publication : même chose en 4:5, au-dessus de la signature", async () => {
    await partnerOf(kenji);
    const plain = (await post(kenji, { caption: "sans" })).json.id;
    const marked = (await post(kenji, { caption: "@wrap-66" })).json.id;
    const d = diff(
      await exported(kenji, `/feed-posts/${plain}/export`),
      await exported(kenji, `/feed-posts/${marked}/export`),
    );
    expect(d.n).toBeGreaterThan(800);
    expect(d.box.x1).toBeLessThanOrEqual(d.width - 44);
    expect(d.box.y1).toBeLessThan(d.height - 44);
    expect(d.box.y0).toBeGreaterThan(d.height * 0.8);
  });

  it("un nom de pro très long ne déborde pas du fichier (réduit, jamais coupé)", async () => {
    await db.update(proProfiles).set({ name: "Atelier de covering et de personnalisation automobile du Roussillon" });
    const marked = (await post(kenji, { caption: "x", commercialPartnerId: pro.id })).json.id;
    const plain = (await post(kenji, { caption: "y" })).json.id;
    const d = diff(
      await exported(kenji, `/feed-posts/${plain}/export`),
      await exported(kenji, `/feed-posts/${marked}/export`),
    );
    expect(d.box.x0).toBeGreaterThanOrEqual(44 - 2);
    expect(d.box.x1).toBeLessThanOrEqual(d.width - 44);
  });
});

// --- Tour 2 (relectures Opus et Codex) -----------------------------------------------------------------------------------

const shareLinked = (u: TestUser, id: string, over: Record<string, unknown> = {}) =>
  req(u, "POST", "/me/stories", {
    linked: { type: "feed_post", id },
    clientId: crypto.randomUUID(),
    audience: "public",
    ...over,
  });

describe("tour 2 : une story liée à une publication marquée en hérite", () => {
  it("sa propre publication : la story porte la mention sans nouvelle légende ; l'export 9:16 l'imprime", async () => {
    await partnerOf(kenji);
    const made = await post(kenji, { caption: "@wrap-66" });
    const shared = await shareLinked(kenji, made.json.id);
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, shared.json.id));
    expect(row?.commercialPartnerId).toBe(pro.id);
    expect((await read(viewer, kenji, shared.json.id))?.commercialPartner).toMatchObject({ slug: "wrap-66" });
    const get = () =>
      app.request(`/api/stories/${shared.json.id}/export`, { headers: { origin: ORIGIN, cookie: kenji.cookie } });
    const res = await get();
    expect(res.status).toBe(200);
    const marked = Buffer.from(await res.arrayBuffer());
    // Même story sans mention : le fichier diffère (la pastille).
    await db.update(stories).set({ commercialPartnerId: null }).where(eq(stories.id, shared.json.id));
    const plain = Buffer.from(await (await get()).arrayBuffer());
    expect(Buffer.compare(marked, plain)).not.toBe(0);
  });

  it("la publication d'un tiers (carte publique) : la story du tiers porte la mention, sans notifier le pro", async () => {
    await partnerOf(kenji);
    const made = await post(kenji, { caption: "@wrap-66" });
    await db.delete(notifications);
    const shared = await shareLinked(viewer, made.json.id);
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, shared.json.id));
    expect(row?.commercialPartnerId).toBe(pro.id);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
  });

  it("une publication sans mention : rien ; un explicite contradictoire : 400 commercial_conflict ; le même : posé", async () => {
    const plain = await post(kenji, { caption: "rien" });
    expect((await shareLinked(viewer, plain.json.id)).status).toBe(201);
    const other = await signUp("Autre_Pro");
    const otherPro = await createPro(other.id, { slug: "garage-2", verifiedAt: new Date(0) });
    await partnerOf(kenji);
    const marked = await post(kenji, { caption: "@wrap-66" });
    const clash = await shareLinked(viewer, marked.json.id, { commercialPartnerId: otherPro.id });
    expect(clash.status).toBe(400);
    expect(clash.json.error.code).toBe("commercial_conflict");
    expect((await shareLinked(viewer, marked.json.id, { commercialPartnerId: pro.id })).status).toBe(201);
  });
});

describe("tour 2 : story vidéo commerciale", () => {
  async function video(commercial: boolean) {
    const [row] = await db
      .insert(stories)
      .values({
        authorId: kenji.id,
        persona: "fan",
        audience: "public",
        mediaKind: "video",
        storageKey: "private/stories/essai/video.mp4",
        width: 1080,
        height: 1920,
        durationMs: 5000,
        status: "ready",
        plateState: "none_confirmed",
        expiresAt: new Date(clock.now.getTime() + 20 * 3_600_000),
        commercialPartnerId: commercial ? pro.id : null,
      })
      .returning();
    return row?.id as string;
  }
  it("l'export est refusé (409 commercial_video) et « Vers l'extérieur » est fermé avec sa raison", async () => {
    const id = await video(true);
    const res = await req(kenji, "GET", `/stories/${id}/export`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("commercial_video");
    const mine = await req(kenji, "GET", `/stories/by-author/u:${kenji.id}`);
    const view = mine.json.stories.find((s: { id: string }) => s.id === id);
    expect(view.exportable).toBe(false);
    expect(view.exportBlockedReason).toBe(partnershipLabels.errors.commercial_video);
  });
  it("une vidéo sans mention sort comme avant (pas de raison de blocage)", async () => {
    const id = await video(false);
    const mine = await req(kenji, "GET", `/stories/by-author/u:${kenji.id}`);
    const view = mine.json.stories.find((s: { id: string }) => s.id === id);
    expect(view.exportBlockedReason).toBeNull();
    expect(view.exportable).toBe(true);
  });
});

describe("tour 2 : partner_mention seulement si le pro voit le contenu", () => {
  it("story de crew qui cite un partenaire hors du crew : mention posée, aucune notification", async () => {
    await partnerOf(kenji);
    const created = await req(kenji, "POST", "/crews", { name: "Crew essai", department: "66" });
    expect(created.status).toBe(201);
    const res = await story(kenji, { audience: "crew", crewId: created.json.id, caption: "@wrap-66" });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row?.commercialPartnerId).toBe(pro.id);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
    expect(await notifsOf(proOwner, "story_mention")).toHaveLength(0);
  });
  it("auteur privé que le pro ne suit pas : story « abonnés » et publication, aucune notification ; abonné accepté : prévenu", async () => {
    await partnerOf(kenji);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    expect((await story(kenji, { audience: "followers", caption: "@wrap-66" })).status).toBe(201);
    expect((await post(kenji, { caption: "@wrap-66" })).status).toBe(201);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(0);
    await db
      .insert(userFollows)
      .values({ followerId: proOwner.id, followedId: kenji.id, status: "accepted", acceptedAt: clock.now });
    expect((await story(kenji, { audience: "followers", caption: "@wrap-66 encore" })).status).toBe(201);
    expect(await notifsOf(proOwner, "partner_mention")).toHaveLength(1);
  });
});

describe("tour 2 : mention explicite et fiche qui n'est plus visible", () => {
  it("l'explicite ne vise qu'une fiche montrable : non vérifiée ou dépubliée : 400", async () => {
    const o = await signUp("Pro_Non_Verifie");
    const unverified = await createPro(o.id, { slug: "non-verifie", name: "Non vérifié" });
    expect((await story(kenji, { commercialPartnerId: unverified.id })).status).toBe(400);
    expect((await post(kenji, { commercialPartnerId: unverified.id })).status).toBe(400);
    expect((await story(kenji, { commercialPartnerId: pro.id })).status).toBe(201);
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, pro.id));
    expect((await story(kenji, { commercialPartnerId: pro.id })).status).toBe(400);
  });
  it("fiche dépubliée ou supprimée après coup : le texte reste, l'adresse et le logo disparaissent", async () => {
    const id = await okStory(kenji, { commercialPartnerId: pro.id });
    const made = await post(kenji, { commercialPartnerId: pro.id });
    await db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, pro.id));
    expect((await read(viewer, kenji, id))?.commercialPartner).toEqual({
      id: pro.id,
      name: "Wrap 66",
      slug: null,
      logoUrl: null,
    });
    expect((await req(viewer, "GET", `/feed-posts/${made.json.id}`)).json.commercialPartner).toMatchObject({
      name: "Wrap 66",
      slug: null,
    });
    await db
      .update(proProfiles)
      .set({ publishedAt: new Date(0), deletedAt: new Date() })
      .where(eq(proProfiles.id, pro.id));
    expect((await read(viewer, kenji, id))?.commercialPartner).toMatchObject({ name: "Wrap 66", slug: null });
  });
});

describe("tour 3", () => {
  it("la fiche pro qui repartage sous sa casquette la publication qui la concerne garde la mention héritée", async () => {
    await partnerOf(kenji);
    const made = await post(kenji, { caption: "@wrap-66" });
    const shared = await shareLinked(proOwner, made.json.id, { persona: "pro", proId: pro.id });
    expect(shared.status, JSON.stringify(shared.json)).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, shared.json.id));
    expect(row).toMatchObject({ persona: "pro", proId: pro.id, commercialPartnerId: pro.id });
    const lu = await req(viewer, "GET", `/stories/by-author/p:${pro.id}`);
    expect(lu.json.stories[0].commercialPartner).toMatchObject({ name: "Wrap 66", slug: "wrap-66" });
    // Déduite ou explicite, l'exclusion de soi reste : jamais de collaboration avec soi-même.
    const own = await story(proOwner, { persona: "pro", proId: pro.id, commercialPartnerId: pro.id });
    expect(own.status).toBe(201);
    const [ownRow] = await db.select().from(stories).where(eq(stories.id, own.json.id));
    expect(ownRow?.commercialPartnerId).toBeNull();
  });

  it("le sélecteur (GET /pros?eligible=1) ne propose que les fiches éligibles ; une fiche proposée est acceptée", async () => {
    const o = await signUp("Pro_Sel");
    await createPro(o.id, { slug: "wrap-non-verifie", name: "Wrap non vérifié" });
    const all = await req(viewer, "GET", "/pros?q=wrap");
    expect(all.json.items.map((p: { slug: string }) => p.slug).sort()).toEqual(["wrap-66", "wrap-non-verifie"]);
    const eligible = await req(viewer, "GET", "/pros?q=wrap&eligible=1");
    expect(eligible.json.items.map((p: { slug: string }) => p.slug)).toEqual(["wrap-66"]);
    const picked = await req(viewer, "GET", "/pros/by-slug/wrap-66");
    expect((await story(kenji, { commercialPartnerId: picked.json.id })).status).toBe(201);
    // Une valeur inattendue est refusée, pas ignorée.
    expect((await req(viewer, "GET", "/pros?q=wrap&eligible=0")).status).toBe(400);
  });
});
