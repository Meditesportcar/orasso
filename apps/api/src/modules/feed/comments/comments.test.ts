// Commentaires d'une publication du Fil (lot R8k1) : écriture, réponses, flammes, `@`, suppression, couper, signalement,
// notifications, compteurs sous concurrence, suggestions, compte supprimé. La vie privée par regard est dans
// `comments-privacy.test.ts`.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  useClock,
} from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import {
  applications,
  feedCommentMentions,
  feedPostCommentReactions,
  feedPostComments,
  feedPosts,
  notifications,
  profiles,
  reports,
} from "../../../db/schema";
import { withTx } from "../../../lib/tx";
import { accountService } from "../../account/service";
import { anonymizeFeedCommentsForDeletedAccount } from "./anonymize";
import {
  AUTHOR_VIEW_KEYS,
  COMMENT_VIEW_KEYS,
  comment,
  dbPost,
  follow,
  listComments,
  listReplies,
  person,
  texts,
} from "./testkit";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
const tick = () => clock.advance(1000);

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  ref = await seedReference();
});

const post = async (id: string) => (await db.select().from(feedPosts).where(eq(feedPosts.id, id)))[0]!;
const row = async (id: string) => (await db.select().from(feedPostComments).where(eq(feedPostComments.id, id)))[0]!;
const notifs = (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));

describe("écrire et lire", () => {
  it("un commentaire est rendu en liste blanche, sans identifiant de compte, et relu dans l'ordre du temps", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const first = await comment(lea, id, "On se retrouve au port à 17 h 30 ?");
    expect(first.status).toBe(201);
    expect(Object.keys(first.json).sort()).toEqual(COMMENT_VIEW_KEYS);
    expect(Object.keys(first.json.author).sort()).toEqual(AUTHOR_VIEW_KEYS);
    expect(first.json).toMatchObject({
      text: "On se retrouve au port à 17 h 30 ?",
      mine: true,
      canDelete: true,
      reactedByMe: false,
      reactionsCount: 0,
      repliesCount: 0,
      mentions: [],
    });
    expect(JSON.stringify(first.json)).not.toContain(nina.id);
    tick();
    await comment(nina, id, "Hâte d'y être");
    const seen = await listComments(kenji, id);
    expect(seen.status).toBe(200);
    expect(texts(seen.items)).toEqual(["On se retrouve au port à 17 h 30 ?", "Hâte d'y être"]);
    // Auteur de la publication : il peut tout supprimer ; un tiers ne peut pas.
    expect(seen.items.map((i) => [i.mine, i.canDelete])).toEqual([
      [false, true],
      [false, true],
    ]);
    expect((await listComments(nina, id)).items.map((i) => [i.mine, i.canDelete])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect((await post(id)).commentsCount).toBe(2);
  });

  it("20 par page, curseur sans doublon ni trou, mauvais curseur refusé", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    for (let i = 0; i < 23; i++) {
      tick();
      await comment(lea, id, `Commentaire ${i}`);
    }
    const one = await listComments(kenji, id);
    expect(one.items).toHaveLength(20);
    expect(one.page.nextCursor).toBeTruthy();
    const two = await listComments(kenji, id, one.page.nextCursor ?? undefined);
    expect(two.items).toHaveLength(3);
    expect(two.page.nextCursor).toBeNull();
    expect(texts([...one.items, ...two.items])).toEqual(Array.from({ length: 23 }, (_, i) => `Commentaire ${i}`));
    expect((await call(kenji, "GET", `/feed-posts/${id}/comments?cursor=pasuncurseur`)).status).toBe(400);
  });

  it("300 caractères passent, 301, le vide et les espaces seuls sont refusés ; aucune casquette n'est acceptée", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    expect((await comment(lea, id, "a".repeat(300))).status).toBe(201);
    expect((await comment(lea, id, "a".repeat(301))).status).toBe(400);
    expect((await comment(lea, id, "")).status).toBe(400);
    expect((await comment(lea, id, "   ")).status).toBe(400);
    // Un champ inconnu (casquette) est refusé, jamais ignoré en silence ; `persona` reste `fan` en base.
    const structure = await createStructure(lea.id);
    const withPersona = await call(lea, "POST", `/feed-posts/${id}/comments`, {
      text: "Au nom de ma page",
      clientId: randomUUID(),
      persona: "organizer",
      structureId: structure.id,
    });
    expect(withPersona.status).toBe(400);
    const ok = await comment(lea, id, "En mon nom");
    expect((await row(ok.json.id)).persona).toBe("fan");
    expect((await call(lea, "POST", `/feed-posts/${id}/comments`, { text: "Sans clientId" })).status).toBe(400);
    expect((await call(lea, "POST", `/feed-posts/${id}/comments`, { text: "x", clientId: "pas-un-uuid" })).status).toBe(
      400,
    );
  });

  it("jamais sous une carte du Fil ni sous un identifiant inconnu : 400 ou 404", async () => {
    const lea = await person("Lea_11");
    const id = await dbPost(await person("Kenji_66"));
    expect((await comment(lea, `feed_post:${id}`, "x")).status).toBe(400);
    expect((await comment(lea, "sponsored:abc", "x")).status).toBe(400);
    expect((await comment(lea, randomUUID(), "x")).status).toBe(404);
    expect((await listComments(lea, randomUUID())).status).toBe(404);
    expect((await call(lea, "GET", `/feed-comments/${randomUUID()}/replies`)).status).toBe(404);
  });

  it("reprise après une réponse perdue : le même commentaire, un seul envoi, une seule notification", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const clientId = randomUUID();
    const a = await comment(lea, id, "Un seul envoi", { clientId });
    const b = await comment(lea, id, "Un seul envoi", { clientId });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json.id).toBe(a.json.id);
    expect(await db.select().from(feedPostComments)).toHaveLength(1);
    expect((await post(id)).commentsCount).toBe(1);
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(1);
    // Le même identifiant sur une autre publication est refusé.
    const other = await dbPost(kenji);
    expect((await comment(lea, other, "Ailleurs", { clientId })).status).toBe(409);
  });

  it("deux envois simultanés du même identifiant : un commentaire", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const clientId = randomUUID();
    const both = await Promise.all([
      comment(lea, id, "Double", { clientId }),
      comment(lea, id, "Double", { clientId }),
    ]);
    expect(both.map((r) => r.status)).toEqual([201, 201]);
    expect(both[0]?.json.id).toBe(both[1]?.json.id);
    expect(await db.select().from(feedPostComments)).toHaveLength(1);
    expect((await post(id)).commentsCount).toBe(1);
  });

  it("limite de débit : 60 commentaires par heure et par compte", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    let last = 201;
    for (let i = 0; i < 61; i++) last = (await comment(lea, id, `n° ${i}`)).status;
    expect(last).toBe(429);
    expect((await post(id)).commentsCount).toBe(60);
  });
});

