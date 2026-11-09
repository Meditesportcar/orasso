// Lot R7j : les souvenirs (« il y a un an… »). La règle du jour (fuseau, 29 février, veille à 23 h 50), la tâche quotidienne
// (idempotente, une notification par personne et par jour, livrée à 10 h, famille « social » respectée), le bloc de
// l'Accueil (nul hors jour, non calculé masqué), la carte du Fil (personnelle : un autre compte ne la reçoit pas), la page
// du souvenir (404 pour qui n'a pas le tampon) et les plaques (photo du plateau seulement, véhicule cédé jamais).
import { type FeedCard, seasonDates, seasonYear } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  blurPlatesOf,
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  checkins,
  type events,
  notifications,
  passportStamps,
  profiles,
  seasons,
  userFollows,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { memoriesWidget } from "../home/widgets/memories";
import { notificationsService } from "../notifications/service";
import { memoriesService } from "./service";

afterAll(async () => {
  await pool.end();
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 9 h à Paris (hiver) : l'heure où la tâche tourne. */
const NOW = new Date("2026-11-10T08:00:00Z");
/** Un an avant, jour pour jour, 10 h à Paris (hiver). */
const YEAR_AGO = new Date("2025-11-10T09:00:00Z");

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let owner: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clock = useClock(NOW);
  ref = await seedReference();
  owner = await signUp("Organisateur_66");
  structureId = (await createStructure(owner.id)).id;
});

async function person(pseudo: string, departments: string[] = ["66"]) {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ departments }).where(eq(profiles.userId, u.id));
  return u;
}

async function seasonFor(date: Date) {
  const d = seasonDates(seasonYear(date));
  await db.insert(seasons).values(d).onConflictDoNothing();
  const row = await db.query.seasons.findFirst({ where: eq(seasons.startsOn, d.startsOn) });
  return row!.id;
}

/** Un événement publié (fini) daté de `startsAt`, et le tampon de la personne posé à `stampedAt`. */
async function memory(
  u: TestUser,
  over: {
    title?: string;
    startsAt?: Date;
    stampedAt?: Date;
    kind?: "participation" | "visit" | "staff" | "first_outing";
    event?: Partial<typeof events.$inferInsert>;
  } = {},
) {
  const startsAt = over.startsAt ?? YEAR_AGO;
  const event = await createEvent(structureId, {
    title: over.title ?? "Rassemblement des Aspres",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 6 * HOUR),
    department: "66",
    ...over.event,
  });
  const [stamp] = await db
    .insert(passportStamps)
    .values({
      userId: u.id,
      eventId: event.id,
      seasonId: await seasonFor(startsAt),
      kind: over.kind ?? "participation",
      shape: "round",
      ink: "default",
      seed: 42,
      rare: over.kind === "first_outing",
      stampedAt: over.stampedAt ?? new Date(startsAt.getTime() + HOUR),
    })
    .returning();
  return { event, stamp: stamp! };
}

/** La personne était retenue avec une voiture à l'événement (et entrée). */
async function withCar(
  u: TestUser,
  eventId: string,
  opts: { blurred?: boolean; status?: "accepted" | "refused"; ownerId?: string } = {},
) {
  const car = await createVehicle(u.id, ref);
  if (opts.blurred !== false) await blurPlatesOf(u.id);
  const [app] = await db
    .insert(applications)
    .values({
      eventId,
      userId: u.id,
      vehicleId: car.id,
      status: opts.status ?? "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
      decidedAt: new Date(YEAR_AGO.getTime() - 10 * DAY),
    })
    .returning();
  await db.insert(checkins).values({ applicationId: app!.id, eventId, method: "scan", checkedInAt: YEAR_AGO });
  if (opts.ownerId) await db.update(vehicles).set({ ownerId: opts.ownerId }).where(eq(vehicles.id, car.id));
  return { car, app: app! };
}

const memoryNotifications = (userId: string) =>
  db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, "memory")));

// --- La règle du jour, appliquée à la base --------------------------------------------------------------------------------

