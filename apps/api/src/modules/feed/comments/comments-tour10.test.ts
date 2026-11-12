// Commentaires du Fil (lot R8k1, tour 10) : aucun privilège de gestion d'une page dans les gardes sans session, paramètres SQL
// sans plafond, suggestions sans racine illisible, identifiant de commentaire illisible non servi, page suspendue.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addMember, call, createStructure, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { notifications, profiles, structureMembers, structures } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { commentNotificationVerdicts } from "./batch";
import { readableBatch } from "./readers";
import { comment, dbPost, follow, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date(Date.now() + 10 * 60_000));
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
    const { coOrga, structure, priv, open, id } = await world();
    await db
      .delete(structureMembers)
      .where(and(eq(structureMembers.structureId, structure.id), eq(structureMembers.userId, coOrga.id)));
    await comment(priv, id, "Un commentaire d'un compte privé");
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(0);
    await notificationsService.deliverDue();
    expect(JSON.stringify((await call(coOrga, "GET", "/me/activity")).json)).not.toContain("Prive_66");
    expect((await call(coOrga, "GET", "/me/activity/count")).json.unseen).toBe(0);
    // Un commentaire public, lui, reste notifié (témoin).
    await comment(open, id, "Un commentaire public");
    expect(await lines(coOrga.id, "feed_comment")).toHaveLength(1);
  });

  it("un responsable actuel de la page a le même verdict qu'un lecteur sans gestion (il lit en ouvrant la publication)", async () => {
    const { owner, priv, id } = await world();
    await comment(priv, id, "Un commentaire d'un compte privé");
    expect(await lines(owner.id, "feed_comment")).toHaveLength(0);
    // Ouvrir la publication (second facteur prouvé) le montre bien au responsable.
    const list = await call(owner, "GET", `/feed-posts/${id}/comments`);
    expect(JSON.stringify(list.json)).toContain("Un commentaire d'un compte privé");
  });

  it("une page suspendue ou supprimée : aucune notification de commentaire ne part", async () => {
    const { coOrga, structure, open, id } = await world();
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structure.id));
    await comment(open, id, "Sous une page suspendue");
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