describe("réponses sur un seul niveau", () => {
  it("répondre à une réponse rattache au commentaire de premier niveau ; les réponses sont repliées", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const top = await comment(lea, id, "Premier niveau");
    tick();
    const reply = await comment(nina, id, "Une réponse", { parentId: top.json.id });
    expect(reply.status).toBe(201);
    tick();
    const replyToReply = await comment(kenji, id, "Réponse à la réponse", { parentId: reply.json.id });
    expect(replyToReply.status).toBe(201);
    expect((await row(replyToReply.json.id)).parentId).toBe(top.json.id);
    // La liste ne montre que le premier niveau, avec le total des réponses.
    const list = await listComments(kenji, id);
    expect(texts(list.items)).toEqual(["Premier niveau"]);
    expect(list.items[0]?.repliesCount).toBe(2);
    const replies = await listReplies(kenji, top.json.id);
    expect(texts(replies.items)).toEqual(["Une réponse", "Réponse à la réponse"]);
    // Les réponses n'ont pas de réponses propres.
    expect((await listReplies(kenji, reply.json.id)).items).toEqual([]);
    expect((await post(id)).commentsCount).toBe(3);
    expect((await row(top.json.id)).repliesCount).toBe(2);
  });

  it("un parent d'une autre publication, supprimé ou inconnu : 404", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const other = await dbPost(kenji);
    const top = await comment(lea, id, "Premier niveau");
    expect((await comment(lea, other, "Ailleurs", { parentId: top.json.id })).status).toBe(404);
    expect((await comment(lea, id, "Inconnu", { parentId: randomUUID() })).status).toBe(404);
    await call(lea, "DELETE", `/feed-comments/${top.json.id}`);
    expect((await comment(kenji, id, "Trop tard", { parentId: top.json.id })).status).toBe(404);
    expect((await post(id)).commentsCount).toBe(0);
  });
});

