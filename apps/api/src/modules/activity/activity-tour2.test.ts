// Lot R7c1, tour 2 : comptes supprimés ou suspendus dans les notifications regroupées, invitations tronquées, temps réel
// d'un groupe déjà livré, verrou du regroupement, Demandes au-delà de 50, compte suspendu, e-mail d'un vote gagné,
// migration sur une base qui a des données, venue en crew à confirmer, course avec la livraison.
import { readdirSync, readFileSync } from "node:fs";
import { fromWallTime } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  signUp as baseSignUp,
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  crewMembers,
  crews,
  emailOutbox,
  eventPeerInvitations,
  notifications,
  profiles,
  structureMembers,
  user,
  userFollows,
} from "../../db/schema";
import { push } from "../../lib/push";
import { realtime } from "../../lib/realtime";
import { withTx } from "../../lib/tx";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
const HOUR = 3_600_000;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
  ref = await seedReference();
});

/** Un compte neuf, sans la notification de connexion qu'on lui envoie à l'inscription. */
async function signUp(pseudo: string) {
  const u = await baseSignUp(pseudo);
  await notificationsService.flush();
  await db.delete(notifications).where(eq(notifications.userId, u.id));
  return u;
}

const actorOf = (u: TestUser) => ({ userId: u.id, pseudo: u.pseudo, avatarUrl: null });

/** Une flamme sur la story `s1` de `to`, avec le texte « Pseudo a aimé ta story », livrée. */
async function like(to: TestUser, from: TestUser, story = "s1") {
  await withTx((tx) =>
    notificationsService.notify(tx, to.id, "story_like", {
      title: "{name} a aimé ta story",
      body: "{name} a aimé ta story.",
      groupKey: `story_like:${story}`,
      actor: actorOf(from),
    }),
  );
  await notificationsService.deliverDue();
}

const suspend = (u: TestUser) =>
  db
    .update(profiles)
    .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
    .where(eq(profiles.userId, u.id));

/** Les deux lectures d'un compte : l'Activité et l'ancien Journal, en JSON. */
async function bothRoutes(u: TestUser) {
  const activity = (await call(u, "GET", "/me/activity")).json;
  const journal = (await call(u, "GET", "/me/notifications")).json;
  return { activity, journal, text: JSON.stringify([activity, journal]) };
}

