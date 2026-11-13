// Lot R9d : l'Activité de la structure (la cloche de l'organisateur). Responsables, `notifyStructure`, regroupement,
// exclusion de la cloche personnelle (T26), droits des quatre routes, émetteurs, compatibilité de la Boîte (APK en ligne).
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { callAs } from "../../../test/actor-call";
import {
  addMember,
  call,
  createEvent,
  createStructure,
  createVehicle,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { notifications, profiles, structureMembers, structures } from "../../db/schema";
import { structureManagers } from "../../lib/structureManagers";
import { withTx } from "../../lib/tx";
import { applicationsService } from "../applications/service";
import { dbPost } from "../feed/comments/testkit";
import { materializeMentions } from "../feed/mentions";
import { notificationsService } from "../notifications/service";
import { notifyStructure } from "../notifications/structure";
import { staffRequestsService } from "../staff/requests";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let damien: TestUser;
let lea: TestUser;
let structureId: string;
let slug: string;

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 11, day: 12, hour: 15, minute: 0 }));
  quietHours(false);
  ref = await seedReference();
  damien = await signUp("Damien_66", { twoFactor: true });
  lea = await signUp("Lea_11", { twoFactor: true });
  const s = await createStructure(damien.id);
  structureId = s.id;
  slug = s.slug;
  await addMember(structureId, lea.id, "co_organizer");
  await db.update(structures).set({ name: "Roues Libres 66" }).where(eq(structures.id, structureId));
});

const mineIn = (u: TestUser, id = structureId) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.structureId, id)));

const countOf = (row: { data: unknown } | undefined) => (row?.data as { count?: number } | undefined)?.count;

const deliver = async () => {
  await notificationsService.deliverDue();
};

describe("structureManagers", () => {
  it("propriétaire et co-organisateur actifs ; staff, demandeur, invité, ancien membre exclus", async () => {
    const staff = await signUp("Staff_1");
    const asker = await signUp("Asker_1");
    const gone = await signUp("Gone_1");
    await addMember(structureId, staff.id, "staff");
    await db.insert(structureMembers).values({ structureId, userId: asker.id, role: "staff", status: "requested" });
    await db.insert(structureMembers).values({ structureId, userId: gone.id, role: "co_organizer", status: "removed" });
    expect((await structureManagers(db, structureId)).sort()).toEqual([damien.id, lea.id].sort());
  });
  it("compte suspendu ou supprimé exclu ; structure supprimée ou suspendue : vide à l'émission, lisible avec includeSuspended", async () => {
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, lea.id));
    expect(await structureManagers(db, structureId)).toEqual([damien.id]);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, damien.id));
    expect(await structureManagers(db, structureId)).toEqual([]);
    await db.update(profiles).set({ deletedAt: null, suspendedUntil: null });
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structureId));
    expect(await structureManagers(db, structureId)).toEqual([]);
    expect(await structureManagers(db, structureId, { includeSuspended: true })).toHaveLength(2);
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, structureId));
    expect(await structureManagers(db, structureId, { includeSuspended: true })).toEqual([]);
  });
});