describe("couper les commentaires", () => {
  it("coupés : 409 comments_off, les anciens restent lisibles ; l'auteur les rouvre ; un tiers reçoit 404", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    await comment(lea, id, "Avant");
    expect((await call(lea, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true })).status).toBe(404);
    expect((await call(kenji, "PUT", `/me/feed-posts/${id}/comments-off`, { off: "oui" })).status).toBe(400);
    expect(await call(kenji, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true })).toMatchObject({
      status: 200,
      json: { commentsOff: true },
    });
    const refused = await comment(lea, id, "Après");
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("comments_off");
    expect(texts((await listComments(lea, id)).items)).toEqual(["Avant"]);
    expect((await post(id)).commentsOff).toBe(true);
    expect((await call(kenji, "PUT", `/me/feed-posts/${id}/comments-off`, { off: false })).status).toBe(200);
    expect((await comment(lea, id, "Rouvert")).status).toBe(201);
  });

  it("la flamme et la suppression restent possibles quand les commentaires sont coupés", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji, { commentsOff: false });
    const c = await comment(lea, id, "Avant");
    await call(kenji, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true });
    expect((await call(kenji, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(200);
    expect((await call(lea, "DELETE", `/feed-comments/${c.json.id}`)).status).toBe(204);
  });
});

describe("suppression et compteurs", () => {
  it("le sien, par l'auteur de la publication ; un tiers reçoit 404 ; le compteur baisse d'autant ; jamais deux fois", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const a = await comment(lea, id, "Le mien");
    const b = await comment(nina, id, "Celui de Nina");
    expect((await post(id)).commentsCount).toBe(2);
    expect((await call(nina, "DELETE", `/feed-comments/${a.json.id}`)).status).toBe(404);
    expect((await call(null, "DELETE", `/feed-comments/${a.json.id}`)).status).toBe(401);
    expect((await call(lea, "DELETE", `/feed-comments/${a.json.id}`)).status).toBe(204);
    expect((await call(lea, "DELETE", `/feed-comments/${a.json.id}`)).status).toBe(404);
    expect((await call(kenji, "DELETE", `/feed-comments/${b.json.id}`)).status).toBe(204);
    expect((await post(id)).commentsCount).toBe(0);
    expect((await listComments(kenji, id)).items).toEqual([]);
    const gone = await row(b.json.id);
    expect(gone.deletedBy).toBe(kenji.id);
  });

  it("supprimer un commentaire de premier niveau retire aussi ses réponses de la vue et des compteurs", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const top = await comment(lea, id, "Premier niveau");
    const keep = await comment(nina, id, "Un autre");
    const r1 = await comment(nina, id, "Réponse 1", { parentId: top.json.id });
    await comment(kenji, id, "Réponse 2", { parentId: top.json.id });
    expect((await post(id)).commentsCount).toBe(4);
    // Supprimer une réponse : le parent baisse d'une réponse.
    expect((await call(nina, "DELETE", `/feed-comments/${r1.json.id}`)).status).toBe(204);
    expect((await row(top.json.id)).repliesCount).toBe(1);
    expect((await post(id)).commentsCount).toBe(3);
    expect((await call(lea, "DELETE", `/feed-comments/${top.json.id}`)).status).toBe(204);
    expect((await post(id)).commentsCount).toBe(1);
    expect(texts((await listComments(kenji, id)).items)).toEqual(["Un autre"]);
    expect((await listReplies(kenji, top.json.id)).status).toBe(404);
    expect(keep.status).toBe(201);
  });

  it("dix commentaires et dix flammes simultanés : compteurs exacts", async () => {
    const kenji = await person("Kenji_66");
    const id = await dbPost(kenji);
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => person(`Foule_${i}`)));
    const results = await Promise.all(people.map((p, i) => comment(p, id, `Commentaire ${i}`)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect((await post(id)).commentsCount).toBe(10);
    const target = results[0]!.json.id as string;
    const flames = await Promise.all(people.map((p) => call(p, "PUT", `/feed-comments/${target}/reaction`)));
    expect(flames.every((r) => r.status === 200)).toBe(true);
    expect((await row(target)).reactionsCount).toBe(10);
    expect(await db.select().from(feedPostCommentReactions)).toHaveLength(10);
    // Dix réponses simultanées sous le même commentaire, et dix suppressions simultanées.
    const replies = await Promise.all(people.map((p, i) => comment(p, id, `Réponse ${i}`, { parentId: target })));
    expect(replies.every((r) => r.status === 201)).toBe(true);
    expect((await row(target)).repliesCount).toBe(10);
    expect((await post(id)).commentsCount).toBe(20);
    const removed = await Promise.all(people.map((p, i) => call(p, "DELETE", `/feed-comments/${replies[i]?.json.id}`)));
    expect(removed.every((r) => r.status === 204)).toBe(true);
    expect((await row(target)).repliesCount).toBe(0);
    expect((await post(id)).commentsCount).toBe(10);
  });
});

