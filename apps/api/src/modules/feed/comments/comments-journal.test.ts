// Commentaires du Fil (lot R8k1) : le Journal ne liste plus une notification de commentaire que son destinataire ne peut plus lire.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { profiles } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { comment, dbPost, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  // Les heures calmes (22 h à 8 h) ne doivent pas dépendre de l'heure réelle du test.
  quietHours(false);
  useClock(new Date(Date.now() + 10 * 60_000));
});

describe("lecture du Journal", () => {
  it("l'auteur passe privé : la réponse déjà livrée à un non-abonné n'est plus listée ni comptée", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Un commentaire de Lea");
    await comment(nina, id, "Une réponse de Nina", { parentId: top.json.id });
    await notificationsService.deliverDue();
    const before = await notificationsService.list(lea.id, 20);
    expect(before.items.map((i) => i.type)).toEqual(["feed_comment_reply"]);
    expect(await notificationsService.unreadCount(lea.id)).toBe(1);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, author.id));
    const after = await notificationsService.list(lea.id, 20);
    expect(after.items).toEqual([]);
    expect(await notificationsService.unreadCount(lea.id)).toBe(0);
    // L'auteur, lui, garde la sienne.
    expect((await notificationsService.list(author.id, 20)).items.map((i) => i.type)).toContain("feed_comment");
  });

  it("un commentaire supprimé ou un auteur suspendu : la ligne regroupée tient tant qu'un commentaire se lit", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const id = await dbPost(author);
    await comment(x, id, "Commentaire de X");
    await comment(y, id, "Commentaire de Y");
    await notificationsService.deliverDue();
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, x.id));
    expect((await notificationsService.list(author.id, 20)).items).toHaveLength(1);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, y.id));
    expect((await notificationsService.list(author.id, 20)).items).toHaveLength(0);
  });
});
