// Lot R9b : la décoration de `GET /providers/:id` pour l'en-tête de la page d'un prestataire : `stories` (l'anneau), `missionsCount`
// et `organizersCount` (T24). Les champs d'avant ne bougent pas ; sans session la route répond toujours 401 (rien de nouveau ne
// sort) ; liste blanche : ni pseudo, ni identifiant du titulaire, ni e-mail, ni téléphone.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import { createEvent, createStructure, resetDb, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications, events, profiles, providerProfiles, stories } from "../../db/schema";
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
  const holder = await signUp("Brasa_Titulaire");
  const kenji = await signUp("Kenji_66");
  const ownerA = await signUp("Orga_A", { twoFactor: true });
  const ownerB = await signUp("Orga_B", { twoFactor: true });
  const structureA = await createStructure(ownerA.id);
  const structureB = await createStructure(ownerB.id);
  const [brasa] = await db
    .insert(providerProfiles)
    .values({
      userId: holder.id,
      type: "food_truck",
      name: "La Brasa",
      phone: "0611223344",
      email: "brasa@exemple.fr",
    })
    .returning();
  return { holder, kenji, structureA, structureB, brasa: brasa as NonNullable<typeof brasa> };
}

async function apply(
  eventId: string,
  userId: string,
  providerProfileId: string,
  status: "accepted" | "pending" | "refused" | "withdrawn",
) {
  await db.insert(applications).values({
    eventId,
    userId,
    kind: "provider",
    providerProfileId,
    status,
    rulesAcceptedAt: NOW,
    followStructure: false,
  });
}

describe("GET /providers/:id : sans session", () => {
  it("répond 401 comme avant, sans rien de nouveau", async () => {
    const w = await world();
    const res = await callAs(null, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.status).toBe(401);
    expect(res.text).not.toContain("missionsCount");
    expect(res.text).not.toContain("stories");
  });
});

