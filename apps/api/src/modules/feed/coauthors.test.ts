// Collaboration (R8o) : inviter, répondre, se retirer, lire. Rien ne montre un co-auteur qui n'a pas accepté ; il se retire
// quand il veut ; seul l'auteur d'origine supprime ; un pro partenaire porte « Collaboration commerciale », non retirable.
import { randomUUID } from "node:crypto";
import { authorKeyOf, type FeedCard, type FeedPostView, fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createPro,
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
import { feedPostCoauthors, feedPosts, notifications, partnerships, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { resetRateLimits } from "../../lib/rateLimit";
import { fil, follow, person } from "./fil-test-helpers";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const CLIENT = "7f1d3a5e-6a47-4f0c-9c1e-2a1d1c0b0c01";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function jpeg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * 1080) / 40}" y="0" width="13" height="1350" fill="${i % 2 ? "#fff" : "#000"}"/>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Une photo 4:5 envoyée, prête à être publiée (« aucune plaque visible » confirmée). */
async function photoOf(u: TestUser) {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new File([new Uint8Array(await jpeg())], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { photos: [{ uploadKey: ((await res.json()) as { key: string }).key, noPlateConfirmed: true }] };
}

type CoKind = "user" | "structure" | "pro" | "media";
const co = (kind: CoKind, id: string) => ({ kind, id });

/** Publie avec un co-auteur invité. */
async function publishWith(
  u: TestUser,
  coAuthor: { kind: CoKind; id: string } | null,
  extra: Record<string, unknown> = {},
) {
  return call(u, "POST", "/me/feed-posts", {
    caption: "Covering satiné terminé, merci",
    ...(await photoOf(u)),
    ...(coAuthor ? { coAuthor } : {}),
    ...extra,
  });
}

/** Le Fil lit les publications jusqu'à l'horloge simulée : on date la publication d'il y a une heure. */
const backdate = (postId: string) =>
  db.execute(sql`update feed_posts set created_at = ${new Date(now().getTime() - 3_600_000)} where id = ${postId}`);

const view = async (u: TestUser, id: string) => (await call(u, "GET", `/feed-posts/${id}`)).json as FeedPostView;
const list = async (viewer: TestUser, key: string) =>
  ((await call(viewer, "GET", `/authors/${encodeURIComponent(key)}/feed-posts`)).json?.items ?? []) as FeedPostView[];
const notifs = async (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
const rowOf = async (postId: string) =>
  (await db.select().from(feedPostCoauthors).where(eq(feedPostCoauthors.postId, postId)))[0];
/** Lot R9d : les demandes d'une structure (`GET /structures/:id/requests`) : une invitation adressée à la page s'y traite, jamais dans `/me/requests`. */
const structureRequests = async (u: TestUser, structureId: string) =>
  ((await call(u, "GET", `/structures/${structureId}/requests`)).json?.items ?? []) as {
    kind: string;
    id: string;
    payload: Record<string, unknown>;
  }[];

const requests = async (u: TestUser) =>
  ((await call(u, "GET", "/me/requests")).json?.items ?? []) as {
    kind: string;
    id: string;
    payload: Record<string, unknown>;
  }[];

/** Deux publics : Kenji publie, Damien est invité. */
async function pair() {
  const kenji = await person("Kenji_66");
  const damien = await person("Damien_66");
  return { kenji, damien };
}

describe("inviter un co-auteur", () => {
  it("la publication part chez son auteur seul ; l'invité est prévenu, l'auteur voit l'état de son invitation", async () => {
    const { kenji, damien } = await pair();
    const res = await publishWith(kenji, co("user", damien.id));
    expect(res.status).toBe(201);
    const post = res.json as FeedPostView;
    expect(post.coAuthor).toBeNull();
    expect(post.coAuthorInvite).toEqual({ key: authorKeyOf("user", damien.id), name: "Damien_66", status: "pending" });
    expect((await rowOf(post.id))?.status).toBe("pending");
    // Une seule notification, à l'invité, jamais à l'auteur.
    const invited = await notifs(damien.id, "coauthor_invited");
    expect(invited).toHaveLength(1);
    expect(invited[0]?.title).toContain("Kenji_66");
    expect(((invited[0] as { data: unknown }).data as { postId?: string }).postId).toBe(post.id);
    expect(await notifs(kenji.id, "coauthor_invited")).toHaveLength(0);
  });

  it("en attente : rien ne montre le co-auteur (ni la publication, ni sa liste, ni son compteur, ni le Fil de ses abonnés)", async () => {
    const { kenji, damien } = await pair();
    const fan = await person("Fan_de_Damien");
    await follow(fan, damien);
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    // Vue par l'invité : aucun co-auteur, aucune invitation.
    const seenByDamien = await view(damien, post.id);
    expect(seenByDamien.coAuthor).toBeNull();
    expect(seenByDamien.coAuthorInvite).toBeNull();
    expect(seenByDamien.coAuthoredByMe).toBe(false);
    // Sa liste de publications et son compteur de profil.
    expect((await list(fan, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(post.id);
    expect((await list(damien, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(post.id);
    const profile = await call(fan, "GET", "/users/Damien_66");
    expect(profile.json?.publications?.count ?? 0).toBe(0);
    // Le Fil de ses abonnés : « Abonnements » ne la contient pas.
    const feed = await fil(fan, "?filter=following");
    expect(feed.items.map((c: FeedCard) => c.id)).not.toContain(`feed_post:${post.id}`);
  });

  it("refuse : soi-même, une info importante, un prestataire", async () => {
    const { kenji, damien } = await pair();
    const self = await publishWith(kenji, co("user", kenji.id));
    expect(self.status).toBe(400);
    expect(self.json.error.code).toBe("coauthor_self");
    const provider = await publishWith(kenji, { kind: "provider" as never, id: randomUUID() });
    expect(provider.status).toBe(400);
    // Une « Info importante » ne se co-signe pas (400 `coauthor_important`, avant même la vérification de l'événement).
    const orga = await signUp("Orga_Co", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const imp = await publishWith(orga, co("user", damien.id), {
      persona: "organizer",
      structureId: structure.id,
      important: { reason: "schedule" },
    });
    expect(imp.status).toBe(400);
    expect(imp.json.error.code).toBe("coauthor_important");
    expect(await db.select().from(feedPostCoauthors)).toHaveLength(0);
  });

  it("refuse la page au nom de laquelle on publie", async () => {
    const orga = await signUp("Orga_Page", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const res = await publishWith(orga, co("structure", structure.id), {
      persona: "organizer",
      structureId: structure.id,
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("coauthor_self");
  });

  it("cible introuvable, supprimée ou suspendue : 422 ; rien n'est publié", async () => {
    const { kenji, damien } = await pair();
    const ghost = await publishWith(kenji, co("structure", randomUUID()));
    expect(ghost.status).toBe(422);
    expect(ghost.json.error.code).toBe("coauthor_unavailable");
    const unknown = await publishWith(kenji, co("user", "pas-un-compte"));
    expect(unknown.status).toBe(422);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, damien.id));
    expect((await publishWith(kenji, co("user", damien.id))).status).toBe(422);
    const banned = await person("Banni_Co");
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, banned.id));
    expect((await publishWith(kenji, co("user", banned.id))).status).toBe(422);
    const owner = await signUp("Orga_Susp", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await db.execute(sql`update structures set verification = 'suspended' where id = ${structure.id}`);
    expect((await publishWith(kenji, co("structure", structure.id))).status).toBe(422);
    // Une fiche pro non publiée n'est pas invitable.
    const garage = await signUp("Garagiste_Co");
    const draft = await createPro(garage.id, { publishedAt: null });
    expect((await publishWith(kenji, co("pro", draft.id))).status).toBe(422);
    expect(await db.select().from(feedPosts).where(eq(feedPosts.authorId, kenji.id))).toHaveLength(0);
  });

  it("10 invitations par jour et par compte", async () => {
    const { kenji, damien } = await pair();
    for (let i = 0; i < 10; i++) {
      const res = await publishWith(kenji, co("user", damien.id), { clientId: randomUUID() });
      expect(res.status, `${i} ${res.text}`).toBe(201);
    }
    const eleventh = await publishWith(kenji, co("user", damien.id), { clientId: randomUUID() });
    expect(eleventh.status).toBe(429);
    expect(eleventh.json.error.code).toBe("coauthor_quota");
    expect(await db.select().from(feedPosts).where(eq(feedPosts.authorId, kenji.id))).toHaveLength(10);
  });

  it("le rejeu du même envoi : une publication, une invitation, une notification", async () => {
    const { kenji, damien } = await pair();
    const body = {
      caption: "Covering satiné",
      ...(await photoOf(kenji)),
      coAuthor: co("user", damien.id),
      clientId: CLIENT,
    };
    const first = await call(kenji, "POST", "/me/feed-posts", body);
    const again = await call(kenji, "POST", "/me/feed-posts", body);
    expect(first.status).toBe(201);
    expect(again.json.id).toBe(first.json.id);
    expect(await db.select().from(feedPostCoauthors)).toHaveLength(1);
    expect(await notifs(damien.id, "coauthor_invited")).toHaveLength(1);
    // Deux envois simultanés du même identifiant : toujours une seule invitation.
    const pic = await photoOf(kenji);
    const [a, b] = await Promise.all([
      call(kenji, "POST", "/me/feed-posts", { ...pic, coAuthor: co("user", damien.id), clientId: randomUUID() }),
      call(kenji, "POST", "/me/feed-posts", { ...pic, coAuthor: co("user", damien.id), clientId: randomUUID() }),
    ]);
    expect([a.status, b.status].filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
  });

  it("sans co-auteur, rien ne change : coAuthor et coAuthorInvite nuls", async () => {
    const { kenji } = await pair();
    const post = (await publishWith(kenji, null)).json as FeedPostView;
    expect(post.coAuthor).toBeNull();
    expect(post.coAuthorInvite).toBeNull();
    expect(post.coAuthoredByMe).toBe(false);
    expect(await db.select().from(feedPostCoauthors)).toHaveLength(0);
  });
});

describe("la demande dans l'Activité", () => {
  it("GET /me/requests rend le genre `coauthor` en liste blanche, et il disparaît à la réponse", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id), { caption: "x".repeat(300) })).json as FeedPostView;
    const items = await requests(damien);
    const item = items.find((i) => i.kind === "coauthor");
    expect(item?.id).toBe(post.id);
    expect(Object.keys(item?.payload ?? {}).sort()).toEqual([
      "author",
      "caption",
      "forKey",
      "forName",
      "photoUrl",
      "postId",
    ]);
    const payload = item?.payload as {
      caption: string;
      author: Record<string, unknown>;
      forName: string | null;
      forKey: string;
    };
    expect(payload.caption.length).toBeLessThanOrEqual(120);
    expect(Object.keys(payload.author).sort()).toEqual(["avatarUrl", "key", "kind", "name"]);
    expect(payload.forName).toBeNull();
    expect(payload.forKey).toBe(authorKeyOf("user", damien.id));
    // Les autres genres gardent leur forme : `total` et `nextCursor` sont toujours là.
    const raw = (await call(damien, "GET", "/me/requests")).json;
    expect(typeof raw.total).toBe("number");
    expect("nextCursor" in raw).toBe(true);
    // L'auteur n'a pas cette demande.
    expect((await requests(kenji)).some((i) => i.kind === "coauthor")).toBe(false);
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    expect((await requests(damien)).some((i) => i.kind === "coauthor")).toBe(false);
  });
});

describe("accepter", () => {
  it("la publication est sur les deux profils, signée des deux, avec l'auteur prévenu", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const res = await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: "accepted" });
    const row = await rowOf(post.id);
    expect(row?.status).toBe("accepted");
    expect(row?.respondedBy).toBe(damien.id);
    const seen = await view(kenji, post.id);
    expect(seen.coAuthor?.key).toBe(authorKeyOf("user", damien.id));
    expect(seen.coAuthor?.name).toBe("Damien_66");
    expect(seen.coAuthorInvite?.status).toBe("accepted");
    const seenByDamien = await view(damien, post.id);
    expect(seenByDamien.coAuthor?.name).toBe("Damien_66");
    expect(seenByDamien.coAuthoredByMe).toBe(true);
    // Un tiers voit la signature mais jamais l'état de l'invitation.
    const stranger = await person("Tiers_Co");
    const seenByStranger = await view(stranger, post.id);
    expect(seenByStranger.coAuthor?.name).toBe("Damien_66");
    expect(seenByStranger.coAuthorInvite).toBeNull();
    expect(seenByStranger.coAuthoredByMe).toBe(false);
    // Dans les deux listes.
    expect((await list(stranger, authorKeyOf("user", kenji.id))).map((p) => p.id)).toContain(post.id);
    expect((await list(stranger, authorKeyOf("user", damien.id))).map((p) => p.id)).toContain(post.id);
    // Compteur du profil du co-auteur.
    expect((await call(stranger, "GET", "/users/Damien_66")).json?.publications?.count).toBe(1);
    // Notification à l'auteur.
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(1);
    expect(await notifs(damien.id, "coauthor_accepted")).toHaveLength(0);
  });

  it("une seule carte dans le Fil, pour qui suit les deux ; suivie aussi par les abonnés du co-auteur seul", async () => {
    const { kenji, damien } = await pair();
    const both = await person("Suit_les_deux");
    const onlyCo = await person("Suit_Damien");
    await follow(both, kenji);
    await follow(both, damien);
    await follow(onlyCo, damien);
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    await backdate(post.id);
    const feed = await fil(both, "?filter=following");
    expect(feed.items.filter((c: FeedCard) => c.id === `feed_post:${post.id}`)).toHaveLength(1);
    const forYou = await fil(both, "?filter=for_you");
    expect(forYou.items.filter((c: FeedCard) => c.id === `feed_post:${post.id}`)).toHaveLength(1);
    // L'abonné du seul co-auteur la reçoit dans « Abonnements », une fois.
    const mine = await fil(onlyCo, "?filter=following");
    expect(mine.items.filter((c: FeedCard) => c.id === `feed_post:${post.id}`)).toHaveLength(1);
    // Le co-auteur lui-même la retrouve dans ses « Abonnements » comme une de ses publications.
    const own = await fil(damien, "?filter=following");
    expect(own.items.filter((c: FeedCard) => c.id === `feed_post:${post.id}`)).toHaveLength(1);
    // Retrait : plus de carte chez les abonnés du seul co-auteur.
    await call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`);
    const after = await fil(onlyCo, "?filter=following");
    expect(after.items.map((c: FeedCard) => c.id)).not.toContain(`feed_post:${post.id}`);
  });

  it("répéter la même réponse est sans effet (une seule notification) ; répondre l'inverse : 409", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    const inverse = await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/decline`);
    expect(inverse.status).toBe(409);
    expect(inverse.json.error.code).toBe("coauthor_closed");
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(1);
  });

  it("personne d'autre que l'invité ne peut répondre : 404 (on ne révèle pas l'invitation)", async () => {
    const { kenji, damien } = await pair();
    const other = await person("Autre_Co");
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    for (const who of [other, kenji]) {
      expect((await call(who, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(404);
      expect((await call(who, "POST", `/me/feed-coauthor-requests/${post.id}/decline`)).status).toBe(404);
    }
    expect((await rowOf(post.id))?.status).toBe("pending");
    expect((await call(null, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(401);
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${randomUUID()}/accept`)).status).toBe(404);
  });
});

describe("refuser", () => {
  it("l'auteur n'est pas prévenu ; il voit « refusée » sur sa publication ; rien ne change dans les listes", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/decline`)).json).toEqual({
      status: "declined",
    });
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(0);
    expect(await notifs(kenji.id, "coauthor_withdrawn")).toHaveLength(0);
    const seen = await view(kenji, post.id);
    expect(seen.coAuthor).toBeNull();
    expect(seen.coAuthorInvite?.status).toBe("declined");
    expect((await list(kenji, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(post.id);
    // La demande a disparu de l'Activité de l'invité, et la notification d'invitation avec elle.
    expect((await requests(damien)).some((i) => i.kind === "coauthor")).toBe(false);
    expect(await notifs(damien.id, "coauthor_invited")).toHaveLength(0);
    // Une fois refusée, on ne peut plus accepter.
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(409);
  });
});

describe("se retirer, retirer, supprimer", () => {
  it("le co-auteur se retire à tout moment, même accepté : la publication reste chez l'auteur, qui est prévenu", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    const res = await call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: "withdrawn" });
    expect((await rowOf(post.id))?.status).toBe("withdrawn");
    const seen = await view(kenji, post.id);
    expect(seen.coAuthor).toBeNull();
    expect(seen.coAuthorInvite?.status).toBe("withdrawn");
    expect((await list(kenji, authorKeyOf("user", kenji.id))).map((p) => p.id)).toContain(post.id);
    expect((await list(kenji, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(post.id);
    expect(await notifs(kenji.id, "coauthor_withdrawn")).toHaveLength(1);
    // Répété : sans effet, pas de seconde notification.
    expect((await call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`)).status).toBe(200);
    expect(await notifs(kenji.id, "coauthor_withdrawn")).toHaveLength(1);
    // Une fois retiré, il ne peut pas revenir en acceptant.
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(409);
  });

  it("se retirer d'une invitation en attente vaut un refus (sans notification)", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    expect((await call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`)).json).toEqual({ status: "declined" });
    expect(await notifs(kenji.id, "coauthor_withdrawn")).toHaveLength(0);
  });

  it("l'auteur annule l'invitation ou retire le co-auteur : la ligne part, sans notification", async () => {
    const { kenji, damien } = await pair();
    const pending = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    expect((await call(kenji, "DELETE", `/feed-posts/${pending.id}/coauthor`)).json).toEqual({ status: "removed" });
    expect(await rowOf(pending.id)).toBeUndefined();
    expect(await notifs(damien.id, "coauthor_invited")).toHaveLength(0);
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${pending.id}/accept`)).status).toBe(404);
    expect((await view(kenji, pending.id)).coAuthorInvite).toBeNull();

    const accepted = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${accepted.id}/accept`);
    expect((await call(kenji, "DELETE", `/feed-posts/${accepted.id}/coauthor`)).json).toEqual({ status: "removed" });
    expect((await view(damien, accepted.id)).coAuthor).toBeNull();
    expect(await notifs(damien.id, "coauthor_withdrawn")).toHaveLength(0);
    expect((await list(kenji, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(accepted.id);
  });

  it("un tiers ne retire rien : 404", async () => {
    const { kenji, damien } = await pair();
    const other = await person("Tiers_Retrait");
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect((await call(other, "DELETE", `/feed-posts/${post.id}/coauthor`)).status).toBe(404);
    expect((await call(null, "DELETE", `/feed-posts/${post.id}/coauthor`)).status).toBe(401);
    expect((await rowOf(post.id))?.status).toBe("accepted");
  });

  it("le co-auteur ne supprime pas, ne modifie pas, ne coupe pas les commentaires ; seul l'auteur supprime et la co-signature part avec", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect((await call(damien, "DELETE", `/me/feed-posts/${post.id}`)).status).toBe(404);
    expect((await call(damien, "PATCH", `/me/feed-posts/${post.id}`, { commercialPartnerId: null })).status).toBe(404);
    const cut = await call(damien, "PUT", `/me/feed-posts/${post.id}/comments-off`, { off: true });
    expect([403, 404]).toContain(cut.status);
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, post.id)))[0]?.commentsOff).toBe(false);
    const seen = await view(damien, post.id);
    expect(seen.mine).toBe(false);
    // L'auteur supprime : la publication et la co-signature disparaissent partout.
    expect((await call(kenji, "DELETE", `/me/feed-posts/${post.id}`)).status).toBe(204);
    expect(await rowOf(post.id)).toBeUndefined();
    expect((await call(damien, "GET", `/feed-posts/${post.id}`)).status).toBe(404);
    expect((await list(damien, authorKeyOf("user", damien.id))).map((p) => p.id)).not.toContain(post.id);
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(0);
  });

  it("supprimer une publication en attente retire la demande et la notification d'invitation", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(kenji, "DELETE", `/me/feed-posts/${post.id}`);
    expect((await requests(damien)).some((i) => i.kind === "coauthor")).toBe(false);
    expect(await notifs(damien.id, "coauthor_invited")).toHaveLength(0);
    expect((await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(404);
  });
});

describe("au nom d'une page", () => {
  it("invite une structure : chaque responsable actif est prévenu, jamais l'auteur ; la demande est celle de la page", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_Inv", { twoFactor: true });
    const staffer = await signUp("CoOrga_Inv");
    const structure = await createStructure(owner.id);
    await addMember(structure.id, staffer.id, "co_organizer");
    const simple = await signUp("Staff_Inv");
    await addMember(structure.id, simple.id, "staff");
    const post = (await publishWith(kenji, co("structure", structure.id))).json as FeedPostView;
    expect(await notifs(owner.id, "coauthor_invited")).toHaveLength(1);
    expect(await notifs(staffer.id, "coauthor_invited")).toHaveLength(1);
    expect(await notifs(simple.id, "coauthor_invited")).toHaveLength(0);
    expect(await notifs(kenji.id, "coauthor_invited")).toHaveLength(0);
    // Lot R9d : la demande de la page se lit dans les demandes de la structure (ancienne assertion : `/me/requests`), jamais dans
    // la liste personnelle du responsable.
    const item = (await structureRequests(owner, structure.id)).find((i) => i.kind === "coauthor");
    expect(((item as { payload: unknown }).payload as { forName: string }).forName).toBe("Club de test");
    expect(((item as { payload: unknown }).payload as { forKey: string }).forKey).toBe(
      authorKeyOf("structure", structure.id),
    );
    expect((await requests(owner)).some((i) => i.kind === "coauthor")).toBe(false);
    // Un simple staff n'est pas responsable : refusé, aucune demande.
    expect((await call(simple, "GET", `/structures/${structure.id}/requests`)).status).toBe(403);
    expect((await structureRequests(simple, structure.id)).some((i) => i.kind === "coauthor")).toBe(false);
    expect((await requests(simple)).some((i) => i.kind === "coauthor")).toBe(false);
    expect(post.coAuthor).toBeNull();
  });

  it("accepter au nom d'une structure exige le second facteur ; un non-responsable reçoit 404 ; responded_by garde qui a répondu", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_2F", { twoFactor: true });
    const noFactor = await signUp("CoOrga_2F");
    const outsider = await signUp("Dehors_2F", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await addMember(structure.id, noFactor.id, "co_organizer");
    const post = (await publishWith(kenji, co("structure", structure.id))).json as FeedPostView;
    const refused = await call(noFactor, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect(refused.status).toBe(403);
    expect((await rowOf(post.id))?.status).toBe("pending");
    expect((await call(outsider, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(404);
    expect((await call(kenji, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(404);
    const ok = await call(owner, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    expect(ok.status).toBe(200);
    const row = await rowOf(post.id);
    expect(row?.status).toBe("accepted");
    expect(row?.respondedBy).toBe(owner.id);
    // Signée du nom de la structure, jamais d'un compte.
    const seen = await view(kenji, post.id);
    expect(seen.coAuthor?.key).toBe(authorKeyOf("structure", structure.id));
    expect(seen.coAuthor?.name).toBe("Club de test");
    // Le responsable (sans second facteur) voit la publication comme sienne pour s'en retirer, mais ne peut pas le faire.
    expect((await view(noFactor, post.id)).coAuthoredByMe).toBe(true);
    expect((await call(noFactor, "DELETE", `/feed-posts/${post.id}/coauthor`)).status).toBe(403);
    expect((await call(owner, "DELETE", `/feed-posts/${post.id}/coauthor`)).json).toEqual({ status: "withdrawn" });
  });

  it("un média et un pro invités répondent par leur titulaire ; une page supprimée ne se montre plus", async () => {
    const kenji = await person("Kenji_66");
    const garagiste = await signUp("Garagiste_R");
    const pro = await createPro(garagiste.id, { name: "Atelier du Port", verifiedAt: new Date() });
    const post = (await publishWith(kenji, co("pro", pro.id))).json as FeedPostView;
    expect((await requests(garagiste)).some((i) => i.kind === "coauthor")).toBe(true);
    expect((await call(garagiste, "POST", `/me/feed-coauthor-requests/${post.id}/accept`)).status).toBe(200);
    expect((await view(kenji, post.id)).coAuthor?.name).toBe("Atelier du Port");
    await db.execute(sql`update pro_profiles set deleted_at = now() where id = ${pro.id}`);
    // La page supprimée : la co-signature disparaît, la publication reste.
    const after = await view(kenji, post.id);
    expect(after.coAuthor).toBeNull();
    expect(after.id).toBe(post.id);
  });

  it("une page où je ne suis pas responsable n'existe pas pour moi (liste d'Activité vide)", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_Nul", { twoFactor: true });
    const other = await signUp("Autre_Nul", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await publishWith(kenji, co("structure", structure.id));
    // Lot R9d : la liste de la structure (ancienne assertion : `/me/requests`). Un autre compte n'y a pas accès.
    expect((await call(other, "GET", `/structures/${structure.id}/requests`)).status).toBe(403);
    expect((await structureRequests(other, structure.id)).some((i) => i.kind === "coauthor")).toBe(false);
    expect((await requests(other)).some((i) => i.kind === "coauthor")).toBe(false);
    expect((await structureRequests(owner, structure.id)).some((i) => i.kind === "coauthor")).toBe(true);
    expect((await requests(owner)).some((i) => i.kind === "coauthor")).toBe(false);
  });
});

describe("collaboration commerciale", () => {
  const partner = async (user: TestUser, proId: string, status: "active" | "ended" = "active") =>
    db.insert(partnerships).values({ proId, userId: user.id, message: "On te suit", status, proposedAt: new Date() });

  it("un pro partenaire actif de l'auteur : la mention est posée dès l'invitation et ne se retire jamais", async () => {
    const kenji = await person("Kenji_66");
    const garagiste = await signUp("Garagiste_P");
    const pro = await createPro(garagiste.id, { name: "Wrap 66", verifiedAt: new Date() });
    await partner(kenji, pro.id);
    const post = (await publishWith(kenji, co("pro", pro.id))).json as FeedPostView;
    expect(post.commercialPartner?.name).toBe("Wrap 66");
    // Un seul message au titulaire (l'invitation), pas un second pour la mention.
    expect(await notifs(garagiste.id, "coauthor_invited")).toHaveLength(1);
    expect(await notifs(garagiste.id, "partner_mention")).toHaveLength(0);
    // En attente comme refusée : la mention reste, et ne se retire pas.
    const patch = await call(kenji, "PATCH", `/me/feed-posts/${post.id}`, { commercialPartnerId: null });
    expect(patch.status).toBe(409);
    expect(patch.json.error.code).toBe("commercial_locked");
    await call(garagiste, "POST", `/me/feed-coauthor-requests/${post.id}/decline`);
    expect((await view(kenji, post.id)).commercialPartner?.name).toBe("Wrap 66");
    // Acceptée puis retirée : toujours là.
    const second = (await publishWith(kenji, co("pro", pro.id))).json as FeedPostView;
    await call(garagiste, "POST", `/me/feed-coauthor-requests/${second.id}/accept`);
    await call(garagiste, "DELETE", `/feed-posts/${second.id}/coauthor`);
    expect((await view(kenji, second.id)).commercialPartner?.name).toBe("Wrap 66");
  });

  it("un pro qui n'est pas partenaire (ou plus) : aucune mention", async () => {
    const kenji = await person("Kenji_66");
    const garagiste = await signUp("Garagiste_N");
    const pro = await createPro(garagiste.id, { name: "Atelier libre", verifiedAt: new Date() });
    const none = (await publishWith(kenji, co("pro", pro.id))).json as FeedPostView;
    expect(none.commercialPartner).toBeNull();
    await partner(kenji, pro.id, "ended");
    const ended = (await publishWith(kenji, co("pro", pro.id))).json as FeedPostView;
    expect(ended.commercialPartner).toBeNull();
  });

  it("la recherche signale le pro partenaire", async () => {
    const kenji = await person("Kenji_66");
    const garagiste = await signUp("Garagiste_S");
    const pro = await createPro(garagiste.id, { name: "Wrap 66", verifiedAt: new Date() });
    const before = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=wrap&kind=pro");
    expect(before.json.items).toEqual([
      expect.objectContaining({ key: authorKeyOf("pro", pro.id), kind: "pro", name: "Wrap 66", partner: false }),
    ]);
    await partner(kenji, pro.id);
    const after = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=wrap&kind=pro");
    expect(after.json.items[0].partner).toBe(true);
  });
});

describe("concurrence : un seul état final", () => {
  it("accepter et supprimer en même temps : la publication est supprimée et aucune co-signature ne reste", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const [accept, del] = await Promise.all([
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
      call(kenji, "DELETE", `/me/feed-posts/${post.id}`),
    ]);
    expect(del.status).toBe(204);
    expect([200, 404]).toContain(accept.status);
    expect(await rowOf(post.id)).toBeUndefined();
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, post.id)))[0]?.deletedAt).not.toBeNull();
    // Aucune notification d'acceptation ne reste pour une publication supprimée.
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(0);
  });

  it("accepter et refuser en même temps : une réponse l'emporte, l'autre est refusée, l'état est celui du vainqueur", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const [a, d] = await Promise.all([
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/decline`),
    ]);
    expect([a.status, d.status].sort()).toEqual([200, 409]);
    const row = await rowOf(post.id);
    expect(row?.status).toBe(a.status === 200 ? "accepted" : "declined");
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(row?.status === "accepted" ? 1 : 0);
  });

  it("deux acceptations simultanées : une notification", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const results = await Promise.all([
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(1);
    expect((await rowOf(post.id))?.status).toBe("accepted");
  });

  it("accepter et retirer l'invitation (auteur) en même temps : jamais d'état impossible", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const [accept, removed] = await Promise.all([
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
      call(kenji, "DELETE", `/feed-posts/${post.id}/coauthor`),
    ]);
    expect(removed.status).toBe(200);
    expect([200, 404]).toContain(accept.status);
    // Quelle que soit la course, la ligne est partie : ni co-signature, ni demande.
    expect(await rowOf(post.id)).toBeUndefined();
    expect((await view(damien, post.id)).coAuthor).toBeNull();
  });

  it("accepter et se retirer en même temps : un état cohérent", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const [accept, leave] = await Promise.all([
      call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`),
      call(damien, "DELETE", `/feed-posts/${post.id}/coauthor`),
    ]);
    expect([200, 409]).toContain(accept.status);
    expect(leave.status).toBe(200);
    const row = await rowOf(post.id);
    expect(["declined", "withdrawn"]).toContain(row?.status);
    expect((await view(kenji, post.id)).coAuthor).toBeNull();
  });
});

describe("recherche d'un co-auteur", () => {
  it("moins de deux caractères : rien ; huit résultats au plus ; jamais soi-même ni un compte privé non suivi", async () => {
    const kenji = await person("Kenji_66");
    expect((await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=a")).json).toEqual({ items: [] });
    expect((await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=")).json).toEqual({ items: [] });
    for (let i = 0; i < 10; i++) await person(`Pilote_${i}`);
    const many = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=pilote");
    expect(many.status).toBe(200);
    expect(many.json.items).toHaveLength(8);
    const self = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=kenji");
    expect(self.json.items).toEqual([]);
    const secret = await person("Secret_Co", { visibility: "private" });
    expect((await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=secret")).json.items).toEqual([]);
    await follow(kenji, secret);
    const seen = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=secret");
    expect(seen.json.items).toHaveLength(1);
    expect(seen.json.items[0].key).toBe(authorKeyOf("user", secret.id));
  });

  it("liste blanche : key, kind, name, avatarUrl, verified, partner ; un suspendu, un banni, un supprimé n'y sont pas", async () => {
    const kenji = await person("Kenji_66");
    const a = await person("Alpha_Co");
    const b = await person("Alpha_Banni");
    const c = await person("Alpha_Supprime");
    const d = await person("Alpha_Suspendu");
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, b.id));
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, c.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, d.id));
    const res = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=alpha");
    expect(res.json.items).toHaveLength(1);
    expect(Object.keys(res.json.items[0]).sort()).toEqual(["avatarUrl", "key", "kind", "name", "partner", "verified"]);
    expect(res.json.items[0].key).toBe(authorKeyOf("user", a.id));
    expect(JSON.stringify(res.json)).not.toContain("@");
    expect((await call(null, "GET", "/me/feed-posts/coauthor-search?q=alpha")).status).toBe(401);
  });

  it("les quatre genres : personne, structure, pro, média ; le filtre `kind` les sépare", async () => {
    const kenji = await person("Kenji_66");
    await person("Studio_Pers");
    const owner = await signUp("Orga_Rech", { twoFactor: true });
    const structure = await createStructure(owner.id);
    await db.execute(sql`update structures set name = 'Studio Club' where id = ${structure.id}`);
    const garagiste = await signUp("Garagiste_Rech");
    await createPro(garagiste.id, { name: "Studio Pro", verifiedAt: new Date() });
    const media = await signUp("Media_Rech");
    await db.execute(sql`insert into media_profiles (user_id, name) values (${media.id}, 'Studio Media')`);
    const all = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=studio");
    expect((all.json.items as { kind: string }[]).map((i) => i.kind).sort()).toEqual([
      "media",
      "pro",
      "structure",
      "user",
    ]);
    const onlyPro = await call(kenji, "GET", "/me/feed-posts/coauthor-search?q=studio&kind=pro");
    expect((onlyPro.json.items as { kind: string }[]).map((i) => i.kind)).toEqual(["pro"]);
  });
});

describe("compte supprimé", () => {
  it("le nom du co-auteur disparaît de la publication, qui reste chez son auteur", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, damien.id));
    const seen = await view(kenji, post.id);
    expect(seen.coAuthor).toBeNull();
    expect(seen.coAuthorInvite).toBeNull();
    expect(seen.id).toBe(post.id);
    // L'anonymisation efface aussi la ligne.
    const { withTx } = await import("../../lib/tx");
    const { anonymizeFeedForDeletedAccount } = await import("./anonymize");
    await withTx((tx) => anonymizeFeedForDeletedAccount(tx, damien.id));
    expect(await rowOf(post.id)).toBeUndefined();
  });

  it("l'auteur supprimé emporte ses invitations ; une publication de page reste", async () => {
    const { kenji, damien } = await pair();
    const post = (await publishWith(kenji, co("user", damien.id))).json as FeedPostView;
    const { withTx } = await import("../../lib/tx");
    const { anonymizeFeedForDeletedAccount } = await import("./anonymize");
    await withTx((tx) => anonymizeFeedForDeletedAccount(tx, kenji.id));
    expect(await rowOf(post.id)).toBeUndefined();
    expect(await notifs(damien.id, "coauthor_invited")).toHaveLength(0);
    expect((await requests(damien)).some((i) => i.kind === "coauthor")).toBe(false);
  });
});
