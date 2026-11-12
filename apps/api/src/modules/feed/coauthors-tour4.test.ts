// Collaboration (R8o), tour 4 : l'index partiel sert la suppression des notifications (plan vérifié), le compteur de `GET /me` est un
// comptage (même nombre que la liste, nombre de requêtes fixe), et une notification différée par les heures calmes ne survit pas
// à l'anonymisation de l'auteur.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { call, quietHours, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { notifications, profiles } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { coauthorNotificationsWhere, pendingCoauthorCount, pendingCoauthorRequests } from "./coauthors";
import { follow, person } from "./fil-test-helpers";

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
const publishWith = async (u: TestUser, coAuthor: { kind: string; id: string }) =>
  call(u, "POST", "/me/feed-posts", { caption: "x", ...(await photoOf(u)), coAuthor, clientId: randomUUID() });

describe("l'index partiel sert la suppression des notifications", () => {
  it("le plan de la requête réelle (paramètres compris) utilise `notifications_coauthor_post_idx`", async () => {
    const u = await signUp("Notifie_T4");
    await db.execute(sql`insert into notifications (user_id, type, family, title, body, data, deliver_after)
      select ${u.id}, 'event_updated', 'event', 't', 'b', jsonb_build_object('postId', g::text), now() from generate_series(1, 4000) g`);
    await db.execute(sql`analyze notifications`);
    const query = db
      .delete(notifications)
      .where(coauthorNotificationsWhere([randomUUID(), randomUUID()]))
      .toSQL();
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Quelques milliers de lignes : le planificateur préférerait lire toute la table ; on lui interdit pour voir si l'index est utilisable.
      await client.query("set local enable_seqscan = off");
      const plan = await client.query(`explain (format json) ${query.sql}`, query.params as unknown[]);
      expect(JSON.stringify(plan.rows[0])).toContain("notifications_coauthor_post_idx");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});

describe("compteur de `GET /me` : un comptage, pas les cartes", () => {
  it("égale la longueur de la liste dans les cas de visibilité", async () => {
    const kenji = await person("Kenji_66");
    const priv = await person("Prive_T4", { visibility: "private" });
    const damien = await person("Damien_66");
    await follow(damien, priv);
    expect((await publishWith(kenji, { kind: "user", id: damien.id })).status).toBe(201);
    expect((await publishWith(priv, { kind: "user", id: damien.id })).status).toBe(201);
    const hidden = await publishWith(kenji, { kind: "user", id: damien.id });
    const gone = await publishWith(kenji, { kind: "user", id: damien.id });
    const same = async () => {
      const list = await pendingCoauthorRequests(damien.id, db, new Date());
      expect(await pendingCoauthorCount(damien.id, db)).toBe(list.length);
      return list.length;
    };
    expect(await same()).toBe(4);
    // Une publication supprimée, un auteur passé en compte privé que je ne suis pas, un auteur suspendu : hors liste et hors compte.
    await call(kenji, "DELETE", `/me/feed-posts/${gone.json.id}`);
    expect(await same()).toBe(3);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    expect(await same()).toBe(1);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, priv.id));
    expect(await same()).toBe(0);
    expect(hidden.status).toBe(201);
  });

  it("le nombre de requêtes ne dépend pas du nombre d'invitations", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const count = async () => {
      const spy = vi.spyOn(pool, "query");
      try {
        const n = await pendingCoauthorCount(damien.id, db);
        return { n, queries: spy.mock.calls.length };
      } finally {
        spy.mockRestore();
      }
    };
    await publishWith(kenji, { kind: "user", id: damien.id });
    const one = await count();
    for (let i = 0; i < 6; i++) await publishWith(kenji, { kind: "user", id: damien.id });
    const many = await count();
    expect(one.n).toBe(1);
    expect(many.n).toBe(7);
    expect(many.queries).toBe(one.queries);
    expect(many.queries).toBeLessThan(8);
  });
});

describe("heures calmes puis anonymisation de l'auteur", () => {
  it("la notification différée est retirée : ni ligne, ni livraison ensuite", async () => {
    quietHours(true);
    useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 30 }));
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    expect((await publishWith(kenji, { kind: "user", id: damien.id })).status).toBe(201);
    const rows = () =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, damien.id), eq(notifications.type, "coauthor_invited")));
    const before = await rows();
    expect(before).toHaveLength(1);
    expect(before[0]?.deliveredAt).toBeNull();
    await accountService.anonymize(kenji.id, null, {});
    expect(await rows()).toHaveLength(0);
    await notificationsService.deliverDue();
    expect(await rows()).toHaveLength(0);
  });
});
