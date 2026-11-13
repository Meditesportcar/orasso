// Collaboration (R8o), tour 4 : l'index partiel sert la suppression des notifications (plan vérifié), le compteur de `GET /me` est un
// comptage (même nombre que la liste, nombre de requêtes fixe), et une notification différée par les heures calmes ne survit pas
// à l'anonymisation de l'auteur.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
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
import {
  adminAuditLog,
  emailOutbox,
  feedPostCoauthors,
  feedPostReactions,
  feedPosts,
  notifications,
  profiles,
  user,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { mail } from "../../lib/mail";
import { resetRateLimits } from "../../lib/rateLimit";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { coauthorNotificationsWhere, pendingCoauthorCount, pendingCoauthorRequests } from "./coauthors";
import * as commentsAnonymize from "./comments/anonymize";
import { dbPost } from "./comments/testkit";
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

  it("un auteur suspendu qui invite une page qu'il gère : la pastille compte la demande que la liste montre (petit lot API, P46)", async () => {
    const kenji = await signUp("Kenji_Susp", { twoFactor: true });
    await db
      .update(profiles)
      .set({ visibility: "public", departments: ["66"] })
      .where(eq(profiles.userId, kenji.id));
    const structure = await createStructure(kenji.id);
    const sent = await publishWith(kenji, { kind: "structure", id: structure.id });
    expect(sent.status).toBe(201);
    const readBoth = async () => {
      // Même horloge simulée pour les deux lectures.
      // (le compteur lit `now()`, l'horloge simulée de `useClock`).
      // Lot R9d : l'invitation adressée à une page se lit dans la cloche de la structure (`scope` « all »), la liste et le compteur
      // y sont alignés ; la liste personnelle ne l'a plus.
      const list = await pendingCoauthorRequests(kenji.id, db, now(), "all");
      return { list: list.length, count: await pendingCoauthorCount(kenji.id, db, "all") };
    };
    expect(await readBoth()).toEqual({ list: 1, count: 1 });
    expect(await pendingCoauthorRequests(kenji.id, db, now())).toHaveLength(0);
    expect(await pendingCoauthorCount(kenji.id, db)).toBe(0);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(now().getTime() + 86_400_000) })
      .where(eq(profiles.userId, kenji.id));
    // L'auteur lit sa publication même suspendu : la liste la montre, le compteur aussi.
    expect(await readBoth()).toEqual({ list: 1, count: 1 });
    // Les contrôles de suppression restent : publication supprimée, plus de demande dans l'un comme dans l'autre.
    await db.update(feedPosts).set({ deletedAt: now() }).where(eq(feedPosts.id, sent.json.id));
    expect(await readBoth()).toEqual({ list: 0, count: 0 });
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

describe("anonymisation : un seul verrouillage trié au début (petit lot API, P44, tours 2 et 3)", () => {
  /**
   * Chevauchement forcé : une transaction tient `lockedId` ; les deux anonymisations démarrent et attendent toutes les deux ce
   * verrou (sondage de la base), puis tout est relâché : elles se disputent alors tous leurs verrous en même temps.
   */
  async function overlap(a: TestUser, b: TestUser, lockedIds: string[]) {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const holder = db.transaction(async (tx) => {
      await tx.execute(
        sql`select 1 from feed_posts where id in (${sql.join(
          lockedIds.map((i) => sql`${i}::uuid`),
          sql`, `,
        )}) order by id for update`,
      );
      await gate;
    });
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    try {
      await new Promise((r) => setTimeout(r, 50));
      first = accountService.anonymize(a.id, null, {});
      second = accountService.anonymize(b.id, null, {});
      const deadline = Date.now() + 8000;
      for (;;) {
        const seen = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock'`,
        );
        if (Number(seen.rows[0]?.n) >= 2) break;
        if (Date.now() > deadline) throw new Error("Les deux anonymisations n'attendent pas le verrou");
        await new Promise((r) => setTimeout(r, 25));
      }
    } finally {
      release();
      await holder;
    }
    return Promise.allSettled([first, second]);
  }

  it("co-signatures et flammes mutuelles : aucune 40P01, les deux aboutissent", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const posts: { k: string[]; d: string[] } = { k: [], d: [] };
    for (let i = 0; i < 3; i++) {
      const pk = await publishWith(kenji, { kind: "user", id: damien.id });
      const pd = await publishWith(damien, { kind: "user", id: kenji.id });
      expect([pk.status, pd.status]).toEqual([201, 201]);
      posts.k.push(pk.json.id);
      posts.d.push(pd.json.id);
    }
    await db
      .insert(feedPostReactions)
      .values([
        ...posts.d.map((postId) => ({ postId, userId: kenji.id })),
        ...posts.k.map((postId) => ({ postId, userId: damien.id })),
      ]);
    const results = await overlap(kenji, damien, [...posts.k, ...posts.d]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const alive = await db.select({ id: feedPosts.id }).from(feedPosts).where(sql`${feedPosts.deletedAt} is null`);
    expect(alive).toHaveLength(0);
    expect(await db.select().from(feedPostCoauthors)).toHaveLength(0);
  });

  it("sans co-signature : chacun a commenté sa propre publication et mis une flamme au commentaire de l'autre, aucune 40P01", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    // Publications insérées directement : ni co-signature ni flamme sur la publication, seulement les commentaires et leurs flammes.
    const pk = await dbPost(kenji);
    const pd = await dbPost(damien);
    const ck = await call(kenji, "POST", `/feed-posts/${pk}/comments`, {
      text: "Mon commentaire",
      clientId: randomUUID(),
    });
    const cd = await call(damien, "POST", `/feed-posts/${pd}/comments`, { text: "Le mien", clientId: randomUUID() });
    expect([ck.status, cd.status]).toEqual([201, 201]);
    expect((await call(kenji, "PUT", `/feed-comments/${cd.json.id}/reaction`)).status).toBe(200);
    expect((await call(damien, "PUT", `/feed-comments/${ck.json.id}/reaction`)).status).toBe(200);
    const results = await overlap(kenji, damien, [pk, pd]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("deux comptes qui se citent dans leurs commentaires, supprimés au même instant : les deux aboutissent", async () => {
    const kenji = await person("Kenji_66");
    const damien = await person("Damien_66");
    const pk = await dbPost(kenji);
    const pd = await dbPost(damien);
    const ck = await call(kenji, "POST", `/feed-posts/${pk}/comments`, {
      text: "Salut @Damien_66",
      clientId: randomUUID(),
    });
    const cd = await call(damien, "POST", `/feed-posts/${pd}/comments`, {
      text: "Salut @Kenji_66",
      clientId: randomUUID(),
    });
    expect([ck.status, cd.status]).toEqual([201, 201]);
    const results = await overlap(kenji, damien, [pk, pd]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  });

  it("un faux 40P01 au premier essai : la suppression aboutit au second, rien n'est écrit deux fois", async () => {
    const kenji = await person("Kenji_66");
    const pk = await dbPost(kenji);
    expect(
      (await call(kenji, "POST", `/feed-posts/${pk}/comments`, { text: "Un", clientId: randomUUID() })).status,
    ).toBe(201);
    const real = commentsAnonymize.anonymizeFeedCommentsForDeletedAccount;
    const spy = vi
      .spyOn(commentsAnonymize, "anonymizeFeedCommentsForDeletedAccount")
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
      });
    try {
      await accountService.anonymize(kenji.id, null, {});
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
    expect(real).toBeTypeOf("function");
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, kenji.id));
    expect(profile?.deletedAt).not.toBeNull();
    const [after] = await db.select({ email: user.email }).from(user).where(eq(user.id, kenji.id));
    expect(after?.email).toMatch(/^supprime\+[0-9a-f]{8}@orasso\.invalid$/);
    // Une erreur autre qu'un interblocage ne se reprend pas.
    const other = await person("Autre_66");
    const boom = vi
      .spyOn(commentsAnonymize, "anonymizeFeedCommentsForDeletedAccount")
      .mockRejectedValue(new Error("panne"));
    try {
      await expect(accountService.anonymize(other.id, null, {})).rejects.toThrow("panne");
      expect(boom).toHaveBeenCalledTimes(1);
    } finally {
      boom.mockRestore();
    }
  });
});

