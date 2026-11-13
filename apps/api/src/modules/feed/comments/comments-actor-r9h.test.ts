// Lot R9h, tour 1 : sous une casquette, tout ce qui se lit dans une conversation de publication (commentaires, réponses,
// suggestions de mentions) se lit avec les droits de la page (un membre sans aucun lien), comme l'écriture : jamais avec le réseau
// personnel du titulaire (les comptes privés qu'il suit).
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../../test/actor-call";
import { createStructure, resetDb, signUp, useClock } from "../../../../test/helpers";
import { db, pool } from "../../../db/client";
import { providerProfiles } from "../../../db/schema";
import { dbPost, follow, person, type TestUser } from "./testkit";

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
  const kenji = await person("Kenji_66");
  const marie = await person("Marie_66");
  const secret = await person("Secret_66", { visibility: "private" });
  // Sofia suit Secret_66 à titre personnel ; sa page (La Brasa) n'a aucun lien avec lui.
  await follow(sofia, secret);
  const [brasa] = await db
    .insert(providerProfiles)
    .values({ userId: sofia.id, type: "photographer", name: "La Brasa" })
    .returning();
  const page = brasa as NonNullable<typeof brasa>;
  const post = await dbPost(kenji, { createdAt: new Date("2026-11-12T11:00:00Z") });
  return { sofia, kenji, marie, secret, post, as: `v:${page.id}` };
}

const texts = (json: unknown) => (json as { items: { text: string }[] }).items.map((i) => i.text);