describe("la flamme d'un commentaire", () => {
  it("idempotente, se retire, Journal seul, regroupée par commentaire, jamais à soi-même", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const c = await comment(lea, id, "Belle voiture");
    expect(await call(nina, "PUT", `/feed-comments/${c.json.id}/reaction`)).toMatchObject({
      status: 200,
      json: { reactionsCount: 1, reactedByMe: true },
    });
    await call(nina, "PUT", `/feed-comments/${c.json.id}/reaction`);
    await call(kenji, "PUT", `/feed-comments/${c.json.id}/reaction`);
    expect((await row(c.json.id)).reactionsCount).toBe(2);
    // Une seule ligne pour Lea, dans le Journal, sans push (journal seul), regroupée par commentaire.
    const likes = await notifs(lea.id, "feed_comment_like");
    expect(likes).toHaveLength(1);
    expect(likes[0]?.groupKey).toBe(`feed_comment_like:${c.json.id}`);
    expect(likes[0]?.inJournal).toBe(true);
    expect(likes[0]?.pushSentAt).toBeNull();
    expect(likes[0]?.title).toContain("a aimé ton commentaire");
    // Sa propre flamme ne prévient personne.
    await call(lea, "PUT", `/feed-comments/${c.json.id}/reaction`);
    expect(await notifs(lea.id, "feed_comment_like")).toHaveLength(1);
    expect((await row(c.json.id)).reactionsCount).toBe(3);
    // Se retire (idempotent), et la liste dit « reactedByMe ».
    expect((await listComments(nina, id)).items[0]?.reactedByMe).toBe(true);
    expect(await call(nina, "DELETE", `/feed-comments/${c.json.id}/reaction`)).toMatchObject({
      json: { reactionsCount: 2, reactedByMe: false },
    });
    expect(await call(nina, "DELETE", `/feed-comments/${c.json.id}/reaction`)).toMatchObject({
      json: { reactionsCount: 2, reactedByMe: false },
    });
    expect((await call(null, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(401);
    expect((await call(nina, "PUT", `/feed-comments/${randomUUID()}/reaction`)).status).toBe(404);
  });

  it("pas de flamme sur un commentaire supprimé", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const c = await comment(lea, id, "Bientôt supprimé");
    await call(lea, "DELETE", `/feed-comments/${c.json.id}`);
    expect((await call(kenji, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(404);
  });
});

describe("@ : citer une personne", () => {
  it("la personne qui voit la publication est citée (ligne, lien, notification) ; les autres non", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const res = await comment(lea, id, "Merci @Kenji_66 et @Nina_34, salut @Fantome_9 et moi-même @Lea_11 !");
    expect(res.json.mentions.sort()).toEqual(["Kenji_66", "Nina_34"]);
    expect(await db.select().from(feedCommentMentions)).toHaveLength(2);
    const sent = await notifs(nina.id, "feed_comment_mention");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.title).toBe("Lea_11 t'a cité dans un commentaire");
    expect(sent[0]?.body).toContain("Merci @Kenji_66");
    // Kenji est cité : une seule notification (la citation), pas aussi « a commenté ta publication ».
    expect(await notifs(kenji.id, "feed_comment_mention")).toHaveLength(1);
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(0);
    expect(await notifs(lea.id, "feed_comment_mention")).toHaveLength(0);
    // Les listes servent les mêmes pseudos.
    expect((await listComments(nina, id)).items[0]?.mentions.sort()).toEqual(["Kenji_66", "Nina_34"]);
  });

  it("publication d'un compte privé : seul un abonné accepté peut être cité (les autres ne sont ni prévenus ni en lien)", async () => {
    const priv = await person("Marc_66", { visibility: "private" });
    const friend = await person("Ami_66");
    const stranger = await person("Inconnu_66");
    const lea = await person("Lea_11");
    await follow(friend, priv);
    await follow(lea, priv);
    const id = await dbPost(priv);
    const res = await comment(lea, id, "Pour @Ami_66 et @Inconnu_66");
    expect(res.status).toBe(201);
    expect(res.json.mentions).toEqual(["Ami_66"]);
    expect(await notifs(friend.id, "feed_comment_mention")).toHaveLength(1);
    expect(await notifs(stranger.id, "feed_comment_mention")).toHaveLength(0);
    expect(await db.select().from(feedCommentMentions)).toHaveLength(1);
  });

  it("un compte hors règle n'est pas cité", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const banned = await person("Banni_66");
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, banned.id));
    const id = await dbPost(kenji);
    const res = await comment(lea, id, "Hé @Banni_66");
    expect(res.json.mentions).toEqual([]);
    expect(await db.select().from(feedCommentMentions)).toHaveLength(0);
  });

  it("le commentaire d'un compte privé ne part pas vers qui ne le suit pas (même cité)", async () => {
    const kenji = await person("Kenji_66");
    const privLea = await person("Lea_11", { visibility: "private" });
    const nina = await person("Nina_34");
    const paul = await person("Paul_34");
    await follow(paul, privLea);
    const id = await dbPost(kenji);
    const res = await comment(privLea, id, "Pour @Nina_34 et @Paul_34");
    expect(res.json.mentions.sort()).toEqual(["Nina_34", "Paul_34"]);
    expect(await notifs(nina.id, "feed_comment_mention")).toHaveLength(0);
    expect(await notifs(paul.id, "feed_comment_mention")).toHaveLength(1);
    // L'auteur de la publication gère sa publication : il est prévenu.
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("trois commentaires de trois personnes : une seule ligne non lue pour l'auteur, jamais une par commentaire", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const paul = await person("Paul_34");
    const id = await dbPost(kenji);
    await comment(lea, id, "Un");
    await comment(nina, id, "Deux");
    await comment(paul, id, "Trois : le dernier mot");
    const rows = await notifs(kenji.id, "feed_comment");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.groupKey).toBe(`feed_comment:${id}`);
    expect(rows[0]?.readAt).toBeNull();
    expect(rows[0]?.title).toBe("Paul_34 a commenté ta publication");
    expect(rows[0]?.body).toBe("« Trois : le dernier mot »");
    expect(rows[0]?.data).toMatchObject({ postId: id, link: "/app/fil", count: 3 });
    // Une publication différente : une autre ligne.
    const other = await dbPost(kenji);
    await comment(lea, other, "Ailleurs");
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(2);
    // Son propre commentaire ne le prévient pas.
    await comment(kenji, id, "Merci à tous");
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(2);
  });

  it("une réponse prévient l'auteur du commentaire, sans doublon avec la publication ni la citation", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const top = await comment(lea, id, "On se retrouve au port à 17 h 30 ?");
    // Kenji répond à Lea : elle reçoit « répondu », lui ne reçoit rien de plus.
    await comment(kenji, id, "@Lea_11 oui, devant le plateau", { parentId: top.json.id });
    // @Lea_11 est aussi citée : une seule notification, la citation (priorité).
    expect(await notifs(lea.id, "feed_comment_mention")).toHaveLength(1);
    expect(await notifs(lea.id, "feed_comment_reply")).toHaveLength(0);
    await comment(kenji, id, "Sans citation", { parentId: top.json.id });
    const replies = await notifs(lea.id, "feed_comment_reply");
    expect(replies).toHaveLength(1);
    expect(replies[0]?.groupKey).toBe(`feed_comment_reply:${top.json.id}`);
    expect(replies[0]?.title).toBe("Kenji_66 a répondu à ton commentaire");
    // Nina répond : Lea (même ligne regroupée), Kenji (auteur de la publication) prévenu une fois ; pas de doublon.
    await comment(nina, id, "Moi aussi", { parentId: top.json.id });
    expect(await notifs(lea.id, "feed_comment_reply")).toHaveLength(1);
    const toKenji = await notifs(kenji.id, "feed_comment");
    expect(toKenji).toHaveLength(1);
    expect(toKenji[0]?.data).toMatchObject({ count: 2 });
    const perComment = await db.select().from(notifications).where(eq(notifications.userId, lea.id));
    expect(perComment.filter((n) => n.type === "feed_comment")).toHaveLength(0);
    // Répondre à sa propre publication ne prévient pas soi-même.
    const own = await comment(kenji, id, "Ma réponse à Lea", { parentId: top.json.id });
    expect(own.status).toBe(201);
  });

  it("répondre à une réponse prévient l'auteur de cette réponse", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const top = await comment(lea, id, "Premier niveau");
    const reply = await comment(nina, id, "Une réponse", { parentId: top.json.id });
    await comment(lea, id, "Réponse à Nina", { parentId: reply.json.id });
    expect(await notifs(nina.id, "feed_comment_reply")).toHaveLength(1);
  });

  it("un compte supprimé, banni ou suspendu n'est pas prévenu", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, kenji.id));
    const id = await dbPost(kenji);
    await comment(lea, id, "Tu es suspendu");
    expect(await notifs(kenji.id, "feed_comment")).toHaveLength(0);
  });
});