describe("notifications regroupées et comptes supprimés ou suspendus", () => {
  it("suppression réelle d'un compte parmi plusieurs : ni pseudo, ni avatar, ni texte, sur les deux routes", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    const julie = await signUp("Julie_66");
    await like(damien, kenji);
    await like(damien, marc);
    await like(damien, julie);
    expect((await bothRoutes(damien)).text).toContain("Julie_66 a aimé ta story");

    await accountService.anonymize(julie.id, null, {});

    const { activity, journal, text } = await bothRoutes(damien);
    expect(text).not.toContain("Julie_66");
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(JSON.stringify(row)).not.toContain("Julie_66");
    expect(JSON.stringify(row)).not.toContain(julie.id);
    expect(row?.data).toMatchObject({ count: 2, actors: [{ pseudo: "Marc_66" }, { pseudo: "Kenji_66" }] });
    // Titre et corps recomposés avec la personne la plus récente restée.
    expect(row).toMatchObject({ title: "Marc_66 a aimé ta story", body: "Marc_66 a aimé ta story." });
    const item = activity.groups[0].items[0];
    expect(item).toMatchObject({ count: 2, title: "Marc_66 a aimé ta story" });
    expect(item.actors.map((a: { pseudo: string }) => a.pseudo)).toEqual(["Marc_66", "Kenji_66"]);
    expect(journal.items[0]).toMatchObject({ title: "Marc_66 a aimé ta story" });
    expect(journal.items[0].data).toMatchObject({ count: 2 });

    // Les deux autres partent à leur tour : plus rien à montrer, la ligne disparaît.
    await accountService.anonymize(kenji.id, null, {});
    await accountService.anonymize(marc.id, null, {});
    expect(await db.select().from(notifications).where(eq(notifications.userId, damien.id))).toHaveLength(0);
    expect((await call(damien, "GET", "/me/activity")).json.groups).toEqual([]);
    expect((await call(damien, "GET", "/me/notifications")).json.items).toEqual([]);
  });

  it("suspension d'une personne parmi plusieurs : texte, personnes et total recomposés à la lecture, sur les deux routes", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    const julie = await signUp("Julie_66");
    await like(damien, kenji);
    await like(damien, marc);
    await like(damien, julie);
    await suspend(julie);

    const { activity, journal, text } = await bothRoutes(damien);
    expect(text).not.toContain("Julie_66");
    expect(activity.groups[0].items[0]).toMatchObject({ count: 2, title: "Marc_66 a aimé ta story" });
    expect(journal.items[0]).toMatchObject({ title: "Marc_66 a aimé ta story", body: "Marc_66 a aimé ta story." });
    expect(journal.items[0].data.actors.map((a: { pseudo: string }) => a.pseudo)).toEqual(["Marc_66", "Kenji_66"]);
    expect(journal.items[0].data).not.toHaveProperty("_actorIds");
    expect(journal.items[0].data).not.toHaveProperty("_text");
    // La ligne enregistrée n'est pas touchée : la suspension se lève.
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(row?.title).toBe("Julie_66 a aimé ta story");
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, julie.id));
    expect((await call(damien, "GET", "/me/activity")).json.groups[0].items[0]).toMatchObject({ count: 3 });
  });

  it("pastille : une ligne dont toutes les personnes sont suspendues ou bannies ne compte pas (Activité et ancien Journal)", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await like(damien, kenji, "s1");
    await like(damien, julie, "s2");
    await like(damien, kenji, "s2");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 2 });
    expect(await notificationsService.unreadCount(damien.id)).toBe(2);
    await suspend(kenji);
    // s1 : seul Kenji → masquée ; s2 : reste Julie → montrée.
    expect((await call(damien, "GET", "/me/activity")).json.groups[0].items).toHaveLength(1);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
    expect(await notificationsService.unreadCount(damien.id)).toBe(1);
    expect((await call(damien, "GET", "/me/notifications")).json.items).toHaveLength(1);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, julie.id));
    expect((await call(damien, "GET", "/me/activity")).json.groups).toEqual([]);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    expect((await call(damien, "GET", "/me/inbox/summary")).json.unseenActivity).toBe(0);
  });
});

