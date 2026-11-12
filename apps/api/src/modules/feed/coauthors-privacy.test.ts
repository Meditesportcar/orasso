// Collaboration (R8o), vie privée et droits, par regard : auteur, invité, abonné de l'un ou de l'autre, membre connecté,
// responsable de la page avec et sans second facteur, sans session. Une co-signature n'ouvre jamais une publication d'un
// compte privé à qui ne le suit pas ; aucune réponse ne porte d'identifiant de compte hors des clés d'auteur.
import { randomUUID } from "node:crypto";
import { authorKeyOf, type FeedCard, type FeedPostView, fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createStructure,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { feedPostCoauthors, notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { resetRateLimits } from "../../lib/rateLimit";
import { fil, follow, person } from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function photoOf(u: TestUser) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * 1080) / 40}" y="0" width="13" height="1350" fill="${i % 2 ? "#fff" : "#000"}"/>`).join("")}</svg>`;
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append(
    "file",
    new File([new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer())], "photo.jpg", { type: "image/jpeg" }),
  );
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { photos: [{ uploadKey: ((await res.json()) as { key: string }).key, noPlateConfirmed: true }] };
}

type CoKind = "user" | "structure" | "pro" | "media";
const publishWith = async (u: TestUser, coAuthor: { kind: CoKind; id: string }, extra: Record<string, unknown> = {}) =>
  call(u, "POST", "/me/feed-posts", { caption: "Une collaboration", ...(await photoOf(u)), coAuthor, ...extra });

const backdate = (postId: string) =>
  db.execute(sql`update feed_posts set created_at = ${new Date(now().getTime() - 3_600_000)} where id = ${postId}`);
const ids = async (viewer: TestUser | null, key: string) =>
  (
    ((await call(viewer, "GET", `/authors/${encodeURIComponent(key)}/feed-posts`)).json?.items ?? []) as FeedPostView[]
  ).map((p) => p.id);
const notifs = async (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

/** Kenji (compte privé), Damien (public, co-auteur), un abonné de Kenji et un inconnu. */
async function privateSetup() {
  const kenji = await person("Kenji_Prive", { visibility: "private" });
  const damien = await person("Damien_Pub");
  const follower = await person("Abonne_Kenji");
  const stranger = await person("Inconnu_Co");
  await follow(damien, kenji);
  await follow(follower, kenji);
  return { kenji, damien, follower, stranger };
}

describe("compte privé : invitation", () => {
  it("une personne qui ne pourrait pas voir la publication n'est pas invitable : 422 `coauthor_cannot_see`", async () => {
    const kenji = await person("Kenji_Prive", { visibility: "private" });
    const outsider = await person("Hors_Cercle");
    const res = await publishWith(kenji, { kind: "user", id: outsider.id });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("coauthor_cannot_see");
    expect(await db.select().from(feedPostCoauthors)).toHaveLength(0);
    // Une demande d'abonnement encore en attente ne suffit pas.
    const pending = await person("Demande_Attente");
    await follow(pending, kenji, "pending");
    expect((await publishWith(kenji, { kind: "user", id: pending.id })).status).toBe(422);
    // Une personne abonnée (acceptée) est invitable.
    const friend = await person("Abonne_Ok");
    await follow(friend, kenji);
    expect((await publishWith(kenji, { kind: "user", id: friend.id })).status).toBe(201);
  });

  it("une page : chaque responsable doit suivre l'auteur privé ; sinon 422", async () => {
    const kenji = await person("Kenji_Prive", { visibility: "private" });
    const owner = await signUp("Orga_Prive", { twoFactor: true });
    const second = await signUp("CoOrga_Prive");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, second.id, "co_organizer");
    await follow(owner, kenji);
    expect((await publishWith(kenji, { kind: "structure", id: structure.id })).status).toBe(422);
    await follow(second, kenji);
    expect((await publishWith(kenji, { kind: "structure", id: structure.id })).status).toBe(201);
  });

  it("un auteur public invite n'importe qui (la règle ne vaut que pour un compte privé)", async () => {
    const kenji = await person("Kenji_Public");
    const outsider = await person("Hors_Cercle");
    expect((await publishWith(kenji, { kind: "user", id: outsider.id })).status).toBe(201);
  });
});

