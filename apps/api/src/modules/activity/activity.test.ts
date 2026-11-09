// Lot R7c1 : la cloche (Activité), les Demandes, les pastilles, les notifications regroupées, les heures calmes.
import { fromWallTime } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

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
  contactRequests,
  crewMembers,
  crews,
  eventInvitations,
  eventPeerInvitations,
  notifications,
  plateTransferRequests,
  profiles,
  structureMembers,
  userFollows,
} from "../../db/schema";
import { withTx } from "../../lib/tx";
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

type Input = Parameters<typeof notificationsService.notify>[3];
type Type = Parameters<typeof notificationsService.notify>[2];

/** Enregistre une notification puis la livre (comme la tâche de chaque minute). */
async function send(userId: string, type: Type, input: Partial<Input> = {}) {
  const row = await withTx((tx) =>
    notificationsService.notify(tx, userId, type, { title: "Titre", body: "Texte", ...input }),
  );
  await notificationsService.deliverDue();
  const [fresh] = await db.select().from(notifications).where(eq(notifications.id, row.id));
  return fresh ?? row;
}

/** Personnes rassemblées dans une notification regroupée. */
const countOf = (row: { data: unknown } | undefined) => (row?.data as { count?: number } | undefined)?.count;

const actorOf = (u: TestUser) => ({ userId: u.id, pseudo: u.pseudo, avatarUrl: null });

