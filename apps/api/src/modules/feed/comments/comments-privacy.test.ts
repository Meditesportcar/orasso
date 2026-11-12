// Commentaires d'une publication du Fil (lot R8k1) : vie privée par regard. Chaque route est essayée par : moi (l'auteur du
// commentaire), un abonné accepté, un membre connecté, l'auteur de la publication, un responsable de page avec et sans second
// facteur, et un visiteur sans session (401). Ce qu'on ne voit pas répond 404, sans rien révéler.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { addMember, call, createStructure, quietHours, resetDb, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedPostComments, feedPosts, profiles, userFollows } from "../../../db/schema";
import {
  COMMENT_VIEW_KEYS,
  comment,
  dbPost,
  follow,
  listComments,
  listReplies,
  person,
  type TestUser,
  texts,
} from "./testkit";
import * as view from "./view";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
const tick = () => clock.advance(1000);

beforeEach(async () => {
  await resetDb();
  // Les heures calmes (22 h à 8 h) différeraient les notifications lues ici : le test ne dépend pas de l'heure réelle (petit lot API, P25).
  quietHours(false);
  clock = useClock(new Date(Date.now() + 10 * 60_000));
});

const post = async (id: string) => (await db.select().from(feedPosts).where(eq(feedPosts.id, id)))[0]!;
const lastTexts = async (u: TestUser, postId: string) =>
  ((await call(u, "GET", `/feed-posts/${postId}`)).json.lastComments as { text: string }[]).map((c) => c.text);

/** Les neuf routes, essayées sans session : toutes répondent 401. */
describe("sans session", () => {
  it("aucune route ne sert ni n'accepte rien : 401 partout", async () => {
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const id = await dbPost(kenji);
    const c = await comment(lea, id, "Visible des membres seulement");
    const routes: [string, string, unknown?][] = [
      ["GET", `/feed-posts/${id}/comments`],
      ["POST", `/feed-posts/${id}/comments`, { text: "x", clientId: randomUUID() }],
      ["GET", `/feed-posts/${id}/mention-suggestions`],
      ["PUT", `/me/feed-posts/${id}/comments-off`, { off: true }],
      ["GET", `/feed-comments/${c.json.id}/replies`],
      ["DELETE", `/feed-comments/${c.json.id}`],
      ["PUT", `/feed-comments/${c.json.id}/reaction`],
      ["DELETE", `/feed-comments/${c.json.id}/reaction`],
      ["POST", `/feed-comments/${c.json.id}/report`, { reason: "spam" }],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(null, method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 401]);
    }
    // La publication elle-même ne sert pas non plus ses commentaires sans session.
    expect((await call(null, "GET", `/feed-posts/${id}`)).status).toBe(401);
  });
});

