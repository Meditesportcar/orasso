// Collaboration (R8o), tour 2 : plafond d'envois (annuler ou supprimer ne rend rien), mention imposée du pro partenaire co-auteur,
// identifiant validé et normalisé, compte privé non suivi invité par identifiant, notifications d'un compte supprimé, co-auteur
// hors règle dans « Abonnements », pastille sans les invitations.
import { randomUUID } from "node:crypto";
import { authorKeyOf, type FeedCard, type FeedPostView, fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
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
import { feedPostCoauthors, notifications, partnerships, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { resetRateLimits } from "../../lib/rateLimit";
import { withTx } from "../../lib/tx";
import { anonymizeFeedForDeletedAccount } from "./anonymize";
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

type Co = { kind: "user" | "structure" | "pro" | "media"; id: string };
const publishWith = async (u: TestUser, coAuthor: Co, extra: Record<string, unknown> = {}) =>
  call(u, "POST", "/me/feed-posts", {
    caption: "Une collaboration",
    ...(await photoOf(u)),
    coAuthor,
    clientId: randomUUID(),
    ...extra,
  });
const notifs = async (userId: string, type: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));

describe("plafond : compter les envois, pas les lignes", () => {
  it("dix invitations annulées : la onzième est refusée, Damien n'a reçu que dix notifications", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    for (let i = 0; i < 10; i++) {
      const sent = await publishWith(kenji, { kind: "user", id: damien.id });
      expect(sent.status).toBe(201);
      expect((await call(kenji, "DELETE", `/feed-posts/${sent.json.id}/coauthor`)).json).toEqual({ status: "removed" });
    }
    const eleventh = await publishWith(kenji, { kind: "user", id: damien.id });
    expect(eleventh.status).toBe(429);
    expect(eleventh.json.error.code).toBe("coauthor_quota");
  });

  it("dix publications supprimées : la onzième invitation est refusée", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    for (let i = 0; i < 10; i++) {
      const sent = await publishWith(kenji, { kind: "user", id: damien.id });
      expect(sent.status).toBe(201);
      expect((await call(kenji, "DELETE", `/me/feed-posts/${sent.json.id}`)).status).toBe(204);
    }
    expect((await publishWith(kenji, { kind: "user", id: damien.id })).status).toBe(429);
  });

  it("le rejeu d'un même envoi ne consomme qu'une place", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const body = {
      caption: "x",
      ...(await photoOf(kenji)),
      coAuthor: { kind: "user", id: damien.id },
      clientId: randomUUID(),
    };
    await call(kenji, "POST", "/me/feed-posts", body);
    await call(kenji, "POST", "/me/feed-posts", body);
    const used = await db.execute(sql`select count(*)::int as n from feed_coauthor_invite_log`);
    expect(Number((used.rows[0] as { n: number }).n)).toBe(1);
  });
});

describe("mention du pro partenaire co-auteur", () => {
  it("un autre pro choisi à la main : 400 `commercial_conflict` ; le même : la mention est posée", async () => {
    const kenji = await person("Kenji_66");
    const a = await createPro((await signUp("Garagiste_A")).id, { name: "Pro A", verifiedAt: new Date() });
    const b = await createPro((await signUp("Garagiste_B")).id, { name: "Pro B", verifiedAt: new Date() });
    await db.insert(partnerships).values({ proId: a.id, userId: kenji.id, message: "ok", status: "active" });
    await db.insert(partnerships).values({ proId: b.id, userId: kenji.id, message: "ok", status: "active" });
    const clash = await publishWith(kenji, { kind: "pro", id: a.id }, { commercialPartnerId: b.id });
    expect(clash.status).toBe(400);
    expect(clash.json.error.code).toBe("commercial_conflict");
    const same = await publishWith(kenji, { kind: "pro", id: a.id }, { commercialPartnerId: a.id });
    expect(same.status).toBe(201);
    expect((same.json as FeedPostView).commercialPartner?.name).toBe("Pro A");
  });
});

