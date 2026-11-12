// Lot R9a, partie 2 (T7) : commenter en casquette. Le commentaire s'écrit au nom de la page (second facteur d'une structure),
// se lit sous le nom de la page, à qui voit la publication, quelle que soit la confidentialité du compte de qui l'a écrit ;
// ni le pseudo ni l'identifiant de cette personne ne sont servis, nulle part (liste, réponses, derniers commentaires du Fil,
// suggestions, notifications, ligne regroupée, compte supprimé).
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../../test/actor-call";
import { addMember, createStructure, resetDb, signUp, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import {
  feedPostComments,
  notifications,
  pageFollows,
  profiles,
  providerProfiles,
  structures,
} from "../../../db/schema";
import { accountService } from "../../account/service";
import { AUTHOR_VIEW_KEYS, COMMENT_VIEW_KEYS, dbPost, follow, person, type TestUser } from "./testkit";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(new Date("2026-11-12T12:00:00Z"));
});

const say = (u: TestUser, actor: string | null, postId: string, text: string, extra: Record<string, unknown> = {}) =>
  callAs(u, actor, "POST", `/feed-posts/${postId}/comments`, {
    text,
    clientId: crypto.randomUUID(),
    ...extra,
  });

async function world() {
  // Sofia tient La Brasa et a un compte PRIVÉ ; Kenji écrit des publications ; Marie lit.
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

const expectNoHolder = (payload: unknown, holder: TestUser) => {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  expect(text).not.toContain(holder.pseudo);
  expect(text).not.toContain(holder.id);
};

describe("écrire au nom d'une page", () => {
  it("le titulaire commente en tant que La Brasa : la colonne de la page est posée, le corps de la requête ne change pas", async () => {
    const w = await world();
    const res = await say(w.sofia, w.as, w.post, "Belle voiture !");
    expect(res.status, res.text).toBe(201);
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, res.json.id));
    expect(row).toMatchObject({ persona: "provider", providerId: w.brasa.id, authorId: w.sofia.id });
    // Sans en-tête : en son nom, comme avant.
    const own = await say(w.sofia, null, w.post, "Moi, à titre personnel");
    const [own2] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, own.json.id));
    expect(own2).toMatchObject({ persona: "fan", providerId: null });
  });

  it("sans droit sur la page : 403 ; structure sans second facteur : refusée ; page suspendue : 403", async () => {
    const w = await world();
    const stranger = await say(w.marie, w.as, w.post, "Je ne suis pas La Brasa");
    expect(stranger.status).toBe(403);
    expect(stranger.json.error.code).toBe("persona_forbidden");
    const owner = await signUp("Orga_Priv");
    const structure = await createStructure(owner.id);
    const noSecond = await say(owner, `s:${structure.id}`, w.post, "Sans second facteur");
    expect(noSecond.status).toBe(403);
    expect(noSecond.json.error.code).toBe("two_factor_required");
    const ok = await signUp("Orga_2fa", { twoFactor: true });
    const s2 = await createStructure(ok.id);
    expect((await say(ok, `s:${s2.id}`, w.post, "Avec second facteur")).status).toBe(201);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s2.id));
    expect((await say(ok, `s:${s2.id}`, w.post, "Suspendue")).status).toBe(403);
    expect(await db.select().from(feedPostComments).where(eq(feedPostComments.persona, "organizer"))).toHaveLength(1);
  });
});

describe("lire : l'auteur est la page, jamais la personne", () => {
  it("liste blanche de FeedCommentView ; servi à un inconnu malgré le compte privé du titulaire ; ni pseudo ni identifiant", async () => {
    const w = await world();
    const root = await say(w.sofia, w.as, w.post, "Le brasero est allumé");
    await say(w.kenji, null, w.post, "Merci !", { parentId: root.json.id });
    const list = await callAs(w.marie, null, "GET", `/feed-posts/${w.post}/comments`);
    expect(list.status).toBe(200);
    expect(list.json.items).toHaveLength(1);
    const view = list.json.items[0];
    expect(Object.keys(view).sort()).toEqual(COMMENT_VIEW_KEYS);
    expect(Object.keys(view.author).sort()).toEqual(AUTHOR_VIEW_KEYS);
    expect(view.author).toMatchObject({ key: `v:${w.brasa.id}`, kind: "provider", name: "La Brasa" });
    expect(view.mine).toBe(false);
    expectNoHolder(list.text, w.sofia);
    const replies = await callAs(w.marie, null, "GET", `/feed-comments/${root.json.id}/replies`);
    expectNoHolder(replies.text, w.sofia);
    // Le titulaire la voit « sienne » et peut la supprimer ; la réponse de Kenji aussi, via la publication d'un autre.
    const mine = await callAs(w.sofia, null, "GET", `/feed-posts/${w.post}/comments`);
    expect(mine.json.items[0]).toMatchObject({ mine: true, canDelete: true });
    expect(root.json.author.key).toBe(`v:${w.brasa.id}`);
    expectNoHolder(root.text, w.sofia);
  });

  it("les derniers commentaires d'une carte du Fil sont signés de la page, sans le compte", async () => {
    const w = await world();
    await say(w.sofia, w.as, w.post, "Vu au Lydia");
    const fil = await callAs(w.marie, null, "GET", "/fil?filter=for_you");
    expect(fil.status).toBe(200);
    const text = JSON.stringify(fil.json);
    expect(text).toContain("Vu au Lydia");
    expect(text).not.toContain(w.sofia.pseudo);
    expect(text).not.toContain(w.sofia.id);
  });

  it("page supprimée ou compte banni : plus servi ; compte du titulaire passé privé : toujours servi", async () => {
    const w = await world();
    await say(w.sofia, w.as, w.post, "Toujours là");
    const count = async () => (await callAs(w.marie, null, "GET", `/feed-posts/${w.post}/comments`)).json.items.length;
    expect(await count()).toBe(1);
    await db.update(providerProfiles).set({ deletedAt: new Date() }).where(eq(providerProfiles.id, w.brasa.id));
    expect(await count()).toBe(0);
    await db.update(providerProfiles).set({ deletedAt: null }).where(eq(providerProfiles.id, w.brasa.id));
    expect(await count()).toBe(1);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, w.sofia.id));
    expect(await count()).toBe(0);
  });
});

