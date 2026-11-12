// Commentaires du Fil (lot R8k1, tour 9) : l'écran Activité passe par les mêmes gardes que le Journal ; les publications des
// pages (structure, fiche pro) notifient et proposent des citations.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createPro, createStructure, quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { notifications, profiles } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { comment, dbPost, follow, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  // Les heures calmes (22 h à 8 h) ne doivent pas dépendre de l'heure réelle du test.
  quietHours(false);
  useClock(new Date(Date.now() + 10 * 60_000));
});

const lines = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));

describe("écran Activité", () => {
  async function world() {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const paul = await person("Paul_34");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Un commentaire de Lea");
    await comment(nina, id, "Une réponse de Nina", { parentId: top.json.id });
    await comment(paul, id, "Une réponse de Paul", { parentId: top.json.id });
    await notificationsService.deliverDue();
    return { author, lea, nina, paul, id };
  }
  const activity = async (u: Awaited<ReturnType<typeof person>>) =>
    JSON.stringify((await call(u, "GET", "/me/activity")).json);
  const unseen = async (u: Awaited<ReturnType<typeof person>>) =>
    (await call(u, "GET", "/me/activity/count")).json.unseen;

  it("l'auteur passe privé : Lea (qui ne le suit pas) ne voit plus ni pseudo, ni extrait, ni pastille", async () => {
    const { author, lea } = await world();
    expect(await activity(lea)).toContain("Nina_34");
    expect(await unseen(lea)).toBeGreaterThan(0);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, author.id));
    const after = await activity(lea);
    expect(after).not.toContain("Nina_34");
    expect(after).not.toContain("Paul_34");
    expect(after).not.toContain("Une réponse de");
    expect(await unseen(lea)).toBe(0);
  });

  it("un acteur passé en privé n'est plus nommé, l'autre reste ; le corps cite le libellé générique si le commentaire cité est illisible", async () => {
    const { lea, nina } = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, nina.id));
    const after = await activity(lea);
    expect(after).not.toContain("Nina_34");
    expect(after).not.toContain("Une réponse de Nina");
    expect(after).toContain("Paul_34");
  });
});

describe("publications des pages", () => {
  it("publication d'une structure : commentaire, réponse et citation notifient ; les suggestions de @ fonctionnent", async () => {
    const owner = await person("Orga_66", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    await follow(lea, nina);
    const id = await dbPost(owner, { persona: "organizer", structureId: structure.id });
    const top = await comment(lea, id, "Un commentaire sous la page");
    expect(await lines(owner.id, "feed_comment")).toHaveLength(1);
    await comment(nina, id, "Réponse pour @Lea_11", { parentId: top.json.id });
    expect(await lines(lea.id, "feed_comment_mention")).toHaveLength(1);
    const suggested = await call(lea, "GET", `/feed-posts/${id}/mention-suggestions`);
    expect(suggested.json.map((s: { pseudo: string }) => s.pseudo)).toContain("Nina_34");
  });

  it("publication d'une fiche pro : mêmes notifications", async () => {
    const owner = await person("Pro_66");
    const pro = await createPro(owner.id);
    const lea = await person("Lea_11");
    const id = await dbPost(owner, { persona: "pro", proId: pro.id });
    const top = await comment(lea, id, "Un commentaire sous la fiche");
    expect(await lines(owner.id, "feed_comment")).toHaveLength(1);
    const nina = await person("Nina_34");
    await comment(nina, id, "Une réponse", { parentId: top.json.id });
    expect(await lines(lea.id, "feed_comment_reply")).toHaveLength(1);
    // La garde de lecture du Journal ne cache pas non plus ces lignes.
    expect((await notificationsService.list(lea.id, 20)).items.map((i) => i.type)).toContain("feed_comment_reply");
  });
});
