// Lot M6 : « Tes préférences » (`GET` et `PATCH /me/preferences`) et motifs de signalement propres à chaque type.
import { shouldDeliver } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createEvent, createStructure, resetDb, signUp } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("Tes préférences", () => {
  it("lit les réglages du compte, puis enregistre types, distance, départements et notifications", async () => {
    const u = await signUp("Prefs");
    const first = await call(u, "GET", "/me/preferences");
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({
      eventFormats: [],
      radiusKm: 50,
      notifications: { newEvents: true, freedSpots: true, followedNews: true },
      seenAt: null,
    });

    const saved = await call(u, "PATCH", "/me/preferences", {
      eventFormats: ["gathering", "night", "night"],
      radiusKm: 60,
      departments: ["66", "11"],
      notifications: { followedNews: false },
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({
      eventFormats: ["gathering", "night"],
      radiusKm: 60,
      departments: ["66", "11"],
      notifications: { newEvents: true, freedSpots: true, followedNews: false },
    });
    expect(saved.json.seenAt).toEqual(expect.any(String));
    // Les notifications passent par les types coupés du compte (mêmes règles que les réglages).
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.mutedTypes).toContain("new_event_followed");
    expect((await call(u, "GET", "/me/settings")).json.radiusKm).toBe(60);

    // Rétablir une notification la retire des types coupés ; la date de première visite ne bouge plus.
    const again = await call(u, "PATCH", "/me/preferences", { notifications: { followedNews: true } });
    expect(again.json.notifications.followedNews).toBe(true);
    expect(again.json.seenAt).toBe(saved.json.seenAt);
  });

  it("« Passer » : un envoi vide marque l'étape comme vue", async () => {
    const u = await signUp("Passe");
    const res = await call(u, "PATCH", "/me/preferences", {});
    expect(res.status).toBe(200);
    expect(res.json.seenAt).toEqual(expect.any(String));
    expect(res.json.eventFormats).toEqual([]);
  });

  it("refuse un type inconnu, une distance hors du curseur, un département inconnu ; exige un compte", async () => {
    const u = await signUp("Refus");
    expect((await call(u, "PATCH", "/me/preferences", { eventFormats: ["track_day"] })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 250 })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 5 })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { departments: ["99"] })).status).toBe(400);
    expect((await call(null, "GET", "/me/preferences")).status).toBe(401);
  });

  it("un rayon de compte plus large que le curseur est renvoyé tel quel, jamais réécrit (lot M6, tour 2)", async () => {
    const u = await signUp("Large");
    await db.update(profiles).set({ radiusKm: 300 }).where(eq(profiles.userId, u.id));
    expect((await call(u, "GET", "/me/preferences")).json.radiusKm).toBe(300);
    // Un enregistrement qui ne parle pas de distance la laisse à 300 km.
    const saved = await call(u, "PATCH", "/me/preferences", { eventFormats: ["night"] });
    expect(saved.json.radiusKm).toBe(300);
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.radiusKm).toBe(300);
  });

  it("un interrupteur est allumé seulement si la famille est active ET le type non coupé", async () => {
    const u = await signUp("Famille");
    // « Événements » coupée en famille : « Nouveaux événements » et « Actualité suivie » sont éteints.
    await call(u, "PATCH", "/me/settings", {
      notificationPrefs: { application: true, event: false, social: true, grade: true },
    });
    const first = await call(u, "GET", "/me/preferences");
    expect(first.json.notifications).toEqual({ newEvents: false, freedSpots: true, followedNews: false });

    // Rallumer « Nouveaux événements » : la famille revient, mais pas les autres types réglables de la famille.
    const again = await call(u, "PATCH", "/me/preferences", { notifications: { newEvents: true } });
    expect(again.json.notifications).toEqual({ newEvents: true, freedSpots: true, followedNews: false });
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.notificationPrefs.event).toBe(true);
    expect(row?.mutedTypes).toContain("new_event_followed");
    expect(row?.mutedTypes).not.toContain("event_nearby_interest");
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "event_nearby_interest")).toBe(true);
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "new_event_followed")).toBe(false);
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "event_updated")).toBe(false);

    // Couper un type ne touche pas la famille ; les deux d'une même famille dans un seul envoi.
    const both = await call(u, "PATCH", "/me/preferences", { notifications: { newEvents: false, followedNews: true } });
    expect(both.json.notifications).toEqual({ newEvents: false, freedSpots: true, followedNews: true });
  });
});

describe("motifs de signalement par type (lot M6)", () => {
  it("un événement se signale avec ses motifs, pas avec ceux d'une personne", async () => {
    const owner = await signUp("Orga");
    const structure = await createStructure(owner.id);
    const event = await createEvent(structure.id);
    const u = await signUp("Temoin");
    const ok = await call(u, "POST", "/reports", {
      targetType: "event",
      targetId: event.id,
      reason: "unauthorized_place",
    });
    expect(ok.status).toBe(201);
    const wrong = await call(u, "POST", "/reports", {
      targetType: "event",
      targetId: event.id,
      reason: "fake_profile",
    });
    expect(wrong.status).toBe(400);
    // « Autre » exige toujours la description.
    const other = await call(u, "POST", "/reports", { targetType: "event", targetId: event.id, reason: "other" });
    expect(other.status).toBe(400);
  });

  it("une personne garde ses motifs d'origine ; un motif d'événement y est refusé", async () => {
    const target = await signUp("Cible");
    const u = await signUp("Signaleur");
    expect(
      (await call(u, "POST", "/reports", { targetType: "profile", targetId: target.id, reason: "harassment" })).status,
    ).toBe(201);
    expect(
      (await call(u, "POST", "/reports", { targetType: "profile", targetId: target.id, reason: "abusive_pricing" }))
        .status,
    ).toBe(400);
  });
});
