// Lot R2 (maquette « Explorer R2 ») : « Où chercher ? » (départements entiers, rayon autour de ma position), le nombre en
// tout, les pros par métier (comptes), les pros qui se déplacent, la remise pour mon grade et le garage favori ; les
// suggestions de Personnes et crews, tirées des seuls comptes publics.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { crews, friendships, proDiscounts, proFollows, profiles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let fan: TestUser;
beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 16, hour: 11, minute: 0 }));
  fan = await signUp("Kenji_66");
  await db
    .update(profiles)
    .set({ departments: ["66"], grade: "route" })
    .where(eq(profiles.userId, fan.id));
});

const slugs = (res: { json: { items: { slug: string }[] } }) => res.json.items.map((p) => p.slug).sort();
const PERPIGNAN = { lat: 42.7, lng: 2.9 };

describe("événements : Où chercher ?", () => {
  it("Mon coin et Ailleurs : des départements entiers ; le nombre en tout à la demande", async () => {
    const orga = await signUp("Orga_R2");
    const s = await createStructure(orga.id);
    await createEvent(s.id, { title: "Canet", department: "66", lat: 42.7, lng: 3.03 });
    await createEvent(s.id, { title: "Céret", department: "66", lat: 42.49, lng: 2.75 });
    await createEvent(s.id, { title: "Narbonne", department: "11", lat: 43.18, lng: 3.0 });
    await createEvent(s.id, { title: "Toulouse", department: "31", lat: 43.6, lng: 1.44 });
    const coin = await call(fan, "GET", "/events?departments=66&withTotal=1&limit=1");
    expect(coin.json.total).toBe(2);
    expect(coin.json.items).toHaveLength(1);
    const two = await call(fan, "GET", "/events?departments=66,11&withTotal=1");
    expect(two.json.total).toBe(3);
    // Sans `withTotal`, pas de nombre ; une position envoyée avec des départements n'ajoute aucun rayon implicite.
    const near = await call(fan, "GET", `/events?departments=31&lat=${PERPIGNAN.lat}&lng=${PERPIGNAN.lng}&sort=date`);
    expect(near.json.total).toBeUndefined();
    expect(near.json.items.map((e: { title: string }) => e.title)).toEqual(["Toulouse"]);
    expect((await call(fan, "GET", "/events?departments=6x")).status).toBe(400);
  });
});

