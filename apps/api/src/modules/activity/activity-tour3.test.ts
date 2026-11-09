// Lot R7c1, tour 3 : modèle de texte explicite, lignes sans modèle, temps réel par transaction, curseur des Demandes
// (identifiant unique, pagination jusqu'au bout), index de l'anonymisation.
import { fromWallTime, notificationTypes } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { signUp as baseSignUp, call, resetDb, seedReference, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { contactRequests, crewMembers, crews, notifications, profiles, userFollows } from "../../db/schema";
import { realtime } from "../../lib/realtime";
import { withTx } from "../../lib/tx";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
const HOUR = 3_600_000;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
  await seedReference();
});

/** Un compte neuf, sans la notification de connexion qu'on lui envoie à l'inscription. */
async function signUp(pseudo: string) {
  const u = await baseSignUp(pseudo);
  await notificationsService.flush();
  await db.delete(notifications).where(eq(notifications.userId, u.id));
  return u;
}

const actorOf = (u: TestUser) => ({ userId: u.id, pseudo: u.pseudo, avatarUrl: null });

/** Une occurrence regroupée, avec le modèle de texte (`{name}`), livrée. */
async function grouped(to: TestUser, from: TestUser, title: string, key = "story_like:s1") {
  await withTx((tx, after) =>
    notificationsService.notify(tx, to.id, "story_like", {
      title,
      body: `${title}.`,
      groupKey: key,
      actor: actorOf(from),
      after,
    }),
  );
  await notificationsService.deliverDue();
}

const suspend = (u: TestUser) =>
  db
    .update(profiles)
    .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
    .where(eq(profiles.userId, u.id));