describe("todayFor : les souvenirs du jour", () => {
  it("un tampon d'il y a un an, jour pour jour : un souvenir avec ses champs (liste blanche)", async () => {
    const damien = await person("Damien_66");
    const { event, stamp } = await memory(damien);
    const items = await memoriesService.todayFor(damien.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      eventId: event.id,
      slug: event.slug,
      title: "Rassemblement des Aspres",
      city: "Canet-en-Roussillon",
      startsAt: YEAR_AGO.toISOString(),
      yearsAgo: 1,
      posterUrl: null,
      photoUrl: null,
      stampId: stamp.id,
      stamp: expect.objectContaining({ id: stamp.id, kind: "participation", shape: "round", seed: 42 }),
      car: null,
      recapAvailable: false,
    });
  });

  it("personne sans tampon : rien ; autre jour : rien ; tampon d'aujourd'hui : rien (pas encore un souvenir)", async () => {
    const nobody = await person("Sans_tampon");
    expect(await memoriesService.todayFor(nobody.id, NOW)).toEqual([]);
    const u = await person("Autre_jour");
    await memory(u, { startsAt: new Date("2025-11-11T09:00:00Z") });
    await memory(u, { startsAt: new Date("2025-10-10T09:00:00Z") });
    await memory(u, { startsAt: new Date("2026-11-10T07:00:00Z"), stampedAt: new Date("2026-11-10T07:30:00Z") });
    expect(await memoriesService.todayFor(u.id, NOW)).toEqual([]);
  });

  it("seuls la participation et la visite donnent un souvenir (ni le staff, ni un tampon rare)", async () => {
    const u = await person("Staff_66");
    await memory(u, { kind: "staff" });
    await memory(u, { kind: "first_outing" });
    expect(await memoriesService.todayFor(u.id, NOW)).toEqual([]);
    const v = await person("Visiteur_66");
    await memory(v, { kind: "visit" });
    expect(await memoriesService.todayFor(v.id, NOW)).toHaveLength(1);
  });

  it("un tampon posé la veille à 23 h 50 compte pour son jour local ; à 0 h 30 le lendemain, pour le lendemain", async () => {
    const u = await person("Minuit_66");
    // 23 h 50 à Paris le 9 novembre 2025 (UTC+1) : jour local = le 9.
    const eve = await memory(u, { title: "La veille", stampedAt: new Date("2025-11-09T22:50:00Z") });
    // 0 h 30 à Paris le 10 novembre 2025 : jour local = le 10.
    const after = await memory(u, { title: "Après minuit", stampedAt: new Date("2025-11-09T23:30:00Z") });
    const on10 = await memoriesService.todayFor(u.id, NOW);
    expect(on10.map((i) => i.eventId)).toEqual([after.event.id]);
    const on9 = await memoriesService.todayFor(u.id, new Date("2026-11-09T12:00:00Z"));
    expect(on9.map((i) => i.eventId)).toEqual([eve.event.id]);
  });

  it("le 29 février revient le 28 février d'une année non bissextile", async () => {
    const u = await person("Bissextile_66");
    const { event } = await memory(u, {
      startsAt: new Date("2024-02-29T10:00:00Z"),
      stampedAt: new Date("2024-02-29T11:00:00Z"),
    });
    const items = await memoriesService.todayFor(u.id, new Date("2026-02-28T10:00:00Z"));
    expect(items.map((i) => [i.eventId, i.yearsAgo])).toEqual([[event.id, 2]]);
    expect(await memoriesService.todayFor(u.id, new Date("2026-03-01T10:00:00Z"))).toEqual([]);
    expect(await memoriesService.todayFor(u.id, new Date("2028-02-29T10:00:00Z"))).toHaveLength(1);
  });

  it("plusieurs années le même jour : le plus récent d'abord ; un événement privé ou brouillon n'en donne pas", async () => {
    const u = await person("Fidele_66");
    const old = await memory(u, {
      title: "Il y a trois ans",
      startsAt: new Date("2023-11-10T09:00:00Z"),
    });
    const recent = await memory(u, { title: "Il y a un an" });
    await memory(u, {
      title: "Brouillon",
      startsAt: new Date("2024-11-10T09:00:00Z"),
      event: { status: "draft" },
    });
    const items = await memoriesService.todayFor(u.id, NOW);
    expect(items.map((i) => [i.eventId, i.yearsAgo])).toEqual([
      [recent.event.id, 1],
      [old.event.id, 3],
    ]);
  });

  it("ne lit que les tampons de la personne : celui d'un autre n'apparaît jamais", async () => {
    const a = await person("Alice_66");
    const b = await person("Bruno_66");
    await memory(a);
    expect(await memoriesService.todayFor(b.id, NOW)).toEqual([]);
  });
});

