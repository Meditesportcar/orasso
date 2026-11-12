// Commentaires du Fil (lot R8k1, tour 9, suite) : acteurs filtrés avant la limite d'affichage ; candidats bornés par portée.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, notifications, profiles } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { readableBatch, stillReadable } from "./readers";
import { comment, dbPost, person } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
});

const makePrivate = (id: string) => db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, id));

describe("acteurs filtrés avant la limite de trois", () => {
  async function replies(count: number) {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Premier niveau");
    const people = [];
    for (let i = 1; i <= count; i++) {
      const r = await person(`Rep_${i}`);
      clock.advance(1000);
      await comment(r, id, `Réponse ${i}`, { parentId: top.json.id });
      people.push(r);
    }
    await notificationsService.deliverDue();
    return { lea, people };
  }

  it("quatre auteurs dont les trois plus récents deviennent illisibles : le seul lisible est nommé, le compte tombe à un", async () => {
    const { lea, people } = await replies(4);
    const before = (await notificationsService.list(lea.id, 20)).items[0];
    expect(before?.data).toMatchObject({ count: 4 });
    for (const p of people.slice(1)) await makePrivate(p.id);
    const after = (await notificationsService.list(lea.id, 20)).items[0];
    expect(after?.title).toBe("Rep_1 a répondu à ton commentaire");
    expect(after?.data).toMatchObject({ count: 1, actors: [{ pseudo: "Rep_1" }] });
    expect(JSON.stringify(after)).not.toMatch(/Rep_[234]/);
    const activity = JSON.stringify((await call(lea, "GET", "/me/activity")).json);
    expect(activity).toContain("Rep_1");
    expect(activity).not.toMatch(/Rep_[234]/);
  });

  it("cinq auteurs dont trois cachés : les deux lisibles sont nommés et seuls comptés", async () => {
    const { lea, people } = await replies(5);
    for (const p of people.slice(2)) await makePrivate(p.id);
    const after = (await notificationsService.list(lea.id, 20)).items[0];
    expect(after?.title).toBe("Rep_2 a répondu à ton commentaire");
    expect(after?.data).toMatchObject({ count: 2 });
    expect(JSON.stringify(after)).not.toMatch(/Rep_[345]/);
  });
});

describe("candidats bornés par portée", () => {
  it("une publication très active (plus de 2 000 commentaires) ne fait pas disparaître la ligne d'une autre", async () => {
    const author = await person("Kenji_66");
    const busy = await person("Actif_66");
    const quiet = await person("Calme_66");
    const postBusy = await dbPost(author);
    const postQuiet = await dbPost(author);
    const quietComment = await comment(quiet, postQuiet, "Le seul commentaire calme");
    const rows = Array.from({ length: 2100 }, (_, i) => ({
      postId: postBusy,
      authorId: busy.id,
      text: `Bruit ${i}`,
      clientId: randomUUID(),
      createdAt: new Date(Date.now() + 60_000 + i),
    }));
    for (let i = 0; i < rows.length; i += 500) await db.insert(feedPostComments).values(rows.slice(i, i + 500));
    const [lastBusy] = await db
      .select({ id: feedPostComments.id })
      .from(feedPostComments)
      .where(eq(feedPostComments.authorId, busy.id))
      .limit(1);
    // Une ligne par publication pour l'auteur, insérée directement.
    for (const [post, who, cid] of [
      [postBusy, busy, lastBusy?.id],
      [postQuiet, quiet, quietComment.json.id],
    ] as const) {
      await db.insert(notifications).values({
        userId: author.id,
        type: "feed_comment",
        family: "social",
        title: `${who.pseudo} a commenté ta publication`,
        body: "x",
        deliverAfter: new Date(),
        deliveredAt: new Date(),
        groupKey: `feed_comment:${post}`,
        data: {
          postId: post,
          commentId: cid,
          link: "/app/fil",
          _actorIds: [who.id],
          actors: [{ pseudo: who.pseudo, avatarUrl: null }],
          count: 1,
          _text: { title: "{name} a commenté ta publication", body: "x" },
        },
      });
    }
    // Rend la lisibilité de la ligne calme dépendante des candidats : son commentaire direct devient illisible.
    await db
      .update(feedPostComments)
      .set({ deletedAt: new Date() })
      .where(eq(feedPostComments.id, quietComment.json.id));
    const second = await comment(quiet, postQuiet, "Un autre commentaire calme");
    const items = (await notificationsService.list(author.id, 20)).items;
    expect([...new Set(items.map((i) => i.title))].sort()).toEqual([
      "Actif_66 a commenté ta publication",
      "Calme_66 a commenté ta publication",
    ]);
    // Équivalence avec la version ligne par ligne sur les commentaires restants.
    const ids = [second.json.id, quietComment.json.id, lastBusy?.id ?? ""];
    const batch = await readableBatch(db, author.id, ids);
    for (const id of ids) expect(batch.readable.has(id)).toBe(await stillReadable(db, author.id, id));
  });
});