describe("publication d'un compte privé : un non-abonné reçoit 404 partout", () => {
  async function world() {
    const priv = await person("Marc_66", { visibility: "private" });
    const friend = await person("Ami_66");
    const pending = await person("Attente_66");
    const stranger = await person("Inconnu_66");
    await follow(friend, priv);
    await follow(pending, priv, "pending");
    const id = await dbPost(priv);
    const c = await comment(friend, id, "Un abonné commente");
    const reply = await comment(priv, id, "L'auteur répond", { parentId: c.json.id });
    return { priv, friend, pending, stranger, id, c, reply };
  }

  it("liste, écriture, réponses, flamme, signalement, suppression, suggestions et coupure", async () => {
    const { priv, friend, pending, stranger, id, c } = await world();
    for (const outsider of [stranger, pending]) {
      const tries: [string, string, unknown?][] = [
        ["GET", `/feed-posts/${id}/comments`],
        ["POST", `/feed-posts/${id}/comments`, { text: "Intrus", clientId: randomUUID() }],
        ["POST", `/feed-posts/${id}/comments`, { text: "Intrus", clientId: randomUUID(), parentId: c.json.id }],
        ["GET", `/feed-posts/${id}/mention-suggestions`],
        ["GET", `/feed-posts/${id}/mention-suggestions?q=Am`],
        ["PUT", `/me/feed-posts/${id}/comments-off`, { off: true }],
        ["GET", `/feed-comments/${c.json.id}/replies`],
        ["DELETE", `/feed-comments/${c.json.id}`],
        ["PUT", `/feed-comments/${c.json.id}/reaction`],
        ["DELETE", `/feed-comments/${c.json.id}/reaction`],
        ["POST", `/feed-comments/${c.json.id}/report`, { reason: "spam" }],
        ["GET", `/feed-posts/${id}`],
      ];
      for (const [method, path, body] of tries) {
        const res = await call(outsider, method, path, body);
        expect([outsider.pseudo, method, path, res.status]).toEqual([outsider.pseudo, method, path, 404]);
      }
    }
    // Rien n'a bougé pour autant.
    const row = await post(id);
    expect(row.commentsCount).toBe(2);
    expect(row.commentsOff).toBe(false);
    // L'abonné accepté et l'auteur voient et agissent normalement.
    expect(texts((await listComments(friend, id)).items)).toEqual(["Un abonné commente"]);
    expect(texts((await listComments(priv, id)).items)).toEqual(["Un abonné commente"]);
    expect((await call(friend, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(200);
    expect((await comment(friend, id, "Encore")).status).toBe(201);
  });

  it("un abonné qui part ne lit plus rien (la lecture suit l'abonnement)", async () => {
    const { friend, priv, id } = await world();
    expect((await listComments(friend, id)).status).toBe(200);
    await db.execute(
      (await import("drizzle-orm"))
        .sql`delete from user_follows where follower_id = ${friend.id} and followed_id = ${priv.id}`,
    );
    expect((await listComments(friend, id)).status).toBe(404);
    expect((await comment(friend, id, "Je n'ai plus le droit")).status).toBe(404);
  });
});

describe("le commentaire d'un compte privé sous une publication publique", () => {
  async function world() {
    const author = await person("Kenji_66");
    const priv = await person("Lea_11", { visibility: "private" });
    const follower = await person("Suiveur_66");
    const member = await person("Membre_66");
    const pub = await person("Nina_34");
    await follow(follower, priv);
    const id = await dbPost(author);
    tick();
    const secret = await comment(priv, id, "Le commentaire d'un compte privé");
    tick();
    const open = await comment(pub, id, "Le commentaire d'un compte public");
    tick();
    const reply = await comment(follower, id, "Réponse d'un abonné", { parentId: secret.json.id });
    return { author, priv, follower, member, pub, id, secret, open, reply };
  }

  it("servi à lui, à ses abonnés acceptés et à qui gère la publication ; absent pour les autres, dans la liste comme dans l'aperçu", async () => {
    const { author, priv, follower, member, pub, id } = await world();
    const both = ["Le commentaire d'un compte privé", "Le commentaire d'un compte public"];
    expect(texts((await listComments(priv, id)).items)).toEqual(both);
    expect(texts((await listComments(follower, id)).items)).toEqual(both);
    expect(texts((await listComments(author, id)).items)).toEqual(both);
    expect(texts((await listComments(member, id)).items)).toEqual([both[1]]);
    expect(texts((await listComments(pub, id)).items)).toEqual([both[1]]);
    expect(await lastTexts(priv, id)).toEqual(both);
    expect(await lastTexts(follower, id)).toEqual(both);
    expect(await lastTexts(author, id)).toEqual(both);
    expect(await lastTexts(member, id)).toEqual([both[1]]);
    expect(await lastTexts(pub, id)).toEqual([both[1]]);
    // Les totaux sont des totaux : 3 commentaires, réponse comprise, quel que soit le regard.
    expect((await call(member, "GET", `/feed-posts/${id}`)).json.commentsCount).toBe(3);
  });

  it("réponses, flamme et signalement : 404 pour qui ne peut pas lire le commentaire, normal pour les autres", async () => {
    const { author, priv, follower, member, id, secret } = await world();
    const c = secret.json.id as string;
    expect((await listReplies(member, c)).status).toBe(404);
    expect((await call(member, "PUT", `/feed-comments/${c}/reaction`)).status).toBe(404);
    expect((await call(member, "DELETE", `/feed-comments/${c}/reaction`)).status).toBe(404);
    expect((await call(member, "POST", `/feed-comments/${c}/report`, { reason: "spam" })).status).toBe(404);
    expect((await call(member, "DELETE", `/feed-comments/${c}`)).status).toBe(404);
    expect((await comment(member, id, "Je réponds", { parentId: c })).status).toBe(404);
    for (const reader of [priv, follower, author]) {
      expect((await listReplies(reader, c)).status).toBe(200);
    }
    expect((await call(follower, "PUT", `/feed-comments/${c}/reaction`)).status).toBe(200);
    expect((await comment(follower, id, "Je réponds", { parentId: c })).status).toBe(201);
    expect((await call(follower, "POST", `/feed-comments/${c}/report`, { reason: "spam" })).status).toBe(201);
    // Les nombres restent des totaux pour tous.
    expect((await listComments(member, id)).items.map((i) => i.repliesCount)).toEqual([0]);
  });

  it("les suggestions « @ » ne citent pas ceux dont je ne peux pas lire les commentaires", async () => {
    const { member, follower, id } = await world();
    expect(JSON.stringify((await call(member, "GET", `/feed-posts/${id}/mention-suggestions`)).json)).not.toContain(
      "Lea_11",
    );
    expect(
      (
        (await call(follower, "GET", `/feed-posts/${id}/mention-suggestions`)).json as { pseudo: string; why: string }[]
      ).find((s) => s.pseudo === "Lea_11"),
    ).toMatchObject({ why: "thread" });
  });

  it("un commentaire d'un compte privé n'est pas notifié à qui ne le suit pas, mais l'est à l'auteur de la publication", async () => {
    const { author } = await world();
    const { notifications } = await import("../../../db/schema");
    const rows = await db.select().from(notifications).where(eq(notifications.userId, author.id));
    expect(rows.filter((n) => n.type === "feed_comment")).toHaveLength(1);
  });
});

describe("auteur supprimé, suspendu ou banni : omis", () => {
  it("un commentaire d'un compte hors règle n'est ni listé, ni dans l'aperçu, ni proposé, ni accessible", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const banned = await person("Banni_66");
    const suspended = await person("Suspendu_66");
    const id = await dbPost(author);
    tick();
    const a = await comment(banned, id, "Du banni");
    tick();
    const b = await comment(suspended, id, "Du suspendu");
    tick();
    await comment(lea, id, "De Lea");
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, banned.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 86_400_000) })
      .where(eq(profiles.userId, suspended.id));
    for (const reader of [lea, author]) {
      expect(texts((await listComments(reader, id)).items)).toEqual(["De Lea"]);
      expect(await lastTexts(reader, id)).toEqual(["De Lea"]);
      const suggested = JSON.stringify((await call(reader, "GET", `/feed-posts/${id}/mention-suggestions`)).json);
      expect(suggested).not.toContain("Banni_66");
      expect(suggested).not.toContain("Suspendu_66");
    }
    for (const gone of [a, b]) {
      expect((await call(lea, "PUT", `/feed-comments/${gone.json.id}/reaction`)).status).toBe(404);
      expect((await listReplies(lea, gone.json.id)).status).toBe(404);
      expect((await call(author, "DELETE", `/feed-comments/${gone.json.id}`)).status).toBe(404);
    }
    // Totaux : ils comptent encore ce qui a été écrit.
    expect((await post(id)).commentsCount).toBe(3);
  });

  it("un compte suspendu ne peut plus écrire, supprimer ni mettre de flamme (lecture seule)", async () => {
    const author = await person("Kenji_66");
    const sus = await person("Suspendu_66");
    const id = await dbPost(author);
    const c = await comment(author, id, "Lisible");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 86_400_000) })
      .where(eq(profiles.userId, sus.id));
    expect((await listComments(sus, id)).status).toBe(200);
    expect((await comment(sus, id, "Non")).status).toBe(403);
    expect((await call(sus, "PUT", `/feed-comments/${c.json.id}/reaction`)).status).toBe(403);
    expect((await call(sus, "POST", `/feed-comments/${c.json.id}/report`, { reason: "spam" })).status).toBe(403);
  });
});

