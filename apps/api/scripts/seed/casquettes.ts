// Lot 16 : casquettes de l'appli. Sarah_66 est déjà co-organisatrice de MéditeSportCar (des candidatures à trier :
// pastille sur l'avatar) ; on lui donne une seconde structure, « Roues Libres 66 » (rien à traiter), pour voir la
// feuille « Mes casquettes » avec deux structures. Garage_Port (lot 14) a sa fiche pro. Idempotent.
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { now } from "./helpers";

export async function seedCasquettes() {
  if (await db.query.structures.findFirst({ where: eq(t.structures.slug, "roues-libres-66") })) {
    console.log("Casquettes : Roues Libres 66 déjà présente.");
    return;
  }
  const sarah = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'sarah_66'` });
  if (!sarah) throw new Error("Compte Sarah_66 absent");
  const [structure] = await db
    .insert(t.structures)
    .values({
      slug: "roues-libres-66",
      kind: "association",
      name: "Roues Libres 66",
      description: "Petit club de balades et de rassemblements du Roussillon.",
      city: "Perpignan",
      department: "66",
      departments: ["66"],
      verification: "verified",
      verifiedAt: now,
      inviteToken: randomBytes(12).toString("base64url"),
      createdBy: sarah.userId,
    })
    .returning();
  if (!structure) throw new Error("structure");
  await db
    .insert(t.structureMembers)
    .values({ structureId: structure.id, userId: sarah.userId, role: "owner", status: "active", joinedAt: now });
  console.log(
    "Casquettes : Roues Libres 66 (propriétaire Sarah_66, qui est aussi co-organisatrice de MéditeSportCar).",
  );
}
