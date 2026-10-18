// Lot 16 : `GET /me` renvoie les casquettes du compte (passionné en premier, structures actives, fiche pro) avec leur
// pastille « à traiter ».
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications, structureMembers, structures } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
});

describe("casquettes dans GET /me", () => {
  it("un simple passionné n'a que la casquette passionné, sans pastille", async () => {
    const u = await signUp("Seule");
    const { status, json } = await call(u, "GET", "/me");
    expect(status).toBe(200);
    expect(json.personas).toEqual([{ kind: "fan", id: "fan", label: "Passionné", logoUrl: null, badge: 0 }]);
    expect(json.unreadInbox).toBe(0);
  });

  it("le propriétaire et le co-organisateur actifs voient la structure, pas le staff ni un membre retiré", async () => {
    const owner = await signUp("Patron");
    const co = await signUp("Coorga");
    const staff = await signUp("Benevole");
    const gone = await signUp("Parti");
    const s = await createStructure(owner.id);
    await addMember(s.id, co.id, "co_organizer", [], true);
    await addMember(s.id, staff.id, "staff", ["scan"]);
    await addMember(s.id, gone.id, "co_organizer");
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, gone.id));

    for (const u of [owner, co]) {
      const { json } = await call(u, "GET", "/me");
      expect(json.personas.map((p: { kind: string }) => p.kind)).toEqual(["fan", "organizer"]);
      expect(json.personas[1]).toMatchObject({ kind: "organizer", id: s.id, label: "Club de test", badge: 0 });
    }
    for (const u of [staff, gone]) {
      const { json } = await call(u, "GET", "/me");
      expect(json.personas).toHaveLength(1);
    }
  });

  it("une structure supprimée disparaît des casquettes", async () => {
    const owner = await signUp("Patron");
    const s = await createStructure(owner.id);
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, s.id));
    const { json } = await call(owner, "GET", "/me");
    expect(json.personas).toHaveLength(1);
  });

  it("la fiche pro est une casquette ; la pastille de l'équipe organisatrice compte les candidatures en attente", async () => {
    const owner = await signUp("Patron");
    const fan = await signUp("Candidat");
    const ref = await seedReference();
    const s = await createStructure(owner.id);
    const pro = await createPro(owner.id, { name: "Garage du coin" });
    const event = await createEvent(s.id);
    const vehicle = await createVehicle(fan.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: fan.id,
      vehicleId: vehicle.id,
      status: "pending",
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });

    const { json } = await call(owner, "GET", "/me");
    expect(json.personas.map((p: { kind: string; badge: number }) => [p.kind, p.badge])).toEqual([
      ["fan", 0],
      ["organizer", 1],
      ["pro", 0],
    ]);
    expect(json.personas[2]).toMatchObject({ id: pro.id, label: "Garage du coin" });
    // Le candidat n'est pas organisateur : aucune pastille chez lui.
    const other = await call(fan, "GET", "/me");
    expect(other.json.personas).toHaveLength(1);
  });
});
