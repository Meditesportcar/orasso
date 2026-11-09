// Lot R7h, tour 2 : copie d'un auteur indisponible (suspension, bannissement, suppression, lecture), crédit = identité
// publique de l'originale, courses partage / retrait (aucune copie ne survit), double authentification, compteur de
// mentions aligné sur la liste, aperçu d'une vidéo sans affiche. Aucune plaque lisible : photos d'essai en bruit coloré.

import { fromWallTime, HOUR, storyAuthorKeyOf } from "@orasso/shared";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createPro,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { profiles, sanctions, stories, storyTags, structures } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { type Tx, withTx } from "../../lib/tx";
import { recomputeSuspension } from "../moderation/suspension";
import { organizerStoryOf } from "./live";
import { softDeleteWithCopies } from "./purge";
import { dropCopiesOfTag, retireCopiesOfPrivateAccount } from "./share";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
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
  return { status: res.status, json, text };
}

async function photo() {
  const width = 1600;
  const height = 900;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function ok(u: TestUser, over: Record<string, unknown> = {}) {
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
  const res = await req(u, "POST", "/me/stories", {
    uploadKey: key,
    noPlateConfirmed: true,
    audience: "public",
    ...over,
  });
  expect(res.status, res.text).toBe(201);
  return res.json as { id: string };
}

async function world() {
  const owner = await signUp("Sarah_66", { twoFactor: true });
  const co = await signUp("Coorga_66", { twoFactor: true });
  const kenji = await signUp("Kenji_66");
  const stranger = await signUp("Etranger_66");
  const structure = await createStructure(owner.id);
  await addMember(structure.id, co.id, "co_organizer");
  return { owner, co, kenji, stranger, structure };
}

const tagStructure = (structureId: string) => ({ tags: [{ kind: "structure", id: structureId }] });
const share = (u: TestUser, id: string, body?: unknown) => req(u, "POST", `/stories/${id}/share-to-mine`, body ?? {});
const byAuthor = (u: TestUser, key: string) => req(u, "GET", `/stories/by-author/${key}`);
const liveCopies = (storyId: string) =>
  db
    .select({ id: stories.id })
    .from(stories)
    .where(and(eq(stories.sharedFromStoryId, storyId), isNull(stories.deletedAt)));

/** Une sanction posée et recalculée comme la modération le fait (dans la transaction de la décision). */
async function sanction(u: TestUser, kind: "suspension_7d" | "ban") {
  await withTx(async (tx, after) => {
    await tx.insert(sanctions).values({
      userId: u.id,
      kind,
      reason: "spam",
      reportIds: [],
      startsAt: clock.now,
      endsAt: kind === "ban" ? null : new Date(clock.now.getTime() + 7 * 24 * HOUR),
      auto: true,
      createdAt: clock.now,
      updatedAt: clock.now,
    });
    await recomputeSuspension(tx, u.id, after);
  });
}

describe("copie d'un auteur indisponible", () => {
  it("suspension après repartage : la copie tombe (cascade) et plus rien ne la sert", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(1);
    await sanction(w.kenji, "suspension_7d");
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    expect((await req(w.stranger, "GET", `/stories/${copy.id}/thumb`)).status).toBe(404);
    expect((await req(w.owner, "GET", "/me/stories")).json.stories).toHaveLength(0);
  });

  it("bannissement après repartage : même chose", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    await sanction(w.kenji, "ban");
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
  });

  it("suppression du compte de l'auteur (route /me) : les copies tombent", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    const del = await req(w.kenji, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(del.status, del.text).toBe(200);
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
  });

  it("sur tous les chemins de lecture, même si la cascade n'a pas eu lieu : barre, visionneuse, médias, vignette, fiche, Accueil", async () => {
    const w = await world();
    const fan = await signUp("Fan_66");
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    const [row] = await db.select().from(stories).where(eq(stories.id, copy.id));
    const media = `/stories/${copy.id}/media/${row?.storageKey.slice(row.storageKey.lastIndexOf("/") + 1)}`;
    expect((await req(fan, "GET", media)).status).toBe(200);
    // L'originale disparaît sans passer par la cascade (donnée incohérente) : la copie n'est plus servie nulle part.
    await db.update(stories).set({ deletedAt: clock.now }).where(eq(stories.id, s.id));
    expect((await byAuthor(fan, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    expect((await req(fan, "GET", media)).status).toBe(404);
    expect((await req(fan, "GET", `/stories/${copy.id}/thumb`)).status).toBe(404);
    expect((await req(w.owner, "GET", "/me/stories")).json.stories).toHaveLength(0);
    expect(await organizerStoryOf(w.structure.id, clock.now)).toBeNull();
    const bar = await req(fan, "GET", "/stories/bar");
    expect(JSON.stringify(bar.json)).not.toContain(`s:${w.structure.id}`);
  });

  it("l'auteur suspendu sans cascade (donnée incohérente) : la copie n'est pas servie non plus", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    await share(w.owner, s.id, { asStructureId: w.structure.id });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * 24 * HOUR) })
      .where(eq(profiles.userId, w.kenji.id));
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    expect(await organizerStoryOf(w.structure.id, clock.now)).toBeNull();
  });
});