describe("occurrence ajoutée à une ligne regroupée", () => {
  /** Messages temps réel reçus par un compte. */
  function listen(u: TestUser) {
    const got: { type: string; payload: unknown }[] = [];
    const socket = { send: (m: string) => got.push(JSON.parse(m)) };
    realtime.subscribe(`user:${u.id}`, socket);
    return { got, stop: () => realtime.unsubscribe(`user:${u.id}`, socket) };
  }

  it("déjà livrée : les appareils reçoivent « inbox.changed » après la validation, sans nouveau push", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    await like(damien, kenji);
    const spy = vi.spyOn(push, "send").mockResolvedValue(1);
    const live = listen(damien);
    try {
      let during = -1;
      await withTx(async (tx, after) => {
        await notificationsService.notify(tx, damien.id, "story_like", {
          title: "{name} a aimé ta story",
          body: "{name} a aimé ta story.",
          groupKey: "story_like:s1",
          actor: actorOf(marc),
          after,
        });
        // Rien n'est annoncé tant que la transaction n'est pas validée.
        during = live.got.filter((m) => m.type === "inbox.changed").length;
      });
      expect(during).toBe(0);
      // Annoncé dès la validation, sans attendre de `kick`, une seule fois.
      expect(live.got.filter((m) => m.type === "inbox.changed")).toHaveLength(1);
      // Pas de nouvelle livraison « notification » ni de push.
      expect(live.got.filter((m) => m.type === "notification")).toHaveLength(0);
      notificationsService.kick();
      await notificationsService.flush();
      expect(live.got.filter((m) => m.type === "inbox.changed")).toHaveLength(1);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      live.stop();
    }
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(row?.data).toMatchObject({ count: 2 });
  });

  it("appelée sur la base (hors transaction) : elle ouvre sa transaction et annonce tout de suite", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const marc = await signUp("Marc_66");
    await like(damien, kenji);
    const live = listen(damien);
    try {
      await notificationsService.notify(db, damien.id, "story_like", {
        title: "{name} a aimé ta story",
        body: "{name} a aimé ta story.",
        groupKey: "story_like:s1",
        actor: actorOf(marc),
      });
      expect(live.got.filter((m) => m.type === "inbox.changed")).toHaveLength(1);
    } finally {
      live.stop();
    }
  });

  it("deux notify simultanés sur la base, sans transaction : une seule ligne, deux personnes", async () => {
    const damien = await signUp("Damien_66");
    const fans = await Promise.all(["Kenji_66", "Julie_66", "Marc_66", "Lea_66"].map((p) => signUp(p)));
    await Promise.all(
      fans.map((f) =>
        notificationsService.notify(db, damien.id, "story_like", {
          title: "{name} a aimé ta story",
          body: "Flamme",
          groupKey: "story_like:s1",
          actor: actorOf(f),
        }),
      ),
    );
    const rows = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ count: 4 });
  });

  it("course avec la livraison : une seule ligne, livrée une seule fois, toutes les personnes comptées", async () => {
    const damien = await signUp("Damien_66");
    const fans = await Promise.all(["Kenji_66", "Julie_66", "Marc_66", "Lea_66", "Nina_66"].map((p) => signUp(p)));
    const spy = vi.spyOn(push, "send").mockResolvedValue(1);
    try {
      await Promise.all([
        ...fans.map((f) =>
          withTx((tx) =>
            notificationsService.notify(tx, damien.id, "story_like", {
              title: "{name} a aimé ta story",
              body: "Flamme",
              groupKey: "story_like:s1",
              actor: actorOf(f),
            }),
          ).then(() => notificationsService.deliverDue()),
        ),
        notificationsService.deliverDue(),
        notificationsService.deliverDue(),
      ]);
      await notificationsService.deliverDue();
    } finally {
      spy.mockRestore();
    }
    const rows = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deliveredAt).not.toBeNull();
    expect(rows[0]?.data).toMatchObject({ count: 5 });
  });
});

describe("heures calmes : rendez-vous au spot", () => {
  it("à 1 h pour un rendez-vous à 18 h : attend 8 h ; à 16 h 30 pour 18 h : part tout de suite", async () => {
    const damien = await signUp("Damien_66");
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 1, minute: 0 }));
    const startsAt = fromWallTime({ year: 2026, month: 11, day: 10, hour: 18, minute: 0 });
    const night = await withTx((tx) =>
      notificationsService.notify(tx, damien.id, "spot_meetup_new", { title: "T", body: "C", eventStartsAt: startsAt }),
    );
    expect(night.deliverAfter).toEqual(fromWallTime({ year: 2026, month: 11, day: 10, hour: 8, minute: 0 }));
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 16, minute: 30 }));
    const day = await withTx((tx) =>
      notificationsService.notify(tx, damien.id, "spot_meetup_new", { title: "T", body: "C", eventStartsAt: startsAt }),
    );
    expect(day.deliverAfter).toEqual(clock.now);
  });
});