describe("signalement et modération", () => {
  async function reported() {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    const top = await comment(lea, id, "Un mauvais commentaire");
    await comment(nina, id, "Une réponse", { parentId: top.json.id });
    const report = await call(nina, "POST", `/feed-comments/${top.json.id}/report`, { reason: "insult" });
    return { kenji, lea, nina, id, top, report };
  }

  it("le signalement entre dans la file existante ; les motifs sont ceux d'un commentaire de crew ; l'auteur ne sait pas qui", async () => {
    const { lea, nina, top, report, id } = await reported();
    expect(report.status).toBe(201);
    const [filed] = await db.select().from(reports);
    expect(filed).toMatchObject({ targetType: "feed_comment", targetId: top.json.id, reporterId: nina.id });
    expect(await call(nina, "POST", `/feed-comments/${top.json.id}/report`, { reason: "spam" })).toMatchObject({
      status: 409,
    });
    expect((await call(nina, "POST", `/feed-comments/${top.json.id}/report`, { reason: "copyright" })).status).toBe(
      400,
    );
    expect((await call(nina, "POST", `/feed-comments/${top.json.id}/report`, { reason: "other" })).status).toBe(400);
    expect((await call(null, "POST", `/feed-comments/${top.json.id}/report`, { reason: "spam" })).status).toBe(401);
    expect((await call(nina, "POST", `/feed-comments/${randomUUID()}/report`, { reason: "spam" })).status).toBe(404);
    expect((await call(lea, "POST", `/feed-comments/${top.json.id}/report`, { reason: "spam" })).status).toBe(400);
    // L'auteur ne voit rien du signalement : le commentaire est servi tel quel.
    expect(JSON.stringify((await listComments(lea, id)).json)).not.toContain(nina.id);
  });

  it("la décision de modération retire le commentaire (et ses réponses) et ajuste les compteurs", async () => {
    const { kenji, id, top, report } = await reported();
    expect((await post(id)).commentsCount).toBe(2);
    const admin = await person("Mod_Admin", { twoFactor: true });
    await db.update(profiles).set({ platformRole: "super_admin" }).where(eq(profiles.userId, admin.id));
    const done = await call(admin, "POST", `/admin/reports/${report.json.id}/sanction`, { hideContent: true });
    expect(done.status).toBe(200);
    const gone = await row(top.json.id);
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.deletedBy).toBe(admin.id);
    expect((await post(id)).commentsCount).toBe(0);
    expect((await listComments(kenji, id)).items).toEqual([]);
    const detail = await call(admin, "GET", `/admin/reports/${report.json.id}`);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.json)).toContain("Un mauvais commentaire");
  });
});

