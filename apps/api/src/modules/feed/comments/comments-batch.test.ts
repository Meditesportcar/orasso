// Commentaires du Fil (lot R8k1, tour 7) : lecture du Journal et de la pastille en lot (nombre de requêtes fixe), équivalence avec
// `stillReadable`, pastille sans double retrait, acteurs illisibles non nommés.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, feedPosts, notifications, profiles } from "../../../db/schema";
import { notificationsService } from "../../notifications/service";
import { readableBatch } from "./batch";
import { stillReadable } from "./readers";
import { comment, dbPost, follow, person, type TestUser } from "./testkit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date(Date.now() + 10 * 60_000));
});

/** Compte les requêtes envoyées à la base pendant `fn`. */
async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  const spy = vi.spyOn(pool, "query");
  try {
    const result = await fn();
    return { result, queries: spy.mock.calls.length };
  } finally {
    spy.mockRestore();
  }
}

describe("équivalence avec stillReadable", () => {
  it("pour chaque cas (compte privé, suspendu, supprimé, racine cachée, publication privée), le lot donne le même verdict", async () => {
    const author = await person("Kenji_66");
    const pub = await person("Public_66");
    const priv = await person("Prive_66", { visibility: "private" });
    const sus = await person("Suspendu_66");
    const follower = await person("Suiveur_66");
    const stranger = await person("Inconnu_66");
    const gone = await person("Parti_66");
    await follow(follower, priv);
    const privPost = await person("Marc_66", { visibility: "private" });
    await follow(follower, privPost);
    const id = await dbPost(author);
    const idPrivate = await dbPost(privPost);
    const ids: string[] = [];
    const add = async (u: TestUser, post: string, text: string, parentId?: string) => {
      const res = await comment(u, post, text, parentId ? { parentId } : {});
      ids.push(res.json.id);
      return res.json.id as string;
    };
    const a = await add(pub, id, "public");
    const b = await add(priv, id, "privé");
    const c = await add(sus, id, "suspendu");
    const d = await add(gone, id, "supprimé");
    await add(pub, id, "réponse sous privé", b);
    await add(priv, id, "réponse privée sous public", a);
    await add(pub, id, "réponse sous suspendu", c);
    await add(follower, idPrivate, "sur publication privée");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, sus.id));
    await db.update(feedPostComments).set({ deletedAt: new Date() }).where(eq(feedPostComments.id, d));
    // Publication retirée, auteur de la publication suspendu, racine supprimée sous une réponse restée vivante, compte supprimé.
    const removedPost = await dbPost(author);
    await add(pub, removedPost, "sous une publication retirée");
    await db.update(feedPosts).set({ deletedAt: new Date() }).where(eq(feedPosts.id, removedPost));
    const suspendedAuthor = await person("AuteurSuspendu_66");
    const postOfSuspended = await dbPost(suspendedAuthor);
    await add(pub, postOfSuspended, "sous l'auteur suspendu");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, suspendedAuthor.id));
    const root = await add(pub, id, "racine bientôt supprimée");
    await add(follower, id, "réponse restée vivante", root);
    await db.update(feedPostComments).set({ deletedAt: new Date() }).where(eq(feedPostComments.id, root));
    const erased = await person("Efface_66");
    await add(erased, id, "d'un compte supprimé");
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, erased.id));
    ids.push(randomUUID());
    for (const viewer of [author, pub, priv, follower, stranger, privPost, sus, gone, suspendedAuthor, erased]) {
      const batch = await readableBatch(db, viewer.id, ids);
      for (const commentId of ids) {
        const one = await stillReadable(db, viewer.id, commentId);
        expect([viewer.pseudo, commentId, batch.readable.has(commentId)]).toEqual([viewer.pseudo, commentId, one]);
      }
    }
  });
});