describe("pros : Où chercher ?, métiers, remise, favori", () => {
  it("autour de moi : le rayon, plus ceux qui se déplacent dans mes départements", async () => {
    const a = await signUp("Pro_A");
    const b = await signUp("Pro_B");
    const c = await signUp("Pro_C");
    const d = await signUp("Pro_D");
    await createPro(a.id, { slug: "port", lat: 42.7, lng: 3.03 });
    await createPro(b.id, { slug: "toulouse", lat: 43.6, lng: 1.44, department: "31", city: "Toulouse" });
    await createPro(c.id, {
      slug: "mobile-66",
      lat: null,
      lng: null,
      city: null,
      department: null,
      interventionDepartments: ["66", "11"],
    });
    await createPro(d.id, {
      slug: "mobile-33",
      lat: null,
      lng: null,
      city: null,
      department: null,
      interventionDepartments: ["33"],
    });
    const res = await call(
      fan,
      "GET",
      `/pros?lat=${PERPIGNAN.lat}&lng=${PERPIGNAN.lng}&radiusKm=100&sort=distance&withTotal=1`,
    );
    expect(slugs(res)).toEqual(["mobile-66", "port"]);
    expect(res.json.total).toBe(2);
    // Le pro sans atelier passe après ceux qui ont une adresse.
    expect(res.json.items.map((p: { slug: string }) => p.slug)).toEqual(["port", "mobile-66"]);
    // Mon coin : installés dans le département ou qui y interviennent.
    expect(slugs(await call(fan, "GET", "/pros?departments=66"))).toEqual(["mobile-66", "port"]);
    expect(slugs(await call(fan, "GET", "/pros?departments=31,33"))).toEqual(["mobile-33", "toulouse"]);
  });

  it("chaque métier compté dans le lieu choisi ; le métier choisi n'entre pas dans les comptes", async () => {
    const a = await signUp("Pro_A");
    const b = await signUp("Pro_B");
    const c = await signUp("Pro_C");
    await createPro(a.id, { activities: ["garage", "preparation"] });
    await createPro(b.id, { activities: ["detailing"] });
    await createPro(c.id, { activities: ["garage"], department: "31", city: "Toulouse" });
    const coin = await call(fan, "GET", "/pros/activities?departments=66&activity=detailing");
    expect(coin.json).toEqual({ total: 2, counts: { garage: 1, preparation: 1, detailing: 1 } });
    const all = await call(null, "GET", "/pros/activities");
    expect(all.json.total).toBe(3);
    expect(all.json.counts.garage).toBe(2);
  });

  it("la remise pour mon grade (ou dès un grade au-dessus) et l'étoile de mon garage favori, connecté seulement", async () => {
    const a = await signUp("Pro_A");
    const b = await signUp("Pro_B");
    const c = await signUp("Pro_C");
    const mine = await createPro(a.id, { slug: "a-port", name: "A Port" });
    const later = await createPro(b.id, { slug: "b-sport", name: "B Sport" });
    await createPro(c.id, { slug: "c-rien", name: "C Rien" });
    await db.insert(proDiscounts).values([
      { proId: mine.id, grade: "route", percent: 8 },
      { proId: later.id, grade: "sport", percent: 10 },
    ]);
    await db.insert(proFollows).values({ proId: mine.id, userId: fan.id, favorite: true });
    const res = await call(fan, "GET", "/pros?sort=name");
    const by = Object.fromEntries(res.json.items.map((p: { slug: string }) => [p.slug, p]));
    expect(by["a-port"]).toMatchObject({ discount: { percent: 8, from: null }, favorite: true });
    expect(by["b-sport"]).toMatchObject({ discount: { percent: 10, from: "sport" }, favorite: false });
    expect(by["c-rien"]).toMatchObject({ discount: null, favorite: false });
    const anon = await call(null, "GET", "/pros?sort=name");
    expect(anon.json.items[0].discount).toBeUndefined();
    expect(anon.json.items[0].favorite).toBeUndefined();
  });
});

describe("Personnes et crews : suggestions", () => {
  it("même modèle : comptes publics seulement, jamais moi ni mes amis ; le département choisi", async () => {
    const ref = await seedReference();
    await createVehicle(fan.id, ref);
    const pub = await signUp("Pilote_041");
    const priv = await signUp("Pilote_063");
    const friend = await signUp("Lea_11");
    const away = await signUp("Pilote_088");
    for (const u of [pub, priv, friend, away]) await createVehicle(u.id, ref);
    await db
      .update(profiles)
      .set({ departments: ["11"] })
      .where(eq(profiles.userId, pub.id));
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, away.id));
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, priv.id));
    await db.insert(friendships).values({ requesterId: fan.id, addresseeId: friend.id, status: "accepted" });
    const res = await call(fan, "GET", "/users/suggestions");
    expect(res.json.sameModel).toMatchObject({ model: "Série 3", vehicle: "BMW Série 3 E36" });
    expect(res.json.sameModel.items.map((p: { pseudo: string }) => p.pseudo).sort()).toEqual([
      "Pilote_041",
      "Pilote_088",
    ]);
    const dept = await call(fan, "GET", "/users/suggestions?department=66");
    expect(dept.json.sameModel.items.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Pilote_088"]);
    // Sans véhicule : rien à suggérer.
    const empty = await signUp("Sans_Auto");
    expect((await call(empty, "GET", "/users/suggestions")).json).toEqual({ sameModel: null });
    expect((await call(null, "GET", "/users/suggestions")).status).toBe(401);
  });
});