describe("compte privé : la co-signature n'ouvre rien", () => {
  it("la publication d'un auteur privé n'apparaît pas à qui ne le suit pas, même sur le profil public du co-auteur", async () => {
    const { kenji, damien, follower, stranger } = await privateSetup();
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    await backdate(post.id);
    const damienKey = authorKeyOf("user", damien.id);
    // L'inconnu : ni la liste du co-auteur, ni la page de la publication, ni le Fil, ni le compteur.
    expect(await ids(stranger, damienKey)).not.toContain(post.id);
    expect((await call(stranger, "GET", `/feed-posts/${post.id}`)).status).toBe(404);
    expect((await fil(stranger, "?filter=for_you")).items.map((c: FeedCard) => c.id)).not.toContain(
      `feed_post:${post.id}`,
    );
    expect((await call(stranger, "GET", "/users/Damien_Pub")).json?.publications?.count).toBe(0);
    // Un abonné de l'auteur privé la voit, signée des deux, dans les deux listes et dans le compteur du co-auteur.
    expect(await ids(follower, damienKey)).toContain(post.id);
    expect(await ids(follower, authorKeyOf("user", kenji.id))).toContain(post.id);
    expect((await call(follower, "GET", "/users/Damien_Pub")).json?.publications?.count).toBe(1);
    const seen = (await call(follower, "GET", `/feed-posts/${post.id}`)).json as FeedPostView;
    expect(seen.coAuthor?.name).toBe("Damien_Pub");
    // Le co-auteur, qui suit l'auteur, la voit dans sa propre liste.
    expect(await ids(damien, damienKey)).toContain(post.id);
    // Sans session : rien.
    expect((await call(null, "GET", `/authors/${encodeURIComponent(damienKey)}/feed-posts`)).status).toBe(401);
  });

  it("l'auteur passé en compte privé depuis l'invitation : l'invité qui ne le suit pas ne peut plus répondre (404)", async () => {
    const kenji = await person("Kenji_Public");
    const damien = await person("Damien_Pub");
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(404);
    expect(
      (await call(damien, "GET", "/me/requests")).json.items.some((i: { kind: string }) => i.kind === "coauthor"),
    ).toBe(false);
    const row = (await db.select().from(feedPostCoauthors))[0];
    expect(row?.status).toBe("pending");
  });

  it("sans session, la page publique d'une structure co-signataire ne sert jamais la publication d'une personne", async () => {
    const kenji = await person("Kenji_Public");
    const owner = await signUp("Orga_Pub", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const post = (await publishWith(kenji, { kind: "structure", id: structure.id })).json as FeedPostView;
    expect((await call(owner, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    const key = authorKeyOf("structure", structure.id);
    // Un membre connecté la voit dans la liste de la structure (co-signée, acceptée) ; un visiteur sans session, jamais.
    expect(await ids(kenji, key)).toContain(post.id);
    const anon = await call(null, "GET", `/authors/${encodeURIComponent(key)}/feed-posts`);
    expect(anon.status).toBe(200);
    expect((anon.json.items as { id: string }[]).map((i) => i.id)).not.toContain(post.id);
    expect(JSON.stringify(anon.json)).not.toContain("Kenji_Public");
  });
});

describe("regards : en attente, rien ne montre le co-auteur", () => {
  it("auteur, invité, abonnés de l'un et de l'autre, membre connecté, sans session", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const ofKenji = await person("Abonne_Kenji");
    const ofDamien = await person("Abonne_Damien");
    const member = await person("Membre_Co");
    await follow(ofKenji, kenji);
    await follow(ofDamien, damien);
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await backdate(post.id);
    const one = async (u: TestUser) => (await call(u, "GET", `/feed-posts/${post.id}`)).json as FeedPostView;
    // Seul l'auteur voit l'état de son invitation ; personne ne voit de co-auteur.
    expect((await one(kenji)).coAuthorInvite?.status).toBe("pending");
    for (const u of [damien, ofKenji, ofDamien, member]) {
      const v = await one(u);
      expect(v.coAuthor).toBeNull();
      expect(v.coAuthorInvite).toBeNull();
      expect(v.coAuthoredByMe).toBe(false);
    }
    expect((await call(null, "GET", `/feed-posts/${post.id}`)).status).toBe(401);
    // Le Fil de l'abonné du seul invité : ni « Abonnements », ni la liste du co-auteur.
    expect((await fil(ofDamien, "?filter=following")).items.map((c: FeedCard) => c.id)).not.toContain(
      `feed_post:${post.id}`,
    );
    expect(await ids(ofDamien, authorKeyOf("user", damien.id))).not.toEqual(expect.arrayContaining([post.id]));
    // L'abonné de l'auteur la voit sans co-auteur.
    expect((await fil(ofKenji, "?filter=following")).items.map((c: FeedCard) => c.id)).toContain(
      `feed_post:${post.id}`,
    );
  });

  it("la carte du Fil ne porte aucun nom de co-auteur tant qu'il n'a pas accepté", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await backdate(post.id);
    const feed = await fil(damien, "?filter=for_you");
    const card = feed.items.find((c: FeedCard) => c.id === `feed_post:${post.id}`);
    expect(card).toBeDefined();
    expect(JSON.stringify(card)).not.toContain("coauthor-invited");
    expect(((card as FeedCard).payload as { post: FeedPostView }).post.coAuthor).toBeNull();
    expect(((card as FeedCard).payload as { post: FeedPostView }).post.coAuthorInvite).toBeNull();
  });
});

describe("liste blanche : aucun identifiant de compte hors des clés d'auteur", () => {
  it("coAuthor, coAuthorInvite, la demande et la notification n'ont que les champs prévus", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_Blanche", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const post = (await publishWith(kenji, { kind: "structure", id: structure.id })).json as FeedPostView;
    expect(Object.keys(post.coAuthorInvite ?? {}).sort()).toEqual(["key", "name", "status"]);
    await call(owner, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    const seen = (await call(kenji, "GET", `/feed-posts/${post.id}`)).json as FeedPostView;
    expect(Object.keys(seen.coAuthor ?? {}).sort()).toEqual(
      ["avatarUrl", "grade", "key", "kind", "name", "official", "pseudo", "verified"].sort(),
    );
    // Aucun compte (le titulaire de la structure) n'est cité dans la carte de la page.
    const text = JSON.stringify(seen.coAuthor);
    expect(text).not.toContain(owner.id);
    expect(text).not.toContain(owner.pseudo);
    const note = (await notifs(kenji.id, "coauthor_accepted"))[0];
    expect(note?.title).toContain("Club de test");
    expect(JSON.stringify(note?.data)).not.toContain(owner.id);
    expect(JSON.stringify(note?.data)).not.toContain(owner.pseudo);
  });

  it("une publication de page invite une personne : la page signe, le compte qui a publié n'est jamais nommé", async () => {
    const owner = await signUp("Orga_Page", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const damien = await person("Damien_66");
    const post = (
      await publishWith(owner, { kind: "user", id: damien.id }, { persona: "organizer", structureId: structure.id })
    ).json as FeedPostView;
    expect(post.author.name).toBe("Club de test");
    const invited = (await notifs(damien.id, "coauthor_invited"))[0];
    expect(invited?.title).toContain("Club de test");
    expect(JSON.stringify(invited)).not.toContain("Orga_Page");
    const item = (
      (await call(damien, "GET", "/me/requests")).json.items as { kind: string; from: unknown; payload: unknown }[]
    ).find((i) => i.kind === "coauthor");
    expect(JSON.stringify(item)).not.toContain("Orga_Page");
    expect(JSON.stringify(item)).not.toContain(owner.id);
    // Un autre responsable de la page voit l'état de l'invitation ; l'invité, non.
    const second = await signUp("CoOrga_Page", { twoFactor: true });
    await addMember(structure.id, second.id, "co_organizer");
    expect(((await call(second, "GET", `/feed-posts/${post.id}`)).json as FeedPostView).coAuthorInvite?.status).toBe(
      "pending",
    );
    expect(((await call(damien, "GET", `/feed-posts/${post.id}`)).json as FeedPostView).coAuthorInvite).toBeNull();
    // L invité qui se retire d une invitation en attente la refuse.
    expect((await call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`)).json).toEqual({ status: "declined" });
  });

  it("l'auteur d'une page sans second facteur ne retire pas le co-auteur", async () => {
    const owner = await signUp("Orga_Page", { twoFactor: true });
    const noFactor = await signUp("CoOrga_Sans");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, noFactor.id, "co_organizer");
    const damien = await person("Damien_66");
    const post = (
      await publishWith(owner, { kind: "user", id: damien.id }, { persona: "organizer", structureId: structure.id })
    ).json as FeedPostView;
    const res = await call(noFactor, "DELETE", `/feed-posts/${post.id}/coauthor`);
    expect(res.status).toBe(403);
    expect((await db.select().from(feedPostCoauthors))[0]?.status).toBe("pending");
    expect((await call(owner, "DELETE", `/feed-posts/${post.id}/coauthor`)).json).toEqual({ status: "removed" });
  });
});

describe("comptes hors règle", () => {
  it("un co-auteur suspendu ou banni disparaît de la publication ; un suspendu ne peut pas répondre", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const lea = await person("Lea_66");
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    const other = (await publishWith(kenji, { kind: "user", id: lea.id })).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, damien.id));
    expect(((await call(kenji, "GET", `/feed-posts/${post.id}`)).json as FeedPostView).coAuthor).toBeNull();
    expect(await ids(kenji, authorKeyOf("user", kenji.id))).toContain(post.id);
    // Suspendu : ses écritures sont coupées (réponse refusée), la demande reste en attente.
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 7) })
      .where(eq(profiles.userId, lea.id));
    const res = await call(lea, "POST", `/me/feed-coauthor-requests/${other.id}/accept`);
    expect([401, 403]).toContain(res.status);
    expect((await db.select().from(feedPostCoauthors).where(eq(feedPostCoauthors.postId, other.id)))[0]?.status).toBe(
      "pending",
    );
  });

  it("un auteur banni emporte sa publication : plus de demande pour l'invité", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    await publishWith(kenji, { kind: "user", id: damien.id });
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, kenji.id));
    const items = (await call(damien, "GET", "/me/requests")).json.items as { kind: string }[];
    expect(items.some((i) => i.kind === "coauthor")).toBe(false);
  });
});

describe("notifications", () => {
  it("jamais à soi : inviter une page que je gère ne me prévient pas moi-même, mais l'autre responsable", async () => {
    const owner = await signUp("Orga_A", { twoFactor: true });
    const second = await signUp("Orga_B", { twoFactor: true });
    const mine = await createStructure(owner.id);
    const other = await createStructure(second.id);
    await addMember(other.id, owner.id, "co_organizer");
    const kenji = owner;
    // `owner` publie à titre personnel et invite la structure `other` dont il est aussi co-organisateur.
    const post = (await publishWith(kenji, { kind: "structure", id: other.id })).json as FeedPostView;
    expect(post.coAuthorInvite?.status).toBe("pending");
    expect(await notifs(owner.id, "coauthor_invited")).toHaveLength(0);
    expect(await notifs(second.id, "coauthor_invited")).toHaveLength(1);
    expect(mine.id).toBeDefined();
    // Il voit tout de même la demande dans son Activité (il gère la page invitée).
    const items = (await call(owner, "GET", "/me/requests")).json.items as { kind: string; id: string }[];
    expect(items.some((i) => i.kind === "coauthor" && i.id === post.id)).toBe(true);
    // En répondant lui-même, il ne se prévient pas.
    await call(owner, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect(await notifs(owner.id, "coauthor_accepted")).toHaveLength(0);
  });

  it("le lien d une notification d invitation mène aux Demandes ; d une acceptation, à la publication (par `postId`, comme les mentions)", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    const invited = (await notifs(damien.id, "coauthor_invited"))[0];
    expect(((invited as { data: unknown }).data as { link?: string }).link).toBe("/app/activite/demandes");
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    const accepted = (await notifs(kenji.id, "coauthor_accepted"))[0];
    expect(((accepted as { data: unknown }).data as { link?: string }).link).toBe("/app/fil");
    expect(randomUUID()).toBeDefined();
  });
});