describe("vote gagné : push et e-mail", () => {
  it("un gagnant qui a un appareil reçoit le push et l'e-mail ; un vote ouvert, le push seul", async () => {
    const lea = await signUp("Lea_66");
    const reg = await call(lea, "POST", "/me/devices", {
      platform: "android",
      expoPushToken: "ExponentPushToken[r7c1-tour2]",
    });
    expect(reg.status).toBe(201);
    await notificationsService.flush();
    const spy = vi.spyOn(push, "send").mockResolvedValue(1);
    try {
      await withTx((tx) =>
        notificationsService.notify(tx, lea.id, "vote_won", {
          title: "Tu as gagné un vote",
          body: "Ton véhicule gagne.",
        }),
      );
      await withTx((tx) =>
        notificationsService.notify(tx, lea.id, "vote_opened", { title: "Un vote s'ouvre", body: "Vote ouvert." }),
      );
      await notificationsService.deliverDue();
      const titles = spy.mock.calls.flatMap((c) => c[0].map((m) => m.title));
      expect(titles).toEqual(expect.arrayContaining(["Tu as gagné un vote", "Un vote s'ouvre"]));
    } finally {
      spy.mockRestore();
    }
    const [account] = await db.select({ email: user.email }).from(user).where(eq(user.id, lea.id));
    const mails = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.to, account?.email ?? ""));
    expect(mails.map((m) => m.subject)).toContain("Tu as gagné un vote");
    expect(mails.map((m) => m.subject)).not.toContain("Un vote s'ouvre");
  });
});

describe("compte suspendu", () => {
  it("peut acquitter l'ouverture de la cloche (POST /me/activity/seen), et sa pastille retombe", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await like(damien, kenji);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
    await suspend(damien);
    expect((await call(damien, "POST", "/me/activity/seen")).status).toBe(204);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    // Les autres écritures restent refusées.
    expect((await call(damien, "POST", "/me/follow-requests/x/accept")).status).toBe(403);
  });
});

describe("curseurs invalides", () => {
  const cursor = (text: string) => encodeURIComponent(Buffer.from(text).toString("base64url"));
  it("Activité : identifiant qui n'est pas un uuid, date fausse ou texte quelconque : 400, pas 500", async () => {
    const damien = await signUp("Damien_66");
    for (const bad of [cursor("2026-11-09T10:00:00.000Z|pas-un-uuid"), cursor("n'importe quoi"), "zzz"]) {
      expect((await call(damien, "GET", `/me/activity?cursor=${bad}`)).status).toBe(400);
    }
    const ok = cursor("2026-11-09T10:00:00.000Z|00000000-0000-4000-8000-000000000000");
    expect((await call(damien, "GET", `/me/activity?cursor=${ok}`)).status).toBe(200);
  });
  it("Demandes : curseur illisible ou faux : 400", async () => {
    const damien = await signUp("Damien_66");
    for (const bad of ["zzz", cursor("pas du json"), cursor(JSON.stringify(["pas une date", "follow", "x"]))]) {
      expect((await call(damien, "GET", `/me/requests?cursor=${bad}`)).status).toBe(400);
    }
  });
});

describe("Demandes : plus de cinquante", () => {
  it("51 demandes d'abonnement : total 51, une page de 50, la suite par le curseur, sans doublon", async () => {
    const damien = await signUp("Damien_66");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, damien.id));
    const people: TestUser[] = [];
    for (let i = 0; i < 51; i += 10) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(10, 51 - i) }, (_, j) => baseSignUp(`Fan_${String(i + j).padStart(2, "0")}`)),
      );
      people.push(...batch);
    }
    await db.insert(userFollows).values(
      people.map((p, i) => ({
        followerId: p.id,
        followedId: damien.id,
        status: "pending" as const,
        createdAt: new Date(clock.now.getTime() - i * 60_000),
      })),
    );
    const first = (await call(damien, "GET", "/me/requests")).json;
    expect(first.total).toBe(51);
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(51);
    const second = (await call(damien, "GET", `/me/requests?cursor=${encodeURIComponent(first.nextCursor)}`)).json;
    expect(second.total).toBe(51);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((i: { id: string }) => i.id);
    expect(new Set(ids).size).toBe(51);
    // La plus ancienne arrive en dernier.
    expect(second.items[0].id).toBe(people[50]?.id);
  }, 120_000);
});

