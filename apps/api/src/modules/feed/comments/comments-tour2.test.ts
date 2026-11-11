// Commentaires du Fil (lot R8k1, tour 2) : notifications seulement à qui lit encore, mentions identiques pour tous, garde de
// livraison, notifications retirées avec les commentaires, preuves d'un signalement, ordre des verrous.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, feedPosts, notifications, profiles, reports, userFollows } from "../../../db/schema";
import { withTx } from "../../../lib/tx";
import { accountService } from "../../account/service";
import { notificationsService } from "../../notifications/service";
import { anonymizeFeedCommentsForDeletedAccount } from "./anonymize";
import { comment, dbPost, follow, listReplies, person, texts } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
});

const notifs = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));
const makePrivate = (id: string) => db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, id));
const unfollow = (a: { id: string }, b: { id: string }) =>
  db.delete(userFollows).where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));

describe("notifications seulement à qui lit encore", () => {
  it("l'auteur passe privé et retire B : ni la réponse à B, ni la flamme sur B ne le préviennent", async () => {
    const a = await person("Auteur_66");
    const b = await person("Beta_66");
    const c = await person("Gamma_66");
    const id = await dbPost(a);
    await follow(b, a);
    await follow(c, a);
    const cb = await comment(b, id, "Commentaire de B");
    await makePrivate(a.id);
    await unfollow(b, a);
    // C (abonné) répond à B et met une flamme : B ne voit plus la publication, il ne reçoit rien.
    expect((await comment(c, id, "Réponse à B", { parentId: cb.json.id })).status).toBe(201);
    expect((await call(c, "PUT", `/feed-comments/${cb.json.id}/reaction`)).status).toBe(200);
    expect(await notifs(b.id, "feed_comment_reply")).toHaveLength(0);
    expect(await notifs(b.id, "feed_comment_like")).toHaveLength(0);
    // Témoin : un abonné qui lit encore est prévenu.
    await follow(b, a);
    await comment(c, id, "Seconde réponse", { parentId: cb.json.id });
    expect(await notifs(b.id, "feed_comment_reply")).toHaveLength(1);
  });

  it("une citation ne part pas vers un compte qui ne voit pas la publication, mais la liste rendue est la même", async () => {
    const priv = await person("Marc_66", { visibility: "private" });
    const friend = await person("Ami_66");
    const stranger = await person("Inconnu_66");
    const lea = await person("Lea_11");
    await follow(friend, priv);
    await follow(lea, priv);
    const id = await dbPost(priv);
    const one = await comment(lea, id, "Pour @Ami_66");
    tickClock();
    const two = await comment(lea, id, "Pour @Inconnu_66");
    expect(one.json.mentions).toEqual(["Ami_66"]);
    expect(two.json.mentions).toEqual(["Inconnu_66"]);
    expect(await notifs(friend.id, "feed_comment_mention")).toHaveLength(1);
    expect(await notifs(stranger.id, "feed_comment_mention")).toHaveLength(0);
  });
});

const tickClock = () => clock.advance(1000);

describe("garde de livraison", () => {
  it("une citation différée (heures calmes) ne part pas si le destinataire a perdu l'accès avant l'envoi", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    await follow(nina, author);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, author.id));
    await follow(lea, author);
    clock.set(new Date("2026-06-15T21:00:00Z")); // 23 h à Paris : heures calmes
    quietHours(true);
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    await comment(lea, id, "Pour @Nina_34");
    await notificationsService.flush();
    const [pending] = await notifs(nina.id, "feed_comment_mention");
    expect(pending?.deliveredAt).toBeNull();
    // Nina perd l'accès à la publication pendant la nuit, puis le matin arrive.
    await unfollow(nina, author);
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    expect(await notifs(nina.id, "feed_comment_mention")).toHaveLength(0);
  });

  it("un commentaire retiré entre la création et l'envoi : la notification est supprimée", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(author, { createdAt: new Date("2026-06-15T20:00:00Z") });
    clock.set(new Date("2026-06-15T21:00:00Z"));
    quietHours(true);
    const c = await comment(lea, id, "Bientôt retiré");
    expect(await notifs(author.id, "feed_comment")).toHaveLength(1);
    // Retrait direct en base (la modération et la suppression passent par `softDeleteComment`, testé plus bas).
    await db.update(feedPostComments).set({ deletedAt: new Date() }).where(eq(feedPostComments.id, c.json.id));
    clock.set(new Date("2026-06-16T08:30:00Z"));
    await notificationsService.deliverDue();
    expect(await notifs(author.id, "feed_comment")).toHaveLength(0);
  });
});