describe("GET /providers/:id : les compteurs de la page (T24)", () => {
  it("missions = candidatures retenues sur des événements publiés (à venir ou finis) ; organisateurs = structures distinctes", async () => {
    const w = await world();
    const future = await createEvent(w.structureA.id, { startsAt: new Date(NOW.getTime() + 5 * 86_400_000) });
    const future2 = await createEvent(w.structureA.id, { startsAt: new Date(NOW.getTime() + 9 * 86_400_000) });
    const past = await createEvent(w.structureB.id, {
      startsAt: new Date(NOW.getTime() - 8 * 86_400_000),
      endsAt: new Date(NOW.getTime() - 8 * 86_400_000 + 4 * 3_600_000),
    });
    await apply(future.id, w.holder.id, w.brasa.id, "accepted");
    await apply(future2.id, w.holder.id, w.brasa.id, "accepted");
    await apply(past.id, w.holder.id, w.brasa.id, "accepted");
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.status, res.text).toBe(200);
    expect(res.json.missionsCount).toBe(3);
    expect(res.json.organizersCount).toBe(2);
  });

  it("exclus : en attente, refusée, retirée, événement annulé ou brouillon", async () => {
    const w = await world();
    const e1 = await createEvent(w.structureA.id);
    const e2 = await createEvent(w.structureA.id);
    const e3 = await createEvent(w.structureB.id, { status: "cancelled" });
    const e4 = await createEvent(w.structureB.id, { status: "draft" });
    const e5 = await createEvent(w.structureB.id);
    await apply(e1.id, w.holder.id, w.brasa.id, "pending");
    await apply(e2.id, w.holder.id, w.brasa.id, "refused");
    await apply(e3.id, w.holder.id, w.brasa.id, "accepted");
    await apply(e4.id, w.holder.id, w.brasa.id, "accepted");
    await apply(e5.id, w.holder.id, w.brasa.id, "withdrawn");
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.json.missionsCount).toBe(0);
    expect(res.json.organizersCount).toBe(0);
  });

  it("un événement annulé après coup sort du compte ; les candidatures d'un autre prestataire ne comptent pas", async () => {
    const w = await world();
    const holder2 = await signUp("Autre_Titulaire");
    const [other] = await db
      .insert(providerProfiles)
      .values({ userId: holder2.id, type: "photographer", name: "Autre" })
      .returning();
    const e1 = await createEvent(w.structureA.id);
    const e2 = await createEvent(w.structureB.id);
    await apply(e1.id, w.holder.id, w.brasa.id, "accepted");
    await apply(e2.id, w.holder.id, w.brasa.id, "accepted");
    await apply(e2.id, holder2.id, (other as NonNullable<typeof other>).id, "accepted");
    expect((await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`)).json.missionsCount).toBe(2);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, e2.id));
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.json.missionsCount).toBe(1);
    expect(res.json.organizersCount).toBe(1);
  });

  it("un prestataire sans mission : zéro et zéro (jamais absent)", async () => {
    const w = await world();
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.json.missionsCount).toBe(0);
    expect(res.json.organizersCount).toBe(0);
  });
});

describe("GET /providers/:id : `stories` (l'anneau de la page)", () => {
  const liveStory = (providerId: string, authorId: string, audience: "public" | "followers" = "public") =>
    db.insert(stories).values({
      authorId,
      persona: "provider",
      providerId,
      audience,
      mediaKind: "photo",
      storageKey: "private/stories/essai/photo.webp",
      width: 1080,
      height: 1920,
      status: "ready",
      plateState: "none_confirmed",
      expiresAt: new Date(NOW.getTime() + 20 * 3_600_000),
    });

  it("sans story : count 0 ; avec une story publique : count 1, non vue ; le titulaire n'est jamais nommé", async () => {
    const w = await world();
    expect((await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`)).json.stories).toEqual({
      count: 0,
      hasUnseen: false,
      ring: null,
    });
    await liveStory(w.brasa.id, w.holder.id);
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.json.stories.count).toBe(1);
    expect(res.json.stories.hasUnseen).toBe(true);
    expect(res.json.stories.ring).not.toBeNull();
  });

  it("une story expirée ou supprimée ne compte pas ; la story d'une page est publique par nature (même titulaire en compte privé)", async () => {
    const w = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.holder.id));
    await liveStory(w.brasa.id, w.holder.id);
    await db
      .update(stories)
      .set({ expiresAt: new Date(NOW.getTime() - 3_600_000) })
      .where(eq(stories.providerId, w.brasa.id));
    expect((await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`)).json.stories.count).toBe(0);
    await liveStory(w.brasa.id, w.holder.id);
    expect((await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`)).json.stories.count).toBe(1);
    await db.update(stories).set({ deletedAt: NOW }).where(eq(stories.providerId, w.brasa.id));
    expect((await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`)).json.stories.count).toBe(0);
  });
});

describe("GET /providers/:id : liste blanche", () => {
  it("aucune clé du titulaire ni coordonnée privée ; un compte privé du titulaire : la page est quand même servie", async () => {
    const w = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, w.holder.id));
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.status, res.text).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(
      expect.arrayContaining([
        "id",
        "name",
        "followersCount",
        "isFollowing",
        "stories",
        "missionsCount",
        "organizersCount",
      ]),
    );
    for (const secret of ["Brasa_Titulaire", w.holder.id, w.holder.email, "0611223344", "brasa@exemple.fr"]) {
      expect(res.text, secret).not.toContain(secret);
    }
    for (const key of ["userId", "ownerUserId", "pseudo", "phone", "email"]) {
      expect(res.json).not.toHaveProperty(key);
    }
  });

  it("les champs d'avant ne bougent pas (nom, avis, abonnement) ; `isFollowing` suit l'acteur", async () => {
    const w = await world();
    const res = await callAs(w.kenji, null, "GET", `/providers/${w.brasa.id}`);
    expect(res.json).toMatchObject({
      id: w.brasa.id,
      name: "La Brasa",
      followersCount: 0,
      isFollowing: false,
      reviews: { average: null, count: 0, latest: [] },
    });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