describe("reprise de l'anonymisation : limitée à la transaction (petit lot API, tour 5)", () => {
  const deadlock = (code: string) => Object.assign(new Error("interblocage simulé"), { code });
  const audits = async (userId: string) =>
    (await db.select().from(adminAuditLog)).filter((a) => a.targetId === userId && a.action === "user.self_delete");

  it.each(["40P01", "40001"])(
    "%s au premier essai avec confirm : un seul audit, un seul envoi, trace anonymisée, rien d'un essai annulé",
    async (code) => {
      const kenji = await person("Kenji_66");
      const [before] = await db.select({ email: user.email }).from(user).where(eq(user.id, kenji.id));
      const send = vi.spyOn(mail, "send");
      const spy = vi
        .spyOn(commentsAnonymize, "anonymizeFeedCommentsForDeletedAccount")
        .mockImplementationOnce(async () => {
          throw deadlock(code);
        });
      try {
        await accountService.anonymize(kenji.id, null, { confirm: true });
        expect(spy).toHaveBeenCalledTimes(2);
        expect(send.mock.calls.filter((c) => c[0] === "account_deleted")).toHaveLength(1);
      } finally {
        spy.mockRestore();
        send.mockRestore();
      }
      expect(await audits(kenji.id)).toHaveLength(1);
      const traces = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "account_deleted"));
      expect(traces.filter((t) => t.to === before?.email)).toHaveLength(0);
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, kenji.id));
      expect(profile?.deletedAt).not.toBeNull();
    },
  );

  it("trois interblocages de suite : l'erreur remonte, rien n'est écrit, aucun envoi", async () => {
    const kenji = await person("Kenji_66");
    const send = vi.spyOn(mail, "send");
    const spy = vi
      .spyOn(commentsAnonymize, "anonymizeFeedCommentsForDeletedAccount")
      .mockRejectedValue(deadlock("40P01"));
    try {
      await expect(accountService.anonymize(kenji.id, null, { confirm: true })).rejects.toMatchObject({
        code: "40P01",
      });
      expect(spy).toHaveBeenCalledTimes(3);
      expect(send).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      send.mockRestore();
    }
    expect(await audits(kenji.id)).toHaveLength(0);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, kenji.id));
    expect(profile?.deletedAt).toBeNull();
  });

  it("un interblocage après la validation (envoi de confirmation) n'est pas repris : l'envoi n'est tenté qu'une fois", async () => {
    const kenji = await person("Kenji_66");
    const send = vi.spyOn(mail, "send").mockRejectedValue(deadlock("40P01"));
    try {
      await expect(accountService.anonymize(kenji.id, null, { confirm: true })).rejects.toMatchObject({
        code: "40P01",
      });
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
    }
    // La suppression est validée une seule fois (pas de faux succès d'un second essai).
    expect(await audits(kenji.id)).toHaveLength(1);
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
