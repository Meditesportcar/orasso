// Lot R9b : la décoration de `GET /media/:id` pour l'en-tête de la page d'un média : `stories` (l'anneau) et `accreditationsCount`
// (T22 : ses accréditations acceptées sur des événements publiés). Les champs d'avant ne bougent pas ; sans session la route répond
// toujours 401 ; liste blanche : ni pseudo, ni identifiant du titulaire, ni numéro de carte de presse (D26).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import { createEvent, createStructure, resetDb, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications, events, mediaProfiles, profiles, stories } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-11-11T09:00:00Z");

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  useClock(NOW);
});

async function world() {
  const holder = await signUp("Media_Titulaire");
  const kenji = await signUp("Kenji_66");
  const owner = await signUp("Orga_A", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const [media] = await db
    .insert(mediaProfiles)
    .values({ userId: holder.id, name: "Objectif 66", pressCardNumber: "CARTE-12345", pressCardVerifiedAt: NOW })
    .returning();
  return { holder, kenji, structure, media: media as NonNullable<typeof media> };
}

async function accredit(
  eventId: string,
  userId: string,
  mediaProfileId: string,
  status: "accepted" | "pending" | "refused" | "withdrawn",
) {
  await db.insert(applications).values({
    eventId,
    userId,
    kind: "media",
    mediaProfileId,
    status,
    rulesAcceptedAt: NOW,
    followStructure: false,
  });
}

describe("GET /media/:id : sans session", () => {
  it("répond 401 comme avant, sans rien de nouveau", async () => {
    const w = await world();
    const res = await callAs(null, null, "GET", `/media/${w.media.id}`);
    expect(res.status).toBe(401);
    expect(res.text).not.toContain("accreditationsCount");
    expect(res.text).not.toContain("stories");
  });
});

describe("GET /media/:id : les accréditations (T22)", () => {
  it("compte les accréditations acceptées sur des événements publiés, à venir ou finis", async () => {
    const w = await world();
    const e1 = await createEvent(w.structure.id);
    const e2 = await createEvent(w.structure.id, {
      startsAt: new Date(NOW.getTime() - 8 * 86_400_000),
      endsAt: new Date(NOW.getTime() - 8 * 86_400_000 + 4 * 3_600_000),
    });
    await accredit(e1.id, w.holder.id, w.media.id, "accepted");
    await accredit(e2.id, w.holder.id, w.media.id, "accepted");
    const res = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(res.status, res.text).toBe(200);
    expect(res.json.accreditationsCount).toBe(2);
  });

  it("exclus : en attente, refusée, retirée, événement annulé ou brouillon ; celles d'un autre média ne comptent pas", async () => {
    const w = await world();
    const holder2 = await signUp("Autre_Media");
    const [other] = await db.insert(mediaProfiles).values({ userId: holder2.id, name: "Autre" }).returning();
    const e1 = await createEvent(w.structure.id);
    const e2 = await createEvent(w.structure.id);
    const e3 = await createEvent(w.structure.id, { status: "cancelled" });
    const e4 = await createEvent(w.structure.id, { status: "draft" });
    const e5 = await createEvent(w.structure.id);
    const e6 = await createEvent(w.structure.id);
    await accredit(e1.id, w.holder.id, w.media.id, "pending");
    await accredit(e2.id, w.holder.id, w.media.id, "refused");
    await accredit(e3.id, w.holder.id, w.media.id, "accepted");
    await accredit(e4.id, w.holder.id, w.media.id, "accepted");
    await accredit(e5.id, w.holder.id, w.media.id, "withdrawn");
    await accredit(e6.id, holder2.id, (other as NonNullable<typeof other>).id, "accepted");
    const res = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(res.json.accreditationsCount).toBe(0);
  });

  it("un événement annulé après coup sort du compte", async () => {
    const w = await world();
    const e1 = await createEvent(w.structure.id);
    await accredit(e1.id, w.holder.id, w.media.id, "accepted");
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.accreditationsCount).toBe(1);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, e1.id));
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.accreditationsCount).toBe(0);
  });
});

describe("GET /media/:id : `stories` (l'anneau de la page)", () => {
  const liveStory = (mediaId: string, authorId: string, audience: "public" | "followers" = "public") =>
    db.insert(stories).values({
      authorId,
      persona: "media",
      mediaId,
      audience,
      mediaKind: "photo",
      storageKey: "private/stories/essai/photo.webp",
      width: 1080,
      height: 1920,
      status: "ready",
      plateState: "none_confirmed",
      expiresAt: new Date(NOW.getTime() + 20 * 3_600_000),
    });

  it("sans story : count 0 ; avec une story publique : count 1, non vue", async () => {
    const w = await world();
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.stories).toEqual({
      count: 0,
      hasUnseen: false,
      ring: null,
    });
    await liveStory(w.media.id, w.holder.id);
    const res = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(res.json.stories.count).toBe(1);
    expect(res.json.stories.hasUnseen).toBe(true);
  });

  it("une story expirée ou supprimée ne compte pas ; la story d'une page est publique par nature (même titulaire en compte privé)", async () => {
    const w = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.holder.id));
    await liveStory(w.media.id, w.holder.id);
    await db
      .update(stories)
      .set({ expiresAt: new Date(NOW.getTime() - 3_600_000) })
      .where(eq(stories.mediaId, w.media.id));
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.stories.count).toBe(0);
    await liveStory(w.media.id, w.holder.id);
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.stories.count).toBe(1);
    await db.update(stories).set({ deletedAt: NOW }).where(eq(stories.mediaId, w.media.id));
    expect((await callAs(w.kenji, null, "GET", `/media/${w.media.id}`)).json.stories.count).toBe(0);
  });
});

describe("GET /media/:id : liste blanche", () => {
  it("ni pseudo, ni identifiant du titulaire, ni numéro de carte de presse ; un compte privé du titulaire : page servie", async () => {
    const w = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.holder.id));
    const res = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(res.status, res.text).toBe(200);
    for (const secret of ["Media_Titulaire", w.holder.id, w.holder.email, "CARTE-12345"]) {
      expect(res.text, secret).not.toContain(secret);
    }
    for (const key of ["userId", "pressCardNumber", "pressCardVerifiedAt", "pseudo", "email"]) {
      expect(res.json).not.toHaveProperty(key);
    }
    expect(res.json.verified).toBe(true);
  });

  it("les champs d'avant ne bougent pas (nom, abonnement, cache) ; `isFollowing` suit l'acteur", async () => {
    const w = await world();
    const res = await callAs(w.kenji, null, "GET", `/media/${w.media.id}`);
    expect(res.json).toMatchObject({ id: w.media.id, name: "Objectif 66", followersCount: 0, isFollowing: false });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
