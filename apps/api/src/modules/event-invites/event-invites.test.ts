// Lot R6c (maquettes R6.3 à R6.7) : « Qui y va » pour chaque regard, inviter du monde (droits, événement sur invitation,
// doublon, 30 par jour, invité qui a coupé), notification regroupée et garde de livraison, bandeau de l'invité,
// invitation d'un membre dans un crew (le chef confirme), export RGPD et suppression du compte.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  crewMembers,
  eventPeerInvitations,
  events,
  invitationMutes,
  notifications,
  profiles,
  userFollows,
} from "../../db/schema";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date());
  ref = await seedReference();
});

async function person(pseudo: string, visibility: "public" | "private" = "public") {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ visibility }).where(eq(profiles.userId, u.id));
  return u;
}

async function follow(a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") {
  await db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status, acceptedAt: status === "accepted" ? new Date() : null });
}

async function apply(u: TestUser, eventId: string, status: typeof applications.$inferInsert.status = "accepted") {
  const v = await createVehicle(u.id, ref);
  await db.insert(applications).values({
    eventId,
    userId: u.id,
    vehicleId: v.id,
    status,
    rulesAcceptedAt: new Date(),
    followStructure: false,
    decidedAt: status === "pending" ? null : new Date(),
  });
}

async function newEvent(overrides: Partial<typeof events.$inferInsert> = {}) {
  const orga = await signUp(`Orga_${Math.random().toString(36).slice(2, 8)}`);
  const s = await createStructure(orga.id);
  return createEvent(s.id, { title: "Nocturne de Canet", ...overrides });
}

const invitedOf = (userId: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, "event_invited")));

async function newCrew(leader: TestUser, members: TestUser[]) {
  const res = await call(leader, "POST", "/crews", {
    name: `Crew ${Math.random().toString(36).slice(2, 8)}`,
    department: "66",
  });
  expect(res.status).toBe(201);
  const crew = res.json as { id: string; slug: string };
  for (const m of members) {
    expect((await call(m, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await call(leader, "POST", `/crews/${crew.id}/requests/${m.id}/accept`)).status).toBe(204);
  }
  return crew;
}

describe("Qui y va", () => {
  it("les personnes que je suis qui y vont : retenues, en cours, billet ; jamais un refusé, un retiré, ni un compte privé non accepté", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const nina = await person("Nina_34");
    const marc = await person("Marc_66", "private");
    const sarah = await person("Sarah_66", "private");
    const theo = await person("Theo_66");
    const lea = await person("Lea_11");
    const paul = await person("Paul_66");
    await follow(kenji, julie);
    await follow(kenji, nina);
    await follow(kenji, marc);
    await follow(kenji, sarah, "pending");
    await follow(kenji, lea);
    await follow(kenji, paul);
    await apply(julie, e.id, "accepted");
    await apply(nina, e.id, "pending");
    await apply(marc, e.id, "waitlisted");
    await apply(sarah, e.id, "accepted");
    await apply(theo, e.id, "accepted");
    await apply(lea, e.id, "refused");
    await apply(paul, e.id, "withdrawn");

    const res = await call(kenji, "GET", `/events/${e.id}/following-going`);
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(3);
    expect(res.json.people).toHaveLength(3);
    // Liste blanche : pseudo et avatar, jamais d'identifiant de compte.
    for (const p of res.json.people) expect(Object.keys(p).sort()).toEqual(["avatarUrl", "pseudo"]);
    expect(res.json.people.map((p: { pseudo: string }) => p.pseudo).sort()).toEqual(["Julie_66", "Marc_66", "Nina_34"]);

    // Regard de Théo (ne suit personne) : personne.
    expect((await call(theo, "GET", `/events/${e.id}/following-going`)).json).toEqual({ people: [], total: 0 });
    // Visiteur sans compte : rien.
    expect((await call(null, "GET", `/events/${e.id}/following-going`)).status).toBe(401);
    // Compte suspendu : il sort de la liste.
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, julie.id));
    expect((await call(kenji, "GET", `/events/${e.id}/following-going`)).json.total).toBe(2);
    // Après la fin : plus rien (les absents ne se déduisent pas).
    clock.set(new Date(e.endsAt.getTime() + 60_000));
    expect((await call(kenji, "GET", `/events/${e.id}/following-going`)).json).toEqual({ people: [], total: 0 });
  });

  it("un événement sur invitation de l'organisateur ne montre personne à qui ne le voit pas", async () => {
    const e = await newEvent({ admission: "invite_only" });
    const kenji = await person("Kenji_66");
    expect((await call(kenji, "GET", `/events/${e.id}/following-going`)).status).toBe(403);
  });
});

