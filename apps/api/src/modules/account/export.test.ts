// Lot 35c : export des données personnelles (`GET /me/export`) et newsletter (`PATCH /me/profile`), côté appli.
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  useClock(new Date("2026-10-17T10:00:00Z"));
});

describe("export des données personnelles", () => {
  it("renvoie le compte, le profil, les véhicules et les candidatures de son titulaire, sans aucun secret", async () => {
    const ref = await seedReference();
    const owner = await signUp("Orga_Export");
    const kenji = await signUp("Kenji_Export");
    const other = await signUp("Autre_Export");
    const structure = await createStructure(owner.id);
    const event = await createEvent(structure.id, { title: "Rassemblement d'export" });
    const car = await createVehicle(kenji.id, ref);
    await createVehicle(other.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: kenji.id,
      vehicleId: car.id,
      status: "accepted",
      followStructure: true,
      rulesAcceptedAt: new Date(),
    });
    await call(kenji, "PATCH", "/me/profile", { bio: "Passionné de youngtimers", newsletterOptIn: true });

    const res = await call(kenji, "GET", "/me/export");
    expect(res.status).toBe(200);
    const body = res.json;
    expect(body.account).toMatchObject({ id: kenji.id, email: kenji.email });
    expect(body.profile).toMatchObject({
      pseudo: "Kenji_Export",
      bio: "Passionné de youngtimers",
      newsletterOptIn: true,
    });
    expect(body.vehicles).toHaveLength(1);
    expect(body.vehicles[0]).toMatchObject({ id: car.id, make: "BMW", model: "Série 3", plate: car.plate });
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0]).toMatchObject({ event: "Rassemblement d'export", status: "accepted" });
    expect(body.structures).toEqual([]);

    // Rien de secret ni de l'autre compte.
    const text = JSON.stringify(body);
    expect(text).not.toContain("accountQrSecret");
    expect(text).not.toContain("account_qr_secret");
    expect(text).not.toContain("inviteToken");
    expect(text).not.toContain(other.email);
    expect(text).not.toContain("Autre_Export");

    // L'organisateur voit ses structures, pas les candidatures des autres.
    const mine = (await call(owner, "GET", "/me/export")).json;
    expect(mine.structures).toEqual([expect.objectContaining({ role: "owner", status: "active" })]);
    expect(mine.applications).toEqual([]);
  });

  it("demande une connexion et limite le nombre d'exports", async () => {
    const u = await signUp("Limite_Export");
    expect((await call(null, "GET", "/me/export")).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await call(u, "GET", "/me/export")).status).toBe(200);
    expect((await call(u, "GET", "/me/export")).status).toBe(429);
  });
});

describe("newsletter depuis l'appli", () => {
  it("la case se règle par `PATCH /me/profile` et se relit dans `GET /me`", async () => {
    const u = await signUp("News_Opt");
    expect((await call(u, "GET", "/me")).json.profile.newsletterOptIn).toBe(false);
    const on = await call(u, "PATCH", "/me/profile", { newsletterOptIn: true });
    expect(on.status).toBe(200);
    expect(on.json.profile.newsletterOptIn).toBe(true);
    const off = await call(u, "PATCH", "/me/profile", { newsletterOptIn: false });
    expect(off.json.profile.newsletterOptIn).toBe(false);
    // Un autre réglage ne touche pas à la case.
    await call(u, "PATCH", "/me/profile", { newsletterOptIn: true });
    const bio = await call(u, "PATCH", "/me/profile", { bio: "Salut" });
    expect(bio.json.profile.newsletterOptIn).toBe(true);
  });
});
