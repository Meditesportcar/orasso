// Lot 31, corrections de la relecture : fuite de la fiche de l'ancien propriétaire (B2), anonymisation du compte (B3),
// concurrence sur la fiche (I1), pluralité de demandes de transfert (I2, I3), doubles demandes (M1), harcèlement (M4).
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createVehicle, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  certificationRequests,
  notifications,
  plateTransferRequests,
  profiles,
  vehicleCategories,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-10-16T10:00:00Z"));
  ref = await seedReference();
});

const car = (plate: string) => ({
  vehicleType: "car",
  makeId: ref.makeId,
  modelId: ref.modelId,
  generationId: ref.generationId,
  year: 1995,
  plate,
});

const PLATE = "AB-123-CD";

async function marcWithPlate() {
  const marc = await signUp("Marc_66");
  const gti = await call(marc, "POST", "/me/vehicles", car(PLATE));
  expect(gti.status).toBe(201);
  return { marc, gti: gti.json as { id: string } };
}

const row = (id: string) => db.query.vehicles.findFirst({ where: eq(vehicles.id, id) });
const transfers = () => db.select().from(plateTransferRequests);

describe("B2 : la vue du demandeur ne montre rien de l'ancien propriétaire", () => {
  it("outgoing : identifiant, statut, dates, échéance, note et son propre véhicule seulement", async () => {
    const { marc, gti } = await marcWithPlate();
    const lea = await signUp("Lea_11");
    const mine = await call(lea, "POST", "/me/vehicles", car("ab 123 cd"));
    const { outgoing } = (await call(lea, "GET", "/me/plate-transfers")).json;
    expect(outgoing).toHaveLength(1);
    expect(Object.keys(outgoing[0]).sort()).toEqual(
      ["answerBy", "createdAt", "id", "note", "requesterVehicleLabel", "status"].sort(),
    );
    const text = JSON.stringify(outgoing);
    expect(text).not.toContain(gti.id);
    expect(text).not.toContain("Marc_66");
    expect(text).not.toContain("AB-123-CD");
    expect(outgoing[0].requesterVehicleLabel).toBe("BMW Série 3 E36");
    expect(mine.json.plateTransfer.status).toBe("pending");
    // L'ancien propriétaire, lui, voit la demande entrante.
    expect((await call(marc, "GET", "/me/plate-transfers")).json.incoming).toHaveLength(1);
  });
});

describe("M1 et M4 : doubles demandes et harcèlement", () => {
  it("deux créations simultanées avec la même plaque d'autrui : une seule demande, 409 propre pour l'autre", async () => {
    await marcWithPlate();
    const lea = await signUp("Lea_11");
    const [a, b] = await Promise.all([
      call(lea, "POST", "/me/vehicles", car("AB-123-CD")),
      call(lea, "POST", "/me/vehicles", car("ab 123 cd")),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await transfers()).toHaveLength(1);
  });

  it("supprimer et recréer le véhicule avec la plaque d'autrui : bloqué à la troisième demande en 24 h", async () => {
    const { marc } = await marcWithPlate();
    const lea = await signUp("Lea_11");
    for (let i = 0; i < 2; i++) {
      const made = await call(lea, "POST", "/me/vehicles", car(PLATE));
      expect(made.status).toBe(201);
      expect((await call(lea, "DELETE", `/me/vehicles/${made.json.id}`)).status).toBe(204);
    }
    const third = await call(lea, "POST", "/me/vehicles", car(PLATE));
    expect(third.status).toBe(429);
    const sent = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, marc.id), eq(notifications.type, "plate_transfer_request")),
    });
    expect(sent).toHaveLength(2);
  });
});

