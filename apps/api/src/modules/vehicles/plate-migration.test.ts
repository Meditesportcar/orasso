// Lot M2 : la migration 0053 recalcule la forme unique des plaques enregistrées avant le lot (accents, bande « F »,
// département), liste les collisions sans rien fusionner (rejouable, jamais en échec), suit toutes les demandes de
// transfert ouvertes et fait repartir les entrées du staff. On rejoue ici sa partie « données » sur des lignes écrites
// comme avant M2, et on vérifie que sa fonction SQL donne la même forme que `normalizePlate`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizePlate } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createVehicle, resetDb, seedReference, signUp } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { plateNormalizationConflicts, plateTransferRequests, vehicles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

const MIGRATION = fileURLToPath(new URL("../../../drizzle/0053_plate-normalization-conflicts.sql", import.meta.url));

/** Les instructions « données » de la migration (après le changement de la table), dans l'ordre. */
function dataStatements(): string[] {
  const text = readFileSync(MIGRATION, "utf8");
  return text
    .slice(text.indexOf("-- Lot M2, tour 3"))
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function inSession(
  statements: string[],
  body?: (q: (text: string, values?: unknown[]) => Promise<unknown[]>) => Promise<void>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of statements) await client.query(s);
    if (body) await body(async (text, values) => (await client.query(text, values)).rows);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const replayDataMigration = () => inSession(dataStatements());

/** Forme normalisée d'avant le lot M2 (majuscules puis lettres et chiffres : l'accent faisait tomber la lettre). */
const beforeM2 = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

const car = (plate: string) => ({
  vehicleType: "car",
  makeId: ref.makeId,
  modelId: ref.modelId,
  generationId: ref.generationId,
  year: 1995,
  plate,
});

describe("migration 0053 : forme unique des plaques existantes", () => {
  it("parité : la fonction SQL de la migration donne la même forme que normalizePlate", async () => {
    const corpus = [
      "AB-123-CD",
      "ab 123 cd",
      "aé 665 gh",
      "AE665GH",
      "F AB-123-CD 66",
      "F AB-123-CD",
      "AB-123-CD 66",
      "AB-123-CD 974",
      "AB-123-CD 2A",
      "F-AB-123-CD-66",
      "FAB123CD66",
      "FW-123-AB",
      "FW-123-AB 66",
      "F W 123 AB",
      "F W 123 AB 66",
      "F FW-123-AB 66",
      "FW123AB",
      "F-W-123-AB",
      "W-623-AX",
      "w623ax",
      "W 623 AX 66",
      "F W 623 AX 66",
      "WW-123-AB",
      "F WW-123-AB 2A",
      "ww 123 ab",
      "1234 AB 66",
      "F 1234 AB 66",
      "7 ABC 34",
      "456 BCD 2A",
      "12 AB 974",
      "1234 WW 66",
      "6 CMD 5",
      "12 CD 3456",
      "123 K 4567",
      "M-AB 1234",
      "B-AB 1234",
      "GE 123456",
      "AB-000-CD",
      "IO-123-UA",
      "SS-123-AB",
      "0 AB 66",
      "F-123 XY 66 99",
      "  f   ab.123.cd  ",
      "FT-340-NC",
      "GA·662·KS 66",
      "Ç0-123-ÉÈ",
    ];
    expect(corpus.length).toBeGreaterThanOrEqual(40);
    const functions = dataStatements()
      .map((s) => s.replace(/^(--[^\n]*\n)+/, ""))
      .filter((s) => s.startsWith("CREATE FUNCTION"));
    await inSession(functions, async (q) => {
      for (const raw of corpus) {
        const [row] = (await q("select pg_temp.m2_plate($1) as n", [raw])) as { n: string }[];
        expect(row?.n, raw).toBe(normalizePlate(raw));
      }
      await q(
        "DROP FUNCTION pg_temp.m2_plate(text), pg_temp.m2_before(text), pg_temp.m2_strip(text), pg_temp.m2_french(text), pg_temp.m2_recent(text), pg_temp.m2_chars(text)",
      );
    });
  });

  it("recalcule comme normalizePlate, liste les collisions une seule fois, rejouable", async () => {
    const a = await signUp("Migr_01");
    const b = await signUp("Migr_02");
    const rows: [string, string][] = [
      ["aé 665 gh", "AE665GH"],
      ["F AB-123-CD 66", "AB123CD"],
      ["F W 623 AX 66", "W623AX"],
      ["FW-456-AB 66", "FW456AB"],
      ["1234 AB 66", "1234AB66"],
      ["M-AB 1234", "MAB1234"],
    ];
    const ids: string[] = [];
    for (const [plate] of rows)
      ids.push((await createVehicle(a.id, ref, { plate, plateNormalized: beforeM2(plate) })).id);
    // Collision : « GA-662-KS 66 » (ancienne forme GA662KS66) deviendrait GA662KS, déjà actif chez B.
    const dup = await createVehicle(a.id, ref, { plate: "GA-662-KS 66", plateNormalized: "GA662KS66" });
    await createVehicle(b.id, ref, { plate: "GA-662-KS", plateNormalized: "GA662KS" });

    await replayDataMigration();
    await replayDataMigration(); // rejouée : rien de plus, rien en échec

    for (const [i, [plate, expected]] of rows.entries()) {
      expect(normalizePlate(plate), plate).toBe(expected);
      const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, ids[i]!) });
      expect(row?.plateNormalized, plate).toBe(expected);
    }
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, dup.id) }))?.plateNormalized).toBe("GA662KS66");
    expect(await db.select().from(plateNormalizationConflicts)).toMatchObject([
      { vehicleId: dup.id, transferId: null, keptNormalized: "GA662KS66", wantedNormalized: "GA662KS" },
    ]);
    const left = await db.execute(sql`select count(*)::int as n from pg_proc where proname like 'm2_%'`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });

  it("toutes les demandes ouvertes suivent, même si le véhicule d'origine a cédé la plaque ; aucun doublon actif", async () => {
    const marc = await signUp("Marc_66");
    const lea = await signUp("Lea_11");
    const nina = await signUp("Nina_34");
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    // Avant M2 : la GTI de Marc porte « F AB-123-CD 66 » (clé FAB123CD66) ; Léa puis Nina la demandent.
    const gti = await createVehicle(marc.id, ref, { plate: "F AB-123-CD 66", plateNormalized: "FAB123CD66" });
    const leaV = await createVehicle(lea.id, ref, { plate: "F AB-123-CD 66", plateNormalized: null });
    const ninaV = await createVehicle(nina.id, ref, { plate: "F AB-123-CD 66", plateNormalized: null });
    const [toLea] = await db
      .insert(plateTransferRequests)
      .values({ plateNormalized: "FAB123CD66", fromVehicleId: gti.id, toUserId: lea.id })
      .returning();
    const [toNina] = await db
      .insert(plateTransferRequests)
      .values({ plateNormalized: "FAB123CD66", fromVehicleId: gti.id, toUserId: nina.id, status: "arbitrated" })
      .returning();
    await db.update(vehicles).set({ pendingTransferId: toLea!.id }).where(eq(vehicles.id, leaV.id));
    await db.update(vehicles).set({ pendingTransferId: toNina!.id }).where(eq(vehicles.id, ninaV.id));
    // Marc accepte Léa (avant M2) : sa GTI est vendue, sans clé ; la demande de Nina reste en arbitrage.
    expect((await call(marc, "POST", `/plate-transfers/${toLea!.id}/accept`)).status).toBe(200);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, gti.id) }))?.plateNormalized).toBeNull();

    await replayDataMigration();

    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, leaV.id) }))?.plateNormalized).toBe("AB123CD");
    expect(
      (await db.query.plateTransferRequests.findFirst({ where: eq(plateTransferRequests.id, toNina!.id) }))
        ?.plateNormalized,
    ).toBe("AB123CD");
    // L'équipe accepte ensuite Nina : la plaque est déjà active chez Léa, sous la même forme → refus, pas de doublon.
    const decided = await call(admin, "POST", `/admin/plate-transfers/${toNina!.id}/decide`, { decision: "accept" });
    expect(decided.status).toBe(409);
    const active = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.status, "active"), eq(vehicles.plateNormalized, "AB123CD")));
    expect(active.map((v) => v.id)).toEqual([leaV.id]);
  });

  it("collision entre deux anciennes variantes : forme réservée, un tiers passe par une demande de transfert", async () => {
    const a = await signUp("Var_01");
    const b = await signUp("Var_02");
    const c = await signUp("Var_03");
    const va = await createVehicle(a.id, ref, { plate: "F AB-123-CD 66", plateNormalized: "FAB123CD66" });
    const vb = await createVehicle(b.id, ref, { plate: "AB-123-CD 66", plateNormalized: "AB123CD66" });

    await replayDataMigration();

    const conflicts = await db.select().from(plateNormalizationConflicts);
    expect(conflicts.map((x) => x.vehicleId).sort()).toEqual([va.id, vb.id].sort());
    // Modifier autre chose que la plaque ne recalcule pas la clé gardée.
    expect((await call(a, "PATCH", `/me/vehicles/${va.id}`, { color: "Bleue" })).status).toBe(200);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, va.id) }))?.plateNormalized).toBe("FAB123CD66");
    // Un tiers saisit la plaque sous sa forme unique : demande de transfert, aucun doublon.
    const created = await call(c, "POST", "/me/vehicles", car("AB-123-CD"));
    expect(created.status).toBe(201);
    expect(created.json.plateTransfer).not.toBeNull();
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, created.json.id) });
    expect(row?.plateNormalized).toBeNull();
  });
});