describe("crédit d'une copie : l'identité publique de l'originale", () => {
  it("story personnelle : la personne, avec son lien", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    await share(w.owner, s.id, { asStructureId: w.structure.id });
    const view = (await byAuthor(w.stranger, `s:${w.structure.id}`)).json;
    expect(view.stories[0].sharedFrom).toMatchObject({
      kind: "user",
      id: w.kenji.id,
      name: "Kenji_66",
      slug: "Kenji_66",
    });
  });

  it("story d'organisateur : la structure, jamais le pseudo du responsable qui l'a publiée", async () => {
    const w = await world();
    const otherOwner = await signUp("Marc_66", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    await db.update(structures).set({ name: "Club Voisin", slug: "club-voisin" }).where(eq(structures.id, other.id));
    const s = await ok(otherOwner, { persona: "organizer", structureId: other.id, ...tagStructure(w.structure.id) });
    const res = await share(w.owner, s.id, { asStructureId: w.structure.id });
    expect(res.status, res.text).toBe(201);
    const out = await byAuthor(w.stranger, `s:${w.structure.id}`);
    expect(out.json.stories[0].sharedFrom).toMatchObject({
      kind: "structure",
      id: other.id,
      name: "Club Voisin",
      slug: "club-voisin",
    });
    expect(out.text).not.toContain("Marc_66");
    expect(out.text).not.toContain(otherOwner.id);
  });

  it("story de pro : le pro, jamais le compte du propriétaire", async () => {
    const w = await world();
    const proOwner = await signUp("Garagiste_66");
    const pro = await createPro(proOwner.id, { name: "Garage du Lydia", slug: "garage-du-lydia" });
    const s = await ok(proOwner, { persona: "pro", proId: pro.id, ...tagStructure(w.structure.id) });
    const res = await share(w.owner, s.id, { asStructureId: w.structure.id });
    expect(res.status, res.text).toBe(201);
    const out = await byAuthor(w.stranger, `s:${w.structure.id}`);
    expect(out.json.stories[0].sharedFrom).toMatchObject({
      kind: "pro",
      id: pro.id,
      name: "Garage du Lydia",
      slug: "garage-du-lydia",
    });
    expect(out.text).not.toContain("Garagiste_66");
  });
});

describe("courses partage / retrait : jamais de copie qui survit", () => {
  // Déterministe : la transaction de retrait fait son travail (compte, suppression ou identification verrouillés, copies
  // cherchées : aucune), puis reste ouverte pendant que le partage démarre. Sans les verrous du partage, il insérerait sa
  // copie sans attendre et elle survivrait au retrait ; avec eux, il attend la validation, revérifie ses droits et refuse.
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  type After = (cb: () => unknown) => void;
  async function retireWhileSharing(
    retire: (tx: Tx, after: After) => Promise<void>,
    sharing: () => Promise<{ status: number }>,
  ) {
    const held = deferred();
    const gate = deferred();
    const done = withTx(async (tx, after) => {
      await retire(tx, after);
      held.resolve();
      await gate.promise;
    });
    await held.promise;
    const attempt = sharing();
    await sleep(2500);
    gate.resolve();
    await done;
    return attempt;
  }

  it("partage pendant le passage en privé de l'auteur", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const res = await retireWhileSharing(
      async (tx, after) => {
        await tx.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.kenji.id));
        await retireCopiesOfPrivateAccount(tx, after, w.kenji.id);
      },
      () => share(w.owner, s.id, { asStructureId: w.structure.id }),
    );
    expect([403, 404]).toContain(res.status);
    expect(await liveCopies(s.id)).toHaveLength(0);
  });

  it("partage pendant la suppression de l'originale", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const res = await retireWhileSharing(
      async (tx) => {
        await softDeleteWithCopies(tx, [s.id]);
      },
      () => share(w.owner, s.id, { asStructureId: w.structure.id }),
    );
    expect([403, 404]).toContain(res.status);
    expect(await liveCopies(s.id)).toHaveLength(0);
  });

  it("partage pendant le retrait de l'identification", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const res = await retireWhileSharing(
      async (tx) => {
        await tx
          .update(storyTags)
          .set({ removedAt: clock.now })
          .where(and(eq(storyTags.storyId, s.id), isNull(storyTags.removedAt)));
        await dropCopiesOfTag(tx, s.id, "structure", w.structure.id);
      },
      () => share(w.owner, s.id, { asStructureId: w.structure.id }),
    );
    expect([403, 404]).toContain(res.status);
    expect(await liveCopies(s.id)).toHaveLength(0);
  });

  it("partage pendant la suspension de l'auteur", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const res = await retireWhileSharing(
      async (tx, after) => {
        await tx.insert(sanctions).values({
          userId: w.kenji.id,
          kind: "suspension_7d",
          reason: "spam",
          reportIds: [],
          startsAt: clock.now,
          endsAt: new Date(clock.now.getTime() + 7 * 24 * HOUR),
          auto: true,
          createdAt: clock.now,
          updatedAt: clock.now,
        });
        await recomputeSuspension(tx, w.kenji.id, after);
      },
      () => share(w.owner, s.id, { asStructureId: w.structure.id }),
    );
    expect([403, 404]).toContain(res.status);
    expect(await liveCopies(s.id)).toHaveLength(0);
  });

  it("sans course, le partage réussit (les verrous ne bloquent rien d'autre)", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    expect((await share(w.owner, s.id, { asStructureId: w.structure.id })).status).toBe(201);
    expect(await liveCopies(s.id)).toHaveLength(1);
  });
});