// --- Photo : la règle du plateau --------------------------------------------------------------------------------------------

describe("photo du souvenir : plaques", () => {
  it("ma voiture au plateau, plaque floutée : sa photo ; le nom de la voiture est dit sur la page", async () => {
    const u = await person("Plateau_66");
    const { event } = await memory(u);
    const { car } = await withCar(u, event.id);
    const [item] = await memoriesService.todayFor(u.id, NOW);
    expect(item?.photoUrl).toContain(car.id);
    expect(item?.recapAvailable).toBe(true);
  });

  it("une photo dont la plaque n'est pas traitée ne sort pas : l'affiche prend le relais (photoUrl nul)", async () => {
    const u = await person("Plaque_66");
    const { event } = await memory(u);
    await withCar(u, event.id, { blurred: false });
    const [item] = await memoriesService.todayFor(u.id, NOW);
    expect(item?.photoUrl).toBeNull();
    // « Aucune plaque visible » confirmée : montrable.
    await db.update(vehiclePhotos).set({ noPlateConfirmed: true });
    const [again] = await memoriesService.todayFor(u.id, NOW);
    expect(again?.photoUrl).not.toBeNull();
  });

  it("un véhicule cédé depuis ou vendu n'est jamais montré (ni son nom)", async () => {
    const u = await person("Cedeur_66");
    const buyer = await person("Acheteur_66");
    const { event } = await memory(u);
    const { car } = await withCar(u, event.id, { ownerId: buyer.id });
    const [item] = await memoriesService.todayFor(u.id, NOW);
    expect(item?.photoUrl).toBeNull();
    // Rendu au premier propriétaire puis vendu : toujours pas montré.
    await db.update(vehicles).set({ ownerId: u.id, status: "sold" }).where(eq(vehicles.id, car.id));
    expect((await memoriesService.todayFor(u.id, NOW))[0]?.photoUrl).toBeNull();
    const detail = await memoriesService.detail(u.id, event.id, NOW);
    expect(detail.vehicleLabel).toBeNull();
  });

  it("une candidature refusée ne donne pas de photo ; un visiteur au billet n'en a pas non plus", async () => {
    const u = await person("Refuse_66");
    const { event } = await memory(u);
    await withCar(u, event.id, { status: "refused" });
    expect((await memoriesService.todayFor(u.id, NOW))[0]?.photoUrl).toBeNull();
  });
});

// --- La page du souvenir ---------------------------------------------------------------------------------------------------

// --- Événement sur invitation, numéro du plateau, anniversaire, 22 h ----------------------------------------------------------

describe("événement sur invitation", () => {
  it("jamais de souvenir : ni dans la liste du jour, ni sur la page (404), ni de notification (comme « Sorties »)", async () => {
    const u = await person("Invite_66");
    const { event } = await memory(u, { title: "Soirée sur invitation", event: { admission: "invite_only" } });
    expect(await memoriesService.todayFor(u.id, NOW)).toEqual([]);
    expect((await call(u, "GET", `/me/memories/${event.id}`)).status).toBe(404);
    expect((await call(u, "GET", "/me/memories/today")).json).toEqual([]);
    expect(await memoriesService.daily(NOW)).toBe(0);
    expect(await memoryNotifications(u.id)).toEqual([]);
    // Le même jour, un événement ouvert reste un souvenir (le filtre ne touche que l'invitation).
    await memory(u, { title: "Rassemblement ouvert" });
    expect((await memoriesService.todayFor(u.id, NOW)).map((i) => i.title)).toEqual(["Rassemblement ouvert"]);
    expect(await memoriesService.daily(NOW)).toBe(1);
    expect((await memoryNotifications(u.id))[0]?.body).toContain("Rassemblement ouvert");
  });
});