describe("I1 : une modification concurrente n'écrase pas une acceptation de transfert", () => {
  it("la fiche changée entre la lecture et l'écriture donne un 409, la plaque acceptée est conservée", async () => {
    const { marc, gti } = await marcWithPlate();
    const lea = await signUp("Lea_11");
    const made = await call(lea, "POST", "/me/vehicles", car(PLATE));
    const id = made.json.id as string;
    const transferId = (await call(marc, "GET", "/me/plate-transfers")).json.incoming[0].id;

    let patch: ReturnType<typeof call> | undefined;
    await db.transaction(async (tx) => {
      // Le véhicule de Léa est verrouillé ici : le PATCH lit « en attente », puis attend le verrou.
      await tx.select().from(vehicles).where(eq(vehicles.id, id)).for("update");
      patch = call(lea, "PATCH", `/me/vehicles/${id}`, { description: "Nouvelle description" });
      await new Promise((r) => setTimeout(r, 600));
      // Acceptation concurrente : l'ancien véhicule est vendu, la plaque arrive, la demande disparaît.
      await tx.update(vehicles).set({ status: "sold", plateNormalized: null }).where(eq(vehicles.id, gti.id));
      await tx.update(vehicles).set({ plateNormalized: "AB123CD", pendingTransferId: null }).where(eq(vehicles.id, id));
      await tx
        .update(plateTransferRequests)
        .set({ status: "accepted" })
        .where(eq(plateTransferRequests.id, transferId));
    });
    const res = await patch;
    expect(res?.status).toBe(409);
    expect(await row(id)).toMatchObject({ plateNormalized: "AB123CD", pendingTransferId: null });
  });
});

describe("I2 et I3 : plusieurs demandes sur la même plaque", () => {
  async function twoRequesters() {
    const base = await marcWithPlate();
    const lea = await signUp("Lea_11");
    const nina = await signUp("Nina_34");
    const leaV = (await call(lea, "POST", "/me/vehicles", car(PLATE))).json.id as string;
    const ninaV = (await call(nina, "POST", "/me/vehicles", car("ab-123-cd"))).json.id as string;
    return { ...base, lea, nina, leaV, ninaV };
  }

  it("I2 : l'ancien véhicule quitte la plaque avec deux demandes → tout à l'arbitrage, aucun refus ni acceptation d'office", async () => {
    const { marc, gti, leaV, ninaV } = await twoRequesters();
    const first = (await call(marc, "GET", "/me/plate-transfers")).json.incoming;
    expect(first).toHaveLength(2);
    await call(marc, "PATCH", `/me/vehicles/${gti.id}`, { status: "sold" });
    const all = await transfers();
    expect(all.map((t) => t.status)).toEqual(["arbitrated", "arbitrated"]);
    for (const id of [leaV, ninaV]) {
      expect(await row(id)).toMatchObject({ plateNormalized: null, unregistered: false });
      expect((await row(id))?.pendingTransferId).toBeTruthy();
    }
  });

  it("I2 : une demande déjà refusée par l'ancien propriétaire ne reçoit pas la plaque d'office", async () => {
    const { marc, gti, lea, nina, leaV } = await twoRequesters();
    const leaTransfer = (await transfers()).find((t) => t.toUserId === lea.id);
    await call(marc, "POST", `/plate-transfers/${leaTransfer?.id}/decline`);
    // Il ne reste que la demande refusée par Marc (celle de Nina est retirée).
    await db.delete(plateTransferRequests).where(eq(plateTransferRequests.toUserId, nina.id));
    await call(marc, "PATCH", `/me/vehicles/${gti.id}`, { status: "sold" });
    expect((await row(leaV))?.plateNormalized).toBeNull();
    expect((await transfers()).find((t) => t.id === leaTransfer?.id)?.status).toBe("arbitrated");
  });

  it("I2 : une seule demande jamais refusée → acceptée d'office quand la plaque se libère", async () => {
    const { marc, gti } = await marcWithPlate();
    const lea = await signUp("Lea_11");
    const leaV = (await call(lea, "POST", "/me/vehicles", car(PLATE))).json.id as string;
    await call(marc, "PATCH", `/me/vehicles/${gti.id}`, { status: "sold" });
    expect((await row(leaV))?.plateNormalized).toBe("AB123CD");
  });

  it("I3 : acceptation de Marc pour Léa → la demande de Nina passe à l'arbitrage, jamais refusée d'office", async () => {
    const { marc, lea, leaV, ninaV } = await twoRequesters();
    const leaTransfer = (await transfers()).find((t) => t.toUserId === lea.id);
    expect((await call(marc, "POST", `/plate-transfers/${leaTransfer?.id}/accept`)).status).toBe(200);
    expect((await row(leaV))?.plateNormalized).toBe("AB123CD");
    const ninaTransfer = (await transfers()).find((t) => t.id !== leaTransfer?.id);
    expect(ninaTransfer?.status).toBe("arbitrated");
    expect((await row(ninaV))?.pendingTransferId).toBe(ninaTransfer?.id);
  });

  it("I3 : le véhicule du demandeur a disparu → la demande est close sans marquer l'ancien véhicule « Vendu »", async () => {
    const { marc, gti, lea, leaV } = await twoRequesters();
    const leaTransfer = (await transfers()).find((t) => t.toUserId === lea.id);
    // Véhicule du demandeur supprimé par un autre chemin (clé étrangère : la demande reste, sans véhicule en attente).
    await db.update(vehicles).set({ pendingTransferId: null }).where(eq(vehicles.id, leaV));
    expect((await call(marc, "POST", `/plate-transfers/${leaTransfer?.id}/accept`)).status).toBe(200);
    expect((await row(gti.id))?.status).toBe("active");
    expect((await transfers()).find((t) => t.id === leaTransfer?.id)?.status).toBe("refused");
  });

  it("la suppression de l'ancien véhicule est refusée tant que plusieurs demandes portent sur sa plaque", async () => {
    const { marc, gti } = await twoRequesters();
    expect((await call(marc, "DELETE", `/me/vehicles/${gti.id}`)).status).toBe(409);
  });
});

