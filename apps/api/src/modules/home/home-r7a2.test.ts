// Lot R7a2 : les blocs de l'Accueil « tableau de bord » (maquette R7.4, D38) : Mes sorties, Mon crew, Du nouveau chez tes
// potes (et les deux réservés, Au spot et Souvenirs, vides jusqu'à R7i et R7j). Pour chaque bloc : sa donnée, son regard, et
// la règle « un bloc masqué n'est pas calculé ». L'Accueil est un tableau de bord, jamais un fil : trois nouveautés au plus.
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  conversationParticipants,
  conversations,
  crewMembers,
  crewOutingReplies,
  crewOutings,
  crewPostComments,
  crewPostPhotos,
  crewPosts,
  crews,
  events,
  messages,
  profiles,
  storyMutes,
  userFollows,
  vehicles,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { notificationsService } from "../notifications/service";
import { ticketsService } from "../tickets/service";
import { friendsNewsWidget } from "./widgets/friends_news";
import { myCrewWidget } from "./widgets/my_crew";
import { myOutingsWidget } from "./widgets/my_outings";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-10T10:00:00Z");

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(NOW);
  ref = await seedReference();
});

async function user(pseudo: string) {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

async function home(u: TestUser, query = "") {
  const res = await app.request(`/api/me/home${query}`, { headers: { origin: ORIGIN, cookie: u.cookie } });
  // biome-ignore lint/suspicious/noExplicitAny: réponse JSON lue librement dans les tests
  return { status: res.status, json: (await res.json()) as any };
}
async function setWidgets(u: TestUser, config: { order: string[]; hidden: string[] }) {
  const res = await call(u, "PUT", "/me/home/widgets", config);
  expect(res.status).toBe(200);
}
async function viewerOf(u: TestUser) {
  const { viewerOf: v } = await import("../../../test/helpers");
  return v(u);
}

// --- Mes sorties --------------------------------------------------------------------------------------------------------

describe("Mes sorties", () => {
  async function world() {
    const orga = await signUp("Orga_Sorties");
    const s = await createStructure(orga.id);
    const u = await user("Fan_Sorties");
    const veh = await createVehicle(u.id, ref);
    const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * DAY + hours * HOUR);
    const base = { userId: u.id, vehicleId: veh.id, rulesAcceptedAt: NOW, followStructure: false };
    return { s, u, base, at };
  }

  it("mes 3 prochaines places, la plus proche d'abord, avec leur nombre total ; un événement en cours compte", async () => {
    const { s, u, base, at } = await world();
    const lydia = await createEvent(s.id, { title: "En cours", startsAt: at(-1), endsAt: at(2) });
    const near = await createEvent(s.id, { title: "Proche", startsAt: at(4) });
    const mid = await createEvent(s.id, { title: "Milieu", startsAt: at(9) });
    const far = await createEvent(s.id, { title: "Lointain", startsAt: at(20) });
    await db.insert(applications).values([
      { ...base, eventId: far.id, status: "pending" },
      { ...base, eventId: lydia.id, status: "accepted" },
      { ...base, eventId: mid.id, status: "waitlisted" },
      { ...base, eventId: near.id, status: "accepted" },
    ]);
    const r = await home(u);
    expect(r.status).toBe(200);
    expect(r.json.myOutings.total).toBe(4);
    expect(r.json.myOutings.items.map((i: { title: string }) => i.title)).toEqual(["En cours", "Proche", "Milieu"]);
    expect(r.json.myOutings.items[0]).toMatchObject({ kind: "application", status: "accepted", ongoing: true });
    expect(r.json.myOutings.items[1]).toMatchObject({ status: "accepted", ongoing: false });
    expect(r.json.myOutings.items[2].status).toBe("waitlisted");
  });

  it("ni refusée, ni annulée, ni un événement fini ou annulé", async () => {
    const { s, u, base, at } = await world();
    const refused = await createEvent(s.id, { title: "Refusée", startsAt: at(3) });
    const cancelled = await createEvent(s.id, { title: "Annulée", startsAt: at(4) });
    const over = await createEvent(s.id, { title: "Finie", startsAt: at(-3), endsAt: at(-2) });
    const called = await createEvent(s.id, { title: "Événement annulé", startsAt: at(5) });
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, called.id));
    await db.insert(applications).values([
      { ...base, eventId: refused.id, status: "refused" },
      { ...base, eventId: cancelled.id, status: "cancelled" },
      { ...base, eventId: over.id, status: "accepted" },
      { ...base, eventId: called.id, status: "accepted" },
    ]);
    expect((await home(u)).json.myOutings).toBeNull();
  });

  it("un billet compte, sauf si une place retenue donne déjà l'accès au même événement", async () => {
    const { s, u, base, at } = await world();
    const orga = await signUp("Orga_Billets", { twoFactor: true });
    const s2 = await createStructure(orga.id);
    const free = (title: string, days: number) =>
      createEvent(s2.id, { title, publicAccess: "free_reservation", startsAt: at(days) });
    const a = await free("Billet seul", 6);
    const b = await free("Billet et place", 7);
    for (const e of [a, b]) {
      expect((await call(orga, "PUT", `/events/${e.id}/ticketing`, { enabled: true, capacity: 5 })).status).toBe(200);
      expect((await call(u, "POST", `/events/${e.id}/tickets/reserve`, { quantity: 1 })).status).toBe(201);
    }
    await db.insert(applications).values({ ...base, eventId: b.id, status: "accepted" });
    const mine = await createEvent(s.id, { title: "Ma place", startsAt: at(3) });
    await db.insert(applications).values({ ...base, eventId: mine.id, status: "pending" });
    const r = await home(u);
    const items = r.json.myOutings.items as { title: string; kind: string; status: string }[];
    expect(items.map((i) => [i.title, i.kind, i.status])).toEqual([
      ["Ma place", "application", "pending"],
      ["Billet seul", "ticket", "ticket"],
      ["Billet et place", "application", "accepted"],
    ]);
    expect(r.json.myOutings.total).toBe(3);
  });

  it("masqué : le bloc n'est pas calculé (aucune lecture des billets) ; réaffiché : il revient", async () => {
    const { s, u, base, at } = await world();
    const e = await createEvent(s.id, { startsAt: at(3) });
    await db.insert(applications).values({ ...base, eventId: e.id, status: "accepted" });
    const spy = vi.spyOn(ticketsService, "mine");
    await setWidgets(u, { order: [], hidden: ["my_outings"] });
    const hidden = await home(u);
    expect(hidden.json.myOutings).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    await setWidgets(u, { order: [], hidden: [] });
    expect((await home(u)).json.myOutings.total).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("jamais pour les anciens appels (blocks=v2, light) : les blocs réglables ne sont pas calculés", async () => {
    const { s, u, base, at } = await world();
    const e = await createEvent(s.id, { startsAt: at(3) });
    await db.insert(applications).values({ ...base, eventId: e.id, status: "accepted" });
    const spy = vi.spyOn(ticketsService, "mine");
    for (const q of ["?blocks=v2&persona=fan", "?light=1&persona=fan", "?persona=pro"]) {
      const r = await home(u, q);
      expect(r.json.myOutings, q).toBeNull();
      expect(r.json.myCrew, q).toBeNull();
      expect(r.json.friendsNews, q).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("la fonction sans événement ni billet rend null", async () => {
    const { u } = await world();
    expect(await myOutingsWidget(await viewerOf(u), [])).toBeNull();
  });
});

// --- Mon crew -----------------------------------------------------------------------------------------------------------

describe("Mon crew", () => {
  let n = 0;
  async function newCrew(leader: TestUser, name?: string) {
    n++;
    const [row] = await db
      .insert(crews)
      .values({
        slug: `crew-accueil-${n}`,
        name: name ?? `Crew accueil ${n}`,
        department: "66",
        createdBy: leader.id,
        membersCount: 3,
      })
      .returning();
    if (!row) throw new Error("crew");
    await db.insert(crewMembers).values({
      crewId: row.id,
      userId: leader.id,
      role: "leader",
      status: "active",
      joinedAt: new Date(NOW.getTime() - 5 * DAY),
    });
    return row;
  }
  async function join(crewId: string, u: TestUser, status: "active" | "requested" = "active") {
    await db.insert(crewMembers).values({ crewId, userId: u.id, status, joinedAt: new Date(NOW.getTime() - 4 * DAY) });
  }
  async function post(
    crewId: string,
    author: TestUser,
    over: Partial<typeof crewPosts.$inferInsert> = {},
    at = new Date(NOW.getTime() - 2 * HOUR),
  ) {
    const [row] = await db
      .insert(crewPosts)
      .values({ crewId, authorId: author.id, kind: "text", text: "Balade dimanche", createdAt: at, ...over })
      .returning();
    if (!row) throw new Error("post");
    return row;
  }

  it("le dernier message du crew, sa prochaine sortie, ses réponses, sa Discussion et ses non lus", async () => {
    const kenji = await user("Kenji_Crew");
    const lea = await user("Lea_Crew");
    const crew = await newCrew(kenji, "Roussillon Drift");
    await join(crew.id, lea);
    const p = await post(crew.id, kenji, { text: "Balade des Aspres dimanche, départ 9 h" });
    await db.insert(crewPostComments).values([
      { postId: p.id, authorId: lea.id, text: "J'en suis" },
      { postId: p.id, authorId: lea.id, text: "Moi aussi", deletedAt: NOW },
    ]);
    const [outing] = await db
      .insert(crewOutings)
      .values({
        crewId: crew.id,
        authorId: kenji.id,
        title: "Balade des Aspres",
        startsAt: new Date(NOW.getTime() + 5 * DAY),
        place: "Parking de Thuir",
      })
      .returning();
    await db.insert(crewOutingReplies).values([
      { outingId: outing?.id ?? "", userId: kenji.id, answer: "yes" },
      { outingId: outing?.id ?? "", userId: lea.id, answer: "maybe" },
    ]);
    // La Discussion : un message de Kenji, non lu par Léa.
    const [conv] = await db
      .insert(conversations)
      .values({ kind: "crew", crewId: crew.id, directKey: `crew:${crew.id}` })
      .returning();
    if (!conv) throw new Error("conversation");
    await db.insert(conversationParticipants).values([
      { conversationId: conv.id, userId: kenji.id },
      { conversationId: conv.id, userId: lea.id },
    ]);
    await db.insert(messages).values({ conversationId: conv.id, senderId: kenji.id, body: "On part à 9 h" });

    const r = await home(lea);
    expect(r.status).toBe(200);
    expect(r.json.myCrew).toMatchObject({
      crew: { slug: crew.slug, name: "Roussillon Drift", membersCount: 3 },
      unread: 1,
      conversationId: conv.id,
      lastPost: { text: "Balade des Aspres dimanche, départ 9 h", hasPhoto: false, replies: 1 },
      nextOuting: { title: "Balade des Aspres", place: "Parking de Thuir", going: 1 },
    });
    expect(r.json.myCrew.lastPost.author.pseudo).toBe("Kenji_Crew");
    // Kenji n'a pas de message non lu : le sien.
    expect((await home(kenji)).json.myCrew.unread).toBe(0);
  });

  it("une publication de photo sans texte : « photo », jamais l'image ; une sortie annulée ou passée n'est pas la prochaine", async () => {
    const kenji = await user("Kenji_Photo");
    const crew = await newCrew(kenji);
    const p = await post(crew.id, kenji, { kind: "photo", text: null });
    await db
      .insert(crewPostPhotos)
      .values({ postId: p.id, storageKey: `private/crews/${p.id}/0.webp`, width: 4, height: 5, position: 0 });
    await db.insert(crewOutings).values([
      { crewId: crew.id, title: "Passée", startsAt: new Date(NOW.getTime() - DAY), place: "Quelque part" },
      {
        crewId: crew.id,
        title: "Annulée",
        startsAt: new Date(NOW.getTime() + DAY),
        place: "Ailleurs",
        cancelledAt: NOW,
      },
    ]);
    const r = await home(kenji);
    expect(r.json.myCrew.lastPost).toMatchObject({ text: null, hasPhoto: true });
    // Aucune adresse d'image n'est servie par ce bloc.
    expect(JSON.stringify(r.json.myCrew)).not.toContain("private/crews");
    expect(r.json.myCrew.nextOuting).toBeNull();
  });

  it("le crew le plus récemment actif ; une publication supprimée ne compte pas", async () => {
    const kenji = await user("Kenji_Deux");
    const old = await newCrew(kenji, "Vieux crew");
    const fresh = await newCrew(kenji, "Crew du jour");
    await post(old.id, kenji, { text: "Ancien" }, new Date(NOW.getTime() - 3 * DAY));
    await post(fresh.id, kenji, { text: "Récent" }, new Date(NOW.getTime() - HOUR));
    // La publication la plus récente de « Vieux crew » est supprimée : elle ne le fait pas passer devant.
    await post(old.id, kenji, { text: "Supprimée", deletedAt: NOW }, new Date(NOW.getTime() - 10 * 60_000));
    const r = await home(kenji);
    expect(r.json.myCrew.crew.name).toBe("Crew du jour");
    expect(r.json.myCrew.lastPost.text).toBe("Récent");
  });

  it("sans crew actif : rien (demande en attente, crew dissous, autre personne)", async () => {
    const kenji = await user("Kenji_Seul");
    const lea = await user("Lea_Seule");
    const crew = await newCrew(kenji);
    await post(crew.id, kenji);
    await join(crew.id, lea, "requested");
    expect((await home(lea)).json.myCrew).toBeNull();
    await db.update(crews).set({ deletedAt: NOW }).where(eq(crews.id, crew.id));
    expect((await home(kenji)).json.myCrew).toBeNull();
    expect(await myCrewWidget(await viewerOf(lea))).toBeNull();
  });

  it("masqué : le bloc n'est pas calculé", async () => {
    const kenji = await user("Kenji_Masque");
    const crew = await newCrew(kenji);
    await post(crew.id, kenji);
    expect((await home(kenji)).json.myCrew).not.toBeNull();
    await setWidgets(kenji, { order: [], hidden: ["my_crew"] });
    expect((await home(kenji)).json.myCrew).toBeNull();
  });
});

// --- Du nouveau chez tes potes --------------------------------------------------------------------------------------------

describe("Du nouveau chez tes potes", () => {
  async function follow(a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") {
    await db.insert(userFollows).values({
      followerId: a.id,
      followedId: b.id,
      status,
      acceptedAt: status === "accepted" ? NOW : null,
    });
  }
  /** La nouveauté « <ami> va à <événement> » posée dans le Journal de `to`. */
  async function going(to: TestUser, friend: TestUser, eventId: string, title: string) {
    await notificationsService.notify(db, to.id, "friend_going_event", {
      title: `${friend.pseudo} va à ${title}`,
      body: "sam. 21 nov.",
      eventId,
      data: { actor: { userId: friend.id, pseudo: friend.pseudo, avatarUrl: null }, link: "/e/x", subjectId: eventId },
    });
    await notificationsService.deliverDue();
  }
  async function newVehicle(to: TestUser, friend: TestUser, vehicleId: string, label: string) {
    await notificationsService.notify(db, to.id, "friend_new_vehicle", {
      title: `${friend.pseudo} a ajouté ${label}`,
      body: label,
      data: { actor: { userId: friend.id, pseudo: friend.pseudo, avatarUrl: null }, subjectId: vehicleId, vehicleId },
    });
    await notificationsService.deliverDue();
  }

  async function world() {
    const orga = await signUp("Orga_Potes");
    const s = await createStructure(orga.id);
    const me = await user("Moi_Potes");
    const kenji = await user("Kenji_Potes");
    await follow(me, kenji);
    const event = await createEvent(s.id, {
      title: "Rassemblement de Narbonne",
      startsAt: new Date(NOW.getTime() + 11 * DAY),
    });
    return { s, me, kenji, event };
  }

  it("va à / a ajouté un véhicule, le plus récent d'abord, 3 au plus, une ligne par personne et par nouveauté", async () => {
    const { s, me, kenji, event } = await world();
    const lea = await user("Lea_Potes");
    const nina = await user("Nina_Potes");
    await follow(me, lea);
    await follow(me, nina);
    const kv = await createVehicle(kenji.id, ref);
    await going(me, kenji, event.id, "Rassemblement de Narbonne");
    await going(me, kenji, event.id, "Rassemblement de Narbonne");
    await newVehicle(me, lea, (await createVehicle(lea.id, ref)).id, "une Mazda RX-7");
    const e2 = await createEvent(s.id, { title: "Salon", startsAt: new Date(NOW.getTime() + 20 * DAY) });
    await going(me, nina, e2.id, "Salon");
    await newVehicle(me, kenji, kv.id, "une Supra");
    const r = await home(me);
    expect(r.status).toBe(200);
    const items = r.json.friendsNews.items as { kind: string; text: string; target: { type: string } }[];
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(["new_vehicle", "going", "new_vehicle"]);
    expect(items[0]?.text).toBe("Kenji_Potes a ajouté une Supra");
    expect(items[0]?.target.type).toBe("vehicle");
    expect(items[1]?.target).toEqual({ type: "event", slug: e2.slug });
    // « Kenji va à Narbonne » (doublon) a été dédoublonné : au plus une fois.
    expect(items.filter((i) => i.text.includes("Narbonne"))).toHaveLength(0);
  });

  it("regard : un compte que je ne suis pas (ou plus), en attente, privé, suspendu ou supprimé n'apparaît pas", async () => {
    const { me, kenji, event } = await world();
    await going(me, kenji, event.id, "Rassemblement de Narbonne");
    expect((await home(me)).json.friendsNews.items).toHaveLength(1);
    // Je ne le suis plus : la nouveauté tombe, même si elle est dans mon Journal.
    await db.delete(userFollows).where(and(eq(userFollows.followerId, me.id), eq(userFollows.followedId, kenji.id)));
    expect((await home(me)).json.friendsNews).toBeNull();
    // Abonnement seulement demandé (compte privé) : rien.
    await follow(me, kenji, "pending");
    expect((await home(me)).json.friendsNews).toBeNull();
    await db
      .update(userFollows)
      .set({ status: "accepted", acceptedAt: NOW })
      .where(and(eq(userFollows.followerId, me.id), eq(userFollows.followedId, kenji.id)));
    expect((await home(me)).json.friendsNews.items).toHaveLength(1);
    // Compte suspendu, puis supprimé : plus rien.
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + DAY) })
      .where(eq(profiles.userId, kenji.id));
    expect((await home(me)).json.friendsNews).toBeNull();
    await db.update(profiles).set({ suspendedUntil: null, deletedAt: NOW }).where(eq(profiles.userId, kenji.id));
    expect((await home(me)).json.friendsNews).toBeNull();
  });

  it("une nouveauté d'un compte privé n'est vue que de ses abonnés acceptés", async () => {
    const { me, kenji, event } = await world();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    const stranger = await user("Etranger_Potes");
    // Même une notification égarée dans le Journal d'un non-abonné ne ressort pas.
    await going(stranger, kenji, event.id, "Rassemblement de Narbonne");
    expect((await home(stranger)).json.friendsNews).toBeNull();
    await going(me, kenji, event.id, "Rassemblement de Narbonne");
    expect((await home(me)).json.friendsNews.items).toHaveLength(1);
  });

  it("un événement fini, annulé ou sur invitation, un véhicule vendu : plus une nouveauté", async () => {
    const { s, me, kenji } = await world();
    const over = await createEvent(s.id, {
      title: "Fini",
      startsAt: new Date(NOW.getTime() - 3 * DAY),
      endsAt: new Date(NOW.getTime() - 2 * DAY),
    });
    const priv = await createEvent(s.id, {
      title: "Privé",
      admission: "invite_only",
      startsAt: new Date(NOW.getTime() + 3 * DAY),
    });
    const veh = await createVehicle(kenji.id, ref);
    await going(me, kenji, over.id, "Fini");
    await going(me, kenji, priv.id, "Privé");
    await newVehicle(me, kenji, veh.id, "une Supra");
    expect((await home(me)).json.friendsNews.items).toHaveLength(1);
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, veh.id));
    expect((await home(me)).json.friendsNews).toBeNull();
  });

  it("une story d'un ami (« a publié une story ») : tant qu'elle est visible, jamais celle d'un crew, jamais d'un auteur mis en sourdine", async () => {
    const { me, kenji } = await world();
    const jpg = await sharp({ create: { width: 900, height: 1600, channels: 3, background: { r: 120, g: 60, b: 30 } } })
      .jpeg()
      .toBuffer();
    async function publish(over: Record<string, unknown> = {}) {
      const form = new FormData();
      form.append("purpose", "story");
      form.append("file", new File([new Uint8Array(jpg)], "p.jpg", { type: "image/jpeg" }));
      const up = await app.request("/api/me/uploads", {
        method: "POST",
        headers: { origin: ORIGIN, cookie: kenji.cookie },
        body: form,
      });
      const { key } = (await up.json()) as { key: string };
      return call(kenji, "POST", "/me/stories", {
        uploadKey: key,
        noPlateConfirmed: true,
        audience: "followers",
        ...over,
      });
    }
    const made = await publish();
    expect(made.status).toBe(201);
    await notificationsService.deliverDue();
    const r = await home(me);
    expect(r.json.friendsNews.items).toHaveLength(1);
    expect(r.json.friendsNews.items[0]).toMatchObject({
      kind: "story",
      actor: { pseudo: "Kenji_Potes" },
      target: { type: "story", authorKey: `u:${kenji.id}` },
    });
    // Mise en sourdine (« ne plus voir ses stories ») : la ligne disparaît.
    await db.insert(storyMutes).values({ userId: me.id, authorKind: "user", authorId: kenji.id });
    expect((await home(me)).json.friendsNews).toBeNull();
    await db.delete(storyMutes);
    // La story expire : plus de ligne (24 h plus tard).
    clock.set(new Date(NOW.getTime() + 25 * HOUR));
    expect((await home(me)).json.friendsNews).toBeNull();
  });

  it("masqué : le bloc n'est pas calculé (aucune lecture du Journal)", async () => {
    const { me, kenji, event } = await world();
    await going(me, kenji, event.id, "Rassemblement de Narbonne");
    await setWidgets(me, { order: [], hidden: ["friends_news"] });
    expect((await home(me)).json.friendsNews).toBeNull();
    await setWidgets(me, { order: [], hidden: [] });
    expect((await home(me)).json.friendsNews.items).toHaveLength(1);
    expect(await friendsNewsWidget(await viewerOf(kenji))).toBeNull();
  });
});