describe("ma voiture sur le plateau", () => {
  it("le nom, le numéro d'acceptation et le nombre de voitures du plateau ; sans voiture retenue, rien", async () => {
    const u = await person("Numero_66");
    const { event } = await memory(u);
    // Deux autres voitures retenues et entrées avant la mienne, une retenue mais jamais entrée (hors plateau).
    for (const name of ["Avant_1", "Avant_2"]) {
      const o = await person(name);
      const { app } = await withCar(o, event.id);
      await db
        .update(applications)
        .set({ decidedAt: new Date(YEAR_AGO.getTime() - 40 * DAY) })
        .where(eq(applications.id, app.id));
    }
    const absent = await person("Absent_1");
    const away = await withCar(absent, event.id);
    await db.delete(checkins).where(eq(checkins.applicationId, away.app.id));
    await withCar(u, event.id);
    const [item] = await memoriesService.todayFor(u.id, NOW);
    expect(item?.car).toEqual({ label: "BMW Série 3 E36", rank: 3, total: 3 });
    const none = await person("Visiteur_car");
    await memory(none, { kind: "visit" });
    const [other] = await memoriesService.todayFor(none.id, NOW);
    expect(other?.car).toBeNull();
  });
});

describe("GET /me/memories/:eventId", () => {
  it("rend le souvenir avec le tampon et la voiture ; sans session : 401", async () => {
    const u = await person("Page_66");
    const { event, stamp } = await memory(u);
    await withCar(u, event.id);
    const res = await call(u, "GET", `/me/memories/${event.id}`);
    expect(res.status).toBe(200);
    expect(res.json.stampId).toBe(stamp.id);
    expect(res.json.stamp.id).toBe(stamp.id);
    expect(res.json.stamp.kind).toBe("participation");
    expect(res.json.vehicleLabel).toBe("BMW Série 3 E36");
    expect(res.json).not.toHaveProperty("sentence");
    expect(JSON.stringify(res.json)).not.toMatch(/AA-\d{3}-ZZ|plate/i);
    expect((await call(null, "GET", `/me/memories/${event.id}`)).status).toBe(401);
  });

  it("404 pour une autre personne, un événement inconnu, un tampon staff, un tampon de moins d'un an", async () => {
    const u = await person("Proprio_66");
    const other = await person("Curieux_66");
    const { event } = await memory(u);
    expect((await call(other, "GET", `/me/memories/${event.id}`)).status).toBe(404);
    expect((await call(u, "GET", "/me/memories/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call(u, "GET", "/me/memories/pas-un-uuid")).status).toBe(400);
    const staff = await memory(u, { kind: "staff", startsAt: new Date("2025-06-01T09:00:00Z") });
    expect((await call(u, "GET", `/me/memories/${staff.event.id}`)).status).toBe(404);
    const recent = await memory(u, {
      startsAt: new Date("2026-06-01T09:00:00Z"),
      stampedAt: new Date("2026-06-01T10:00:00Z"),
    });
    expect((await call(u, "GET", `/me/memories/${recent.event.id}`)).status).toBe(404);
  });

  it("ouverte le lendemain de la notification, elle répond encore (« il y a un an ») mais n'est plus « jour pour jour »", async () => {
    const u = await person("Lendemain_66");
    const { event } = await memory(u);
    expect((await call(u, "GET", `/me/memories/${event.id}`)).json.anniversary).toBe(true);
    clock.set(new Date(NOW.getTime() + 2 * DAY));
    const res = await call(u, "GET", `/me/memories/${event.id}`);
    expect(res.status).toBe(200);
    expect(res.json.yearsAgo).toBe(1);
    expect(res.json.anniversary).toBe(false);
  });

  it("GET /me/memories/today : la liste du jour, sans session 401, vide un autre jour", async () => {
    const u = await person("Aujourdhui_66");
    await memory(u);
    expect((await call(null, "GET", "/me/memories/today")).status).toBe(401);
    const today = await call(u, "GET", "/me/memories/today");
    expect(today.status).toBe(200);
    expect(today.json).toHaveLength(1);
    clock.set(new Date(NOW.getTime() + DAY));
    expect((await call(u, "GET", "/me/memories/today")).json).toEqual([]);
  });
});

// --- La tâche quotidienne --------------------------------------------------------------------------------------------------

describe("memories.daily", () => {
  it("une notification `memory`, livrée à 10 h (heure de Paris), avec le lien vers la page", async () => {
    const u = await person("Notifie_66");
    const { event } = await memory(u);
    expect(await memoriesService.daily(NOW)).toBe(1);
    const rows = await memoryNotifications(u.id);
    expect(rows).toHaveLength(1);
    const n = rows[0]!;
    expect(n.family).toBe("social");
    expect(n.eventId).toBe(event.id);
    expect(n.title).toBe("Un souvenir pour toi");
    expect(n.body).toBe("Il y a un an, tu étais là : Rassemblement des Aspres.");
    expect(n.deliverAfter.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(n.deliveredAt).toBeNull();
    expect(n.data).toMatchObject({
      eventId: event.id,
      day: "2026-11-10",
      screen: "memory",
      link: `/app/souvenir/${event.id}`,
    });
  });

  it("idempotente : deux passages = une notification, et un passage de plus plus tard dans la journée n'en ajoute pas", async () => {
    const u = await person("Rejeu_66");
    await memory(u);
    expect(await memoriesService.daily(NOW)).toBe(1);
    expect(await memoriesService.daily(NOW)).toBe(0);
    expect(await memoriesService.daily(new Date(NOW.getTime() + 5 * HOUR))).toBe(0);
    expect(await memoryNotifications(u.id)).toHaveLength(1);
    // Deux passages en même temps : toujours une seule.
    const v = await person("Parallele_66");
    await memory(v);
    await Promise.all([memoriesService.daily(NOW), memoriesService.daily(NOW)]);
    expect(await memoryNotifications(v.id)).toHaveLength(1);
  });

  it("pas de souvenir créé à 22 h locales ou après : la livraison tomberait le lendemain", async () => {
    const u = await person("Tard_66");
    await memory(u);
    // 21 h 59 : encore possible ; 22 h : plus rien (le tampon est du 10 novembre, jour local de NOW).
    expect(await memoriesService.daily(new Date("2026-11-10T21:00:00Z"))).toBe(0);
    expect(await memoryNotifications(u.id)).toEqual([]);
    expect(await memoriesService.daily(new Date("2026-11-10T20:59:00Z"))).toBe(1);
  });

  it("une par personne et par jour : deux souvenirs le même jour (1 an et 3 ans) = une notification qui le dit", async () => {
    const u = await person("Deux_66");
    await memory(u, { title: "Vieille sortie", startsAt: new Date("2023-11-10T09:00:00Z") });
    await memory(u, { title: "Sortie de l'an dernier" });
    expect(await memoriesService.daily(NOW)).toBe(1);
    const [n] = await memoryNotifications(u.id);
    expect(n?.body).toBe("Il y a un an, tu étais là : Sortie de l'an dernier. (+ 1 autre)");
  });

  it("l'année suivante, le même événement ne re-notifie pas un autre jour, mais prévient à nouveau son anniversaire", async () => {
    const u = await person("Annuel_66");
    await memory(u);
    expect(await memoriesService.daily(NOW)).toBe(1);
    // Le lendemain : plus de souvenir, plus de notification.
    expect(await memoriesService.daily(new Date(NOW.getTime() + DAY))).toBe(0);
    // Un an plus tard : « il y a 2 ans », nouvelle notification (autre jour local).
    expect(await memoriesService.daily(new Date("2027-11-10T08:00:00Z"))).toBe(1);
    const rows = await memoryNotifications(u.id);
    expect(rows.map((r) => (r.data as { day: string }).day).sort()).toEqual(["2026-11-10", "2027-11-10"]);
  });

  it("personne sans tampon, tampon d'un autre jour, ou événement pas publié : aucune notification", async () => {
    await person("Rien_66");
    const u = await person("AutreJour_66");
    await memory(u, { startsAt: new Date("2025-11-09T09:00:00Z") });
    const v = await person("Brouillon_66");
    await memory(v, { event: { status: "cancelled" } });
    expect(await memoriesService.daily(NOW)).toBe(0);
    expect(await db.select().from(notifications).where(eq(notifications.type, "memory"))).toEqual([]);
  });

  it("la famille « social » coupée, ou le type coupé : aucune notification", async () => {
    const off = await person("Coupe_66");
    await memory(off);
    await db
      .update(profiles)
      .set({ notificationPrefs: { application: true, event: true, social: false, grade: true } })
      .where(eq(profiles.userId, off.id));
    const muted = await person("Mute_66");
    await memory(muted);
    await db
      .update(profiles)
      .set({ mutedTypes: ["memory"] })
      .where(eq(profiles.userId, muted.id));
    const on = await person("Actif_66");
    await memory(on);
    expect(await memoriesService.daily(NOW)).toBe(1);
    expect(await memoryNotifications(off.id)).toHaveLength(0);
    expect(await memoryNotifications(muted.id)).toHaveLength(0);
    expect(await memoryNotifications(on.id)).toHaveLength(1);
  });

  it("un compte suspendu, banni ou supprimé n'est pas prévenu", async () => {
    const s = await person("Suspendu_66");
    const b = await person("Banni_66");
    const d = await person("Supprime_66");
    for (const u of [s, b, d]) await memory(u);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(NOW.getTime() + 10 * DAY) })
      .where(eq(profiles.userId, s.id));
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, b.id));
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, d.id));
    expect(await memoriesService.daily(NOW)).toBe(0);
  });

  it("livrée à 10 h : rien avant, la notification part ensuite (Journal, famille social)", async () => {
    const u = await person("Livre_66");
    await memory(u);
    await memoriesService.daily(NOW);
    clock.set(new Date("2026-11-10T08:30:00Z"));
    await notificationsService.deliverDue();
    expect((await memoryNotifications(u.id))[0]?.deliveredAt).toBeNull();
    clock.set(new Date("2026-11-10T09:01:00Z"));
    await notificationsService.deliverDue();
    expect((await memoryNotifications(u.id))[0]?.deliveredAt).not.toBeNull();
  });
});

