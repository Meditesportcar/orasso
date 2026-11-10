// Lot R7h, tour 4 : mentions au-delà de 500 (pagination en base, sans plafond), plafond de 50 des copies visibles.
// Aucune plaque lisible : les stories sont insérées sans image réelle (clé de stockage factice).

import { fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { profiles, stories, storyTags } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

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

// biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
type Json = any;

async function get(cookie: string, path: string) {
  const res = await app.request(`/api${path}`, { method: "GET", headers: { origin: ORIGIN, cookie } });
  return { status: res.status, json: (await res.json()) as Json };
}

describe("mentions au-delà de 500", () => {
  it("501 mentions : tous les curseurs parcourus donnent 501 lignes distinctes, le total est 501", async () => {
    const owner = await signUp("Sarah_66", { twoFactor: true });
    const kenji = await signUp("Kenji_66");
    const structure = await createStructure(owner.id);
    const total = 501;
    const base = clock.now.getTime() - 20 * HOUR;
    // Une seconde d'écart, sauf deux paires à la même milliseconde (départage par identifiant).
    const rows = Array.from({ length: total }, (_, i) => ({
      authorId: kenji.id,
      persona: "fan" as const,
      audience: "public" as const,
      mediaKind: "photo" as const,
      storageKey: `private/stories/tour4/${i}.jpg`,
      plateState: "none_confirmed" as const,
      createdAt: new Date(base + Math.floor(i / 2) * 1000),
      expiresAt: new Date(clock.now.getTime() + 20 * HOUR),
    }));
    const inserted = await db.insert(stories).values(rows).returning({ id: stories.id });
    await db
      .insert(storyTags)
      .values(inserted.map((s) => ({ storyId: s.id, targetKind: "structure" as const, targetId: structure.id })));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let count = -1;
    do {
      const res: Awaited<ReturnType<typeof get>> = await get(
        owner.cookie,
        `/structures/${structure.id}/story-mentions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(res.status).toBe(200);
      if (count >= 0) expect(res.json.count).toBe(count);
      count = res.json.count;
      for (const m of res.json.items) seen.push(m.storyId);
      cursor = res.json.nextCursor;
      pages++;
      expect(pages).toBeLessThan(40);
    } while (cursor);
    expect(count).toBe(total);
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(pages).toBe(Math.ceil(total / 20));
  }, 120_000);

  it("le compteur n'inclut pas ce que la liste n'a pas le droit de montrer", async () => {
    const owner = await signUp("Sarah_66", { twoFactor: true });
    const co = await signUp("Coorga_66", { twoFactor: true });
    const priv = await signUp("Prive_66");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, co.id, "co_organizer");
    const common = {
      persona: "fan" as const,
      audience: "public" as const,
      mediaKind: "photo" as const,
      plateState: "none_confirmed" as const,
      expiresAt: new Date(clock.now.getTime() + 20 * HOUR),
    };
    const [a] = await db
      .insert(stories)
      .values({ ...common, authorId: priv.id, storageKey: "private/stories/tour4/p.jpg" })
      .returning({ id: stories.id });
    await db.insert(storyTags).values({ storyId: a?.id as string, targetKind: "structure", targetId: structure.id });
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, priv.id));
    const res = await get(co.cookie, `/structures/${structure.id}/story-mentions`);
    expect(res.json.count).toBe(0);
    expect(res.json.items).toHaveLength(0);
  });
});

describe("plafond de 50 stories : les copies masquées ne comptent pas", () => {
  const common = (authorId: string, clockNow: Date) => ({
    authorId,
    mediaKind: "photo" as const,
    plateState: "none_confirmed" as const,
    audience: "public" as const,
    expiresAt: new Date(clockNow.getTime() + 20 * HOUR),
  });

  async function fullStructure() {
    const owner = await signUp("Sarah_66", { twoFactor: true });
    const kenji = await signUp("Kenji_66");
    const lea = await signUp("Lea_11");
    const structure = await createStructure(owner.id);
    // 49 stories propres de la structure + 2 copies de stories de Kenji (51 lignes vivantes).
    await db.insert(stories).values(
      Array.from({ length: 49 }, (_, i) => ({
        ...common(owner.id, clock.now),
        persona: "organizer" as const,
        structureId: structure.id,
        storageKey: `private/stories/tour4/own-${i}.jpg`,
      })),
    );
    const origins = await db
      .insert(stories)
      .values(
        [0, 1].map((i) => ({
          ...common(kenji.id, clock.now),
          persona: "fan" as const,
          storageKey: `private/stories/tour4/kenji-${i}.jpg`,
        })),
      )
      .returning({ id: stories.id });
    await db.insert(stories).values(
      origins.map((o, i) => ({
        ...common(owner.id, clock.now),
        persona: "organizer" as const,
        structureId: structure.id,
        sharedFromStoryId: o.id,
        storageKey: `private/stories/tour4/copy-${i}.jpg`,
      })),
    );
    return { owner, kenji, lea, structure };
  }

  const suspend = (userId: string) =>
    db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * 24 * HOUR) })
      .where(eq(profiles.userId, userId));

  /** Une vraie story publiée par Léa (le partage recopie le fichier) qui identifie la structure. */
  async function leaStory(lea: TestUser, structureId: string) {
    const width = 1600;
    const height = 900;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
    const jpeg = await sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const form = new FormData();
    form.append("purpose", "story");
    form.append("file", new File([new Uint8Array(jpeg)], "photo.jpg", { type: "image/jpeg" }));
    const up = await app.request("/api/me/uploads", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: lea.cookie },
      body: form,
    });
    expect(up.status).toBe(201);
    const key = ((await up.json()) as { key: string }).key;
    const res = await app.request("/api/me/stories", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: lea.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        uploadKey: key,
        noPlateConfirmed: true,
        audience: "public",
        tags: [{ kind: "structure", id: structureId }],
      }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function shareLea(w: Awaited<ReturnType<typeof fullStructure>>) {
    const id = await leaStory(w.lea, w.structure.id);
    const res = await app.request(`/api/stories/${id}/share-to-mine`, {
      method: "POST",
      headers: { origin: ORIGIN, cookie: w.owner.cookie, "content-type": "application/json" },
      body: JSON.stringify({ asStructureId: w.structure.id }),
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  it("auteur actif : 51 copies et stories vivantes, le plafond de 50 refuse l'ajout", async () => {
    const w = await fullStructure();
    const res = await shareLea(w);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("too_many_stories");
  });

  it("auteur suspendu : ses deux copies masquées ne comptent pas, l'ajout passe (49 + 1)", async () => {
    const w = await fullStructure();
    await suspend(w.kenji.id);
    const res = await shareLea(w);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
  });
});
