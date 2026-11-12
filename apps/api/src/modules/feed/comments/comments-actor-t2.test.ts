// Lot R9a, partie 2, tour 2 : une page ne lit que ce qu'un membre sans lien voit (publication, commentaire cité, citation),
// les lignes regroupées d'une page se recomposent par la page, les suggestions suivent les règles d'une page, et un
// commentaire dont la page manque est écarté (jamais montré sous le compte de la personne).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../../test/actor-call";
import { resetDb, signUp, useClock, viewerOf } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { feedCommentMentions, feedPostComments, notifications, profiles, providerProfiles } from "../../../db/schema";
import { commentNotificationVerdicts } from "./batch";
import { guardCommentNotification, pageLineReadable } from "./notify";
import { dbPost, follow, person, type TestUser } from "./testkit";
import { toViews } from "./view";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-11-12T12:00:00Z"));
});

const say = (u: TestUser, actor: string | null, postId: string, text: string, extra: Record<string, unknown> = {}) =>
  callAs(u, actor, "POST", `/feed-posts/${postId}/comments`, { text, clientId: crypto.randomUUID(), ...extra });

async function world() {
  const sofia = await signUp("Sofia_66", { twoFactor: true });
  await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, sofia.id));
  const kenji = await person("Kenji_66");
  const marie = await person("Marie_66");
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: sofia.id, type: "photographer", name: "La Brasa" })
    .returning();
  const page = brasa as NonNullable<typeof brasa>;
  const post = await dbPost(kenji, { createdAt: new Date("2026-11-12T11:00:00Z") });
  return { sofia, kenji, marie, brasa: page, post, as: `v:${page.id}` };
}

describe("une page ne lit que ce qu'un membre sans lien voit", () => {
  it("la publication d'un compte privé que la personne suit : 404 et aucune notification ; à titre personnel, permis", async () => {
    const w = await world();
    const secret = await person("Secret_66", { visibility: "private" });
    await follow(w.sofia, secret);
    const privatePost = await dbPost(secret, { createdAt: new Date("2026-11-12T11:00:00Z") });
    expect((await say(w.sofia, null, privatePost, "Moi, en tant que moi")).status).toBe(201);
    await db.delete(notifications);
    const res = await say(w.sofia, w.as, privatePost, "Au nom de la page");
    expect(res.status).toBe(404);
    expect(await db.select().from(feedPostComments).where(eq(feedPostComments.persona, "provider"))).toHaveLength(0);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("une réponse au commentaire d'un compte privé suivi : 404 ; à celui d'un compte public : permis", async () => {
    const w = await world();
    const secret = await person("Secret_66", { visibility: "private" });
    await follow(w.sofia, secret);
    const hidden = await say(secret, null, w.post, "Un avis privé");
    const open = await say(w.marie, null, w.post, "Un avis public");
    expect(hidden.status).toBe(201);
    expect((await say(w.sofia, null, w.post, "Réponse perso", { parentId: hidden.json.id })).status).toBe(201);
    expect((await say(w.sofia, w.as, w.post, "Réponse de page", { parentId: hidden.json.id })).status).toBe(404);
    expect((await say(w.sofia, w.as, w.post, "Réponse de page", { parentId: open.json.id })).status).toBe(201);
  });

  it("@pseudo_privé tapé à la main : le commentaire part, la citation est ignorée, aucune notification", async () => {
    const w = await world();
    const secret = await person("Secret_66", { visibility: "private" });
    await follow(secret, w.kenji);
    const res = await say(w.sofia, w.as, w.post, "Bravo @Secret_66 et @Marie_66");
    expect(res.status, res.text).toBe(201);
    expect(res.json.mentions).toEqual(["Marie_66"]);
    const rows = await db.select().from(feedCommentMentions);
    expect(rows.map((r) => r.userId)).toEqual([w.marie.id]);
    expect(await db.select().from(notifications).where(eq(notifications.userId, secret.id))).toHaveLength(0);
  });
});

describe("lignes regroupées, suggestions, repli", () => {
  it("deux commentaires d'une même page, le dernier retiré : la ligne reste avec le premier ; les deux retirés : elle disparaît", async () => {
    const w = await world();
    const first = await say(w.sofia, w.as, w.post, "Premier mot de la page");
    const second = await say(w.sofia, w.as, w.post, "Deuxième mot de la page");
    const linesOf = async () =>
      (await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id))).filter(
        (n) => n.type === "feed_comment",
      );
    expect(await linesOf()).toHaveLength(1);
    expect(((await linesOf())[0]?.data as { commentId: string } | undefined)?.commentId).toBe(second.json.id);
    expect((await callAs(w.sofia, null, "DELETE", `/feed-comments/${second.json.id}`)).status).toBe(204);
    const [line] = await linesOf();
    expect(line).toBeDefined();
    expect(await guardCommentNotification(line as NonNullable<typeof line>)).toBeTruthy();
    const [after] = await linesOf();
    expect((after?.data as { commentId: string } | undefined)?.commentId).toBe(first.json.id);
    expect(after?.title).toBe("La Brasa a commenté ta publication");
    await callAs(w.sofia, null, "DELETE", `/feed-comments/${first.json.id}`);
    expect(await guardCommentNotification(after as NonNullable<typeof after>)).toBe(false);
  });

  it("suggestions : une réponse sous une racine de page (compte privé derrière) compte dans la conversation", async () => {
    const w = await world();
    const root = await say(w.sofia, w.as, w.post, "Une question de la page");
    await say(w.marie, null, w.post, "Ma réponse", { parentId: root.json.id });
    const pierre = await person("Pierre_66");
    const res = await callAs(pierre, null, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    const pseudos = (res.json as { pseudo: string }[]).map((s) => s.pseudo);
    expect(pseudos).toContain("Marie_66");
    expect(pseudos).not.toContain("Sofia_66");
  });

  it("un commentaire dont la page manque est écarté, jamais montré sous le compte de la personne", async () => {
    const w = await world();
    const made = await say(w.sofia, w.as, w.post, "Du brasero");
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, made.json.id));
    const [p] = await db.select().from(profiles).where(eq(profiles.userId, w.sofia.id));
    const orphan = { ...(row as NonNullable<typeof row>), providerId: crypto.randomUUID() };
    const views = await toViews(
      db,
      [{ c: orphan, p: p as NonNullable<typeof p> }],
      await viewerOf(w.sofia),
      false,
      new Date(),
    );
    expect(views).toEqual([]);
  });
});