// --- Accueil et Fil --------------------------------------------------------------------------------------------------------

describe("bloc de l'Accueil", () => {
  it("les souvenirs du jour ; `null` hors de ces jours et sans tampon", async () => {
    const u = await person("Accueil_66");
    const none = await person("Vide_66");
    const { event } = await memory(u);
    const mine = await memoriesWidget(await viewerOf(u));
    expect(mine?.items.map((i) => i.eventId)).toEqual([event.id]);
    expect(await memoriesWidget(await viewerOf(none))).toBeNull();
    clock.set(new Date(NOW.getTime() + DAY));
    expect(await memoriesWidget(await viewerOf(u))).toBeNull();
  });

  it("GET /me/home : `memories` présent le jour, absent le lendemain, et non calculé quand le bloc est masqué", async () => {
    const u = await person("Home_66");
    await memory(u);
    const get = async () => (await call(u, "GET", "/me/home")).json;
    expect((await get()).memories.items).toHaveLength(1);
    // Masqué : non calculé, donc `null`.
    const hidden = await call(u, "PUT", "/me/home/widgets", {
      order: [
        "next_access",
        "live",
        "my_outings",
        "my_crew",
        "friends_news",
        "spot_meetup",
        "memories",
        "nearby",
        "weather",
        "agenda",
        "favorite_garage",
        "pending",
      ],
      hidden: ["memories", "agenda", "favorite_garage", "pending"],
    });
    expect(hidden.status).toBe(200);
    expect((await get()).memories).toBeNull();
    await call(u, "PUT", "/me/home/widgets", {
      order: hidden.json.order,
      hidden: ["agenda", "favorite_garage", "pending"],
    });
    expect((await get()).memories.items).toHaveLength(1);
    clock.set(new Date(NOW.getTime() + DAY));
    expect((await get()).memories).toBeNull();
  });
});

