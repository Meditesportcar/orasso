// R8p, tour 3 : `GET /me/feed-posts/by-client/:clientId` vérifie un envoi dont la réponse s'est perdue.
import { fromWallTime } from "@orasso/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;
const CLIENT = "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0b01";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function pagePost() {
  const owner = await signUp("Orga_T3", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const startsAt = new Date(Date.now() + 20 * 24 * HOUR);
  const event = await createEvent(structure.id, {
    title: "Rassemblement du Lydia",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * HOUR),
    posterKey: "events/poster-t3.webp",
  });
  const sent = await call(owner, "POST", "/me/feed-posts", {
    persona: "organizer",
    structureId: structure.id,
    eventId: event.id,
    caption: "Le plan est en ligne",
    clientId: CLIENT,
  });
  expect(sent.status).toBe(201);
  return { owner, sent };
}

describe("POST /me/feed-posts : compte attendu (tour 8)", () => {
  it("un autre compte attendu : 409 account_changed, rien n'est écrit ; le bon compte : 201", async () => {
    const owner = await signUp("Orga_T8", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const startsAt = new Date(Date.now() + 20 * 24 * HOUR);
    const event = await createEvent(structure.id, {
      title: "Rassemblement du Lydia",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 4 * HOUR),
      posterKey: "events/poster-t8.webp",
    });
    const body = {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Le plan est en ligne",
      clientId: "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0b08",
    };
    const wrong = await call(owner, "POST", "/me/feed-posts", { ...body, expectedUserId: "un-autre-compte" });
    expect(wrong.status).toBe(409);
    expect(wrong.json.error.code).toBe("account_changed");
    expect((await call(owner, "GET", `/me/feed-posts/by-client/${body.clientId}`)).status).toBe(404);
    const ok = await call(owner, "POST", "/me/feed-posts", { ...body, expectedUserId: owner.id });
    expect(ok.status).toBe(201);
  });
});

describe("GET /me/feed-posts/by-client/:clientId", () => {
  it("l'auteur retrouve sa publication de structure (toutes casquettes), en `private, no-store`", async () => {
    const { owner, sent } = await pagePost();
    const res = await app.request(`/api/me/feed-posts/by-client/${CLIENT}`, {
      headers: { origin: process.env.PUBLIC_URL ?? "http://localhost:5173", cookie: owner.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(((await res.json()) as { id: string }).id).toBe(sent.json.id);
  });
  it("un identifiant inconnu : 404 ; sans session : 401", async () => {
    const { owner } = await pagePost();
    const none = await call(owner, "GET", "/me/feed-posts/by-client/0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0b99");
    expect(none.status).toBe(404);
    const anon = await app.request(`/api/me/feed-posts/by-client/${CLIENT}`, {
      headers: { origin: process.env.PUBLIC_URL ?? "http://localhost:5173" },
    });
    expect(anon.status).toBe(401);
  });
  it("un autre compte ne retrouve jamais la publication d'un auteur : 404", async () => {
    await pagePost();
    const other = await signUp("Autre_T3");
    const res = await call(other, "GET", `/me/feed-posts/by-client/${CLIENT}`);
    expect(res.status).toBe(404);
  });
  it("une publication retirée n'est plus retrouvée", async () => {
    const { owner, sent } = await pagePost();
    expect((await call(owner, "DELETE", `/me/feed-posts/${sent.json.id}`)).status).toBe(204);
    expect((await call(owner, "GET", `/me/feed-posts/by-client/${CLIENT}`)).status).toBe(404);
  });
  it("un identifiant mal formé : 400", async () => {
    const { owner } = await pagePost();
    expect((await call(owner, "GET", "/me/feed-posts/by-client/pas-un-uuid")).status).toBe(400);
  });
});