describe("la conversation se lit avec les droits de la page", () => {
  it("un commentaire d'un compte privé suivi personnellement : lu par la personne, jamais sous la page", async () => {
    const w = await world();
    expect((await say(w.secret, null, w.post, "Un avis privé")).status).toBe(201);
    expect((await say(w.marie, null, w.post, "Un avis public")).status).toBe(201);
    const person = await callAs(w.sofia, null, "GET", `/feed-posts/${w.post}/comments`);
    expect(texts(person.json).sort()).toEqual(["Un avis privé", "Un avis public"]);
    const page = await callAs(w.sofia, w.as, "GET", `/feed-posts/${w.post}/comments`);
    expect(page.status, page.text).toBe(200);
    expect(texts(page.json)).toEqual(["Un avis public"]);
  });

  it("les réponses : celles d'un compte privé suivi disparaissent sous la page ; le commentaire privé lui-même est un 404", async () => {
    const w = await world();
    const open = await say(w.marie, null, w.post, "Un avis public");
    const hidden = await say(w.secret, null, w.post, "Un avis privé");
    expect((await say(w.secret, null, w.post, "Réponse privée", { parentId: open.json.id })).status).toBe(201);
    expect((await say(w.kenji, null, w.post, "Réponse publique", { parentId: open.json.id })).status).toBe(201);
    expect(texts((await callAs(w.sofia, null, "GET", `/feed-comments/${open.json.id}/replies`)).json).sort()).toEqual([
      "Réponse privée",
      "Réponse publique",
    ]);
    const asPage = await callAs(w.sofia, w.as, "GET", `/feed-comments/${open.json.id}/replies`);
    expect(asPage.status, asPage.text).toBe(200);
    expect(texts(asPage.json)).toEqual(["Réponse publique"]);
    // Le commentaire privé (premier niveau) : permis à la personne, 404 sous la page (comme l'écriture).
    expect((await callAs(w.sofia, null, "GET", `/feed-comments/${hidden.json.id}/replies`)).status).toBe(200);
    expect((await callAs(w.sofia, w.as, "GET", `/feed-comments/${hidden.json.id}/replies`)).status).toBe(404);
  });

  it("une page qu'on ne tient pas : 403 `persona_forbidden`, comme à l'écriture", async () => {
    const w = await world();
    const res = await callAs(w.marie, w.as, "GET", `/feed-posts/${w.post}/comments`);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("persona_forbidden");
  });

  it("suggestions « @ » : une publication que seule la personne voit (compte privé suivi) est un 404 sous la page", async () => {
    const w = await world();
    const privatePost = await dbPost(w.secret, { createdAt: new Date("2026-11-12T11:00:00Z") });
    expect((await callAs(w.sofia, null, "GET", `/feed-posts/${privatePost}/mention-suggestions?q=`)).status).toBe(200);
    expect((await callAs(w.sofia, w.as, "GET", `/feed-posts/${privatePost}/mention-suggestions?q=`)).status).toBe(404);
    // Et ses commentaires : même règle que la publication.
    expect((await callAs(w.sofia, null, "GET", `/feed-posts/${privatePost}/comments`)).status).toBe(200);
    expect((await callAs(w.sofia, w.as, "GET", `/feed-posts/${privatePost}/comments`)).status).toBe(404);
  });

  it("suggestions « @ » : les résultats sous la page n'ont aucun compte privé suivi personnellement", async () => {
    const w = await world();
    await say(w.secret, null, w.post, "Un avis privé");
    await say(w.marie, null, w.post, "Marie participe");
    const asPage = await callAs(w.sofia, w.as, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    const pseudos = (asPage.json as { pseudo: string }[]).map((s) => s.pseudo);
    expect(pseudos).toContain("Marie_66");
    expect(pseudos).not.toContain("Secret_66");
    const asPerson = await callAs(w.sofia, null, "GET", `/feed-posts/${w.post}/mention-suggestions?q=`);
    expect((asPerson.json as { pseudo: string }[]).map((s) => s.pseudo)).toContain("Secret_66");
  });
});

describe("une page garde la main sur la conversation de SES publications (tour 2, décision du coordinateur)", () => {
  async function structureWorld() {
    const owner = await signUp("Orga_66", { twoFactor: true });
    const s = await createStructure(owner.id);
    const other = await createStructure(owner.id);
    const secret = await person("Secret_66", { visibility: "private" });
    const marie = await person("Marie_66");
    const kenji = await person("Kenji_66");
    const own = await dbPost(owner, {
      persona: "organizer",
      structureId: s.id,
      createdAt: new Date("2026-11-12T11:00:00Z"),
    });
    const third = await dbPost(kenji, { createdAt: new Date("2026-11-12T11:00:00Z") });
    return { owner, s, other, secret, marie, kenji, own, third, as: `s:${s.id}`, asOther: `s:${other.id}` };
  }
  const items = (json: unknown) => (json as { items: { id: string; text: string; canDelete: boolean }[] }).items;

  it("sur sa propre publication : le commentaire d'un compte privé non suivi est lu, supprimable et « répondable » sous la page", async () => {
    const w = await structureWorld();
    const hidden = await say(w.secret, null, w.own, "Un avis privé");
    expect(hidden.status, hidden.text).toBe(201);
    await say(w.marie, null, w.own, "Un avis public");
    const list = await callAs(w.owner, w.as, "GET", `/feed-posts/${w.own}/comments`);
    expect(list.status, list.text).toBe(200);
    expect(
      items(list.json)
        .map((i) => i.text)
        .sort(),
    ).toEqual(["Un avis privé", "Un avis public"]);
    // Le compteur et la liste disent la même chose, et tout est supprimable par la page.
    expect(items(list.json).every((i) => i.canDelete)).toBe(true);
    // Ses réponses se lisent aussi, et on peut y répondre au nom de la page.
    expect((await say(w.marie, null, w.own, "Réponse publique", { parentId: hidden.json.id })).status).toBe(404);
    const reply = await say(w.owner, w.as, w.own, "Merci", { parentId: hidden.json.id });
    expect(reply.status, reply.text).toBe(201);
    const replies = await callAs(w.owner, w.as, "GET", `/feed-comments/${hidden.json.id}/replies`);
    expect(replies.status, replies.text).toBe(200);
    expect(items(replies.json).map((i) => i.text)).toEqual(["Merci"]);
    // Supprimer le commentaire privé.
    expect((await callAs(w.owner, null, "DELETE", `/feed-comments/${hidden.json.id}`)).status).toBe(204);
  });

  it("sous une autre page, sur la même publication : rien de privé, rien de supprimable", async () => {
    const w = await structureWorld();
    await say(w.secret, null, w.own, "Un avis privé");
    await say(w.marie, null, w.own, "Un avis public");
    const list = await callAs(w.owner, w.asOther, "GET", `/feed-posts/${w.own}/comments`);
    expect(items(list.json).map((i) => i.text)).toEqual(["Un avis public"]);
    expect(items(list.json).some((i) => i.canDelete)).toBe(false);
  });

  it("sur la publication d'un tiers : droits de la page sans lien, aucun commentaire privé, canDelete faux", async () => {
    const w = await structureWorld();
    await say(w.secret, null, w.third, "Un avis privé");
    await say(w.marie, null, w.third, "Un avis public");
    const list = await callAs(w.owner, w.as, "GET", `/feed-posts/${w.third}/comments`);
    expect(items(list.json).map((i) => i.text)).toEqual(["Un avis public"]);
    expect(items(list.json).some((i) => i.canDelete)).toBe(false);
  });
});