// Lot R2, tour 2 (relectures Opus et Codex).
describe("tour 2 : plus aucun annuaire de personnes", () => {
  it("sans texte d'au moins deux caractères : aucune liste, même avec un filtre ou une page suivante", async () => {
    for (const path of [
      "/users/search?grade=rodage",
      "/users/search?department=66",
      "/users/search?departments=66,11",
      "/users/search?q=a&grade=rodage",
      `/users/search?cursor=${Buffer.from("a|b").toString("base64url")}`,
    ]) {
      expect((await call(fan, "GET", path)).status, path).toBe(400);
    }
  });

  it("texte + filtre : le filtre ne trouve que les comptes au détail visible (jamais un privé par son grade)", async () => {
    const pub = await signUp("Pilote_041");
    const priv = await signUp("Pilote_063");
    await db
      .update(profiles)
      .set({ grade: "sport", departments: ["66"] })
      .where(eq(profiles.userId, pub.id));
    await db
      .update(profiles)
      .set({ grade: "sport", departments: ["66"], visibility: "private" })
      .where(eq(profiles.userId, priv.id));
    const pseudos = async (path: string) =>
      (await call(fan, "GET", path)).json.items.map((p: { pseudo: string }) => p.pseudo).sort();
    // Le texte seul trouve le compte privé (pseudo visible de tous) ; le grade et le département ne le trouvent pas.
    expect(await pseudos("/users/search?q=pilote")).toEqual(["Pilote_041", "Pilote_063"]);
    expect(await pseudos("/users/search?q=pilote&grade=sport")).toEqual(["Pilote_041"]);
    expect(await pseudos("/users/search?q=pilote&departments=66,11")).toEqual(["Pilote_041"]);
    expect(await pseudos("/users/search?q=pilote&departments=11")).toEqual([]);
  });

  it("crews : « Mon coin » choisi cherche dans l'un des départements du compte", async () => {
    const chef = await signUp("Chef_R2");
    for (const [name, department] of [
      ["Drift 66", "66"],
      ["Drift 11", "11"],
      ["Drift 31", "31"],
    ] as const) {
      await db.insert(crews).values({ slug: `drift-${department}`, name, department, createdBy: chef.id });
    }
    const names = (await call(fan, "GET", "/crews/search?q=drift&departments=66,11")).json.items
      .map((c: { name: string }) => c.name)
      .sort();
    expect(names).toEqual(["Drift 11", "Drift 66"]);
  });
});

describe("tour 2 : annuaire des pros et compteurs des métiers", () => {
  it("une fiche publiée non vérifiée reste listée (fiche de base, docs/01) ; un titulaire suspendu : jamais", async () => {
    const a = await signUp("Pro_A");
    const b = await signUp("Pro_B");
    await createPro(a.id, { slug: "non-verifie", activities: ["garage"], verifiedAt: null });
    await createPro(b.id, { slug: "suspendu", activities: ["garage"] });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 7 * 86_400_000) })
      .where(eq(profiles.userId, b.id));
    expect(slugs(await call(fan, "GET", "/pros"))).toEqual(["non-verifie"]);
    expect((await call(fan, "GET", "/pros/activities")).json).toEqual({ total: 1, counts: { garage: 1 } });
  });

  it("des pros distincts : une activité en double ne compte qu'une fois ; elle est dédoublonnée à l'écriture", async () => {
    const a = await signUp("Pro_A");
    await createPro(a.id, { activities: ["garage", "garage", "detailing"] });
    expect((await call(fan, "GET", "/pros/activities")).json).toEqual({
      total: 1,
      counts: { garage: 1, detailing: 1 },
    });
    const owner = await signUp("Pro_Neuf");
    const res = await call(owner, "POST", "/pros", {
      name: "Atelier Neuf",
      activities: ["covering", "covering"],
      city: "Perpignan",
      postalCode: "66000",
    });
    expect(res.status).toBe(201);
    expect(res.json.activities).toEqual(["covering"]);
  });
});