describe("notifications retirées avec les commentaires", () => {
  async function group() {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(author);
    const a = await comment(lea, id, "Premier de Lea");
    const b = await comment(nina, id, "Second de Nina");
    return { author, lea, nina, id, a, b };
  }

  it("plusieurs acteurs : le corps n'a pas d'extrait ; la suppression ou la suspension de l'un ne laisse pas son texte", async () => {
    const { author, nina, a, b } = await group();
    const [line] = await notifs(author.id, "feed_comment");
    expect(line?.body).toBe("Nina_34 a commenté ta publication.");
    expect(JSON.stringify(line?.data)).not.toContain("Second de Nina");
    // Nina supprime son commentaire : la ligne regroupée reste (Lea y est encore), sans texte de Nina.
    expect((await call(nina, "DELETE", `/feed-comments/${b.json.id}`)).status).toBe(204);
    const after = await notifs(author.id, "feed_comment");
    expect(after).toHaveLength(1);
    expect(JSON.stringify(after[0])).not.toContain("Second de Nina");
    expect(a.status).toBe(201);
  });

  it("un commentaire seul retiré (auteur, modération) : sa notification disparaît ; ses réponses et leurs notifications aussi", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(author);
    const top = await comment(lea, id, "Un commentaire");
    await comment(nina, id, "Une réponse", { parentId: top.json.id });
    await call(nina, "PUT", `/feed-comments/${top.json.id}/reaction`);
    expect(await notifs(lea.id, "feed_comment_reply")).toHaveLength(1);
    expect(await notifs(lea.id, "feed_comment_like")).toHaveLength(1);
    expect((await call(lea, "DELETE", `/feed-comments/${top.json.id}`)).status).toBe(204);
    expect(await notifs(lea.id, "feed_comment_reply")).toHaveLength(0);
    expect(await notifs(lea.id, "feed_comment_like")).toHaveLength(0);
    expect(await notifs(author.id, "feed_comment")).toHaveLength(0);
  });

  it("compte supprimé : les notifications de ses commentaires et de ses flammes partent", async () => {
    const author = await person("Kenji_66");
    const leaving = await person("Part_Compte");
    const nina = await person("Nina_34");
    const id = await dbPost(author);
    const mine = await comment(leaving, id, "Je pars");
    await call(nina, "PUT", `/feed-comments/${mine.json.id}/reaction`);
    await comment(nina, id, "Réponse à celui qui part", { parentId: mine.json.id });
    expect(await notifs(author.id, "feed_comment")).not.toHaveLength(0);
    await accountService.anonymize(leaving.id, null);
    expect(await notifs(author.id, "feed_comment")).toHaveLength(0);
    expect(await notifs(leaving.id, "feed_comment_reply")).toHaveLength(0);
  });
});

describe("preuves d'un signalement", () => {
  it("compte supprimé pendant une instruction : le commentaire signalé et son premier niveau restent cachés, puis partent à la décision", async () => {
    const author = await person("Kenji_66");
    const leaving = await person("Part_Compte");
    const nina = await person("Nina_34");
    const id = await dbPost(author);
    const top = await comment(leaving, id, "Premier niveau qui part");
    const reply = await comment(nina, id, "Une réponse insultante", { parentId: top.json.id });
    const report = await call(author, "POST", `/feed-comments/${reply.json.id}/report`, { reason: "insult" });
    expect(report.status).toBe(201);
    await accountService.anonymize(leaving.id, null);
    // Cachés des lecteurs, mais la ligne et le texte restent pour la modération.
    expect(texts((await call(author, "GET", `/feed-posts/${id}/comments`)).json.items)).toEqual([]);
    const kept = await db.select().from(feedPostComments);
    expect(kept.map((c) => c.text).sort()).toEqual(["Premier niveau qui part", "Une réponse insultante"]);
    expect(kept.every((c) => c.deletedAt !== null)).toBe(true);
    const admin = await person("Mod_Admin", { twoFactor: true });
    await db.update(profiles).set({ platformRole: "super_admin" }).where(eq(profiles.userId, admin.id));
    const detail = await call(admin, "GET", `/admin/reports/${report.json.id}`);
    expect(JSON.stringify(detail.json)).toContain("Une réponse insultante");
    // La décision close le dossier : les lignes gardées partent.
    const [filed] = await db.select().from(reports);
    const done = await call(admin, "POST", `/admin/reports/${filed?.id}/status`, {
      status: "resolved_no_action",
      note: null,
    });
    expect(done.status).toBe(200);
    expect(await db.select().from(feedPostComments)).toHaveLength(0);
  });

  it("sans signalement, tout part tout de suite", async () => {
    const author = await person("Kenji_66");
    const leaving = await person("Part_Compte");
    const id = await dbPost(author);
    await comment(leaving, id, "Rien à garder");
    await accountService.anonymize(leaving.id, null);
    expect(await db.select().from(feedPostComments)).toHaveLength(0);
  });
});

