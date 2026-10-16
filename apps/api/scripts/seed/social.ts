// Lot 17 : amitiés de démonstration. Kenji et Léa sont amis ; Nina a demandé Damien en ami (demande en attente) ;
// Marc a un compte privé (marque et modèle seulement pour les inconnus, tout pour ses amis, ici Julie).
// Les retenues à venir de Kenji alimentent le Journal de Léa. Idempotent.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { now } from "../../src/lib/deps";
import { socialJournal } from "../../src/modules/social/journal";
import { socialRepo } from "../../src/modules/social/repo";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function link(a: string, b: string, status: "accepted" | "pending", message?: string) {
  if (await socialRepo.pair(a, b)) return false;
  await db.insert(t.friendships).values({
    requesterId: a,
    addresseeId: b,
    status,
    message: message ?? null,
    source: "profile",
    respondedAt: status === "accepted" ? new Date() : null,
  });
  return true;
}

export async function seedSocial() {
  const [kenji, lea, damien, nina, marc, julie] = await Promise.all(
    ["Kenji_66", "Lea_11", "Damien_66", "Nina_34", "Marc_66", "Julie_66"].map(byPseudo),
  );
  if (!kenji || !lea || !damien || !nina || !marc || !julie) {
    console.log("Social : comptes de démonstration absents, rien ajouté.");
    return;
  }
  await link(kenji.userId, lea.userId, "accepted");
  await link(marc.userId, julie.userId, "accepted");
  await link(nina.userId, damien.userId, "pending", "Salut Damien, on s'est croisés à Canet !");
  await db.update(t.profiles).set({ visibility: "private" }).where(eq(t.profiles.userId, marc.userId));
  await socialRepo.recountFriends([kenji.userId, lea.userId, marc.userId, julie.userId]);

  // Journal de Léa : « Kenji_66 va à … » pour ses retenues à venir (les crochets ne se déclenchent pas sur le seed).
  const upcoming = await db
    .select({ app: t.applications })
    .from(t.applications)
    .innerJoin(t.events, eq(t.events.id, t.applications.eventId))
    .where(
      and(
        eq(t.applications.userId, kenji.userId),
        eq(t.applications.status, "accepted"),
        eq(t.events.status, "published"),
        gt(t.events.endsAt, now()),
      ),
    );
  for (const { app } of upcoming) await db.transaction((tx) => socialJournal.friendGoingEvent(tx, app));
  console.log("Social : Kenji ↔ Léa amis, Marc (privé) ↔ Julie, demande de Nina à Damien en attente.");
}