describe("B3 : suppression du compte", () => {
  async function sport(pseudo: string): Promise<{ u: TestUser; v: { id: string } }> {
    const u = await signUp(pseudo);
    await db.update(profiles).set({ grade: "sport", pointsSeason: 340 }).where(eq(profiles.userId, u.id));
    const v = await createVehicle(u.id, ref, { description: "Description personnelle secrète." });
    await db.insert(vehiclePhotos).values([
      { vehicleId: v.id, position: 2, storageKey: "t/2.webp", width: 1, height: 1, bytes: 1 },
      { vehicleId: v.id, position: 3, storageKey: "t/3.webp", width: 1, height: 1, bytes: 1 },
    ]);
    await db.insert(vehicleCategories).values({ vehicleId: v.id, categoryId: ref.jdm.id });
    return { u, v };
  }

  it("demandes de certification supprimées, certification retirée ; demande de transfert d'un autre acceptée d'office", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const { u, v } = await sport("Kenji_66");
    const requested = await call(u, "POST", `/me/vehicles/${v.id}/certification-request`, {
      message: "Mon message personnel",
    });
    await call(admin, "POST", `/admin/certification-requests/${requested.json.request.id}/decide`, {
      decision: "accept",
    });
    expect((await row(v.id))?.certifiedAt).not.toBeNull();
    // Une demande de transfert d'un autre compte sur la plaque de Kenji.
    const plate = (await row(v.id))?.plate as string;
    const lea = await signUp("Lea_11");
    const leaV = (await call(lea, "POST", "/me/vehicles", car(plate))).json.id as string;
    expect((await row(leaV))?.pendingTransferId).toBeTruthy();

    const res = await call(u, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(res.status).toBe(200);

    expect(await db.select().from(certificationRequests).where(eq(certificationRequests.userId, u.id))).toHaveLength(0);
    const after = await row(v.id);
    expect(after).toMatchObject({ certifiedAt: null, certifiedLostReason: null, description: null });
    // Plaque libérée : la demande de Léa est acceptée d'office.
    expect(await row(leaV)).toMatchObject({
      plateNormalized: plate.replace(/-/g, "").toUpperCase(),
      pendingTransferId: null,
    });
  });
});