/** Des comptes en nombre, créés d'un coup en SQL (sans passer par l'inscription) : `Bulk_001`… */
async function bulkUsers(n: number): Promise<string[]> {
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    select 'bulk-' || g, 'Bulk_' || lpad(g::text, 4, '0'), 'bulk' || g || '@orasso.test', true, now(), now()
    from generate_series(1, ${n}) g`);
  await db.execute(sql`
    insert into profiles (user_id, pseudo, account_qr_secret, account_qr_short_id, invite_token, created_at, updated_at)
    select 'bulk-' || g, 'Bulk_' || lpad(g::text, 4, '0'), decode(md5('s' || g), 'hex'),
      decode(substr(md5('i' || g), 1, 16), 'hex'), md5('t' || g), now(), now()
    from generate_series(1, ${n}) g`);
  return Array.from({ length: n }, (_, i) => `bulk-${i + 1}`);
}

describe("modèle de texte explicite", () => {
  it("un pseudo identique à un mot du message (« story », « Lydia ») ne casse pas la phrase recomposée", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const story = await signUp("story");
    await grouped(damien, kenji, "{name} a aimé ta story");
    await grouped(damien, story, "{name} a aimé ta story");
    const title = async () => (await call(damien, "GET", "/me/activity")).json.groups[0].items[0].title;
    expect(await title()).toBe("story a aimé ta story");
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(row?.data).toMatchObject({ _text: { title: "{name} a aimé ta story", body: "{name} a aimé ta story." } });

    // Le compte « story » part : la phrase se recompose avec Kenji_66, sans toucher au mot « story ».
    await accountService.anonymize(story.id, null, {});
    expect(await title()).toBe("Kenji_66 a aimé ta story");
    const [after] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(after).toMatchObject({ title: "Kenji_66 a aimé ta story", body: "Kenji_66 a aimé ta story." });
  });

  it("le pseudo « Lydia » dans le texte : seule la place de la personne change", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const lydia = await signUp("Lydia");
    await grouped(damien, kenji, "{name} remercie Lydia", "story_like:s2");
    await grouped(damien, lydia, "{name} remercie Lydia", "story_like:s2");
    const journal = async () => (await call(damien, "GET", "/me/notifications")).json.items[0].title;
    expect(await journal()).toBe("Lydia remercie Lydia");
    await suspend(lydia);
    expect(await journal()).toBe("Kenji_66 remercie Lydia");
    expect((await call(damien, "GET", "/me/activity")).json.groups[0].items[0].title).toBe("Kenji_66 remercie Lydia");
  });
});

describe("lignes regroupées sans modèle de texte (R6, seed, tour 1)", () => {
  const legacy = async (to: TestUser, type: "story_like" | "user_followed", people: TestUser[], withKey: boolean) => {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: to.id,
        type,
        family: notificationTypes[type],
        title: `${people[0]?.pseudo} et ${people.length - 1} autres`,
        body: "Ancien texte",
        data: {
          ...(withKey ? { _actorIds: people.map((p) => p.id) } : { actorIds: people.map((p) => p.id) }),
          actors: people.map((p) => ({ pseudo: p.pseudo, avatarUrl: null })),
          count: people.length,
        },
        groupKey: withKey ? "story_like:old" : null,
        deliverAfter: clock.now,
        deliveredAt: clock.now,
      })
      .returning();
    return row as typeof notifications.$inferSelect;
  };

  it("type de la table R7 : le texte se recompose d'après le type avec la personne restée, sur les deux routes", async () => {
    const damien = await signUp("Damien_66");
    const marc = await signUp("Marc_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await legacy(damien, "story_like", [marc, kenji, julie], true);
    const read = async () => {
      const activity = (await call(damien, "GET", "/me/activity")).json.groups[0].items[0];
      const journal = (await call(damien, "GET", "/me/notifications")).json.items[0];
      return { activity, journal };
    };
    // Tout le monde en règle : le texte enregistré.
    expect((await read()).activity.title).toBe("Marc_66 et 2 autres");
    await suspend(marc);
    const { activity, journal } = await read();
    expect(activity).toMatchObject({ title: "Kenji_66 a aimé ta story", count: 2 });
    expect(journal).toMatchObject({ title: "Kenji_66 a aimé ta story" });
    expect(JSON.stringify([activity, journal])).not.toContain("Marc_66");
    expect((await call(damien, "GET", "/me/activity/count")).json.unseen).toBe(1);
  });

  it("type sans libellé générique : la ligne est masquée dès qu'une personne citée est partie (liste et pastille)", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    // Forme R6 (`actorIds`), puis forme regroupée (`_actorIds`) d'un type hors table R7.
    await legacy(damien, "user_followed", [kenji, julie], false);
    await legacy(damien, "user_followed", [kenji, julie], true);
    const lines = async () =>
      (await call(damien, "GET", "/me/activity")).json.groups.flatMap((g: { items: unknown[] }) => g.items);
    expect(await lines()).toHaveLength(2);
    expect((await call(damien, "GET", "/me/activity/count")).json.unseen).toBe(2);

    await suspend(julie);
    expect(await lines()).toHaveLength(0);
    expect((await call(damien, "GET", "/me/activity/count")).json.unseen).toBe(0);
    // L'ancien Journal ne masque que les lignes regroupées (`_actorIds`) : la forme R6 (`actorIds`) garde son comportement.
    const journal = (await call(damien, "GET", "/me/notifications")).json.items;
    expect(journal).toHaveLength(1);
    expect(journal[0].data).toHaveProperty("actors");
    // La suspension se lève : les lignes reviennent telles quelles.
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, julie.id));
    expect(await lines()).toHaveLength(2);
  });

  it("compte supprimé : une ligne sans modèle de type inconnu est retirée, celle d'un type R7 est recomposée", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await legacy(damien, "story_like", [julie, kenji], true);
    await legacy(damien, "user_followed", [julie, kenji], true);
    await accountService.anonymize(julie.id, null, {});
    const rows = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "story_like", title: "Kenji_66 a aimé ta story" });
  });
});

describe("temps réel : publié par la transaction concernée", () => {
  function listen(u: TestUser) {
    const got: { type: string }[] = [];
    const socket = { send: (m: string) => got.push(JSON.parse(m)) };
    realtime.subscribe(`user:${u.id}`, socket);
    return {
      changed: () => got.filter((m) => m.type === "inbox.changed").length,
      stop: () => realtime.unsubscribe(`user:${u.id}`, socket),
    };
  }
  const add = (
    tx: Parameters<Parameters<typeof withTx>[0]>[0],
    after: (cb: () => unknown) => void,
    to: TestUser,
    from: TestUser,
    key: string,
  ) =>
    notificationsService.notify(tx, to.id, "story_like", {
      title: "{name} a aimé ta story",
      body: "{name} a aimé ta story.",
      groupKey: key,
      actor: actorOf(from),
      after,
    });

  it("deux transactions entrelacées : chacune annonce à sa propre validation, pas avant", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    const julie = await signUp("Julie_66");
    await grouped(damien, kenji, "{name} a aimé ta story", "story_like:s1");
    await grouped(damien, kenji, "{name} a aimé ta story", "story_like:s2");
    const live = listen(damien);
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let aAdded: () => void = () => undefined;
      const added = new Promise<void>((resolve) => {
        aAdded = resolve;
      });
      // A ajoute son occurrence puis reste ouverte ; B s'entrelace, ajoute la sienne et valide avant A.
      const a = withTx(async (tx, after) => {
        const r = await add(tx, after, damien, marc, "story_like:s1");
        expect(r.mergedIntoDelivered).toBe(true);
        aAdded();
        await gate;
      });
      await added;
      const b = await withTx(
        async (tx, after) => (await add(tx, after, damien, julie, "story_like:s2")).mergedIntoDelivered,
      );
      expect(b).toBe(true);
      // Seule la transaction B a validé : une annonce, celle de B ; celle de A attend sa validation.
      expect(live.changed()).toBe(1);
      release();
      await a;
      expect(live.changed()).toBe(2);
      // Une livraison (`kick`) n'annonce plus rien de plus.
      notificationsService.kick();
      await notificationsService.flush();
      expect(live.changed()).toBe(2);
    } finally {
      live.stop();
    }
  });

  it("transaction annulée : aucune annonce, et la ligne reste comme avant", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    await grouped(damien, kenji, "{name} a aimé ta story");
    const live = listen(damien);
    try {
      await expect(
        withTx(async (tx, after) => {
          await add(tx, after, damien, marc, "story_like:s1");
          throw new Error("annulée");
        }),
      ).rejects.toThrow("annulée");
      notificationsService.kick();
      await notificationsService.flush();
      expect(live.changed()).toBe(0);
      const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
      expect(row?.data).toMatchObject({ count: 1 });
    } finally {
      live.stop();
    }
  });
});

describe("Demandes : curseur à identifiant unique et pagination jusqu'au bout", () => {
  it("49 abonnements puis 2 demandes de crew au même instant, à cheval sur la frontière : 50 puis 1, aucune perdue", async () => {
    const damien = await signUp("Damien_66");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, damien.id));
    const ids = await bulkUsers(51);
    const t0 = new Date(clock.now.getTime() - 30 * 24 * HOUR);
    await db.insert(userFollows).values(
      ids.slice(0, 49).map((id, i) => ({
        followerId: id,
        followedId: damien.id,
        status: "pending" as const,
        createdAt: new Date(clock.now.getTime() - i * 60_000),
      })),
    );
    const [crew] = await db
      .insert(crews)
      .values({ slug: "les-pistons", name: "Les Pistons", department: "66", createdBy: damien.id })
      .returning();
    await db.insert(crewMembers).values([
      { crewId: crew!.id, userId: damien.id, role: "leader", status: "active" },
      { crewId: crew!.id, userId: ids[49]!, role: "member", status: "requested", message: "Salut", updatedAt: t0 },
      { crewId: crew!.id, userId: ids[50]!, role: "member", status: "requested", message: "Salut", updatedAt: t0 },
    ]);
    const first = (await call(damien, "GET", "/me/requests")).json;
    expect(first.total).toBe(51);
    expect(first.items).toHaveLength(50);
    expect(first.items.at(-1)).toMatchObject({ kind: "crew" });
    const second = (await call(damien, "GET", `/me/requests?cursor=${encodeURIComponent(first.nextCursor)}`)).json;
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const requesters = [...first.items, ...second.items]
      .filter((i: { kind: string }) => i.kind === "crew")
      .map((i: { payload: { requesterId: string } }) => i.payload.requesterId);
    expect(new Set(requesters)).toEqual(new Set([ids[49], ids[50]]));
  }, 120_000);

  it("plus de 500 demandes : toutes les pages jusqu'à nextCursor = null, sans doublon, du plus récent au plus ancien", async () => {
    const damien = await signUp("Damien_66");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, damien.id));
    const ids = await bulkUsers(525);
    // 520 abonnements (une minute d'écart) et 5 demandes de message intercalées parmi les plus anciennes.
    await db.insert(userFollows).values(
      ids.slice(0, 520).map((id, i) => ({
        followerId: id,
        followedId: damien.id,
        status: "pending" as const,
        createdAt: new Date(clock.now.getTime() - i * 60_000),
      })),
    );
    await db.insert(contactRequests).values(
      ids.slice(520).map((id, i) => ({
        fromUserId: id,
        toUserId: damien.id,
        message: "Salut",
        createdAt: new Date(clock.now.getTime() - (505 + i * 3) * 60_000 - 30_000),
      })),
    );
    const seen: { id: string; kind: string; at: string }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { total: number; items: typeof seen; nextCursor: string | null } = (
        await call(damien, "GET", `/me/requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
      ).json;
      expect(res.total).toBe(525);
      expect(res.items.length).toBeLessThanOrEqual(50);
      seen.push(...res.items);
      cursor = res.nextCursor;
      pages += 1;
    } while (cursor && pages < 30);
    expect(cursor).toBeNull();
    expect(pages).toBe(11);
    expect(seen).toHaveLength(525);
    expect(new Set(seen.map((i) => `${i.kind}:${i.id}`)).size).toBe(525);
    const times = seen.map((i) => i.at);
    expect(times).toEqual([...times].sort().reverse());
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(525);
  }, 240_000);
});