describe("notifyStructure", () => {
  it("une ligne par responsable, structure_id et group_key propres ; celui qui agit n'est pas prévenu", async () => {
    const rows = await withTx((tx, after) =>
      notifyStructure(
        tx,
        structureId,
        "feed_comment",
        { title: "T", body: "B", groupKey: "feed_comment:p1", after },
        { exclude: [lea.id] },
      ),
    );
    expect(rows).toEqual([damien.id]);
    const [d] = await mineIn(damien);
    expect(d).toMatchObject({ structureId, groupKey: `s:${structureId}:feed_comment:p1` });
    expect(d?.data).toMatchObject({ structureId, structureName: "Roues Libres 66" });
    expect(await mineIn(lea)).toHaveLength(0);
    const all = await withTx((tx, after) =>
      notifyStructure(tx, structureId, "feed_comment", { title: "T", body: "B", after }),
    );
    expect(all.sort()).toEqual([damien.id, lea.id].sort());
  });

  it("dix candidatures sur le même événement : une ligne par responsable, compteur à 10 (le texte des genres média et prestataire est testé dans media.test.ts et missions.test.ts)", async () => {
    // Lot R9d, tour 1 : le « reste à trier » se lit dans les candidatures réelles : dix vraies candidatures.
    const e = await createEvent(structureId, { title: "Nocturne de Canet", capacity: 30 });
    for (let i = 0; i < 10; i++) {
      const u = await signUp(`Cand_${i}`);
      const car = await createVehicle(u.id, ref);
      await applicationsService.apply(await viewerOf(u), e.id, {
        vehicleIds: [car.id],
        rulesAccepted: true,
        followStructure: false,
        newsletterOptIn: false,
        companions: 0,
        message: null,
      } as never);
    }
    for (const u of [damien, lea]) {
      const rows = await mineIn(u);
      expect(rows).toHaveLength(1);
      expect(countOf(rows[0])).toBe(10);
    }
    const page = await callAs(damien, null, "GET", `/structures/${structureId}/activity?filter=triage`);
    expect(page.status).toBe(200);
    expect(page.json.groups[0].items[0].title).toBe("10 candidatures à trier · Nocturne de Canet");
  });

  it("deux émissions simultanées de la même clé ne créent qu'une ligne (verrou)", async () => {
    await Promise.all(
      [1, 2].map(() =>
        withTx((tx, after) =>
          notifyStructure(tx, structureId, "application_received", {
            title: "x",
            body: "x",
            groupKey: "applications:e:vehicle",
            after,
          }),
        ),
      ),
    );
    expect(await mineIn(damien)).toHaveLength(1);
  });

  it("push : préférences d'un responsable respectées, la ligne reste ; inbox.changed seulement après validation", async () => {
    await db
      .update(profiles)
      .set({ notificationPrefs: { social: false } as never })
      .where(eq(profiles.userId, lea.id));
    const { realtime } = await import("../../lib/realtime");
    const seen: string[] = [];
    const original = realtime.publish;
    realtime.publish = ((channel: string, type: string) => {
      if (type === "inbox.changed") seen.push(channel);
    }) as never;
    try {
      await expect(
        withTx(async (tx, after) => {
          await notifyStructure(tx, structureId, "feed_comment", { title: "T", body: "B", after });
          expect(seen).toEqual([]);
          throw new Error("annulée");
        }),
      ).rejects.toThrow("annulée");
      expect(seen).toEqual([]);
      await withTx((tx, after) => notifyStructure(tx, structureId, "feed_comment", { title: "T", body: "B", after }));
      expect(seen.sort()).toEqual([`user:${damien.id}`, `user:${lea.id}`].sort());
    } finally {
      realtime.publish = original;
    }
    await deliver();
    expect(await mineIn(lea)).toHaveLength(1);
  });
});

describe("T26 : une ligne de structure n'est jamais dans la cloche personnelle", () => {
  it("ni dans /me/activity, ni dans le compte, ni dans /me/notifications ; « tout lire » personnel n'y touche pas, { ids } oui", async () => {
    await withTx((tx, after) =>
      notifyStructure(tx, structureId, "feed_comment", { title: "Sur la structure", body: "B", after }),
    );
    await notificationsService.notify(db, damien.id, "feed_comment", { title: "Perso", body: "B" });
    await deliver();
    const act = await call(damien, "GET", "/me/activity");
    expect(JSON.stringify(act.json)).toContain("Perso");
    expect(JSON.stringify(act.json)).not.toContain("Sur la structure");
    expect((await call(damien, "GET", "/me/activity/count")).json.unseen).toBe(1);
    const notifs = await call(damien, "GET", "/me/notifications");
    expect(JSON.stringify(notifs.json)).not.toContain("Sur la structure");
    expect(await notificationsService.unreadCount(damien.id)).toBe(1);
    await call(damien, "POST", "/me/notifications/read", { all: true });
    const [line] = await mineIn(damien);
    expect(line?.readAt).toBeNull();
    await call(damien, "POST", "/me/notifications/read", { ids: [line!.id] });
    expect((await mineIn(damien))[0]?.readAt).not.toBeNull();
  });
});

