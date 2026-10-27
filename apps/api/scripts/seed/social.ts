// Lot 17, puis lot R6b (D37, « Suivre » remplace l'amitié) : abonnements de démonstration. Kenji et Léa se suivent ;
// Nina demande à suivre Damien (son compte reste public : la demande est acceptée, comme à la migration) ; Marc a un
// compte privé (marque et modèle seulement pour ceux qui ne le suivent pas, tout pour ses abonnés : ici Julie, qu'il
// suit en retour) ; Théo a demandé à suivre Marc (demande en attente). Les retenues à venir de Kenji alimentent le
// Journal de Léa. Idempotent.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { now } from "../../src/lib/deps";
import { socialJournal } from "../../src/modules/social/journal";

const byPseudo = (pseudo: string) =>
  db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = ${pseudo.toLowerCase()}` });

async function follow(a: string, b: string, status: "accepted" | "pending") {
  const at = new Date();
  await db
    .insert(t.userFollows)
    .values({ followerId: a, followedId: b, status, createdAt: at, acceptedAt: status === "accepted" ? at : null })
    .onConflictDoNothing();
}

export async function seedSocial() {
  const [kenji, lea, damien, nina, marc, julie, theo] = await Promise.all(
    ["Kenji_66", "Lea_11", "Damien_66", "Nina_34", "Marc_66", "Julie_66", "Theo_66"].map(byPseudo),
  );
  if (!kenji || !lea || !damien || !nina || !marc || !julie) {
    console.log("Social : comptes de démonstration absents, rien ajouté.");
    return;
  }
  await db.update(t.profiles).set({ visibility: "private" }).where(eq(t.profiles.userId, marc.userId));
  await follow(kenji.userId, lea.userId, "accepted");
  await follow(lea.userId, kenji.userId, "accepted");
  await follow(julie.userId, marc.userId, "accepted");
  await follow(marc.userId, julie.userId, "accepted");
  await follow(nina.userId, damien.userId, "accepted");
  if (theo) await follow(theo.userId, marc.userId, "pending");

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
  console.log("Social : Kenji ↔ Léa, Marc (privé) ↔ Julie, Nina suit Damien, Théo demande à suivre Marc.");
}