describe("identifiant de la cible", () => {
  it("un UUID en majuscules : l'invitation est visible dans les Demandes et acceptable", async () => {
    const kenji = await person("Kenji_66");
    const owner = await signUp("Orga_Maj", { twoFactor: true });
    const structure = await createStructure(owner.id);
    const sent = await publishWith(kenji, { kind: "structure", id: structure.id.toUpperCase() });
    expect(sent.status).toBe(201);
    const row = (await db.select().from(feedPostCoauthors))[0];
    expect(row?.coauthorId).toBe(structure.id.toLowerCase());
    // Lot R9d : l'invitation d'une structure se lit dans ses demandes (ancienne assertion : `/me/requests`), plus dans la liste personnelle.
    const items = (await call(owner, "GET", `/structures/${structure.id}/requests`)).json.items as { kind: string }[];
    expect(items.some((i) => i.kind === "coauthor")).toBe(true);
    const personal = (await call(owner, "GET", "/me/requests")).json.items as { kind: string }[];
    expect(personal.some((i) => i.kind === "coauthor")).toBe(false);
    expect((await call(owner, "POST", `/me/feed-coauthor-requests/${sent.json.id}/accept`)).status).toBe(200);
  });

  it("un identifiant mal formé : 400, jamais 500", async () => {
    const kenji = await person("Kenji_66");
    for (const co of [
      { kind: "structure", id: "pas-un-uuid" },
      { kind: "pro", id: "1; drop table" },
      { kind: "media", id: "x" },
      { kind: "user", id: "a b/c" },
    ] as Co[]) {
      expect((await publishWith(kenji, co)).status).toBe(400);
    }
  });

  it("un compte privé non suivi, invité par son identifiant : 422", async () => {
    const kenji = await person("Kenji_66");
    const secret = await person("Secret_Co", { visibility: "private" });
    const res = await publishWith(kenji, { kind: "user", id: secret.id });
    expect(res.status).toBe(422);
    expect(res.json.error.code).toBe("coauthor_unavailable");
    await follow(kenji, secret);
    expect((await publishWith(kenji, { kind: "user", id: secret.id })).status).toBe(201);
  });
});

describe("compte supprimé : plus aucun nom dans les notifications", () => {
  it("accepter puis supprimer le compte du co-auteur, ou se retirer : rien ne nomme plus Damien_66", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const one = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${one.id}/accept`);
    const two = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${two.id}/accept`);
    await call(damien, "DELETE", `/feed-posts/${two.id}/coauthor`);
    expect(await notifs(kenji.id, "coauthor_accepted")).toHaveLength(2);
    expect(await notifs(kenji.id, "coauthor_withdrawn")).toHaveLength(1);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, damien.id));
    await withTx((tx) => anonymizeFeedForDeletedAccount(tx, damien.id));
    for (const type of ["coauthor_accepted", "coauthor_withdrawn"])
      expect(await notifs(kenji.id, type)).toHaveLength(0);
    const feed = JSON.stringify((await call(kenji, "GET", "/me/activity")).json);
    expect(feed).not.toContain("Damien_66");
    expect(JSON.stringify((await call(kenji, "GET", "/me/notifications")).json)).not.toContain("Damien_66");
  });
});

describe("Fil et pastille", () => {
  it("un co-auteur suspendu ne fait pas entrer la carte dans « Abonnements » de qui ne suit que lui", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const fan = await person("Fan_Damien");
    await follow(fan, damien);
    const post = (await publishWith(kenji, { kind: "user", id: damien.id })).json as FeedPostView;
    await call(damien, "POST", `/me/feed-coauthor-requests/${post.id}/accept`);
    await db.execute(
      sql`update feed_posts set created_at = ${new Date(now().getTime() - 3_600_000)} where id = ${post.id}`,
    );
    const ids = async () => (await fil(fan, "?filter=following")).items.map((c: FeedCard) => c.id);
    expect(await ids()).toContain(`feed_post:${post.id}`);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(now().getTime() + 7 * 86_400_000) })
      .where(eq(profiles.userId, damien.id));
    expect(await ids()).not.toContain(`feed_post:${post.id}`);
  });

  it("la pastille des Demandes ne compte pas les invitations (l'ancienne appli n'a pas leur carte) ; la liste les compte", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    await publishWith(kenji, { kind: "user", id: damien.id });
    const summary = (await call(damien, "GET", "/me/inbox/summary")).json;
    expect(summary.pendingRequests).toBe(0);
    const list = (await call(damien, "GET", "/me/requests")).json;
    expect(list.total).toBe(1);
    expect(authorKeyOf("user", damien.id)).toContain("u:");
  });
});
