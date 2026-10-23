// Lot M6 : « Tes préférences » (`GET` et `PATCH /me/preferences`) et motifs de signalement propres à chaque type.
import { shouldDeliver } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createEvent, createStructure, resetDb, seedReference, signUp } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("Tes préférences", () => {
  it("lit les réglages du compte, puis enregistre coin, distance, types, centres d'intérêt et interrupteur", async () => {
    const ref = await seedReference();
    const u = await signUp("Prefs");
    const first = await call(u, "GET", "/me/preferences");
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({
      eventFormats: [],
      radiusKm: 50,
      interests: [],
      newEvents: true,
      seenAt: null,
    });

    const saved = await call(u, "PATCH", "/me/preferences", {
      eventFormats: ["gathering", "night", "night"],
      radiusKm: 60,
      departments: ["66", "11"],
      interests: [ref.jdm.id, ref.jdm.id],
      newEvents: false,
    });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({
      eventFormats: ["gathering", "night"],
      radiusKm: 60,
      departments: ["66", "11"],
      interests: [ref.jdm.id],
      newEvents: false,
    });
    expect(saved.json.seenAt).toEqual(expect.any(String));
    // L'interrupteur passe par les types coupés du compte (le même réglage que l'écran Notifications).
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.mutedTypes).toContain("event_nearby_interest");
    const settings = (await call(u, "GET", "/me/settings")).json;
    expect(settings.radiusKm).toBe(60);
    expect(settings.interests).toEqual([ref.jdm.id]);
    expect(settings.mutedTypes).toContain("event_nearby_interest");

    // Rétablir l'interrupteur retire le type des types coupés ; la date de première visite ne bouge plus.
    const again = await call(u, "PATCH", "/me/preferences", { newEvents: true });
    expect(again.json.newEvents).toBe(true);
    expect(again.json.seenAt).toBe(saved.json.seenAt);
    // Un envoi qui ne parle pas des centres d'intérêt les laisse tels quels.
    expect(again.json.interests).toEqual([ref.jdm.id]);
  });

  it("« Partout en France » : la distance est null, enregistrée et relue, puis un nombre la remplace", async () => {
    const u = await signUp("Partout");
    const everywhere = await call(u, "PATCH", "/me/preferences", { radiusKm: null });
    expect(everywhere.status).toBe(200);
    expect(everywhere.json.radiusKm).toBeNull();
    expect((await call(u, "GET", "/me/preferences")).json.radiusKm).toBeNull();
    expect((await call(u, "GET", "/me/settings")).json.radiusKm).toBeNull();
    // Un enregistrement qui ne parle pas de distance la laisse « Partout ».
    expect((await call(u, "PATCH", "/me/preferences", { eventFormats: ["night"] })).json.radiusKm).toBeNull();
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.radiusKm).toBeNull();
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 120 })).json.radiusKm).toBe(120);
  });

  it("« Passer » : un envoi vide marque l'étape comme vue", async () => {
    const u = await signUp("Passe");
    const res = await call(u, "PATCH", "/me/preferences", {});
    expect(res.status).toBe(200);
    expect(res.json.seenAt).toEqual(expect.any(String));
    expect(res.json.eventFormats).toEqual([]);
  });

  it("refuse un type inconnu, une distance hors du curseur, un département ou un centre d'intérêt inconnu ; exige un compte", async () => {
    const u = await signUp("Refus");
    expect((await call(u, "PATCH", "/me/preferences", { eventFormats: ["track_day"] })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 250 })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 300 })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { radiusKm: 5 })).status).toBe(400);
    expect((await call(u, "PATCH", "/me/preferences", { departments: ["99"] })).status).toBe(400);
    expect(
      (await call(u, "PATCH", "/me/preferences", { interests: ["00000000-0000-4000-8000-000000000000"] })).status,
    ).toBe(400);
    expect((await call(u, "PATCH", "/me/settings", { radiusKm: 250 })).status).toBe(400);
    expect((await call(null, "GET", "/me/preferences")).status).toBe(401);
  });

  it("l'interrupteur est allumé seulement si la famille est active ET le type non coupé", async () => {
    const u = await signUp("Famille");
    // « Événements » coupée en famille : « Nouveaux événements » est éteint.
    await call(u, "PATCH", "/me/settings", {
      notificationPrefs: { application: true, event: false, social: true, grade: true },
    });
    const first = await call(u, "GET", "/me/preferences");
    expect(first.json.newEvents).toBe(false);

    // Rallumer l'interrupteur : la famille revient, mais pas les autres types réglables de la famille.
    const again = await call(u, "PATCH", "/me/preferences", { newEvents: true });
    expect(again.json.newEvents).toBe(true);
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(row?.notificationPrefs.event).toBe(true);
    expect(row?.mutedTypes).toContain("new_event_followed");
    expect(row?.mutedTypes).not.toContain("event_nearby_interest");
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "event_nearby_interest")).toBe(true);
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "new_event_followed")).toBe(false);
    expect(shouldDeliver(row?.notificationPrefs, row?.mutedTypes, "event_updated")).toBe(false);

    // Couper l'interrupteur ne touche pas la famille.
    const off = await call(u, "PATCH", "/me/preferences", { newEvents: false });
    expect(off.json.newEvents).toBe(false);
    const [after] = await db.select().from(profiles).where(eq(profiles.userId, u.id));
    expect(after?.notificationPrefs.event).toBe(true);
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
