// Commentaires du Fil (lot R8k1, tour 6) : lisibilité examinée avant de retenir un commentaire par auteur ; recomposition de
// la ligne sous le verrou du regroupement.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, feedPosts, notifications, profiles } from "../../../db/schema";
import { withTx } from "../../../lib/tx";
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

describe("lisibilité avant la retenue par auteur", () => {
  it("X commente au premier niveau puis répond à Z suspendu : le premier commentaire de X, lisible, maintient la ligne", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const z = await person("Zoe_66");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    const first = await comment(x, id, "Premier commentaire de X");
    clock.advance(1000);
    const zTop = await comment(z, id, "Commentaire de Zoe");
    clock.advance(1000);
    await comment(x, id, "X répond à Zoe", { parentId: zTop.json.id });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date("2026-07-15T00:00:00Z") })
      .where(eq(profiles.userId, z.id));
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    const [line] = await lines(author.id, "feed_comment");
    expect(line).toBeDefined();
    expect(line?.title).toBe("Xavier_66 a commenté ta publication");
    expect(line?.data).toMatchObject({ commentId: first.json.id, count: 1 });
    expect(JSON.stringify(line)).not.toContain("Zoe_66");
  });
});

describe("recomposition sous le verrou du regroupement", () => {
  it("un commentaire regroupé entre la réservation et la garde n'est pas effacé", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    await comment(x, id, "Commentaire de X");
    const yRow = (
      await db
        .insert(feedPostComments)
        .values({ postId: id, authorId: y.id, text: "Commentaire de Y", clientId: randomUUID(), createdAt: new Date() })
        .returning({ id: feedPostComments.id })
    )[0];
    clock.set(new Date("2026-06-16T08:30:00Z"));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked: () => void = () => {};
    const hasPost = new Promise<void>((r) => {
      locked = r;
    });
    // Le regroupement d'un nouveau commentaire : la publication, une pause, puis la ligne de l'auteur de la publication.
    const writer = withTx(async (tx) => {
      await tx.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.id, id)).for("update");
      locked();
      await gate;
      await notificationsService.notify(tx, author.id, "feed_comment", {
        title: "{name} a commenté ta publication",
        body: "{name} a commenté ta publication.",
        data: { postId: id, commentId: yRow?.id, link: "/app/fil" },
        groupKey: `feed_comment:${id}`,
        actor: { userId: y.id, pseudo: "Yann_66", avatarUrl: null },
      });
    });
    await hasPost;
    const delivery = notificationsService.deliverDue();
    await new Promise((r) => setTimeout(r, 700));
    release();
    await Promise.all([writer, delivery]);
    const [line] = await lines(author.id, "feed_comment");
    expect(line?.data).toMatchObject({ count: 2, commentId: yRow?.id });
    expect(JSON.stringify(line?.data)).toContain(y.id);
    expect(JSON.stringify(line?.data)).toContain(x.id);
    expect(line?.title).toBe("Yann_66 a commenté ta publication");
  });
});