describe("double authentification des gestes au nom d'une structure", () => {
  it("sans second facteur : ajouter à la story, retirer sa story, retirer l'identification au nom de la structure : refusé", async () => {
    const w = await world();
    const noFactor = await signUp("Sans2fa_66");
    await addMember(w.structure.id, noFactor.id, "co_organizer");
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const added = await share(noFactor, s.id, { asStructureId: w.structure.id });
    expect(added.status).toBe(403);
    expect(added.json.error.code).toBe("two_factor_required");
    expect(await liveCopies(s.id)).toHaveLength(0);

    const mine = await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    const removed = await req(noFactor, "DELETE", `/me/stories/${mine.id}`);
    expect(removed.status).toBe(403);
    expect(removed.json.error.code).toBe("two_factor_required");
    const [still] = await db.select().from(stories).where(eq(stories.id, mine.id));
    expect(still?.deletedAt).toBeNull();

    const tag = await req(noFactor, "POST", `/me/story-tags/${s.id}/remove`, { kind: "structure", id: w.structure.id });
    expect(tag.status).toBe(403);
    expect(tag.json.error.code).toBe("two_factor_required");
    const active = await db
      .select()
      .from(storyTags)
      .where(and(eq(storyTags.storyId, s.id), isNull(storyTags.removedAt)));
    expect(active).toHaveLength(1);

    // La lecture des mentions reste ouverte comme avant ; avec le second facteur, les gestes passent.
    expect((await req(noFactor, "GET", `/structures/${w.structure.id}/story-mentions`)).status).toBe(200);
    expect((await share(w.co, s.id, { asStructureId: w.structure.id })).status).toBe(201);
  });
});

describe("compteur de mentions et aperçu", () => {
  it("une structure auteur suspendue n'est ni listée ni comptée", async () => {
    const w = await world();
    const otherOwner = await signUp("Marc_66", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    await ok(otherOwner, { persona: "organizer", structureId: other.id, ...tagStructure(w.structure.id) });
    await ok(w.kenji, tagStructure(w.structure.id));
    let res = await req(w.owner, "GET", `/structures/${w.structure.id}/story-mentions`);
    expect(res.json.count).toBe(2);
    expect(res.json.items).toHaveLength(2);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, other.id));
    res = await req(w.owner, "GET", `/structures/${w.structure.id}/story-mentions`);
    expect(res.json.count).toBe(1);
    expect(res.json.items).toHaveLength(1);
  });

  it("une vidéo sans affiche : aperçu vide, jamais l'adresse de la vidéo", async () => {
    const w = await world();
    await db.insert(stories).values({
      authorId: w.owner.id,
      persona: "organizer",
      structureId: w.structure.id,
      audience: "public",
      mediaKind: "video",
      storageKey: "private/stories/video-sans-affiche/0123456789abcdef.mp4",
      plateState: "none_confirmed",
      expiresAt: new Date(clock.now.getTime() + 20 * HOUR),
    });
    const out = await organizerStoryOf(w.structure.id, clock.now);
    expect(out).toEqual({ structureKey: storyAuthorKeyOf("structure", w.structure.id), posterUrl: null });
  });
});
