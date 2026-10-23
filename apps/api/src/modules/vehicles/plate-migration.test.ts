// Lot M2, tour 2 : la migration 0052 recalcule la forme unique des plaques enregistrées avant le lot (accents, bande
// « F », département), liste les collisions sans rien fusionner, suit les demandes de transfert et fait repartir les
// entrées du staff à la synchro. On rejoue ici sa partie « données » sur des lignes écrites comme avant M2.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizePlate } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createVehicle, resetDb, seedReference, signUp } from "../../../test/helpers";
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

/** Les instructions « données » de la migration (après la création de la table), dans une transaction. */
async function replayDataMigration() {
  const file = fileURLToPath(new URL("../../../drizzle/0052_plate-normalization.sql", import.meta.url));
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s && !/^(CREATE TABLE|ALTER TABLE)/.test(s));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const s of statements) await client.query(s);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Forme normalisée d'avant le lot M2 (majuscules puis lettres et chiffres : l'accent faisait tomber la lettre). */
const beforeM2 = (plate: string) => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

describe("migration 0052 : forme unique des plaques existantes", () => {
  it("recalcule comme normalizePlate, liste les collisions, suit les transferts", async () => {
    const a = await signUp("Migr_01");
    const b = await signUp("Migr_02");
    const rows: [string, string][] = [
      ["aé 665 gh", "AE665GH"],
      ["F AB-123-CD 66", "AB123CD"],
      ["F W 623 AX 66", "W623AX"],
      ["1234 AB 66", "1234AB66"],
      ["M-AB 1234", "MAB1234"],
    ];
    const ids: string[] = [];
    for (const [plate] of rows) {
      const v = await createVehicle(a.id, ref, { plate, plateNormalized: beforeM2(plate) });
      ids.push(v.id);
    }
    // Collision : « GA-662-KS 66 » (ancienne forme GA662KS66) deviendrait GA662KS, déjà actif chez B.
    const dup = await createVehicle(a.id, ref, { plate: "GA-662-KS 66", plateNormalized: "GA662KS66" });
    await createVehicle(b.id, ref, { plate: "GA-662-KS", plateNormalized: "GA662KS" });
    // Demande de transfert ouverte sur l'ancienne forme de la plaque du véhicule 2.
    await db
      .insert(plateTransferRequests)
      .values({ plateNormalized: "FAB123CD66", fromVehicleId: ids[1]!, toUserId: b.id });

    await replayDataMigration();

    for (const [i, [plate, expected]] of rows.entries()) {
      expect(normalizePlate(plate), plate).toBe(expected);
      const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, ids[i]!) });
      expect(row?.plateNormalized, plate).toBe(expected);
    }
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, dup.id) }))?.plateNormalized).toBe("GA662KS66");
    expect(await db.select().from(plateNormalizationConflicts)).toMatchObject([
      { vehicleId: dup.id, keptNormalized: "GA662KS66", wantedNormalized: "GA662KS" },
    ]);
    expect((await db.query.plateTransferRequests.findFirst())?.plateNormalized).toBe("AB123CD");
    // Les fonctions de la migration n'ont pas survécu à la session.
    const left = await db.execute(sql`select count(*)::int as n from pg_proc where proname like 'm2_%'`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
});