describe("inviter du monde", () => {
  it("abonnés, abonnements et membres de mes crews ; hors réseau refusé, sans rien écrire", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const lea = await person("Lea_11");
    const theo = await person("Theo_66");
    const paul = await person("Paul_66");
    await follow(kenji, julie);
    await follow(lea, kenji);
    await newCrew(kenji, [theo]);

    const out = await call(kenji, "POST", `/events/${e.id}/peer-invitations`, {
      userIds: [julie.id, paul.id],
      note: "Viens !",
    });
    expect(out.status).toBe(403);
    expect(await db.select().from(eventPeerInvitations)).toHaveLength(0);

    const ok = await call(kenji, "POST", `/events/${e.id}/peer-invitations`, {
      userIds: [julie.id, lea.id, theo.id],
      note: "  On y va avec le crew, viens !  ",
    });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ invited: 3, alreadyInvited: [], going: [], remainingToday: 27 });
    const rows = await db.select().from(eventPeerInvitations);
    expect(rows.map((r) => r.note)).toEqual(Array(3).fill("On y va avec le crew, viens !"));
    await notificationsService.flush();
    const [n] = await invitedOf(julie.id);
    expect(n?.title).toBe("Kenji_66 t'invite à Nocturne de Canet");
    expect(n?.body).toContain("« On y va avec le crew, viens ! »");
    expect(n?.data).toMatchObject({ link: `/e/${e.slug}`, actorIds: [kenji.id] });

    // Soi-même : refusé.
    expect((await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [kenji.id] })).status).toBe(400);
    // Compte inconnu : comme hors réseau.
    expect((await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: ["inconnu"] })).status).toBe(403);
  });

  it("événement sur invitation, passé, annulé ou brouillon : refusé", async () => {
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    await follow(kenji, julie);
    const invite = async (overrides: Partial<typeof events.$inferInsert>) => {
      const e = await newEvent(overrides);
      return (await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] })).status;
    };
    expect(await invite({ admission: "invite_only" })).toBe(403);
    expect(await invite({ status: "cancelled" })).toBe(409);
    expect(await invite({ status: "draft" })).toBe(409);
    const past = new Date(Date.now() - 3 * 86_400_000);
    expect(await invite({ startsAt: past, endsAt: new Date(past.getTime() + 3_600_000) })).toBe(409);
    expect(await db.select().from(eventPeerInvitations)).toHaveLength(0);
  });

  it("doublon ignoré et dit ; « y va déjà » dit seulement quand je peux le savoir", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const nina = await person("Nina_34", "private");
    const marc = await person("Marc_66");
    await follow(kenji, julie);
    await follow(nina, kenji); // Nina me suit, compte privé : sa sortie ne m'est pas montrée.
    await follow(marc, kenji); // Marc me suit, compte public : sa sortie retenue est sur son profil.
    await apply(nina, e.id, "accepted");
    await apply(marc, e.id, "accepted");
    expect((await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] })).json.invited).toBe(
      1,
    );
    const again = await call(kenji, "POST", `/events/${e.id}/peer-invitations`, {
      userIds: [julie.id, nina.id, marc.id],
    });
    expect(again.json).toEqual({ invited: 1, alreadyInvited: [julie.id], going: [marc.id], remainingToday: 28 });
    await notificationsService.flush();
    // Nina y va : la réponse ne le dit pas, mais rien ne lui est envoyé.
    expect(await invitedOf(nina.id)).toHaveLength(0);
    expect(await invitedOf(julie.id)).toHaveLength(1);

    const list = await call(kenji, "GET", `/events/${e.id}/peer-invitations/candidates`);
    const states = Object.fromEntries(
      list.json.people.map((p: { pseudo: string; state: string; caption: string }) => [p.pseudo, [p.state, p.caption]]),
    );
    expect(states).toEqual({
      Julie_66: ["invited", "déjà invité(e) par toi"],
      Marc_66: ["going", "y va déjà · te suit"],
      Nina_34: ["invited", "déjà invité(e) par toi"],
    });
    for (const p of list.json.people) {
      expect(Object.keys(p).sort()).toEqual(["avatarUrl", "caption", "crewIds", "pseudo", "state", "userId"]);
    }
  });

  it("30 invitations par 24 heures et par compte", async () => {
    const kenji = await person("Kenji_66");
    const friends = await Promise.all([1, 2, 3].map((i) => person(`Ami_${i}`)));
    for (const f of friends) await follow(kenji, f);
    const evs = await Promise.all(Array.from({ length: 11 }, () => newEvent()));
    // 30 invitations déjà parties aujourd'hui (10 événements × 3 personnes).
    await db
      .insert(eventPeerInvitations)
      .values(
        evs.slice(0, 10).flatMap((e) => friends.map((f) => ({ eventId: e.id, inviterId: kenji.id, inviteeId: f.id }))),
      );
    const last = evs[10]!;
    const over = await call(kenji, "POST", `/events/${last.id}/peer-invitations`, { userIds: [friends[0]!.id] });
    expect(over.status).toBe(429);
    expect(over.json.error.details).toEqual({ remaining: 0 });
    // Au-delà de 24 h, elles ne comptent plus.
    await db.execute(sql`update event_peer_invitations set created_at = created_at - interval '25 hours'`);
    const ok = await call(kenji, "POST", `/events/${last.id}/peer-invitations`, { userIds: [friends[0]!.id] });
    expect(ok.status).toBe(200);
    expect(ok.json.remainingToday).toBe(29);
  });

  it("une personne qui a coupé mes invitations : réponse identique, rien d'envoyé, pas de bandeau", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const nina = await person("Nina_34");
    await follow(kenji, julie);
    await follow(kenji, nina);
    expect((await call(julie, "POST", "/me/invitation-mutes", { userId: kenji.id })).status).toBe(200);
    expect((await call(julie, "GET", "/me/invitation-mutes")).json).toEqual([
      { userId: kenji.id, pseudo: "Kenji_66", avatarUrl: null },
    ]);
    const toJulie = await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] });
    const toNina = await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [nina.id] });
    expect(toJulie.status).toBe(toNina.status);
    expect({ ...toJulie.json, remainingToday: 0 }).toEqual({ ...toNina.json, remainingToday: 0 });
    await notificationsService.flush();
    expect(await invitedOf(julie.id)).toHaveLength(0);
    expect(await invitedOf(nina.id)).toHaveLength(1);
    expect((await call(julie, "GET", `/events/${e.id}/peer-invitations/received`)).json).toBeNull();
    // Rétablir : la prochaine invitation (d'un autre événement) arrive.
    expect((await call(julie, "DELETE", `/me/invitation-mutes/${kenji.id}`)).status).toBe(200);
    const e2 = await newEvent();
    await call(kenji, "POST", `/events/${e2.id}/peer-invitations`, { userIds: [julie.id] });
    await notificationsService.flush();
    expect(await invitedOf(julie.id)).toHaveLength(1);
  });

  it("notification regroupée par événement, bandeau « Kenji_66 et Theo_66 t'invitent »", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const theo = await person("Theo_66");
    const julie = await person("Julie_66");
    await follow(kenji, julie);
    await follow(julie, theo);
    await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id], note: "Viens avec ta R1" });
    clock.advance(60_000);
    await call(theo, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] });
    await notificationsService.flush();
    const rows = await invitedOf(julie.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Theo_66 et Kenji_66 t'invitent à Nocturne de Canet");
    const banner = await call(julie, "GET", `/events/${e.id}/peer-invitations/received`);
    expect(banner.json.inviters.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Theo_66", "Kenji_66"]);
    expect(banner.json.note).toBe("Viens avec ta R1");
    // Un autre ne voit pas les invitations de Julie.
    expect((await call(kenji, "GET", `/events/${e.id}/peer-invitations/received`)).json).toBeNull();
  });

  it("garde de livraison : événement annulé, invité déjà inscrit, auteur coupé entre-temps", async () => {
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    await follow(kenji, julie);
    const deferred = async () => {
      const e = await newEvent();
      await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] });
      await notificationsService.flush();
      // Comme différée par les heures calmes : pas encore livrée.
      await db
        .update(notifications)
        .set({ deliveredAt: null })
        .where(and(eq(notifications.userId, julie.id), eq(notifications.eventId, e.id)));
      return e;
    };
    const cancelled = await deferred();
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, cancelled.id));
    const applied = await deferred();
    await apply(julie, applied.id, "pending");
    const muted = await deferred();
    await db.insert(invitationMutes).values({ userId: julie.id, mutedUserId: kenji.id });
    await notificationsService.deliverDue();
    for (const e of [cancelled, applied, muted]) {
      const left = await db.select().from(notifications).where(eq(notifications.eventId, e.id));
      expect(left).toHaveLength(0);
    }
    // Rien de changé : elle part.
    await db.delete(invitationMutes);
    const fine = await deferred();
    await notificationsService.deliverDue();
    const [kept] = await db.select().from(notifications).where(eq(notifications.eventId, fine.id));
    expect(kept?.deliveredAt).not.toBeNull();
  });

  it("liste : mes crews en tête, « Tout <crew> » coche ses membres, recherche par début de pseudo", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const lea = await person("Lea_11");
    const theo = await person("Theo_66");
    const nina = await person("Nina_34");
    const marc = await person("Marc_66");
    await follow(marc, kenji);
    const crew = await newCrew(kenji, [lea, theo, nina]);
    await apply(nina, e.id, "accepted"); // public : sa sortie retenue se voit.
    const list = await call(kenji, "GET", `/events/${e.id}/peer-invitations/candidates`);
    expect(list.json.crews).toEqual([
      expect.objectContaining({ id: crew.id, membersCount: 4, going: 1, invitable: expect.any(Array) }),
    ]);
    expect([...list.json.crews[0].invitable].sort()).toEqual([lea.id, theo.id].sort());
    expect(list.json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual([
      "Lea_11",
      "Nina_34",
      "Theo_66",
      "Marc_66",
    ]);
    expect(list.json.people[0]).toMatchObject({ caption: "ton crew", crewIds: [crew.id] });
    expect(list.json.remainingToday).toBe(30);
    const found = await call(kenji, "GET", `/events/${e.id}/peer-invitations/candidates?q=ma`);
    expect(found.json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Marc_66"]);
    expect(found.json.crews).toEqual([]);
    // Un événement qui ne se partage pas : la liste le dit.
    const priv = await newEvent({ admission: "invite_only" });
    expect((await call(kenji, "GET", `/events/${priv.id}/peer-invitations/candidates`)).status).toBe(403);
  });
});