const activity = async (u: TestUser, cursor?: string) =>
  (await call(u, "GET", `/me/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json;
// biome-ignore lint/suspicious/noExplicitAny: formes JSON lues librement
const itemsOf = (page: any): any[] => page.groups.flatMap((g: { items: unknown[] }) => g.items);

describe("notifications regroupées (group_key)", () => {
  it("cinq flammes sur la même story : une seule ligne, trois pseudos et le compte", async () => {
    const damien = await signUp("Damien_66");
    const fans = [] as TestUser[];
    for (const p of ["Kenji_66", "Julie_66", "Lea_66", "Marc_66", "Nina_66"]) fans.push(await signUp(p));
    for (const f of fans) {
      await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(f), title: `${f.pseudo} aime` });
    }
    const rows = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(rows).toHaveLength(1);
    const data = rows[0]?.data as { actors: { pseudo: string }[]; count: number; _actorIds: string[] };
    expect(data.count).toBe(5);
    expect(data.actors.map((a) => a.pseudo)).toEqual(["Nina_66", "Marc_66", "Lea_66"]);
    expect(data._actorIds).toHaveLength(5);
    expect(rows[0]?.groupKey).toBe("story_like:s1");
    expect(rows[0]?.title).toBe("Nina_66 aime");
  });

  it("cinq flammes simultanées : toujours une seule ligne, cinq personnes", async () => {
    const damien = await signUp("Damien_66");
    const fans = await Promise.all(["Kenji_66", "Julie_66", "Lea_66", "Marc_66", "Nina_66"].map((p) => signUp(p)));
    await Promise.all(
      fans.map((f) =>
        withTx((tx) =>
          notificationsService.notify(tx, damien.id, "story_like", {
            title: "Flamme",
            body: "Flamme",
            groupKey: "story_like:s1",
            actor: actorOf(f),
          }),
        ),
      ),
    );
    const rows = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(rows).toHaveLength(1);
    expect(countOf(rows[0])).toBe(5);
  });

  it("la même personne deux fois ne compte qu'une fois", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, damien.id));
    expect(countOf(row)).toBe(1);
  });

  it("une story différente, une notification lue ou de plus de 24 h : une nouvelle ligne", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    await send(damien.id, "story_like", { groupKey: "story_like:s2", actor: actorOf(kenji) });
    expect(await db.select().from(notifications).where(eq(notifications.userId, damien.id))).toHaveLength(2);

    await notificationsService.markRead(damien.id, "all");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    expect(await db.select().from(notifications).where(eq(notifications.userId, damien.id))).toHaveLength(3);

    await db.execute(sql`update notifications set created_at = now() - interval '25 hours'`);
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    expect(await db.select().from(notifications).where(eq(notifications.userId, damien.id))).toHaveLength(4);
  });

  it("jamais mélangée entre deux comptes", async () => {
    const a = await signUp("Damien_66");
    const b = await signUp("Lea_66");
    const kenji = await signUp("Kenji_66");
    await send(a.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    await send(b.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    expect(await db.select().from(notifications)).toHaveLength(2);
  });

  it("une occurrence regroupée déjà livrée repasse en tête des non vus de la cloche", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    await call(damien, "POST", "/me/activity/seen");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    clock.advance(HOUR);
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(julie) });
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
  });
});

describe("GET /me/activity", () => {
  it("regroupe par clé, liste blanche, sans identifiant de personne", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji), data: { storyId: "s1" } });
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(julie), data: { storyId: "s1" } });
    await send(damien.id, "vote_opened", { title: "Vote ouvert" });
    const res = await call(damien, "GET", "/me/activity");
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(["groups", "highlighted", "nextCursor"]);
    const items = itemsOf(res.json);
    expect(items).toHaveLength(2);
    const like = items.find((i) => i.type === "story_like");
    expect(Object.keys(like).sort()).toEqual(
      [
        "actors",
        "body",
        "count",
        "data",
        "eventId",
        "groupKey",
        "id",
        "ids",
        "latestAt",
        "read",
        "title",
        "type",
      ].sort(),
    );
    expect(like).toMatchObject({ count: 2, groupKey: "story_like:s1", read: false });
    expect(like.actors.map((a: { pseudo: string }) => a.pseudo)).toEqual(["Julie_66", "Kenji_66"]);
    expect(Object.keys(like.actors[0]).sort()).toEqual(["avatarUrl", "pseudo"]);
    expect(like.data).toEqual({ storyId: "s1" });
    expect(res.json.groups[0].day).toBe("today");
    // Aucun identifiant de compte dans la réponse.
    expect(res.text).not.toContain(kenji.id);
    expect(res.text).not.toContain(julie.id);
    expect(res.text).not.toContain("_actorIds");
  });

  it("exclut les nouvelles du Fil (potes, publication de story)", async () => {
    const damien = await signUp("Damien_66");
    await send(damien.id, "friend_going_event", { title: "Kenji va à X" });
    await send(damien.id, "friend_new_vehicle", { title: "Kenji ajoute une voiture" });
    await send(damien.id, "story_published", { title: "Kenji a publié une story" });
    await send(damien.id, "points_awarded", { title: "Points" });
    const items = itemsOf(await activity(damien));
    expect(items.map((i) => i.type)).toEqual(["points_awarded"]);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
  });

  it("ne montre que mes notifications, livrées, du Journal", async () => {
    const damien = await signUp("Damien_66");
    const lea = await signUp("Lea_66");
    await send(lea.id, "points_awarded");
    await send(damien.id, "points_awarded", { inJournal: false });
    expect(itemsOf(await activity(damien))).toHaveLength(0);
    expect(itemsOf(await activity(lea))).toHaveLength(1);
    // Une notification différée (heures calmes) n'apparaît qu'une fois livrée.
    clock.set(fromWallTime({ year: 2026, month: 11, day: 9, hour: 23, minute: 0 }));
    await send(damien.id, "points_awarded");
    expect(itemsOf(await activity(damien))).toHaveLength(0);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 8, minute: 5 }));
    await notificationsService.deliverDue();
    expect(itemsOf(await activity(damien))).toHaveLength(1);
  });

  it("une ligne dont toutes les personnes sont suspendues ou supprimées n'apparaît pas", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const julie = await signUp("Julie_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    await send(damien.id, "story_like", { groupKey: "story_like:s2", actor: actorOf(julie) });
    await send(damien.id, "story_like", { groupKey: "story_like:s2", actor: actorOf(kenji) });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, kenji.id));
    const items = itemsOf(await activity(damien));
    // s1 : seule Kenji, suspendu → disparue. s2 : reste Julie, compte 1.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ groupKey: "story_like:s2", count: 1 });
    expect(items[0].actors.map((a: { pseudo: string }) => a.pseudo)).toEqual(["Julie_66"]);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, julie.id));
    expect(itemsOf(await activity(damien))).toHaveLength(0);
  });

  it("périodes : aujourd'hui, cette semaine, plus tôt ; pagination par curseur", async () => {
    const damien = await signUp("Damien_66");
    await send(damien.id, "points_awarded", { title: "Aujourd'hui" });
    clock.set(fromWallTime({ year: 2026, month: 11, day: 6, hour: 10, minute: 0 }));
    await send(damien.id, "points_awarded", { title: "Il y a trois jours" });
    clock.set(fromWallTime({ year: 2026, month: 10, day: 20, hour: 10, minute: 0 }));
    await send(damien.id, "points_awarded", { title: "Il y a trois semaines" });
    clock.set(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
    const page = await activity(damien);
    expect(page.groups.map((g: { day: string }) => g.day)).toEqual(["today", "week", "earlier"]);
    expect(page.nextCursor).toBeNull();
    // Au-delà de 30 jours : hors de la cloche.
    clock.set(fromWallTime({ year: 2026, month: 12, day: 30, hour: 15, minute: 0 }));
    expect(itemsOf(await activity(damien))).toHaveLength(0);
  });

  it("plus de 30 lignes : le curseur continue sans doublon", async () => {
    const damien = await signUp("Damien_66");
    for (let i = 0; i < 34; i++) {
      clock.advance(60_000);
      await send(damien.id, "points_awarded", { title: `Ligne ${i}` });
    }
    const first = await activity(damien);
    expect(itemsOf(first)).toHaveLength(30);
    expect(first.nextCursor).toBeTruthy();
    expect(first.highlighted).toEqual([]);
    const second = await activity(damien, first.nextCursor);
    expect(itemsOf(second)).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    const ids = [...itemsOf(first), ...itemsOf(second)].map((i) => i.id);
    expect(new Set(ids).size).toBe(34);
  });

  it("un visiteur sans compte n'y accède pas", async () => {
    expect((await call(null, "GET", "/me/activity")).status).toBe(401);
    expect((await call(null, "GET", "/me/activity/count")).status).toBe(401);
    expect((await call(null, "POST", "/me/activity/seen")).status).toBe(401);
    expect((await call(null, "GET", "/me/requests")).status).toBe(401);
  });

  it("« lu » : la ligne regroupée est non lue tant que l'une de ses notifications l'est", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await send(damien.id, "story_like", { groupKey: "story_like:s1", actor: actorOf(kenji) });
    const [item] = itemsOf(await activity(damien));
    expect(item.read).toBe(false);
    expect((await call(damien, "POST", "/me/notifications/read", { ids: item.ids })).status).toBe(204);
    expect(itemsOf(await activity(damien))[0].read).toBe(true);
  });
});

describe("à la une (highlighted)", () => {
  async function setup() {
    const damien = await signUp("Damien_66");
    const orga = await signUp("Orga_66");
    const s = await createStructure(orga.id);
    const lydia = await createEvent(s.id, {
      title: "Rassemblement du Lydia",
      startsAt: new Date(clock.now.getTime() + 3 * 24 * HOUR),
    });
    const other = await createEvent(s.id, {
      title: "Autre rendez-vous",
      startsAt: new Date(clock.now.getTime() + 3 * 24 * HOUR),
    });
    return { damien, orga, s, lydia, other };
  }
  const apply = async (userId: string, eventId: string, status: "accepted" | "pending" = "accepted") => {
    const v = await createVehicle(userId, ref);
    await db.insert(applications).values({
      eventId,
      userId,
      vehicleId: v.id,
      status,
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
  };

  it("horaire modifié d'un événement à venir où j'ai une place : à la une, une fois par événement", async () => {
    const { damien, lydia, other } = await setup();
    await apply(damien.id, lydia.id);
    await send(damien.id, "event_updated", { eventId: lydia.id, title: "Ancien", eventStartsAt: lydia.startsAt });
    await send(damien.id, "schedule_change", {
      eventId: lydia.id,
      title: "Horaire modifié",
      eventStartsAt: lydia.startsAt,
    });
    // Sans place (candidature en attente) : pas à la une.
    await apply(damien.id, other.id, "pending");
    await send(damien.id, "schedule_change", { eventId: other.id, title: "Autre", eventStartsAt: other.startsAt });
    const page = await activity(damien);
    expect(page.highlighted).toHaveLength(1);
    expect(page.highlighted[0]).toMatchObject({ type: "schedule_change", eventId: lydia.id, title: "Horaire modifié" });
    // Les lignes restent aussi dans les groupes.
    expect(itemsOf(page)).toHaveLength(3);
  });

  it("lu, événement passé ou annulé, ou notification d'un autre compte : pas à la une", async () => {
    const { damien, orga, lydia } = await setup();
    await apply(damien.id, lydia.id);
    await send(orga.id, "schedule_change", { eventId: lydia.id });
    const mine = await send(damien.id, "schedule_change", { eventId: lydia.id });
    expect((await activity(damien)).highlighted).toHaveLength(1);
    await notificationsService.markRead(damien.id, [mine.id]);
    expect((await activity(damien)).highlighted).toHaveLength(0);
    await db.update(notifications).set({ readAt: null }).where(eq(notifications.id, mine.id));
    await db.execute(sql`update events set status = 'cancelled' where id = ${lydia.id}`);
    expect((await activity(damien)).highlighted).toHaveLength(0);
  });
});

describe("pastille de la cloche", () => {
  it("non vus avant et après « seen » ; une lecture la fait baisser ; l'ancien compteur est inchangé", async () => {
    const damien = await signUp("Damien_66");
    await send(damien.id, "points_awarded");
    await send(damien.id, "points_awarded");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 2 });
    expect((await call(damien, "GET", "/me")).json.counts).toMatchObject({ unreadNotifications: 2, unseenActivity: 2 });
    clock.advance(1000);
    expect((await call(damien, "POST", "/me/activity/seen")).status).toBe(204);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    // Non lues pour autant : la pastille de l'ancien Journal ne bouge pas.
    expect((await call(damien, "GET", "/me")).json.counts.unreadNotifications).toBe(2);
    clock.advance(1000);
    const fresh = await send(damien.id, "points_awarded");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
    await notificationsService.markRead(damien.id, [fresh.id]);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
  });

  it("le Fil n'y compte pas, et chacun a la sienne", async () => {
    const damien = await signUp("Damien_66");
    const lea = await signUp("Lea_66");
    await send(damien.id, "friend_going_event");
    await send(lea.id, "points_awarded");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    expect((await call(lea, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
    await call(lea, "POST", "/me/activity/seen");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
  });
});

describe("GET /me/requests", () => {
  /** Une demande de chaque sorte pour `damien`. */
  async function everyKind() {
    const damien = await signUp("Damien_66");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, damien.id));
    const orga = await signUp("Orga_66");
    const s = await createStructure(orga.id);
    const event = await createEvent(s.id, {
      title: "Nocturne de Canet",
      startsAt: new Date(clock.now.getTime() + 5 * 24 * HOUR),
    });
    const people: Record<string, TestUser> = {};
    for (const p of ["Kenji_66", "Julie_66", "Lea_66", "Marc_66", "Nina_66", "Theo_66"]) people[p] = await signUp(p);
    const k = (name: string) => people[name] as TestUser;

    // Abonnement (compte privé).
    await db.insert(userFollows).values({ followerId: k("Kenji_66").id, followedId: damien.id, status: "pending" });
    // Demande de message.
    await db
      .insert(contactRequests)
      .values({ fromUserId: k("Julie_66").id, toUserId: damien.id, message: "Salut, belle voiture !" });
    // Invitation à un crew.
    const [crew] = await db
      .insert(crews)
      .values({ slug: "les-pistons", name: "Les Pistons", department: "66", createdBy: k("Lea_66").id })
      .returning();
    await db.insert(crewMembers).values([
      { crewId: crew!.id, userId: k("Lea_66").id, role: "leader", status: "active" },
      { crewId: crew!.id, userId: damien.id, role: "member", status: "invited", invitedBy: k("Lea_66").id },
    ]);
    // Invitation d'un organisateur à un événement.
    await db.insert(eventInvitations).values({
      eventId: event.id,
      userId: damien.id,
      token: `jeton-${"a".repeat(20)}`,
      message: "On compte sur toi",
      createdBy: orga.id,
    });
    // Invitation d'un passionné à un autre événement.
    const peerEvent = await createEvent(s.id, {
      title: "Cars and coffee",
      startsAt: new Date(clock.now.getTime() + 6 * 24 * HOUR),
    });
    await db
      .insert(eventPeerInvitations)
      .values({ eventId: peerEvent.id, inviterId: k("Marc_66").id, inviteeId: damien.id, note: "Viens !" });
    // Invitation à rejoindre le staff d'une structure.
    const s2 = await createStructure(orga.id);
    await db
      .insert(structureMembers)
      .values({ structureId: s2.id, userId: damien.id, role: "staff", status: "invited", invitedBy: orga.id });
    // Transfert de plaque : Nina a saisi la plaque de la voiture de Damien.
    const holder = await createVehicle(damien.id, ref);
    const [transfer] = await db
      .insert(plateTransferRequests)
      .values({ plateNormalized: holder.plateNormalized!, fromVehicleId: holder.id, toUserId: k("Nina_66").id })
      .returning();
    const requesterCar = await createVehicle(k("Nina_66").id, ref, {
      pendingTransferId: transfer!.id,
      plate: null,
      plateNormalized: null,
    });
    return { damien, orga, k, event, peerEvent, crew: crew!, holder, transfer: transfer!, requesterCar };
  }

  it("chaque sorte, trie par date, liste blanche, total = pastille", async () => {
    const { damien, holder } = await everyKind();
    const res = await call(damien, "GET", "/me/requests");
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(["items", "nextCursor", "total"]);
    const kinds = res.json.items.map((i: { kind: string }) => i.kind).sort();
    expect(kinds).toEqual(
      [
        "contact",
        "crew_invitation",
        "event_invitation",
        "event_invitation",
        "follow",
        "plate_transfer",
        "staff",
      ].sort(),
    );
    expect(res.json.total).toBe(7);
    for (const item of res.json.items) {
      expect(Object.keys(item).sort()).toEqual(["at", "from", "id", "kind", "payload"]);
      expect(["person", "structure"]).toContain(item.from.type);
    }
    // Triées de la plus récente à la plus ancienne.
    const ats = res.json.items.map((i: { at: string }) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);

    const by = (kind: string) => res.json.items.filter((i: { kind: string }) => i.kind === kind);
    expect(by("follow")[0].from).toMatchObject({ type: "person", pseudo: "Kenji_66" });
    expect(by("contact")[0].payload).toMatchObject({ message: "Salut, belle voiture !" });
    expect(by("crew_invitation")[0].payload.crew).toMatchObject({ slug: "les-pistons", name: "Les Pistons" });
    expect(by("crew_invitation")[0].from).toMatchObject({ pseudo: "Lea_66" });
    const orgs = by("event_invitation").find((i: { payload: { source: string } }) => i.payload.source === "organizer");
    expect(orgs.from.type).toBe("structure");
    expect(orgs.payload.event.title).toBe("Nocturne de Canet");
    const peer = by("event_invitation").find((i: { payload: { source: string } }) => i.payload.source === "peer");
    expect(peer.payload.inviters).toEqual([{ pseudo: "Marc_66", avatarUrl: null }]);
    expect(peer.payload.notes).toEqual([{ pseudo: "Marc_66", note: "Viens !" }]);
    expect(by("staff")[0].from.type).toBe("structure");
    expect(by("plate_transfer")[0].from).toMatchObject({ pseudo: "Nina_66" });

    // Jamais la plaque, ni d'e-mail.
    expect(res.text).not.toContain(holder.plate as string);
    expect(res.text).not.toContain(holder.plateNormalized as string);
    expect(res.text).not.toContain("@orasso.test");

    const summary = (await call(damien, "GET", "/me/inbox/summary")).json;
    expect(summary.pendingRequests).toBe(7);
    expect((await call(damien, "GET", "/me")).json.counts.pendingRequests).toBe(7);
  });

  it("une demande d'un compte suspendu, banni ou supprimé n'apparaît ni dans la liste ni dans la pastille", async () => {
    const { damien, k } = await everyKind();
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, k("Kenji_66").id));
    await db
      .update(profiles)
      .set({ deletedAt: new Date() })
      .where(eq(profiles.userId, k("Julie_66").id));
    await db
      .update(profiles)
      .set({ bannedAt: new Date() })
      .where(eq(profiles.userId, k("Nina_66").id));
    const res = await call(damien, "GET", "/me/requests");
    const kinds = res.json.items.map((i: { kind: string }) => i.kind);
    expect(kinds).not.toContain("follow");
    expect(kinds).not.toContain("contact");
    expect(kinds).not.toContain("plate_transfer");
    expect(res.json.total).toBe(4);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(4);
  });

  it("une invitation coupée ou d'un événement où je vais déjà n'apparaît pas", async () => {
    const { damien, k, peerEvent } = await everyKind();
    const v = await createVehicle(damien.id, ref);
    await db.insert(applications).values({
      eventId: peerEvent.id,
      userId: damien.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
    const kinds = (await call(damien, "GET", "/me/requests")).json.items;
    expect(kinds.filter((i: { payload: { source?: string } }) => i.payload.source === "peer")).toHaveLength(0);
    expect(k("Marc_66").pseudo).toBe("Marc_66");
  });

  it("chacun ne voit que les siennes ; une demande traitée disparaît", async () => {
    const { damien, k } = await everyKind();
    const lea = k("Lea_66");
    expect((await call(lea, "GET", "/me/requests")).json).toEqual({ total: 0, items: [], nextCursor: null });
    expect((await call(lea, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(0);
    const follow = (await call(damien, "GET", "/me/requests")).json.items.find(
      (i: { kind: string }) => i.kind === "follow",
    );
    expect((await call(damien, "POST", `/me/follow-requests/${follow.id}/accept`)).status).toBe(200);
    const after = await call(damien, "GET", "/me/requests");
    expect(after.json.total).toBe(6);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(6);
  });

  it("la demande d'un chef de crew (je suis chef) : variante join_request, avec son mot", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    const [crew] = await db
      .insert(crews)
      .values({ slug: "les-turbos", name: "Les Turbos", department: "66", createdBy: damien.id })
      .returning();
    await db.insert(crewMembers).values([
      { crewId: crew!.id, userId: damien.id, role: "leader", status: "active" },
      { crewId: crew!.id, userId: kenji.id, role: "member", status: "requested", message: "Je peux rejoindre ?" },
    ]);
    const res = await call(damien, "GET", "/me/requests");
    expect(res.json.items).toHaveLength(1);
    expect(res.json.items[0]).toMatchObject({
      kind: "crew",
      id: crew!.id,
      from: { type: "person", pseudo: "Kenji_66" },
      payload: { variant: "join_request", message: "Je peux rejoindre ?", requesterId: kenji.id },
    });
    expect(res.json.total).toBe(1);
    expect((await call(damien, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(1);
  });
});

describe("pastilles de la Boîte (inbox/summary et /me)", () => {
  it("garde les anciens champs et ajoute les trois pastilles", async () => {
    const damien = await signUp("Damien_66");
    const res = await call(damien, "GET", "/me/inbox/summary");
    expect(res.json).toEqual({
      unreadMessages: 0,
      requests: expect.objectContaining({ follow: 0, contact: 0, crew: 0 }),
      unseenActivity: 0,
      pendingRequests: 0,
    });
    const me = (await call(damien, "GET", "/me")).json;
    expect(me.counts).toMatchObject({
      vehicles: 0,
      upcomingApplications: 0,
      unreadNotifications: 0,
      unreadMessages: 0,
      unseenActivity: 0,
      pendingRequests: 0,
    });
    expect(me.unreadInbox).toBe(0);
  });

  it("une demande de contact compte dans l'ancienne pastille de la Boîte et dans les nouvelles", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await db.insert(contactRequests).values({ fromUserId: kenji.id, toUserId: damien.id, message: "Salut" });
    await send(damien.id, "points_awarded");
    const me = (await call(damien, "GET", "/me")).json;
    expect(me.unreadInbox).toBe(1);
    expect(me.counts).toMatchObject({ pendingRequests: 1, unseenActivity: 1, unreadMessages: 0 });
  });
});

describe("GET /me/conversations : sorte et vignette de story", () => {
  it("kind direct puis organizer, storyThumbUrl toujours nul, story_reply jamais servi", async () => {
    const damien = await signUp("Damien_66");
    const kenji = await signUp("Kenji_66");
    await db.insert(userFollows).values({ followerId: damien.id, followedId: kenji.id, status: "accepted" });
    const open = await call(kenji, "POST", "/conversations/direct", { userId: damien.id });
    expect([200, 201]).toContain(open.status);
    const sent = await call(kenji, "POST", `/conversations/${open.json.id}/messages`, {
      clientId: crypto.randomUUID(),
      body: "Salut",
    });
    expect(sent.status).toBe(201);
    const list = (await call(damien, "GET", "/me/conversations")).json;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ kind: "direct", storyThumbUrl: null });

    // Conversation avec un organisateur : écrite par Damien, vue de Damien.
    const orga = await signUp("Orga_66");
    const s = await createStructure(orga.id);
    const toOrga = await call(damien, "POST", `/structures/${s.id}/conversation`);
    expect([200, 201]).toContain(toOrga.status);
    const hello = await call(damien, "POST", `/conversations/${toOrga.json.id}/messages`, {
      clientId: crypto.randomUUID(),
      body: "Bonjour",
    });
    expect(hello.status).toBe(201);
    const items = (await call(damien, "GET", "/me/conversations")).json.items;
    expect(items).toHaveLength(2);
    expect(items.find((i: { id: string }) => i.id === toOrga.json.id)).toMatchObject({
      kind: "organizer",
      storyThumbUrl: null,
    });
    expect(items.some((i: { kind: string }) => i.kind === "story_reply")).toBe(false);
  });
});

describe("heures calmes : horaire modifié et notifications R7", () => {
  const night = () => fromWallTime({ year: 2026, month: 11, day: 9, hour: 23, minute: 30 });
  const morning = fromWallTime({ year: 2026, month: 11, day: 10, hour: 8, minute: 0 });

  it("horaire modifié d'un événement demain : part malgré les heures calmes ; dans trois jours : à 8 h", async () => {
    const damien = await signUp("Damien_66");
    clock.set(night());
    const tomorrow = new Date(fromWallTime({ year: 2026, month: 11, day: 10, hour: 14, minute: 0 }));
    const later = new Date(fromWallTime({ year: 2026, month: 11, day: 12, hour: 14, minute: 0 }));
    const soon = await send(damien.id, "schedule_change", { eventStartsAt: tomorrow });
    expect(soon.deliverAfter).toEqual(night());
    expect(soon.deliveredAt).not.toBeNull();
    const far = await send(damien.id, "schedule_change", { eventStartsAt: later });
    expect(far.deliverAfter).toEqual(morning);
    const [stored] = await db.select().from(notifications).where(eq(notifications.id, far.id));
    expect(stored?.deliveredAt).toBeNull();
  });

  it("un type sans règle propre suit les heures calmes même pour un événement demain", async () => {
    const damien = await signUp("Damien_66");
    clock.set(night());
    const tomorrow = new Date(fromWallTime({ year: 2026, month: 11, day: 10, hour: 14, minute: 0 }));
    const row = await send(damien.id, "vote_opened", { eventStartsAt: tomorrow });
    expect(row.deliverAfter).toEqual(morning);
  });

  it("rendez-vous au spot dans moins de 2 heures : part la nuit ; plus loin : attend", async () => {
    const damien = await signUp("Damien_66");
    clock.set(night());
    const soon = await send(damien.id, "spot_meetup_new", { eventStartsAt: new Date(clock.now.getTime() + HOUR) });
    expect(soon.deliverAfter).toEqual(night());
    const late = await send(damien.id, "spot_meetup_new", { eventStartsAt: new Date(clock.now.getTime() + 5 * HOUR) });
    expect(late.deliverAfter).toEqual(morning);
  });

  it("les types « Journal seul » sont livrés tout de suite, sans push", async () => {
    const damien = await signUp("Damien_66");
    clock.set(night());
    const row = await send(damien.id, "story_like", { groupKey: "story_like:s1" });
    expect(row.deliverAfter).toEqual(night());
    expect(row.groupKey).toBe("story_like:s1");
  });
});

describe("migration", () => {
  it("les colonnes existent : group_key (indexée avec user_id) et activity_seen_at, nulles par défaut", async () => {
    const cols = await db.execute(sql`
      select table_name, column_name, is_nullable from information_schema.columns
      where (table_name = 'notifications' and column_name = 'group_key')
         or (table_name = 'profiles' and column_name = 'activity_seen_at')
      order by table_name`);
    expect(cols.rows).toEqual([
      { table_name: "notifications", column_name: "group_key", is_nullable: "YES" },
      { table_name: "profiles", column_name: "activity_seen_at", is_nullable: "YES" },
    ]);
    const idx = await db.execute(sql`select indexdef from pg_indexes where indexname = 'notifications_user_group_idx'`);
    expect(String((idx.rows[0] as { indexdef: string }).indexdef)).toContain("(user_id, group_key)");
  });
});