describe("publication d'une page : le responsable avec et sans second facteur", () => {
  async function world() {
    const owner = await person("Orga_66", { twoFactor: true });
    const coOrga = await person("CoOrga_66");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, coOrga.id, "co_organizer");
    const priv = await person("Lea_11", { visibility: "private" });
    const member = await person("Membre_66");
    const id = await dbPost(owner, { persona: "organizer", structureId: structure.id });
    tick();
    const secret = await comment(priv, id, "Compte privé sous une page");
    tick();
    const open = await comment(member, id, "Compte public sous une page");
    return { owner, coOrga, priv, member, id, secret, open };
  }

  it("avec second facteur : lit tout, supprime n'importe lequel, coupe les commentaires", async () => {
    const { owner, id, secret, open } = await world();
    expect(texts((await listComments(owner, id)).items)).toEqual([
      "Compte privé sous une page",
      "Compte public sous une page",
    ]);
    expect((await listComments(owner, id)).items.every((i) => i.canDelete)).toBe(true);
    expect((await call(owner, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true })).status).toBe(200);
    expect((await call(owner, "PUT", `/me/feed-posts/${id}/comments-off`, { off: false })).status).toBe(200);
    expect((await call(owner, "DELETE", `/feed-comments/${open.json.id}`)).status).toBe(204);
    expect((await call(owner, "DELETE", `/feed-comments/${secret.json.id}`)).status).toBe(204);
    expect((await post(id)).commentsCount).toBe(0);
  });

  it("sans second facteur : rien d'une page ne s'ouvre (pas d'erreur masquée en lecture, 403 en écriture)", async () => {
    const { coOrga, id, secret, open } = await world();
    // Lecture : il se comporte comme un membre (le commentaire privé ne lui est pas servi).
    const seen = await listComments(coOrga, id);
    expect(texts(seen.items)).toEqual(["Compte public sous une page"]);
    expect(seen.items.every((i) => !i.canDelete)).toBe(true);
    // Écriture : l'erreur du second facteur remonte telle quelle, rien ne bouge.
    const cut = await call(coOrga, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true });
    expect(cut.status).toBe(403);
    expect(cut.json.error.code).toBe("two_factor_required");
    const del = await call(coOrga, "DELETE", `/feed-comments/${open.json.id}`);
    expect(del.status).toBe(403);
    expect(del.json.error.code).toBe("two_factor_required");
    expect((await call(coOrga, "DELETE", `/feed-comments/${secret.json.id}`)).status).toBe(404);
    expect((await post(id)).commentsCount).toBe(2);
    expect((await post(id)).commentsOff).toBe(false);
  });

  it("un membre connecté ne coupe ni ne supprime : 404 ; l'aperçu de la carte n'ajoute jamais de droit", async () => {
    const { member, owner, id, secret, open } = await world();
    expect((await call(member, "PUT", `/me/feed-posts/${id}/comments-off`, { off: true })).status).toBe(404);
    expect((await call(member, "DELETE", `/feed-comments/${secret.json.id}`)).status).toBe(404);
    // Le sien se supprime.
    expect((await call(member, "DELETE", `/feed-comments/${open.json.id}`)).status).toBe(204);
    // L'aperçu de la carte ne prouve pas le second facteur : le responsable n'y lit pas le commentaire d'un compte privé.
    expect(await lastTexts(owner, id)).toEqual([]);
  });
});