describe("routes de l'Activité de la structure : droits", () => {
  const paths = (id: string) => [
    ["GET", `/structures/${id}/activity`],
    ["GET", `/structures/${id}/activity/count`],
    ["POST", `/structures/${id}/activity/seen`],
    ["GET", `/structures/${id}/requests`],
  ];

  it("propriétaire et co-organisateur avec second facteur : 200 ; cache-control privé", async () => {
    for (const u of [damien, lea]) {
      for (const [m, p] of paths(structureId)) {
        const res = await call(u, m as string, p as string);
        expect(res.status, `${m} ${p}`).toBeLessThan(300);
      }
    }
    expect((await call(damien, "GET", `/structures/${structureId}/activity`)).headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });

  it("sans second facteur : 403 two_factor_required ; staff, autre structure, inconnu : 403 sans contenu ; structure supprimée : 404", async () => {
    const noFactor = await signUp("Coorga_nofactor");
    await addMember(structureId, noFactor.id, "co_organizer");
    const staff = await signUp("Staff_2", { twoFactor: true });
    await addMember(structureId, staff.id, "staff");
    const other = await signUp("Other_2", { twoFactor: true });
    await createStructure(other.id);
    await withTx((tx, after) =>
      notifyStructure(tx, structureId, "feed_comment", { title: "Secret", body: "B", after }),
    );
    for (const [m, p] of paths(structureId)) {
      const r1 = await call(noFactor, m as string, p as string);
      expect(r1.status).toBe(403);
      expect(r1.json.error.code).toBe("two_factor_required");
      for (const u of [staff, other]) {
        const r = await call(u, m as string, p as string);
        expect(r.status).toBe(403);
        expect(r.text).not.toContain("Secret");
        expect(r.text).not.toContain("Roues Libres");
      }
    }
    // Le même refus pour une structure qui n'existe pas : l'existence n'est pas révélée.
    const ghost = await call(other, "GET", "/structures/00000000-0000-4000-8000-000000000000/activity");
    const real = await call(other, "GET", `/structures/${structureId}/activity`);
    expect(ghost.status).toBe(real.status);
    // Structure supprimée : fermée, même réponse que pour une structure inconnue (rien ne révèle qu'elle a existé).
    await db.update(structures).set({ deletedAt: new Date() }).where(eq(structures.id, structureId));
    expect((await call(damien, "GET", `/structures/${structureId}/activity`)).status).toBe(ghost.status);
  });

  it("structure suspendue : lisible ; compte supprimé : fermé", async () => {
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structureId));
    expect((await call(damien, "GET", `/structures/${structureId}/activity`)).status).toBe(200);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, lea.id));
    expect((await call(lea, "GET", `/structures/${structureId}/activity`)).status).toBeGreaterThanOrEqual(401);
  });

  it("un responsable ne voit jamais la ligne d'un autre ; « vu » et « lu » séparés ; filtres ; ancien responsable fermé", async () => {
    await withTx((tx, after) =>
      notifyStructure(tx, structureId, "feed_comment", { title: "{name} a commenté", body: "B", after }),
    );
    await withTx((tx, after) =>
      notifyStructure(tx, structureId, "feed_post_mention", { title: "Cité", body: "B", after }),
    );
    await deliver();
    const [dRow] = await mineIn(damien);
    const [lRow] = await mineIn(lea);
    const idsD = (await callAs(damien, null, "GET", `/structures/${structureId}/activity`)).json.groups
      .flatMap((g: { items: { ids: string[] }[] }) => g.items.flatMap((i) => i.ids))
      .sort();
    expect(idsD).toEqual((await mineIn(damien)).map((r) => r.id).sort());
    expect(idsD).not.toContain(lRow!.id);
    expect(dRow).toBeTruthy();
    // Filtres.
    const only = async (f: string) =>
      (await call(damien, "GET", `/structures/${structureId}/activity?filter=${f}`)).json.groups.flatMap(
        (g: { items: { type: string }[] }) => g.items.map((i) => i.type),
      );
    expect(await only("mentions")).toEqual(["feed_post_mention"]);
    expect(await only("comments")).toEqual(["feed_comment"]);
    expect(await only("triage")).toEqual([]);
    expect((await call(damien, "GET", `/structures/${structureId}/activity?filter=nope`)).status).toBe(400);
    // « Vu » séparé.
    expect((await call(damien, "GET", `/structures/${structureId}/activity/count`)).json.unseen).toBe(2);
    await call(damien, "POST", `/structures/${structureId}/activity/seen`);
    expect((await call(damien, "GET", `/structures/${structureId}/activity/count`)).json.unseen).toBe(0);
    expect((await call(lea, "GET", `/structures/${structureId}/activity/count`)).json.unseen).toBe(2);
    // Ancien responsable : les lignes restent en base, invisibles et fermées.
    await db
      .update(structureMembers)
      .set({ status: "removed" })
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.userId, lea.id)));
    expect((await call(lea, "GET", `/structures/${structureId}/activity`)).status).toBe(403);
    expect(await mineIn(lea)).toHaveLength(2);
    expect(JSON.stringify((await call(lea, "GET", "/me/activity")).json)).not.toContain("Cité");
  });

  it("curseur sans doublon", async () => {
    for (let i = 0; i < 35; i++) {
      await withTx((tx, after) =>
        notifyStructure(
          tx,
          structureId,
          "feed_post_mention",
          { title: `M${i}`, body: "B", after },
          { exclude: [lea.id] },
        ),
      );
    }
    await deliver();
    const first = await call(damien, "GET", `/structures/${structureId}/activity?filter=mentions`);
    expect(first.json.nextCursor).toBeTruthy();
    const second = await call(
      damien,
      "GET",
      `/structures/${structureId}/activity?filter=mentions&cursor=${encodeURIComponent(first.json.nextCursor)}`,
    );
    const ids = [first, second].flatMap((r) =>
      r.json.groups.flatMap((g: { items: { ids: string[] }[] }) => g.items.flatMap((i) => i.ids)),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(35);
  });
});