describe("ordre des verrous : anonymisation et commentaires simultanés", () => {
  it("créer des commentaires pendant qu'un compte est supprimé : jamais d'interblocage, compteurs exacts", async () => {
    const author = await person("Kenji_66");
    const leaving = await person("Part_Compte");
    const people = await Promise.all(Array.from({ length: 6 }, (_, i) => person(`Foule_${i}`)));
    const id = await dbPost(author);
    for (let i = 0; i < 3; i++) await comment(leaving, id, `Avant ${i}`);
    const results = await Promise.all(
      [
        ...people.map((p, i) => comment(p, id, `Pendant ${i}`)),
        withTx((tx) => anonymizeFeedCommentsForDeletedAccount(tx, leaving.id)).then(() => ({ status: 201 })),
        accountService.anonymize(leaving.id, null).then(() => ({ status: 201 })),
      ].map((p) => p.catch((error: unknown) => ({ status: 500, error }))),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, id));
    expect(row?.commentsCount).toBe(6);
  });
});

describe("droits et lecture", () => {
  it("une réponse sous le commentaire d'un compte privé que je ne suis pas n'est ni aimable, ni signalable, ni source de citation", async () => {
    const author = await person("Kenji_66");
    const priv = await person("Lea_11", { visibility: "private" });
    const follower = await person("Suiveur_66");
    const member = await person("Membre_66");
    await follow(follower, priv);
    const id = await dbPost(author);
    const top = await comment(priv, id, "Compte privé");
    const reply = await comment(follower, id, "Réponse publique d'un abonné", { parentId: top.json.id });
    expect(reply.status).toBe(201);
    expect((await call(member, "PUT", `/feed-comments/${reply.json.id}/reaction`)).status).toBe(404);
    expect((await call(member, "POST", `/feed-comments/${reply.json.id}/report`, { reason: "spam" })).status).toBe(404);
    expect((await comment(member, id, "Je réponds à la réponse", { parentId: reply.json.id })).status).toBe(404);
    expect((await listReplies(member, top.json.id)).status).toBe(404);
  });

  it("qui perd l'accès à une publication supprime encore son commentaire et retire sa flamme, sans rien lire d'autre", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    await follow(lea, author);
    await follow(nina, author);
    const id = await dbPost(author);
    const mine = await comment(lea, id, "Le mien");
    const theirs = await comment(nina, id, "Celui de Nina");
    await call(lea, "PUT", `/feed-comments/${theirs.json.id}/reaction`);
    await makePrivate(author.id);
    await unfollow(lea, author);
    expect((await call(lea, "GET", `/feed-posts/${id}/comments`)).status).toBe(404);
    expect((await call(lea, "PUT", `/feed-comments/${theirs.json.id}/reaction`)).status).toBe(404);
    expect(await call(lea, "DELETE", `/feed-comments/${theirs.json.id}/reaction`)).toMatchObject({ status: 200 });
    // Sans flamme à retirer, rien n'est révélé.
    expect((await call(lea, "DELETE", `/feed-comments/${theirs.json.id}/reaction`)).status).toBe(404);
    expect((await call(lea, "DELETE", `/feed-comments/${theirs.json.id}`)).status).toBe(404);
    expect((await call(lea, "DELETE", `/feed-comments/${mine.json.id}`)).status).toBe(204);
  });

  it("le signalement refuse un champ inconnu", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(author);
    const c = await comment(author, id, "Un commentaire");
    const res = await call(lea, "POST", `/feed-comments/${c.json.id}/report`, {
      reason: "spam",
      targetId: randomUUID(),
    });
    expect(res.status).toBe(400);
  });
});