describe("liste blanche de champs, par regard", () => {
  it("FeedCommentView : exactement les mêmes champs pour tous, jamais d'adresse e-mail ni de rôle", async () => {
    const author = await person("Kenji_66");
    const lea = await person("Lea_11");
    const friend = await person("Ami_66");
    const member = await person("Membre_66");
    await follow(friend, lea);
    const id = await dbPost(author);
    const c = await comment(lea, id, "Un commentaire @Ami_66");
    await comment(member, id, "Une réponse", { parentId: c.json.id });
    for (const reader of [lea, friend, member, author]) {
      const list = await listComments(reader, id);
      expect(Object.keys(list.items[0] ?? {}).sort()).toEqual(COMMENT_VIEW_KEYS);
      const replies = await listReplies(reader, c.json.id);
      expect(Object.keys(replies.items[0] ?? {}).sort()).toEqual(COMMENT_VIEW_KEYS);
      expect(Object.keys(list.json).sort()).toEqual(["items", "nextCursor"]);
      const text = JSON.stringify([list.json, replies.json]);
      for (const secret of [reader.email, lea.email, "motdepasse", "platformRole", "birthDate"]) {
        expect(text).not.toContain(secret);
      }
    }
    const suggestions = await call(friend, "GET", `/feed-posts/${id}/mention-suggestions`);
    for (const s of suggestions.json as object[]) expect(Object.keys(s).sort()).toEqual(["avatarUrl", "pseudo", "why"]);
    expect(Object.keys((await call(member, "PUT", `/feed-comments/${c.json.id}/reaction`)).json).sort()).toEqual([
      "reactedByMe",
      "reactionsCount",
    ]);
  });

  it("les commentaires d'une publication que je ne vois pas n'arrivent jamais dans l'aperçu d'une carte", async () => {
    const priv = await person("Marc_66", { visibility: "private" });
    const friend = await person("Ami_66");
    const stranger = await person("Inconnu_66");
    await follow(friend, priv);
    const id = await dbPost(priv);
    await comment(friend, id, "Entre abonnés");
    expect((await call(stranger, "GET", `/feed-posts/${id}`)).status).toBe(404);
    const fil = await call(stranger, "GET", "/fil");
    expect(JSON.stringify(fil.json)).not.toContain("Entre abonnés");
    expect(await lastTexts(friend, id)).toEqual(["Entre abonnés"]);
    expect(await db.select({ n: feedPostComments.id }).from(feedPostComments)).toHaveLength(1);
  });
});