describe("anonymisation : l'index partiel", () => {
  it("la recherche par personne citée passe par notifications_actor_ids_idx (index partiel sur group_key non nul)", async () => {
    const def = await db.execute(sql`select indexdef from pg_indexes where indexname = 'notifications_actor_ids_idx'`);
    const indexdef = (def.rows[0] as { indexdef: string } | undefined)?.indexdef ?? "";
    expect(indexdef).toContain("gin");
    expect(indexdef.toLowerCase()).toContain("group_key is not null");
    // Le plan, lu dans une transaction annulée (rien ne reste du réglage `enable_seqscan`).
    class Rollback extends Error {}
    let plan = "";
    await db
      .transaction(async (tx) => {
        // Sur une table presque vide, le planificateur préfère parcourir l'autre index de la clé en entier : on l'écarte
        // (annulé avec la transaction) pour voir si l'index de l'anonymisation sait servir la requête.
        await tx.execute(sql`drop index notifications_user_group_idx`);
        await tx.execute(sql`set local enable_seqscan = off`);
        const res = await tx.execute(
          sql`explain select * from notifications where group_key is not null and data -> '_actorIds' ? 'x'`,
        );
        plan = (res.rows as { "QUERY PLAN": string }[]).map((r) => r["QUERY PLAN"]).join("; ");
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expect(plan).toContain("notifications_actor_ids_idx");
  });
});