describe("Demandes de staff : ce qui s'adresse à moi en tant que personne", () => {
  it("l'invitation à rejoindre un staff y est ; la demande adressée à ma structure reste dans l'espace organisateur", async () => {
    const orga = await signUp("Orga_66");
    const kenji = await signUp("Kenji_66");
    const damien = await signUp("Damien_66");
    const mine = await createStructure(orga.id);
    const other = await createStructure(kenji.id);
    // Kenji demande à rejoindre le staff de la structure d'Orga ; Kenji invite Damien dans la sienne.
    await db
      .insert(structureMembers)
      .values({ structureId: mine.id, userId: kenji.id, role: "staff", status: "requested" });
    await db
      .insert(structureMembers)
      .values({ structureId: other.id, userId: damien.id, role: "staff", status: "invited", invitedBy: kenji.id });
    const orgaRequests = (await call(orga, "GET", "/me/requests")).json;
    expect(orgaRequests.items.filter((i: { kind: string }) => i.kind === "staff")).toHaveLength(0);
    expect(orgaRequests.total).toBe(0);
    const damienRequests = (await call(damien, "GET", "/me/requests")).json;
    expect(damienRequests.items.map((i: { kind: string; id: string }) => [i.kind, i.id])).toEqual([
      ["staff", other.id],
    ]);
    expect(damienRequests.total).toBe(1);
  });
});

describe("invitation de crew d'un chef qui n'est plus en règle", () => {
  it("chef suspendu ou banni : l'invitation n'apparaît ni dans la liste ni dans la pastille", async () => {
    const damien = await signUp("Damien_66");
    const lea = await signUp("Lea_66");
    const [crew] = await db
      .insert(crews)
      .values({ slug: "les-pistons", name: "Les Pistons", department: "66", createdBy: lea.id })
      .returning();
    await db.insert(crewMembers).values([
      { crewId: crew!.id, userId: lea.id, role: "leader", status: "active" },
      { crewId: crew!.id, userId: damien.id, role: "member", status: "invited", invitedBy: lea.id },
    ]);
    const kinds = async () =>
      (await call(damien, "GET", "/me/requests")).json.items.map((i: { kind: string }) => i.kind);
    expect(await kinds()).toEqual(["crew_invitation"]);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(1);

    await suspend(lea);
    expect(await kinds()).toEqual([]);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(0);
    expect((await call(damien, "GET", "/me/crew-requests")).json).toEqual([]);

    await db.update(profiles).set({ suspendedUntil: null, bannedAt: new Date() }).where(eq(profiles.userId, lea.id));
    expect(await kinds()).toEqual([]);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(0);
  });
});

describe("invitations entre passionnés : vingt déjà honorées n'en cachent pas une vingt-et-unième", () => {
  it("la vingt-et-unième, plus ancienne, apparaît dans la liste et dans le compteur", async () => {
    const orga = await signUp("Orga_66");
    const damien = await signUp("Damien_66");
    const marc = await signUp("Marc_66");
    const s = await createStructure(orga.id);
    const vehicle = await createVehicle(damien.id, ref);
    const rows: (typeof eventPeerInvitations.$inferInsert)[] = [];
    for (let i = 0; i < 21; i += 1) {
      const e = await createEvent(s.id, {
        title: `Rassemblement ${i}`,
        startsAt: new Date(clock.now.getTime() + (5 + i) * 24 * HOUR),
      });
      // Les vingt premiers : invitations récentes, et Damien y va déjà. La dernière : plus ancienne, pas encore répondu.
      rows.push({
        eventId: e.id,
        inviterId: marc.id,
        inviteeId: damien.id,
        createdAt: new Date(clock.now.getTime() - (i === 20 ? 10 * 24 * HOUR : i * 60_000)),
      });
      if (i < 20) {
        await db.insert(applications).values({
          eventId: e.id,
          userId: damien.id,
          vehicleId: vehicle.id,
          status: "accepted",
          rulesAcceptedAt: new Date(),
          followStructure: false,
        });
      }
    }
    await db.insert(eventPeerInvitations).values(rows);
    const res = (await call(damien, "GET", "/me/requests")).json;
    const peers = res.items.filter((i: { payload: { source?: string } }) => i.payload.source === "peer");
    expect(peers).toHaveLength(1);
    expect(peers[0].payload.event.title).toBe("Rassemblement 20");
    expect(res.total).toBe(1);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(1);
  }, 120_000);
});

