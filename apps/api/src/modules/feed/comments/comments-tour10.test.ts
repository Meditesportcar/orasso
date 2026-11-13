// Commentaires du Fil (lot R8k1, tour 10) : aucun privilège de gestion d'une page dans les gardes sans session, paramètres SQL
// sans plafond, suggestions sans racine illisible, identifiant de commentaire illisible non servi, page suspendue.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addMember, call, createStructure, quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { notifications, profiles, structureMembers, structures } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { commentNotificationVerdicts } from "./batch";
import { readableBatch } from "./readers";
import { comment, dbPost, follow, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  quietHours(false);
});

const lines = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));

describe("publication de page : aucun privilège de gestion dans les gardes de notification", () => {
  async function world() {
    const owner = await person("Orga_66", { twoFactor: true });
    const coOrga = await person("CoOrga_66", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await addMember(structure.id, coOrga.id, "co_organizer");
    const priv = await person("Prive_66", { visibility: "private" });
    const open = await person("Public_66");
    // Publiée par le co-organisateur (author_id) au nom de la structure.
    const id = await dbPost(coOrga, { persona: "organizer", structureId: structure.id });
    return { owner, coOrga, structure, priv, open, id };
  }

  it("un co-organisateur retiré de la structure ne reçoit ni notification, ni ligne d'Activité, ni pastille pour un commentaire privé", async () => {
    const { owner, coOrga, structure, priv, open, id } = await world();
    await db
      .delete(structureMembers)
      .where(and(eq(structureMembers.structureId, structure.id), eq(structureMembers.userId, coOrga.id)));
    await comment(priv, id, "Un commentaire d'un compte privé");
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(0);
    // Lot R9d : l'intention du volet est gardée pour un responsable actuel (le propriétaire ne lit pas ce commentaire privé).
    expect(await lines(owner.id, "feed_comment")).toHaveLength(0);
    await notificationsService.deliverDue();
    expect(JSON.stringify((await call(coOrga, "GET", "/me/activity")).json)).not.toContain("Prive_66");
    expect((await call(coOrga, "GET", "/me/activity/count")).json.unseen).toBe(0);
    // Un commentaire public, lui, reste notifié (témoin). Lot R9d : une publication de structure prévient ses responsables
    // d'aujourd'hui (le propriétaire), non plus la personne qui l'a publiée ; l'ancien co-organisateur n'en reçoit plus.
    await comment(open, id, "Un commentaire public");
    expect(await lines(owner.id, "feed_comment")).toHaveLength(1);
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(0);
  });

  it("un responsable actuel de la page a le même verdict qu'un lecteur sans gestion (il lit en ouvrant la publication)", async () => {
    // Le responsable actuel est ici celui qui a publié (le destinataire des notifications) : `coOrga`, second facteur prouvé.
    const { coOrga, priv, id } = await world();
    await comment(priv, id, "Un commentaire d'un compte privé");
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(0);
    // Ouvrir la publication (second facteur prouvé) le montre bien au responsable.
    const list = await call(coOrga, "GET", `/feed-posts/${id}/comments`);
    expect(JSON.stringify(list.json)).toContain("Un commentaire d'un compte privé");
  });

  it("une page suspendue après le commentaire : la notification différée ne part pas", async () => {
    const { coOrga, structure, open, id } = await world();
    clock.set(new Date("2026-06-15T21:00:00Z")); // 23 h à Paris : heures calmes, la notification attend le matin
    quietHours(true);
    await comment(open, id, "Avant la suspension de la page");
    const [pending] = await lines(coOrga.id, "feed_comment");
    expect(pending?.deliveredAt).toBeNull();
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structure.id));
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(0);
  });
});

describe("paramètres SQL sans plafond", () => {
  it("plus de 65 535 identifiants : la lecture en lot répond, sans erreur", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const fake = Array.from({ length: 70_000 }, () => randomUUID());
    const batch = await readableBatch(db, lea.id, fake);
    expect(batch.readable.size).toBe(0);
    const id = await dbPost(author);
    const c = await comment(lea, id, "Un commentaire");
    const big = Array.from({ length: 70_000 }, (_, i) => `u${i}`);
    const row = {
      id: randomUUID(),
      userId: author.id,
      type: "feed_comment",
      data: { postId: id, commentId: c.json.id, _actorIds: [lea.id, ...big] },
    } as unknown as typeof notifications.$inferSelect;
    const verdicts = await commentNotificationVerdicts(author.id, [row]);
    expect(verdicts.get(row.id)?.shown).toBe(true);
  });
});

describe("suggestions « discussion »", () => {
  it("l'auteur d'une réponse sous une racine devenue privée (non suivie) n'est pas proposé", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const paul = await person("Paul_34");
    const reader = await person("Lecteur_66");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Une racine");
    await comment(paul, id, "Une réponse publique", { parentId: top.json.id });
    const pseudos = async () =>
      ((await call(reader, "GET", `/feed-posts/${id}/mention-suggestions`)).json as { pseudo: string }[]).map(
        (s) => s.pseudo,
      );
    expect(await pseudos()).toContain("Paul_34");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, lea.id));
    expect(await pseudos()).not.toContain("Paul_34");
    // Suivre l'auteur de la racine la rend lisible : la réponse compte de nouveau.
    await follow(reader, lea);
    expect(await pseudos()).toContain("Paul_34");
  });
});

describe("identifiant du commentaire illisible", () => {
  it("n'est servi ni par le Journal, ni par l'Activité : remplacé par un commentaire lisible de la ligne", async () => {
    const author = await person("Kenji_66");
    const r = await person("Racine_66");
    const x = await person("Xavier_66");
    const id = await dbPost(author);
    await comment(x, id, "Un ancien commentaire de X");
    await notificationsService.deliverDue();
    await notificationsService.markRead(author.id, "all");
    const root = await comment(r, id, "Racine");
    await notificationsService.markRead(author.id, "all");
    const sensitive = await comment(x, id, "Réponse sensible de X", { parentId: root.json.id });
    await notificationsService.deliverDue();
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, r.id));
    const journal = JSON.stringify((await notificationsService.list(author.id, 20)).items);
    const activity = JSON.stringify((await call(author, "GET", "/me/activity")).json);
    expect(journal).toContain("Xavier_66");
    expect(activity).toContain("Xavier_66");
    expect(journal).not.toContain(sensitive.json.id);
    expect(activity).not.toContain(sensitive.json.id);
  });
});