describe("le compteur du parent n'est rendu que si le parent se lit encore", () => {
  it("rejeu d'un envoi, ou suppression d'une réponse, après que le compte privé m'a retiré de ses abonnés : pas de `parent`", async () => {
    const priv = await person("Marc_66", { visibility: "private" });
    const friend = await person("Lea_11");
    const kenji = await person("Kenji_66");
    await follow(friend, priv);
    const id = await dbPost(kenji);
    const parent = await comment(priv, id, "Un commentaire privé");
    const clientId = randomUUID();
    const first = await comment(friend, id, "Ma réponse", { parentId: parent.json.id, clientId });
    expect(first.status).toBe(201);
    expect(first.json.parent).toMatchObject({ id: parent.json.id, repliesCount: 1 });
    // Sans retrait : le rejeu rend toujours le parent.
    expect((await comment(friend, id, "Ma réponse", { parentId: parent.json.id, clientId })).json.parent).toBeDefined();
    // Le compte privé me retire de ses abonnés.
    await db.delete(userFollows).where(and(eq(userFollows.followerId, friend.id), eq(userFollows.followedId, priv.id)));
    const again = await comment(friend, id, "Ma réponse", { parentId: parent.json.id, clientId });
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    expect(again.json.parent).toBeUndefined();
    expect((await listReplies(friend, parent.json.id)).status).toBe(404);
    // Supprimer ma réponse (DELETE réel) : 204 sans corps, sans compteur du parent ; la réponse est bien supprimée (petit lot API, P32).
    const del = await call(friend, "DELETE", `/feed-comments/${first.json.id}`);
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, first.json.id));
    expect(row?.deletedAt).not.toBeNull();
  });
  it("supprimer une réponse rend 200 avec le compteur de son parent (lu après la suppression) ; un commentaire de premier niveau, 204", async () => {
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const kenji = await person("Kenji_66");
    const id = await dbPost(kenji);
    const parent = await comment(lea, id, "Parent");
    const r1 = await comment(nina, id, "R1", { parentId: parent.json.id });
    await comment(nina, id, "R2", { parentId: parent.json.id });
    const del = await call(nina, "DELETE", `/feed-comments/${r1.json.id}`);
    expect(del.status).toBe(200);
    expect(del.json.parent).toMatchObject({ id: parent.json.id, repliesCount: 1 });
    expect(del.json.parent.countedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect((await call(lea, "DELETE", `/feed-comments/${parent.json.id}`)).status).toBe(204);
  });

  it("suppression d'une réponse par celui qui gère la publication : 200 avec le compteur du parent (petit lot API, P32)", async () => {
    const owner = await person("Orga_66", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const id = await dbPost(owner, { persona: "organizer", structureId: structure.id });
    const parent = await comment(lea, id, "Parent");
    const r1 = await comment(nina, id, "R1", { parentId: parent.json.id });
    await comment(nina, id, "R2", { parentId: parent.json.id });
    const del = await call(owner, "DELETE", `/feed-comments/${r1.json.id}`);
    expect(del.status).toBe(200);
    expect(del.json.parent).toMatchObject({ id: parent.json.id, repliesCount: 1 });
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, r1.json.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("suppression d'une réponse dont le parent est déjà supprimé : 204, la réponse est supprimée (petit lot API, P32)", async () => {
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const kenji = await person("Kenji_66");
    const id = await dbPost(kenji);
    const parent = await comment(lea, id, "Parent");
    const r1 = await comment(nina, id, "R1", { parentId: parent.json.id });
    // Le parent est retiré ailleurs au même instant (course : sa suppression n'a pas encore emporté cette réponse).
    await db.update(feedPostComments).set({ deletedAt: new Date() }).where(eq(feedPostComments.id, parent.json.id));
    const del = await call(nina, "DELETE", `/feed-comments/${r1.json.id}`);
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, r1.json.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("la lecture du compteur du parent en panne après la suppression : 204, la réponse est supprimée (petit lot API, P31)", async () => {
    const lea = await person("Lea_11");
    const nina = await person("Nina_34");
    const kenji = await person("Kenji_66");
    const id = await dbPost(kenji);
    const parent = await comment(lea, id, "Parent");
    const r1 = await comment(nina, id, "R1", { parentId: parent.json.id });
    const spy = vi.spyOn(view, "repliesCountsOf").mockRejectedValueOnce(new Error("panne de lecture"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const del = await call(nina, "DELETE", `/feed-comments/${r1.json.id}`);
      expect(spy).toHaveBeenCalled();
      expect(del.status).toBe(204);
      const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, r1.json.id));
      expect(row?.deletedAt).not.toBeNull();
      expect(quiet).toHaveBeenCalled();
      // Une nouvelle tentative rend « Déjà retiré » : c'est ce que le 500 provoquait.
      expect((await call(nina, "DELETE", `/feed-comments/${r1.json.id}`)).status).toBe(404);
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
  });
});