describe("émetteurs", () => {
  it("candidature de véhicule : les deux responsables, jamais le candidat ; sans push ; ligne regroupée par événement", async () => {
    const e = await createEvent(structureId, { title: "Nocturne de Canet" });
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    for (const u of [kenji, marc]) {
      const v = await viewerOf(u);
      const car = await createVehicle(u.id, ref);
      await applicationsService.apply(v, e.id, {
        vehicleIds: [car.id],
        rulesAccepted: true,
        followStructure: true,
        newsletterOptIn: false,
        companions: 0,
        message: null,
      } as never);
    }
    for (const u of [damien, lea]) {
      const rows = (await mineIn(u)).filter((r) => r.type === "application_received");
      expect(rows).toHaveLength(1);
      expect(countOf(rows[0])).toBe(2);
      expect(rows[0]?.pushSentAt).toBeNull();
    }
    expect(
      (await db.select().from(notifications).where(eq(notifications.userId, kenji.id))).filter(
        (n) => n.type === "application_received",
      ),
    ).toHaveLength(0);
    // Structure suspendue : plus rien n'est émis.
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structureId));
    const r = await signUp("Rene_66");
    const car = await createVehicle(r.id, ref);
    await applicationsService
      .apply(await viewerOf(r), e.id, {
        vehicleIds: [car.id],
        rulesAccepted: true,
        followStructure: false,
        newsletterOptIn: false,
        companions: 0,
        message: null,
      } as never)
      .catch(() => undefined);
    expect(countOf((await mineIn(damien)).find((x) => x.type === "application_received"))).toBe(2);
  });

  it("demande de staff : une ligne par responsable avec structure_id (destinataires inchangés)", async () => {
    const marc = await signUp("Marc_66");
    await staffRequestsService.request(await viewerOf(marc), structureId, "Je peux aider");
    for (const u of [damien, lea]) {
      const rows = (await mineIn(u)).filter((r) => r.type === "staff_request");
      expect(rows).toHaveLength(1);
    }
    const reqs = await call(damien, "GET", `/structures/${structureId}/requests`);
    expect(reqs.json.items).toMatchObject([{ kind: "staff", id: marc.id, from: { pseudo: "Marc_66" } }]);
    expect(reqs.json.total).toBe(1);
    const count = await call(damien, "GET", `/structures/${structureId}/activity/count`);
    expect(count.json.requests).toEqual({ staff: 1, coauthor: 0 });
    // Une demande ne compte qu'une fois : sa notification n'est pas dans les « non vus ».
    expect(count.json.unseen).toBe(0);
    // Boîte de l'APK en ligne : anciens champs identiques, nouveaux champs ajoutés.
    const sum = await call(damien, "GET", `/structures/${structureId}/inbox/summary`);
    expect(sum.json).toMatchObject({
      participantMessages: 0,
      staffDiscussions: 0,
      staffRequests: 1,
      activityUnseen: 0,
      coauthorRequests: 0,
    });
  });

  it("mention : la structure citée prévient ses responsables ; un compte privé qui la cite : rien ; l'auteur responsable : pas lui", async () => {
    const kenji = await signUp("Kenji_66");
    const post = await dbPost(kenji, { caption: `Merci @${slug} pour la soirée` });
    await materializeMentions(db, post, { notify: true });
    for (const u of [damien, lea]) {
      const rows = (await mineIn(u)).filter((r) => r.type === "feed_post_mention");
      expect(rows).toHaveLength(1);
    }
    // Compte privé.
    const secret = await signUp("Secret_66");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, secret.id));
    const privatePost = await dbPost(secret, { caption: `Cc @${slug}` });
    await materializeMentions(db, privatePost, { notify: true });
    expect((await mineIn(damien)).filter((r) => r.type === "feed_post_mention")).toHaveLength(1);
    // Un responsable qui cite sa propre structure : l'autre seulement.
    const own = await dbPost(lea, { caption: `Nous, @${slug}` });
    await materializeMentions(db, own, { notify: true });
    expect((await mineIn(lea)).filter((r) => r.type === "feed_post_mention")).toHaveLength(1);
    expect((await mineIn(damien)).filter((r) => r.type === "feed_post_mention")).toHaveLength(2);
  });

  it("commentaire sous une publication de structure : les autres responsables, pas celui qui écrit ; réponse à un commentaire de page", async () => {
    const post = await dbPost(damien, { persona: "organizer", structureId });
    const kenji = await signUp("Kenji_66");
    const first = await callAs(kenji, null, "POST", `/feed-posts/${post}/comments`, {
      text: "Superbe",
      clientId: crypto.randomUUID(),
    });
    expect(first.status, first.text).toBe(201);
    for (const u of [damien, lea]) {
      const rows = (await mineIn(u)).filter((r) => r.type === "feed_comment");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.title).toContain("a commenté la publication de Roues Libres 66");
    }
    // Lea (responsable) commente : seulement Damien prévenu, pas elle.
    const before = (await mineIn(lea)).length;
    const own = await callAs(lea, `s:${structureId}`, "POST", `/feed-posts/${post}/comments`, {
      text: "Merci !",
      clientId: crypto.randomUUID(),
    });
    expect(own.status, own.text).toBe(201);
    expect((await mineIn(lea)).length).toBe(before);
    // Kenji répond au commentaire de la page : les deux responsables, y compris Lea qui l'a écrit (la réponse s'adresse à la page).
    const reply = await callAs(kenji, null, "POST", `/feed-posts/${post}/comments`, {
      text: "De rien",
      clientId: crypto.randomUUID(),
      parentId: own.json.id,
    });
    expect(reply.status, reply.text).toBe(201);
    expect((await mineIn(damien)).filter((r) => r.type === "feed_comment_reply")).toHaveLength(1);
    expect((await mineIn(lea)).filter((r) => r.type === "feed_comment_reply")).toHaveLength(1);
    // Jamais dans la cloche personnelle.
    expect(JSON.stringify((await call(damien, "GET", "/me/activity")).json)).not.toContain("a commenté la publication");
  });

  it("un compte qui cite un autre type de fiche reste personnel : les lignes personnelles gardent structure_id nul", async () => {
    await notificationsService.notify(db, damien.id, "feed_comment", { title: "Perso", body: "B" });
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(row?.structureId).toBeNull();
  });
});

describe("compatibilité de la Boîte (APK en ligne)", () => {
  it("le résumé garde ses trois anciens champs ; la forme des conversations ne change pas", async () => {
    const sum = await call(damien, "GET", `/structures/${structureId}/inbox/summary`);
    expect(sum.status).toBe(200);
    expect(Object.keys(sum.json).sort()).toEqual(
      ["activityUnseen", "coauthorRequests", "participantMessages", "staffDiscussions", "staffRequests"].sort(),
    );
    const conv = await call(damien, "GET", `/structures/${structureId}/conversations`);
    expect(Object.keys(conv.json).sort()).toEqual(["items", "nextCursor"]);
    const me = await call(damien, "GET", "/me/inbox/summary");
    expect(me.status).toBe(200);
    expect(Object.keys(me.json)).not.toContain("activityUnseen");
  });
});