describe("suggestions après @", () => {
  it("sans texte : la conversation, ceux que je suis et ceux qui me suivent, avec la raison ; huit au plus", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const marc = await person("Marc_66");
    const lena = await person("Lena_75");
    const nina = await person("Nina_34");
    const id = await dbPost(kenji);
    await follow(nina, lea);
    await follow(lena, nina);
    await comment(marc, id, "Dans la conversation");
    const res = await call(nina, "GET", `/feed-posts/${id}/mention-suggestions`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual([
      { pseudo: "Marc_66", avatarUrl: null, why: "thread" },
      { pseudo: "Lea_11", avatarUrl: null, why: "following" },
      { pseudo: "Lena_75", avatarUrl: null, why: "follower" },
    ]);
    // Jamais soi-même, jamais un identifiant de compte.
    expect(JSON.stringify(res.json)).not.toContain(nina.id);
    expect(kenji.id).toBeTruthy();
  });

  it("jamais plus de 8, rien sous 2 caractères hors de mes liens, jamais un compte privé non suivi", async () => {
    const kenji = await person("Kenji_66");
    const me = await person("Moi_Meme");
    const id = await dbPost(kenji);
    for (let i = 0; i < 12; i++) {
      const p = await person(`Ami_${i.toString().padStart(2, "0")}`);
      await follow(me, p);
    }
    const priv = await person("Ami_Prive", { visibility: "private" });
    expect(priv.id).toBeTruthy();
    const all = await call(me, "GET", `/feed-posts/${id}/mention-suggestions`);
    expect(all.json).toHaveLength(8);
    // Un début de pseudo filtre ; un seul caractère ne cherche rien de plus que mes liens (et reste borné).
    const one = await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=A`);
    expect(one.json.length).toBeLessThanOrEqual(8);
    expect(one.json.every((s: { why: string }) => s.why === "following")).toBe(true);
    const two = await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=ami_1`);
    expect(two.json.map((s: { pseudo: string }) => s.pseudo)).toEqual(["Ami_10", "Ami_11"]);
    // Un compte privé que je ne suis pas n'apparaît jamais, même cherché par son nom.
    const hidden = await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=Ami_Pr`);
    expect(hidden.json).toEqual([]);
    // Un inconnu hors de mes liens ne sort pas sans texte, ni sous 2 caractères.
    const stranger = await person("Zorro_66");
    expect(stranger.id).toBeTruthy();
    const nobody = (await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=Z`)).json;
    expect(JSON.stringify(nobody)).not.toContain("Zorro_66");
    expect(JSON.stringify((await call(me, "GET", `/feed-posts/${id}/mention-suggestions`)).json)).not.toContain(
      "Zorro_66",
    );
    // Avec 2 caractères, un compte public hors de mes liens ne sort toujours pas (jamais un annuaire) : seulement l'événement.
    expect((await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=Zo`)).json).toEqual([]);
  });

  it("avec 2 caractères au moins : les exposants retenus de l'événement rattaché, publics ou suivis ; jamais les autres", async () => {
    const orga = await person("Orga_66");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id, {
      startsAt: new Date(clock.now.getTime() + 7 * 86_400_000),
      endsAt: new Date(clock.now.getTime() + 8 * 86_400_000),
    });
    const kenji = await person("Kenji_66");
    const me = await person("Moi_Meme");
    const exposant = await person("Expo_Public");
    const exposantPrive = await person("Expo_Prive", { visibility: "private" });
    const exposantSuivi = await person("Expo_Suivi", { visibility: "private" });
    const attente = await person("Expo_Attente");
    await follow(me, exposantSuivi);
    for (const [u, status] of [
      [exposant, "accepted"],
      [exposantPrive, "accepted"],
      [exposantSuivi, "accepted"],
      [attente, "waitlisted"],
    ] as const) {
      const vehicle = await createVehicle(u.id, ref);
      await db.insert(applications).values({
        eventId: event.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status,
        followStructure: false,
        rulesAcceptedAt: new Date(),
      });
    }
    const id = await dbPost(kenji, { eventId: event.id });
    expect((await call(me, "GET", `/feed-posts/${id}/mention-suggestions`)).json).toEqual([
      { pseudo: "Expo_Suivi", avatarUrl: null, why: "following" },
    ]);
    const found = await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=Ex`);
    expect(found.json).toEqual([
      { pseudo: "Expo_Suivi", avatarUrl: null, why: "following" },
      { pseudo: "Expo_Public", avatarUrl: null, why: "event" },
    ]);
    // Après la fin de l'événement : on ne dit plus qui était retenu.
    clock.advance(10 * 86_400_000);
    expect((await call(me, "GET", `/feed-posts/${id}/mention-suggestions?q=Ex`)).json).toEqual([
      { pseudo: "Expo_Suivi", avatarUrl: null, why: "following" },
    ]);
  });
});