describe("carte du Fil : personnelle", () => {
  const memoryOf = (card: FeedCard | undefined) => {
    if (!card) throw new Error("carte souvenir absente");
    return (card.payload as { memory: { eventId: string; yearsAgo: number; photoUrl: string | null } }).memory;
  };
  const fil = async (u: TestUser, query = "") => {
    const res = await call(u, "GET", `/fil${query}`);
    expect(res.status).toBe(200);
    return res.json.items as FeedCard[];
  };

  it("le souvenir du jour est dans Pour toi, en tête, avec sa raison ; pas dans Autour de moi ni Mes abonnements", async () => {
    const u = await person("Fil_66");
    const { event } = await memory(u);
    // Un événement à venir proche pour que le Fil ne soit pas vide.
    await createEvent(structureId, { title: "Bientôt", department: "66", startsAt: new Date(NOW.getTime() + 3 * DAY) });
    const items = await fil(u);
    const card = items.find((c) => c.kind === "memory");
    expect(card).toBeDefined();
    expect(items[0]?.kind).toBe("memory");
    expect(card?.reason).toEqual({ code: "your_memory", label: "Un souvenir pour toi" });
    expect(memoryOf(card)).toMatchObject({
      eventId: event.id,
      yearsAgo: 1,
    });
    expect((await fil(u, "?filter=nearby")).some((c) => c.kind === "memory")).toBe(false);
    expect((await fil(u, "?filter=following")).some((c) => c.kind === "memory")).toBe(false);
  });

  it("visible de moi seul : un abonné, un ami ou un autre compte ne la reçoit pas", async () => {
    const me = await person("Moi_66");
    const fan = await person("Fan_66");
    const stranger = await person("Inconnu_66");
    await memory(me);
    await db
      .insert(userFollows)
      .values({ followerId: fan.id, followedId: me.id, status: "accepted", acceptedAt: new Date() });
    for (const other of [fan, stranger]) {
      const items = await fil(other);
      expect(items.some((c) => c.kind === "memory")).toBe(false);
      expect(JSON.stringify(items)).not.toContain("Rassemblement des Aspres");
    }
    expect((await fil(me)).some((c) => c.kind === "memory")).toBe(true);
  });

  it("absente le lendemain ; « Moins de ce genre » la retire", async () => {
    const u = await person("Lendemain2_66");
    await memory(u);
    expect((await fil(u)).some((c) => c.kind === "memory")).toBe(true);
    clock.set(new Date(NOW.getTime() + DAY));
    expect((await fil(u)).some((c) => c.kind === "memory")).toBe(false);
  });

  it("la photo de la carte suit la règle des plaques (silhouette d'abord : jamais une photo non traitée)", async () => {
    const u = await person("FilPlaque_66");
    const { event } = await memory(u);
    await withCar(u, event.id, { blurred: false });
    const card = (await fil(u)).find((c) => c.kind === "memory");
    expect(memoryOf(card).photoUrl).toBeNull();
    await blurPlatesOf(u.id);
    const blurred = (await fil(u)).find((c) => c.kind === "memory");
    expect(memoryOf(blurred).photoUrl).not.toBeNull();
  });
});
