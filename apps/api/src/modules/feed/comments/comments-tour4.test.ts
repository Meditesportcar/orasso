// Commentaires du Fil (lot R8k1, tour 4) : une ligne regroupée différée est recomposée entièrement à la livraison.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { notifications, profiles } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { comment, dbPost, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
});

const lines = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));

describe("ligne regroupée recomposée à la livraison", () => {
  it("X est suspendu pendant les heures calmes, Y commente ensuite : la ligne part au nom de Y seul, sans le texte de X", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    await comment(x, id, "Un texte injurieux de X");
    clock.advance(1000);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date("2026-07-15T00:00:00Z") })
      .where(eq(profiles.userId, x.id));
    await comment(y, id, "Un commentaire correct de Y");
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    const [line] = await lines(author.id, "feed_comment");
    expect(line?.deliveredAt).not.toBeNull();
    expect(line?.title).toBe("Yann_66 a commenté ta publication");
    expect(line?.body).toContain("Un commentaire correct de Y");
    expect(JSON.stringify(line)).not.toContain("Xavier_66");
    expect(JSON.stringify(line)).not.toContain("injurieux");
    expect(line?.data).toMatchObject({ count: 1 });
  });

  it("X passe en privé : sa réponse n'est plus lisible du destinataire, la ligne part au nom de Y seul", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    const top = await comment(lea, id, "Premier niveau");
    await comment(x, id, "Une réponse de X", { parentId: top.json.id });
    clock.advance(1000);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, x.id));
    await comment(y, id, "Une réponse de Y", { parentId: top.json.id });
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    const [line] = await lines(lea.id, "feed_comment_reply");
    expect(line?.title).toBe("Yann_66 a répondu à ton commentaire");
    expect(JSON.stringify(line)).not.toContain("Xavier_66");
    expect(JSON.stringify(line)).not.toContain("Une réponse de X");
    expect(line?.data).toMatchObject({ count: 1 });
  });

  it("aucun commentaire lisible ne reste : la ligne est supprimée", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    await comment(x, id, "Seul commentaire");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date("2026-07-15T00:00:00Z") })
      .where(eq(profiles.userId, x.id));
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    expect(await lines(author.id, "feed_comment")).toHaveLength(0);
  });
});