describe("coût du Journal et de la pastille", () => {
  it("100 lignes non lues : un nombre de requêtes fixe, bien en dessous d'une centaine, pour la page et pour la pastille", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const commentIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const post = await dbPost(author);
      const [row] = await db
        .insert(feedPostComments)
        .values({ postId: post, authorId: lea.id, text: `Commentaire ${i}`, clientId: randomUUID() })
        .returning({ id: feedPostComments.id });
      commentIds.push(row?.id ?? "");
      await db.insert(notifications).values({
        userId: author.id,
        type: "feed_comment",
        family: "social",
        title: "Lea_11 a commenté ta publication",
        body: "« x »",
        deliverAfter: new Date(),
        deliveredAt: new Date(),
        groupKey: `feed_comment:${post}`,
        data: {
          postId: post,
          commentId: row?.id,
          link: "/app/fil",
          _actorIds: [lea.id],
          actors: [{ pseudo: "Lea_11", avatarUrl: null }],
          count: 1,
          _text: { title: "{name} a commenté ta publication", body: "« x »" },
        },
      });
    }
    const page = await countQueries(() => notificationsService.list(author.id, 100));
    expect(page.result.items).toHaveLength(100);
    const badge = await countQueries(() => notificationsService.unreadCount(author.id));
    expect(badge.result).toBe(100);
    const old = await countQueries(async () => {
      for (const id of commentIds) await stillReadable(db, author.id, id);
    });
    // La garde ligne par ligne coûtait de l'ordre de sept requêtes par ligne.
    expect(old.queries).toBeGreaterThan(page.queries * 10);
    // Avant le lot : ~7 requêtes par ligne (plusieurs centaines). Maintenant : un petit nombre fixe.
    expect(page.queries).toBeLessThan(30);
    expect(badge.queries).toBeLessThan(30);
    // Le nombre ne dépend pas du nombre de lignes : 10 lignes coûtent autant.
    const few = await countQueries(() => notificationsService.list(author.id, 10));
    expect(Math.abs(few.queries - page.queries)).toBeLessThanOrEqual(2);
    expect(commentIds).toHaveLength(100);
  });
});

describe("corps de la ligne", () => {
  it("le commentaire cité ne se lit plus (racine suspendue) alors qu'un autre de la personne se lit : le libellé générique remplace l'extrait", async () => {
    const author = await person("Kenji_66");
    const r = await person("Racine_66");
    const x = await person("Xavier_66");
    const id = await dbPost(author);
    await comment(x, id, "Un ancien commentaire de X");
    await notificationsService.deliverDue();
    await notificationsService.markRead(author.id, "all");
    const root = await comment(r, id, "Racine");
    await notificationsService.markRead(author.id, "all");
    await comment(x, id, "Réponse sensible de X", { parentId: root.json.id });
    await notificationsService.deliverDue();
    const before = (await notificationsService.list(author.id, 20)).items;
    expect(before.map((i) => i.body).join("|")).toContain("Réponse sensible de X");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, r.id));
    const after = (await notificationsService.list(author.id, 20)).items;
    expect(after.map((i) => i.body)).toContain("Xavier_66 a commenté ta publication.");
    expect(JSON.stringify(after)).not.toContain("Réponse sensible");
  });
});

describe("pastille et acteurs", () => {
  it("une ligne exclue deux fois (acteur suspendu et commentaire illisible) n'est retirée qu'une fois de la pastille", async () => {
    const author = await person("Kenji_66");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const p1 = await dbPost(author);
    const p2 = await dbPost(author);
    await comment(x, p1, "Commentaire de X");
    await comment(y, p2, "Commentaire de Y");
    await notificationsService.deliverDue();
    expect(await notificationsService.unreadCount(author.id)).toBe(2);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, x.id));
    // La ligne de X est exclue par `citedPeopleRemain` ET masquée par la garde : une seule fois retirée.
    expect(await notificationsService.unreadCount(author.id)).toBe(1);
    expect((await notificationsService.list(author.id, 20)).items).toHaveLength(1);
  });

  it("un acteur passé en privé que le destinataire ne suit pas n'est ni nommé ni montré tant qu'un autre commentaire se lit", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const x = await person("Xavier_66");
    const y = await person("Yann_66");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Premier niveau");
    await comment(x, id, "Réponse de X", { parentId: top.json.id });
    await comment(y, id, "Réponse de Y", { parentId: top.json.id });
    await notificationsService.deliverDue();
    const before = (await notificationsService.list(lea.id, 20)).items[0];
    if (!before) throw new Error("aucune ligne dans le Journal");
    expect((before.data as { actors: { pseudo: string }[] }).actors.map((a) => a.pseudo).sort()).toEqual([
      "Xavier_66",
      "Yann_66",
    ]);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, x.id));
    const after = (await notificationsService.list(lea.id, 20)).items[0];
    expect(JSON.stringify(after)).not.toContain("Xavier_66");
    expect(after?.title).toBe("Yann_66 a répondu à ton commentaire");
    expect(after?.data).toMatchObject({ count: 1 });
  });
});