describe("tour 3 : ligne de page dans le Journal, lisibilité avant la limite", () => {
  it("le dernier commentaire retiré : la lecture du Journal (sans garde de livraison) rend commentReadable false et le commentaire encore lisible", async () => {
    const w = await world();
    const first = await say(w.sofia, w.as, w.post, "Premier mot de la page");
    const second = await say(w.sofia, w.as, w.post, "Deuxième mot de la page");
    await callAs(w.sofia, null, "DELETE", `/feed-comments/${second.json.id}`);
    const rows = (await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id))).filter(
      (n) => n.type === "feed_comment",
    );
    const verdicts = await commentNotificationVerdicts(w.kenji.id, rows);
    const verdict = verdicts.get(rows[0]?.id ?? "");
    expect(verdict).toMatchObject({ shown: true, commentReadable: false, readableCommentId: first.json.id });
    // Servi par l'Activité : ni l'ancien identifiant ni l'ancien extrait.
    const activity = await callAs(w.kenji, null, "GET", "/me/activity");
    expect(activity.text).not.toContain(second.json.id);
    expect(activity.text).not.toContain("Deuxième mot");
  });

  it("cent commentaires récents devenus illisibles, un plus ancien lisible : la ligne le reprend", async () => {
    const w = await world();
    const old = await say(w.sofia, w.as, w.post, "Le plus ancien, toujours lisible");
    const line = (await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id))).find(
      (n) => n.type === "feed_comment",
    );
    // Une racine supprimée et 100 réponses de la page, plus récentes : elles ne se lisent pas (leur premier niveau a disparu).
    const at = Date.now();
    const [root] = await db
      .insert(feedPostComments)
      .values({
        postId: w.post,
        authorId: w.marie.id,
        text: "Racine retirée",
        clientId: crypto.randomUUID(),
        createdAt: new Date(at + 500),
        updatedAt: new Date(at + 500),
        deletedAt: new Date(at + 600),
      })
      .returning({ id: feedPostComments.id });
    await db.insert(feedPostComments).values(
      Array.from({ length: 100 }, (_, i) => ({
        postId: w.post,
        parentId: root?.id ?? null,
        authorId: w.sofia.id,
        persona: "provider" as const,
        providerId: w.brasa.id,
        text: `Illisible ${i}`,
        clientId: crypto.randomUUID(),
        createdAt: new Date(at + 1000 + i),
        updatedAt: new Date(at + 1000 + i),
      })),
    );
    const found = await pageLineReadable(db, w.kenji.id, line as NonNullable<typeof line>);
    expect(found?.newest.id).toBe(old.json.id);
  });
});