describe("suppression", () => {
  it("un autre responsable de la page supprime ; un étranger non (404) ; la structure exige le second facteur", async () => {
    const w = await world();
    const owner = await signUp("Orga_Sup", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const co = await signUp("Co_Sup", { twoFactor: true });
    const coNo2fa = await signUp("Co_Sans2fa");
    await addMember(structure.id, co.id, "co_organizer");
    await addMember(structure.id, coNo2fa.id, "co_organizer");
    const made = await say(owner, `s:${structure.id}`, w.post, "Rendez-vous samedi");
    expect(made.status, made.text).toBe(201);
    expect((await callAs(w.marie, null, "DELETE", `/feed-comments/${made.json.id}`)).status).toBe(404);
    const no2fa = await callAs(coNo2fa, null, "DELETE", `/feed-comments/${made.json.id}`);
    expect(no2fa.status).toBe(403);
    expect(no2fa.json.error.code).toBe("two_factor_required");
    expect((await callAs(co, null, "DELETE", `/feed-comments/${made.json.id}`)).status).toBe(204);
    const [row] = await db.select().from(feedPostComments).where(eq(feedPostComments.id, made.json.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("qui a perdu le droit sur la page ne retire plus son ancien commentaire", async () => {
    const w = await world();
    const made = await say(w.sofia, w.as, w.post, "Avant");
    await db.update(providerProfiles).set({ deletedAt: new Date() }).where(eq(providerProfiles.id, w.brasa.id));
    const res = await callAs(w.sofia, null, "DELETE", `/feed-comments/${made.json.id}`);
    expect(res.status).toBe(404);
  });
});

describe("notifications sans fuite", () => {
  it("l'auteur de la publication lit « La Brasa a commenté ta publication » : data.page, aucun actor, ni compte ni pseudo", async () => {
    const w = await world();
    await say(w.sofia, w.as, w.post, "Super photo");
    const rows = await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id));
    const line = rows.find((n) => n.type === "feed_comment");
    expect(line).toBeDefined();
    expect(line?.title).toBe("La Brasa a commenté ta publication");
    const data = line?.data as Record<string, unknown>;
    expect(data.page).toMatchObject({ key: `v:${w.brasa.id}`, name: "La Brasa" });
    expect(data.actor).toBeUndefined();
    expect(data._actorIds).toBeUndefined();
    expect(data.actorIds).toBeUndefined();
    expectNoHolder(line, w.sofia);
    // La liste de l'Activité et la pastille ne nomment pas la personne non plus.
    const activity = await callAs(w.kenji, null, "GET", "/me/activity");
    expect(activity.status).toBe(200);
    expectNoHolder(activity.text, w.sofia);
  });

  it("une ligne regroupée : la page et une personne ne se mélangent pas, la personne reste nommée seule", async () => {
    const w = await world();
    await say(w.sofia, w.as, w.post, "Un commentaire de la page");
    await say(w.marie, null, w.post, "Un commentaire de Marie");
    const lines = (await db.select().from(notifications).where(eq(notifications.userId, w.kenji.id))).filter(
      (n) => n.type === "feed_comment",
    );
    expect(lines).toHaveLength(2);
    const page = lines.find((n) => (n.data as { page?: unknown }).page);
    const person = lines.find((n) => !(n.data as { page?: unknown }).page);
    expect(page?.title).toContain("La Brasa");
    expect(person?.title).toContain("Marie_66");
    expectNoHolder(lines, w.sofia);
    const activity = await callAs(w.kenji, null, "GET", "/me/activity");
    expectNoHolder(activity.text, w.sofia);
  });

  it("la réponse à un commentaire de page prévient la personne qui l'a écrit ; la page qui commente sa propre publication ne prévient personne", async () => {
    const w = await world();
    const made = await say(w.sofia, w.as, w.post, "Question");
    await say(w.marie, null, w.post, "Réponse", { parentId: made.json.id });
    const forSofia = await db.select().from(notifications).where(eq(notifications.userId, w.sofia.id));
    expect(forSofia.some((n) => n.type === "feed_comment_reply")).toBe(true);
    // La Brasa commente sa propre publication (publiée au nom de la page par Sofia) : aucune notification.
    const own = await dbPost(w.sofia, { persona: "provider", providerId: w.brasa.id });
    await db.delete(notifications);
    const res = await say(w.sofia, w.as, own, "Merci à tous");
    expect(res.status, res.text).toBe(201);
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("une citation dans un commentaire de page prévient la personne citée au nom de la page", async () => {
    const w = await world();
    await say(w.sofia, w.as, w.post, "Merci @Marie_66 !");
    const rows = await db.select().from(notifications).where(eq(notifications.userId, w.marie.id));
    const mention = rows.find((n) => n.type === "feed_comment_mention");
    expect(mention?.title).toBe("La Brasa t'a cité dans un commentaire");
    expectNoHolder(mention, w.sofia);
  });
});

describe("suggestions « @ » en casquette", () => {
  it("la conversation et les comptes publics que la page suit ; jamais le compte du titulaire, un compte privé, ni ses abonnés", async () => {
    const w = await world();
    const follower = await person("Abonne_66");
    const secret = await person("Secret_66", { visibility: "private" });
    await follow(follower, w.sofia);
    await follow(w.sofia, secret);
    await say(w.sofia, w.as, w.post, "Un commentaire de la page");
    await say(w.marie, null, w.post, "Marie participe");
    await db.insert(pageFollows).values({
      followerKind: "provider",
      followerId: w.brasa.id,
      targetKind: "user",
      targetId: w.kenji.id,
    });
    const asPage = await callAs(w.sofia, w.as, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    expect(asPage.status, asPage.text).toBe(200);
    const pseudos = (asPage.json as { pseudo: string }[]).map((s) => s.pseudo);
    expect(pseudos).toContain("Marie_66");
    expect(pseudos).toContain("Kenji_66");
    expect(pseudos).not.toContain("Sofia_66");
    expect(pseudos).not.toContain("Secret_66");
    expect(pseudos).not.toContain("Abonne_66");
    // Sans en-tête, la personne garde ses liens (son abonné, le compte privé qu'elle suit).
    const asPerson = await callAs(w.sofia, null, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    const mine = (asPerson.json as { pseudo: string }[]).map((s) => s.pseudo);
    expect(mine).toContain("Abonne_66");
    // Le fil de discussion ne propose jamais le compte derrière un commentaire de page à un tiers.
    const asMarie = await callAs(w.marie, null, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    expect((asMarie.json as { pseudo: string }[]).map((s) => s.pseudo)).not.toContain("Sofia_66");
  });
});

describe("compte supprimé", () => {
  it("ses commentaires de passionné partent ; ceux d'une page restent à la page (servis tant qu'elle est en règle)", async () => {
    const w = await world();
    const owner = await signUp("Orga_Partante", { twoFactor: true });
    const co = await signUp("Co_Reste", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await addMember(structure.id, co.id, "co_organizer");
    const fan = await say(owner, null, w.post, "Mon avis perso");
    const page = await say(owner, `s:${structure.id}`, w.post, "L'avis de la page");
    const brasa = await say(w.sofia, w.as, w.post, "La Brasa aussi");
    await accountService.anonymize(owner.id, null);
    const rows = await db.select().from(feedPostComments);
    const alive = rows.filter((r) => !r.deletedAt).map((r) => r.id);
    expect(alive).toContain(page.json.id);
    expect(alive).not.toContain(fan.json.id);
    const list = await callAs(w.marie, null, "GET", `/feed-posts/${w.post}/comments`);
    expect(list.json.items.map((i: { text: string }) => i.text)).toContain("L'avis de la page");
    expect(list.json.items.map((i: { text: string }) => i.text)).not.toContain("Mon avis perso");
    expect(list.text).not.toContain(owner.id);
    expect(list.text).not.toContain(owner.pseudo);
    const activity = await callAs(w.kenji, null, "GET", "/me/activity");
    expect(activity.text).not.toContain(owner.id);
    // Un prestataire disparaît avec son titulaire : son commentaire reste en base mais n'est plus servi (page supprimée).
    await accountService.anonymize(w.sofia.id, null);
    expect(
      (await db.select().from(feedPostComments).where(eq(feedPostComments.id, brasa.json.id)))[0]?.deletedAt,
    ).toBeNull();
    const after = await callAs(w.marie, null, "GET", `/feed-posts/${w.post}/comments`);
    expect(after.json.items.map((i: { text: string }) => i.text)).not.toContain("La Brasa aussi");
    expect(after.text).not.toContain(w.sofia.id);
  });
});
