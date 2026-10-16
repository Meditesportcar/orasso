// Lot 15 : compte et sécurité. Un compte dont l'adresse n'est pas encore confirmée (bandeau « Vérifie ton e-mail »)
// et un parrainage confirmé (Kenji a invité Léa : +10 points, entrée `referral`). Idempotent.
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { pointsService } from "../../src/modules/points/service";
import { createAccount } from "./helpers";

export async function seedSecurity(hash: string) {
  const existing = await db.query.user.findFirst({ where: eq(t.user.email, "noe@orasso.local") });
  if (!existing) {
    const noe = await createAccount(hash, {
      pseudo: "Noe_34",
      email: "noe@orasso.local",
      firstName: "Noé",
      lastName: "Garcia",
      departments: ["34"],
    });
    await db.update(t.user).set({ emailVerified: false }).where(eq(t.user.id, noe.id));
  }

  const kenji = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = 'kenji_66'` });
  const lea = await db.query.user.findFirst({ where: eq(t.user.email, "lea@orasso.local") });
  if (kenji && lea) {
    await db
      .update(t.profiles)
      .set({ invitedByUserId: kenji.userId })
      .where(sql`${t.profiles.userId} = ${lea.id} and ${t.profiles.invitedByUserId} is null`);
    await pointsService.awardReferral(kenji.userId, lea.id);
  }
  console.log("Sécurité : compte à confirmer (noe@orasso.local), parrainage Kenji → Léa.");
}