describe("inviter dans un crew (R6.7)", () => {
  it("un membre invite une personne de son réseau ; elle accepte ; le chef confirme", async () => {
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const marc = await person("Marc_66");
    const paul = await person("Paul_66");
    const crew = await newCrew(kenji, [julie]);
    await follow(marc, julie);
    // Hors réseau : refusé.
    expect((await call(julie, "POST", `/crews/${crew.id}/invitations`, { pseudo: paul.pseudo })).status).toBe(403);
    // La feuille : son réseau, avec l'état dans le crew.
    const cands = await call(julie, "GET", `/crews/${crew.id}/invite-candidates`);
    expect(cands.json.people).toEqual([
      { userId: marc.id, pseudo: "Marc_66", avatarUrl: null, caption: "te suit", state: "available" },
    ]);
    const sent = await call(julie, "POST", `/crews/${crew.id}/invitations`, { pseudo: marc.pseudo });
    expect(sent.status).toBe(201);
    expect(sent.json).toEqual({ pseudo: "Marc_66", status: "invited" });
    // Pas de doublon.
    expect((await call(julie, "POST", `/crews/${crew.id}/invitations`, { pseudo: marc.pseudo })).status).toBe(409);
    const inbox = await call(marc, "GET", "/me/crew-requests");
    expect(inbox.json[0]).toMatchObject({ kind: "invitation", person: { pseudo: "Julie_66" }, leaderConfirms: true });
    // Marc accepte : il attend le chef.
    const accepted = await call(marc, "POST", `/me/crew-invitations/${crew.id}/accept`);
    expect(accepted.json.viewerState).toBe("requested");
    const [row] = await db.select().from(crewMembers).where(eq(crewMembers.userId, marc.id));
    expect(row).toMatchObject({ status: "requested", invitedBy: julie.id });
    expect(row?.inviteAcceptedAt).not.toBeNull();
    const pending = await call(kenji, "GET", `/crews/${crew.id}/requests`);
    expect(pending.json.requests).toEqual([expect.objectContaining({ invitedBy: "Julie_66" })]);
    const leaderInbox = await call(kenji, "GET", "/me/crew-requests");
    expect(leaderInbox.json[0]).toMatchObject({ kind: "request", invitedBy: "Julie_66" });
    await notificationsService.flush();
    const [toLeader] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, kenji.id),
          eq(notifications.type, "crew_request"),
          eq(notifications.title, "Arrivée à confirmer"),
        ),
      );
    expect(toLeader?.body).toMatch(/^Marc_66 a accepté l'invitation de Julie_66 dans « .+ » : confirme son arrivée\.$/);
    // Le chef confirme : Marc entre.
    expect((await call(kenji, "POST", `/crews/${crew.id}/requests/${marc.id}/accept`)).status).toBe(204);
    expect((await call(marc, "GET", `/crews/${crew.id}`)).json.viewerState).toBe("member");
  });

  it("refus du chef silencieux ; invitation du chef : entrée directe ; personne qui a coupé : même réponse", async () => {
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    const marc = await person("Marc_66");
    const theo = await person("Theo_66");
    const sarah = await person("Sarah_66");
    const crew = await newCrew(kenji, [julie]);
    await follow(marc, julie);
    await follow(julie, sarah);
    await call(julie, "POST", `/crews/${crew.id}/invitations`, { pseudo: marc.pseudo });
    await call(marc, "POST", `/me/crew-invitations/${crew.id}/accept`);
    expect((await call(kenji, "POST", `/crews/${crew.id}/requests/${marc.id}/decline`)).status).toBe(204);
    // Pour Marc, sa démarche reste « envoyée » (refus silencieux, 30 jours).
    expect((await call(marc, "GET", `/crews/${crew.id}`)).json.viewerState).toBe("requested");

    // Le chef invite : Théo accepte et entre tout de suite.
    expect((await call(kenji, "POST", `/crews/${crew.id}/invitations`, { pseudo: theo.pseudo })).status).toBe(201);
    expect((await call(theo, "POST", `/me/crew-invitations/${crew.id}/accept`)).json.viewerState).toBe("member");

    // Sarah a coupé les invitations de Julie : même réponse, rien d'écrit.
    await call(sarah, "POST", "/me/invitation-mutes", { userId: julie.id });
    const muted = await call(julie, "POST", `/crews/${crew.id}/invitations`, { pseudo: sarah.pseudo });
    expect(muted.status).toBe(201);
    expect(muted.json).toEqual({ pseudo: "Sarah_66", status: "invited" });
    expect(await db.select().from(crewMembers).where(eq(crewMembers.userId, sarah.id))).toHaveLength(0);
  });
});