// --- Réservés : Au spot, Souvenirs --------------------------------------------------------------------------------------------

describe("Au spot et Souvenirs (réservés à R7i et R7j)", () => {
  it("proposés dans le réglage, vides d'ici là", async () => {
    const u = await user("Reserves_Home");
    const r = await home(u);
    expect(r.json.spotMeetup).toBeNull();
    expect(r.json.memories).toBeNull();
    expect(r.json.widgets.order).toContain("spot_meetup");
    expect(r.json.widgets.order).toContain("memories");
    expect(r.json.widgets.hidden).not.toContain("spot_meetup");
  });
});

// --- Réglage -------------------------------------------------------------------------------------------------------------------

describe("réglage des blocs", () => {
  it("un réglage enregistré avant R7a2 reçoit les nouveaux blocs, sans perdre l'ordre ni les masqués", async () => {
    const u = await user("Ancien_R7a2");
    await db
      .update(profiles)
      .set({
        homeWidgets: {
          order: ["next_access", "live", "weather", "pending", "nearby", "agenda", "favorite_garage", "wash", "fuel"],
          hidden: ["agenda"],
        },
      })
      .where(eq(profiles.userId, u.id));
    const r = await home(u);
    expect(r.json.widgets.order).toEqual([
      "next_access",
      "live",
      "my_outings",
      "my_crew",
      "friends_news",
      "spot_meetup",
      "memories",
      "weather",
      "pending",
      "nearby",
      "agenda",
      "favorite_garage",
      "wash",
      "fuel",
    ]);
    expect(r.json.widgets.hidden).toEqual(["agenda"]);
  });

  it("PUT /me/home/widgets accepte les nouveaux identifiants, rend le réglage normalisé et le relit", async () => {
    const u = await user("Perso_R7a2");
    const put = await call(u, "PUT", "/me/home/widgets", {
      order: ["next_access", "weather", "my_crew", "memories"],
      hidden: ["friends_news", "spot_meetup"],
    });
    expect(put.status).toBe(200);
    expect(put.json.order.slice(0, 4)).toEqual(["next_access", "live", "my_outings", "weather"]);
    expect(put.json.order).toHaveLength(14);
    expect(put.json.hidden).toEqual(["friends_news", "spot_meetup"]);
    expect((await home(u)).json.widgets).toEqual(put.json);
    // Le réglage est par compte : un autre compte garde le sien.
    const other = await user("Autre_R7a2");
    expect((await home(other)).json.widgets.hidden).toEqual(["agenda", "favorite_garage", "pending"]);
  });

  it("un bloc réglable hors de portée de la casquette (organisateur, pro) n'est jamais calculé", async () => {
    const u = await user("Pro_R7a2");
    const spy = vi.spyOn(ticketsService, "mine");
    const r = await home(u, "?persona=pro");
    expect(r.json.myOutings).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