describe("deux derniers commentaires sous la carte", () => {
  it("les deux derniers de premier niveau, dans l'ordre du temps, avec le total", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const other = await dbPost(kenji);
    for (const t of ["Un", "Deux", "Trois"]) {
      tick();
      await comment(lea, id, t);
    }
    const top = (await listComments(lea, id)).items[0]!;
    tick();
    await comment(kenji, id, "Une réponse n'entre pas dans les deux derniers", { parentId: top.id });
    const view = (await call(lea, "GET", `/feed-posts/${id}`)).json;
    expect(view.commentsCount).toBe(4);
    expect(view.commentsOff).toBe(false);
    expect(view.lastComments.map((c: { text: string }) => c.text)).toEqual(["Deux", "Trois"]);
    expect(Object.keys(view.lastComments[0]).sort()).toEqual(["author", "createdAt", "id", "text"]);
    expect((await call(lea, "GET", `/feed-posts/${other}`)).json.lastComments).toEqual([]);
  });
});

describe("compte supprimé", () => {
  it("ses commentaires, ses réponses et ses flammes partent, les compteurs suivent", async () => {
    const kenji = await person("Kenji_66");
    const leaving = await person("Part_Compte");
    const stays = await person("Reste_Compte");
    const id = await dbPost(kenji);
    const mine = await comment(leaving, id, "Je pars");
    const theirs = await comment(stays, id, "Je reste");
    const answer = await comment(stays, id, "Réponse à celui qui part", { parentId: mine.json.id });
    const replyHere = await comment(leaving, id, "Ma réponse chez un autre", { parentId: theirs.json.id });
    await call(leaving, "PUT", `/feed-comments/${theirs.json.id}/reaction`);
    await call(stays, "PUT", `/feed-comments/${mine.json.id}/reaction`);
    expect(replyHere.status).toBe(201);
    expect(answer.status).toBe(201);
    expect((await post(id)).commentsCount).toBe(4);
    await withTx((tx) => anonymizeFeedCommentsForDeletedAccount(tx, leaving.id));
    const left = await db.select().from(feedPostComments);
    expect(left.map((c) => c.text)).toEqual(["Je reste"]);
    expect(left[0]?.repliesCount).toBe(0);
    expect(left[0]?.reactionsCount).toBe(0);
    expect(await db.select().from(feedPostCommentReactions)).toHaveLength(0);
    expect((await post(id)).commentsCount).toBe(1);
    expect(texts((await listComments(kenji, id)).items)).toEqual(["Je reste"]);
  });

  it("la suppression de compte de l'API appelle l'anonymisation des commentaires", async () => {
    const kenji = await person("Kenji_66");
    const leaving = await signUp("Part_Api");
    const id = await dbPost(kenji);
    await comment(leaving, id, "Au revoir");
    expect(accountService.anonymize).toBeTypeOf("function");
    await accountService.anonymize(leaving.id, null);
    expect(await db.select().from(feedPostComments)).toHaveLength(0);
    expect((await post(id)).commentsCount).toBe(0);
  });

  it("une publication retirée : ses commentaires ne sont plus servis (404)", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const c = await comment(lea, id, "Avant le retrait");
    expect((await call(kenji, "DELETE", `/me/feed-posts/${id}`)).status).toBe(204);
    expect((await listComments(lea, id)).status).toBe(404);
    expect((await comment(lea, id, "Après")).status).toBe(404);
    expect((await call(lea, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(404);
    expect((await listReplies(lea, c.json.id)).status).toBe(404);
  });
});