describe("venue en crew à confirmer (variante confirmation)", () => {
  it("apparaît dans les Demandes avec l'événement et la limite de réponse, et dans la pastille", async () => {
    const orga = await signUp("Orga_66");
    const damien = await signUp("Damien_66");
    const lea = await signUp("Lea_66");
    const s = await createStructure(orga.id);
    const event = await createEvent(s.id, {
      title: "Nocturne de Canet",
      startsAt: new Date(clock.now.getTime() + 8 * 24 * HOUR),
    });
    const [crew] = await db
      .insert(crews)
      .values({ slug: "les-pistons", name: "Les Pistons", department: "66", createdBy: lea.id })
      .returning();
    await db.insert(crewMembers).values([
      { crewId: crew!.id, userId: lea.id, role: "leader", status: "active" },
      { crewId: crew!.id, userId: damien.id, role: "member", status: "active" },
    ]);
    const vehicle = await createVehicle(damien.id, ref);
    const [application] = await db
      .insert(applications)
      .values({
        eventId: event.id,
        userId: damien.id,
        vehicleId: vehicle.id,
        crewId: crew!.id,
        status: "awaiting_member",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    const res = (await call(damien, "GET", "/me/requests")).json;
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      kind: "crew",
      id: application!.id,
      from: { type: "structure", name: "Les Pistons" },
      payload: {
        variant: "confirmation",
        leaderPseudo: "Lea_66",
        event: { slug: event.slug, title: "Nocturne de Canet" },
      },
    });
    expect(res.items[0].payload.confirmBefore).toEqual(expect.any(String));
    expect(JSON.stringify(res.items[0])).not.toContain(vehicle.plateNormalized ?? "plaque-introuvable");
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(1);
  });
});

describe("migration sur une base qui a déjà des données", () => {
  it("les lignes et les comptes existants gardent leurs valeurs : group_key et activity_seen_at arrivent nuls", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await db.insert(notifications).values({
      userId: damien.id,
      type: "event_updated",
      family: "event",
      title: "Horaire modifié",
      body: "Avant la migration",
      deliverAfter: new Date(),
      deliveredAt: new Date(),
    });
    const dir = new URL("../../../drizzle/", import.meta.url);
    const file = readdirSync(dir).find((f) => f.endsWith("_activity.sql"));
    expect(file).toBeDefined();
    const statements = readFileSync(new URL(file as string, dir), "utf8")
      .split("--> statement-breakpoint")
      .map((x) => x.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(4);
    // Schéma d'avant la migration, puis la migration jouée sur les lignes existantes ; tout est annulé à la fin.
    class Rollback extends Error {}
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`alter table notifications drop column group_key`);
        await tx.execute(sql`alter table profiles drop column activity_seen_at`);
        for (const statement of statements) await tx.execute(sql.raw(statement));
        const notes = await tx.execute(sql`select body, group_key from notifications where user_id = ${damien.id}`);
        expect(notes.rows).toEqual([{ body: "Avant la migration", group_key: null }]);
        const people = await tx.execute(
          sql`select user_id, activity_seen_at from profiles where user_id in (${damien.id}, ${kenji.id})`,
        );
        expect(people.rows).toHaveLength(2);
        for (const p of people.rows as { activity_seen_at: unknown }[]) expect(p.activity_seen_at).toBeNull();
        const idx = await tx.execute(sql`select 1 from pg_indexes where indexname = 'notifications_user_group_idx'`);
        expect(idx.rows).toHaveLength(1);
        const actorIdx = await tx.execute(
          sql`select 1 from pg_indexes where indexname = 'notifications_actor_ids_idx'`,
        );
        expect(actorIdx.rows).toHaveLength(1);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);
    // Le schéma de la base de test est resté tel quel.
    const cols = await db.execute(
      sql`select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'group_key'`,
    );
    expect(cols.rows).toHaveLength(1);
  });
});