describe("export et suppression du compte", () => {
  it("l'export dit les invitations envoyées (avec mon mot), reçues (sans le mot d'un autre) et les personnes coupées", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const julie = await person("Julie_66");
    await follow(kenji, julie);
    await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id], note: "Viens !" });
    await call(julie, "POST", "/me/invitation-mutes", { userId: kenji.id });
    const mine = (await call(kenji, "GET", "/me/export")).json.eventInvitations;
    expect(mine.sent).toEqual([
      { event: "Nocturne de Canet", to: "Julie_66", note: "Viens !", at: expect.any(String) },
    ]);
    const hers = (await call(julie, "GET", "/me/export")).json.eventInvitations;
    expect(hers.received).toEqual([{ event: "Nocturne de Canet", from: "Kenji_66", at: expect.any(String) }]);
    expect(hers.mutedInviters).toEqual([{ pseudo: "Kenji_66", since: expect.any(String) }]);
  });

  it("compte supprimé : ses invitations, ses coupures et les notifications qui le citent disparaissent", async () => {
    const e = await newEvent();
    const kenji = await person("Kenji_66");
    const theo = await person("Theo_66");
    const julie = await person("Julie_66");
    await follow(kenji, julie);
    await follow(theo, julie);
    await call(theo, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] });
    await call(kenji, "POST", `/events/${e.id}/peer-invitations`, { userIds: [julie.id] });
    await call(julie, "POST", "/me/invitation-mutes", { userId: theo.id });
    await call(kenji, "POST", "/me/invitation-mutes", { userId: julie.id });
    await notificationsService.flush();
    await accountService.anonymize(kenji.id, null);
    const left = await db.select().from(eventPeerInvitations);
    expect(left.map((r) => r.inviterId)).toEqual([theo.id]);
    expect(await db.select().from(invitationMutes)).toEqual([expect.objectContaining({ userId: julie.id })]);
    // La notification regroupée qui le citait disparaît.
    expect(await invitedOf(julie.id)).toHaveLength(0);
  });
});
