// Lot R7m1 (D38, maquettes R7.19 et R7.20) : partenariats pro ↔ passionné. Un pro vérifié propose, le passionné accepte ou
// refuse, chacun met fin. Vie privée : « Ses partenaires » et « Partenaires » ne montrent que ce que la personne montrerait
// déjà sur son profil (compte privé non suivi : pseudo, photo et grade, sans voiture) ; rien sans compte connecté.
import { fromWallTime } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  blurPlatesOf,
  call,
  createPro,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  notifications,
  partnerships,
  platformSettings,
  profiles,
  proProfiles,
  userFollows,
  vehicles,
} from "../../db/schema";
import { settingsStore } from "../../lib/settings";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let proOwner: TestUser;
let pro: Awaited<ReturnType<typeof createPro>>;
let kenji: TestUser;
let marc: TestUser;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
  ref = await seedReference();
  proOwner = await signUp("Wrap_66");
  pro = await createPro(proOwner.id, { name: "Wrap 66", slug: "wrap-66", verifiedAt: new Date(0) });
  kenji = await person("Kenji_66");
  marc = await person("Marc_66", "private");
});

async function person(pseudo: string, visibility: "public" | "private" = "public") {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ visibility, departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

const follow = (a: TestUser, b: TestUser) =>
  db.insert(userFollows).values({ followerId: a.id, followedId: b.id, status: "accepted", acceptedAt: new Date() });

async function car(owner: TestUser) {
  const v = await createVehicle(owner.id, ref);
  await blurPlatesOf(owner.id);
  return v;
}

const propose = (who: TestUser | null, body: Record<string, unknown>, proId = pro.id) =>
  call(who, "POST", `/pros/${proId}/partnerships`, body);

/** Proposition de Wrap 66 à `to`, acceptée. */
async function partner(to: TestUser, vehicleId?: string) {
  const res = await propose(proOwner, { userPseudo: to.pseudo, message: "Covering offert", vehicleId });
  expect(res.status).toBe(201);
  const ok = await call(to, "POST", `/me/partnerships/${res.json.id}/accept`);
  expect(ok.status).toBe(200);
  return res.json.id as string;
}

/** Partenariat actif posé en base (un compte privé non suivi par le pro ne peut pas citer sa voiture par l'API). */
async function partnerDirect(to: TestUser, vehicleId: string | null = null) {
  const [row] = await db
    .insert(partnerships)
    .values({ proId: pro.id, userId: to.id, vehicleId, message: "Direct", status: "active", respondedAt: new Date() })
    .returning();
  return row!.id;
}

async function setSubscriptionFrom(day: string) {
  await db
    .insert(platformSettings)
    .values({ key: "partnerships.subscription_from", value: day })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: day } });
  settingsStore.invalidate();
}

const notifsOf = async (u: TestUser, type: string) => {
  await notificationsService.flush();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.type, type)));
};

describe("proposer", () => {
  it("un pro vérifié propose à un passionné : 201, la demande arrive, le passionné est prévenu (push)", async () => {
    const res = await propose(proOwner, { userPseudo: "kenji_66", message: "  Covering offert, on te suit  " });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      status: "pending",
      proId: pro.id,
      userPseudo: "Kenji_66",
      vehicleId: null,
      message: "Covering offert, on te suit",
      respondedAt: null,
      endedAt: null,
    });
    const [n] = await notifsOf(kenji, "partnership_proposed");
    expect(n).toMatchObject({ title: "Wrap 66 te propose un partenariat", inJournal: true });
    expect(n?.data).toMatchObject({ partnershipId: res.json.id, link: "/app/activite/demandes" });
  });

  it("un pro non vérifié : 403 not_verified", async () => {
    await db.update(proProfiles).set({ verifiedAt: null });
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("not_verified");
  });

  it("après la date du réglage : 403 subscription_required ; la veille, ça passe ; le réglage recule la date", async () => {
    await setSubscriptionFrom("2026-11-10");
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "Avant" })).status).toBe(201);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 0, minute: 0 }));
    const late = await propose(proOwner, { userPseudo: marc.pseudo, message: "Après" });
    expect(late.status).toBe(403);
    expect(late.json.error.code).toBe("subscription_required");
    // La date par défaut est le 21/06/2027 (Paris, minuit).
    await db.delete(platformSettings).where(eq(platformSettings.key, "partnerships.subscription_from"));
    settingsStore.invalidate();
    clock.set(fromWallTime({ year: 2027, month: 6, day: 20, hour: 23, minute: 59 }));
    expect((await propose(proOwner, { userPseudo: marc.pseudo, message: "Dernier jour" })).status).toBe(201);
    clock.set(fromWallTime({ year: 2027, month: 6, day: 21, hour: 0, minute: 0 }));
    const day = await propose(proOwner, { userPseudo: (await person("Lea_11")).pseudo, message: "Trop tard" });
    expect(day.status).toBe(403);
    expect(day.json.error.code).toBe("subscription_required");
  });

  it("seul le titulaire de la fiche propose ; sans compte : 401 ; la fiche d'un autre : 403", async () => {
    expect((await propose(null, { userPseudo: kenji.pseudo, message: "x" })).status).toBe(401);
    expect((await propose(kenji, { userPseudo: marc.pseudo, message: "x" })).status).toBe(403);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "x" }, crypto.randomUUID())).status).toBe(404);
  });

  it("un seul partenariat en attente ou actif par couple : 409, deux demandes simultanées comprises", async () => {
    const [a, b] = await Promise.all([
      propose(proOwner, { userPseudo: kenji.pseudo, message: "Un" }),
      propose(proOwner, { userPseudo: kenji.pseudo, message: "Deux" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((a.status === 409 ? a : b).json.error.code).toBe("partnership_exists");
    const again = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Trois" });
    expect(again.status).toBe(409);
    // L'index unique partiel le garantit aussi sous l'application.
    await expect(
      db.insert(partnerships).values({ proId: pro.id, userId: kenji.id, message: "x", status: "pending" }),
    ).rejects.toThrow();
  });

  it("le texte : 1 à 200 caractères ; la cible : introuvable, soi-même, compte suspendu", async () => {
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "   " })).status).toBe(400);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "x".repeat(201) })).status).toBe(400);
    expect((await propose(proOwner, { userPseudo: "x".repeat(10), message: "ok" })).status).toBe(404);
    expect((await propose(proOwner, { userPseudo: proOwner.pseudo, message: "ok" })).status).toBe(400);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 86_400_000) })
      .where(eq(profiles.userId, kenji.id));
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "ok" })).status).toBe(404);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "x".repeat(200) })).status).toBe(404);
  });

  it("le véhicule concerné : une voiture active de la personne, visible de ce pro ; sinon 400", async () => {
    const mine = await car(kenji);
    const others = await car(marc);
    const sold = await createVehicle(kenji.id, ref, { status: "sold" });
    const ok = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Ok", vehicleId: mine.id });
    expect(ok.status).toBe(201);
    expect(ok.json.vehicleId).toBe(mine.id);
    await call(kenji, "POST", `/me/partnerships/${ok.json.id}/decline`);
    // Pas la voiture d'un autre, ni une voiture vendue, ni celle d'un compte privé que le pro ne suit pas.
    const lea = await person("Lea_11");
    expect((await propose(proOwner, { userPseudo: lea.pseudo, message: "x", vehicleId: mine.id })).status).toBe(400);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "x", vehicleId: sold.id })).status).toBe(400);
    expect((await propose(proOwner, { userPseudo: marc.pseudo, message: "x", vehicleId: others.id })).status).toBe(400);
    // Compte privé suivi par le pro : sa voiture est visible, donc citable.
    await follow(proOwner, marc);
    expect((await propose(proOwner, { userPseudo: marc.pseudo, message: "x", vehicleId: others.id })).status).toBe(201);
  });
});

describe("répondre et mettre fin : chacun de son côté seulement", () => {
  it("le passionné accepte : actif, le pro est prévenu (Journal) ; deux fois : 409", async () => {
    const id = await partner(kenji);
    const [row] = await db.select().from(partnerships).where(eq(partnerships.id, id));
    expect(row).toMatchObject({ status: "active" });
    expect(row?.respondedAt).not.toBeNull();
    const [n] = await notifsOf(proOwner, "partnership_accepted");
    expect(n?.body).toBe("Kenji_66 a accepté ton partenariat.");
    expect((await call(kenji, "POST", `/me/partnerships/${id}/accept`)).status).toBe(409);
    expect((await call(kenji, "POST", `/me/partnerships/${id}/decline`)).status).toBe(409);
  });

  it("le passionné refuse : le pro est prévenu, et ne repropose pas avant 30 jours", async () => {
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    const declined = await call(kenji, "POST", `/me/partnerships/${res.json.id}/decline`);
    expect(declined.status).toBe(200);
    expect(declined.json.status).toBe("declined");
    expect((await notifsOf(proOwner, "partnership_declined"))[0]?.body).toBe("Kenji_66 a décliné ton partenariat.");
    const retry = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Encore" });
    expect(retry.status).toBe(409);
    expect(retry.json.error.code).toBe("partnership_cooldown");
    clock.advance(31 * 86_400_000);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "Un mois après" })).status).toBe(201);
  });

  it("jamais du mauvais côté : le pro, un tiers ou un autre pro ne répondent ni ne mettent fin pour la personne", async () => {
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    const id = res.json.id as string;
    const intruder = await person("Intrus_66");
    for (const who of [proOwner, intruder, marc]) {
      for (const action of ["accept", "decline", "end"]) {
        expect((await call(who, "POST", `/me/partnerships/${id}/${action}`)).status).toBe(404);
      }
    }
    // « Mettre fin » côté passionné n'ouvre que sur un partenariat actif.
    expect((await call(kenji, "POST", `/me/partnerships/${id}/end`)).status).toBe(409);
    // Côté pro : un autre pro ne touche pas aux partenariats de celui-ci.
    const other = await signUp("Autre_Pro");
    const otherPro = await createPro(other.id, { verifiedAt: new Date(0) });
    expect((await call(other, "POST", `/pros/${otherPro.id}/partnerships/${id}/end`)).status).toBe(404);
    expect((await call(other, "POST", `/pros/${pro.id}/partnerships/${id}/end`)).status).toBe(403);
    expect((await call(kenji, "POST", `/pros/${pro.id}/partnerships/${id}/end`)).status).toBe(403);
    expect((await call(null, "POST", `/me/partnerships/${id}/accept`)).status).toBe(401);
  });

  it("le passionné met fin : le pro est prévenu ; le pro met fin : le passionné est prévenu ; une seule fois", async () => {
    const id = await partner(kenji);
    const byUser = await call(kenji, "POST", `/me/partnerships/${id}/end`);
    expect(byUser.status).toBe(200);
    expect(byUser.json).toMatchObject({ status: "ended" });
    expect((await notifsOf(proOwner, "partnership_ended"))[0]?.body).toBe("Ton partenariat avec Kenji_66 est terminé.");
    expect((await call(kenji, "POST", `/me/partnerships/${id}/end`)).status).toBe(409);

    const lea = await person("Lea_11");
    const second = await partner(lea);
    const byPro = await call(proOwner, "POST", `/pros/${pro.id}/partnerships/${second}/end`);
    expect(byPro.status).toBe(200);
    expect((await notifsOf(lea, "partnership_ended"))[0]?.body).toBe("Ton partenariat avec Wrap 66 est terminé.");
    expect((await call(proOwner, "POST", `/pros/${pro.id}/partnerships/${second}/end`)).status).toBe(409);
    const [row] = await db.select().from(partnerships).where(eq(partnerships.id, second));
    expect(row?.endedBy).toBe(proOwner.id);
  });

  it("le pro retire une proposition avant réponse : plus de demande, personne n'est prévenu de plus", async () => {
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    expect((await call(proOwner, "POST", `/pros/${pro.id}/partnerships/${res.json.id}/end`)).status).toBe(200);
    expect((await call(kenji, "GET", "/me/requests")).json.items).toEqual([]);
    expect(await notifsOf(kenji, "partnership_ended")).toEqual([]);
    // La personne n'a rien refusé : le pro peut proposer de nouveau.
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "Autre texte" })).status).toBe(201);
  });

  it("accepter est refusé quand le pro n'est plus vérifié ; la demande disparaît de la liste", async () => {
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    await db.update(proProfiles).set({ verifiedAt: null });
    expect((await call(kenji, "GET", "/me/requests")).json.items).toEqual([]);
    expect((await call(kenji, "POST", `/me/partnerships/${res.json.id}/accept`)).status).toBe(409);
  });

  it("après un partenariat fini par la personne, le même pro ne repropose pas avant 30 jours (fini par le pro : tout de suite)", async () => {
    const id = await partner(kenji);
    await call(kenji, "POST", `/me/partnerships/${id}/end`);
    expect((await propose(proOwner, { userPseudo: kenji.pseudo, message: "Reviens" })).status).toBe(409);
    const lea = await person("Lea_11");
    const other = await partner(lea);
    await call(proOwner, "POST", `/pros/${pro.id}/partnerships/${other}/end`);
    expect((await propose(proOwner, { userPseudo: lea.pseudo, message: "De nouveau" })).status).toBe(201);
  });
});

describe("la demande et les listes", () => {
  it("GET /me/requests : la proposition (pro, texte, voiture) ; la pastille la compte ; elle n'est pas dans l'Activité", async () => {
    const mine = await car(kenji);
    await propose(proOwner, { userPseudo: kenji.pseudo, message: "Covering offert", vehicleId: mine.id });
    const res = await call(kenji, "GET", "/me/requests");
    expect(res.status).toBe(200);
    expect(res.json.total).toBe(1);
    expect(res.json.items).toHaveLength(1);
    const item = res.json.items[0];
    expect(item).toMatchObject({
      kind: "partnership",
      from: { type: "structure", name: "Wrap 66" },
      payload: {
        message: "Covering offert",
        vehicle: { id: mine.id },
        pro: { slug: "wrap-66", city: "Perpignan", activities: ["garage"] },
      },
    });
    expect(Object.keys(item.payload).sort()).toEqual(["message", "pro", "vehicle"]);
    expect((await call(kenji, "GET", "/me/inbox/summary")).json.pendingRequests).toBe(1);
    const activity = await call(kenji, "GET", "/me/activity");
    expect(JSON.stringify(activity.json)).not.toContain("partnership_proposed");
    // Une fois répondu, la demande disparaît.
    await call(kenji, "POST", `/me/partnerships/${item.id}/accept`);
    expect((await call(kenji, "GET", "/me/requests")).json.total).toBe(0);
  });

  it("la demande d'un autre passionné n'est jamais lue par un tiers ; la voiture d'un autre n'apparaît pas", async () => {
    await propose(proOwner, { userPseudo: kenji.pseudo, message: "Pour Kenji" });
    expect((await call(marc, "GET", "/me/requests")).json.items).toEqual([]);
    expect((await call(proOwner, "GET", "/me/requests")).json.items).toEqual([]);
  });

  it("GET /me/partnerships : mes partenaires actifs seulement", async () => {
    const mine = await car(kenji);
    await propose(proOwner, { userPseudo: kenji.pseudo, message: "En attente" });
    expect((await call(kenji, "GET", "/me/partnerships")).json.items).toEqual([]);
    const id = await partner(marc);
    expect((await call(marc, "GET", "/me/partnerships")).json.items).toHaveLength(1);
    await call(kenji, "POST", `/me/partnerships/${(await call(kenji, "GET", "/me/requests")).json.items[0].id}/accept`);
    const res = await call(kenji, "GET", "/me/partnerships");
    expect(res.json.items).toHaveLength(1);
    expect(res.json.items[0]).toMatchObject({
      pro: { name: "Wrap 66", slug: "wrap-66", proId: pro.id },
      vehicle: null,
    });
    expect(res.json.items[0].id).not.toBe(id);
    expect(mine.id).toBeTruthy();
  });

  it("côté pro : GET /pros/:id/partnerships (titulaire seulement) liste propositions et partenaires, avec le droit de proposer", async () => {
    await partner(kenji);
    await propose(proOwner, { userPseudo: marc.pseudo, message: "En attente" });
    const res = await call(proOwner, "GET", `/pros/${pro.id}/partnerships`);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ canPropose: null, subscriptionFrom: "2027-06-21" });
    expect(res.json.items.map((i: { status: string; user: { pseudo: string } }) => [i.status, i.user.pseudo])).toEqual([
      ["pending", "Marc_66"],
      ["active", "Kenji_66"],
    ]);
    expect((await call(kenji, "GET", `/pros/${pro.id}/partnerships`)).status).toBe(403);
    await setSubscriptionFrom("2026-11-01");
    expect((await call(proOwner, "GET", `/pros/${pro.id}/partnerships`)).json.canPropose).toBe("subscription_required");
  });
});

describe("« Ses partenaires » : la liste blanche, regard par regard", () => {
  it("sans compte connecté : aucun partenaire ; en pending, declined ou ended : jamais listé", async () => {
    await partner(kenji);
    const pending = await propose(proOwner, { userPseudo: marc.pseudo, message: "En attente" });
    expect(pending.status).toBe(201);
    const anonymous = await call(null, "GET", "/pros/by-slug/wrap-66");
    expect(anonymous.status).toBe(200);
    expect(anonymous.json.memberPartners).toEqual([]);
    const member = await person("Lea_11");
    const res = await call(member, "GET", "/pros/by-slug/wrap-66");
    expect(res.json.memberPartners.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Kenji_66"]);
  });

  it("compte public : pseudo, photo, grade et la voiture citée (nom seulement : ni plaque, ni photo)", async () => {
    const mine = await car(kenji);
    await partner(kenji, mine.id);
    const res = await call(await person("Lea_11"), "GET", "/pros/by-slug/wrap-66");
    const [item] = res.json.memberPartners;
    expect(Object.keys(item).sort()).toEqual(["avatarUrl", "grade", "pseudo", "vehicle"]);
    expect(item).toMatchObject({ pseudo: "Kenji_66", grade: "rodage", vehicle: { id: mine.id } });
    expect(Object.keys(item.vehicle).sort()).toEqual(["id", "label"]);
    expect(JSON.stringify(res.json.memberPartners)).not.toMatch(/AA-\d{3}-ZZ|AA\d{3}ZZ|plate/i);
  });

  it("compte privé : sans voiture pour un inconnu, un abonnement en attente ou le pro ; avec voiture pour un abonné accepté et pour soi", async () => {
    const mine = await car(marc);
    await partnerDirect(marc, mine.id);
    const stranger = await person("Inconnu_66");
    const waiting = await person("Attente_66");
    await db
      .insert(userFollows)
      .values({ followerId: waiting.id, followedId: marc.id, status: "pending", acceptedAt: null });
    const follower = await person("Abonne_66");
    await follow(follower, marc);
    const vehicleFor = async (who: TestUser) => {
      const res = await call(who, "GET", "/pros/by-slug/wrap-66");
      expect(res.json.memberPartners).toHaveLength(1);
      const [item] = res.json.memberPartners;
      expect(Object.keys(item).sort()).toEqual(["avatarUrl", "grade", "pseudo", "vehicle"]);
      expect(item.pseudo).toBe("Marc_66");
      return item.vehicle;
    };
    expect(await vehicleFor(stranger)).toBeNull();
    expect(await vehicleFor(waiting)).toBeNull();
    expect(await vehicleFor(proOwner)).toBeNull();
    expect(await vehicleFor(follower)).toMatchObject({ id: mine.id });
    expect(await vehicleFor(marc)).toMatchObject({ id: mine.id });
  });

  it("un partenaire suspendu, banni ou supprimé disparaît de la liste ; un véhicule vendu ou passé à un autre aussi", async () => {
    const mine = await car(kenji);
    await partner(kenji, mine.id);
    const viewer = await person("Lea_11");
    const list = async () => (await call(viewer, "GET", "/pros/by-slug/wrap-66")).json.memberPartners;
    expect((await list())[0].vehicle).toMatchObject({ id: mine.id });
    await db.update(vehicles).set({ ownerId: marc.id }).where(eq(vehicles.id, mine.id));
    expect((await list())[0].vehicle).toBeNull();
    await db.update(vehicles).set({ ownerId: kenji.id, status: "sold" }).where(eq(vehicles.id, mine.id));
    expect((await list())[0].vehicle).toBeNull();
    await db.update(profiles).set({ bannedAt: clock.now }).where(eq(profiles.userId, kenji.id));
    expect(await list()).toEqual([]);
  });

  it("une fiche non publiée n'est pas lisible : ses partenaires non plus", async () => {
    await partner(kenji);
    await db.update(proProfiles).set({ publishedAt: null });
    expect((await call(await person("Lea_11"), "GET", "/pros/by-slug/wrap-66")).status).toBe(404);
  });
});

describe("« Partenaires » d'un profil et « Partenaire : … » sur la voiture", () => {
  it("GET /users/:pseudo : les partenaires d'un compte public ; vide pour un compte privé non suivi ; plein pour un abonné et pour soi", async () => {
    await partner(kenji);
    await partner(marc);
    const lea = await person("Lea_11");
    const pub = await call(lea, "GET", `/users/${kenji.pseudo}`);
    expect(pub.json.partners).toEqual([{ proId: pro.id, name: "Wrap 66", logoUrl: null, slug: "wrap-66" }]);
    expect(Object.keys(pub.json.partners[0]).sort()).toEqual(["logoUrl", "name", "proId", "slug"]);
    expect((await call(lea, "GET", `/users/${marc.pseudo}`)).json.partners).toEqual([]);
    await follow(lea, marc);
    expect((await call(lea, "GET", `/users/${marc.pseudo}`)).json.partners).toHaveLength(1);
    expect((await call(marc, "GET", `/users/${marc.pseudo}`)).json.partners).toHaveLength(1);
    // Fini : la ligne disparaît.
    const mineId = (await call(kenji, "GET", "/me/partnerships")).json.items[0].id;
    await call(kenji, "POST", `/me/partnerships/${mineId}/end`);
    expect((await call(lea, "GET", `/users/${kenji.pseudo}`)).json.partners).toEqual([]);
  });

  it("une fiche pro supprimée, non publiée ou au titulaire suspendu n'est plus un partenaire visible", async () => {
    await partner(kenji);
    const lea = await person("Lea_11");
    await db.update(proProfiles).set({ publishedAt: null });
    expect((await call(lea, "GET", `/users/${kenji.pseudo}`)).json.partners).toEqual([]);
    await db.update(proProfiles).set({ publishedAt: new Date(0) });
    expect((await call(lea, "GET", `/users/${kenji.pseudo}`)).json.partners).toHaveLength(1);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 86_400_000) })
      .where(eq(profiles.userId, proOwner.id));
    expect((await call(lea, "GET", `/users/${kenji.pseudo}`)).json.partners).toEqual([]);
  });

  it("partner sur la voiture : actif seulement, fini → null ; ma voiture, celle d'un autre, la liste du garage et le profil", async () => {
    const mine = await car(kenji);
    const other = await car(kenji);
    const lea = await person("Lea_11");
    expect((await call(kenji, "GET", `/me/vehicles/${mine.id}`)).json.partner).toBeNull();
    const id = await partner(kenji, mine.id);
    const expected = { name: "Wrap 66", logoUrl: null, slug: "wrap-66" };
    expect((await call(kenji, "GET", `/me/vehicles/${mine.id}`)).json.partner).toEqual(expected);
    expect((await call(kenji, "GET", `/me/vehicles/${other.id}`)).json.partner).toBeNull();
    expect((await call(lea, "GET", `/vehicles/${mine.id}`)).json.partner).toEqual(expected);
    expect((await call(lea, "GET", `/vehicles/${other.id}`)).json.partner).toBeNull();
    const list = (await call(kenji, "GET", "/me/vehicles")).json as { id: string; partner: unknown }[];
    expect(list.find((v) => v.id === mine.id)?.partner).toEqual(expected);
    expect(list.find((v) => v.id === other.id)?.partner).toBeNull();
    const profile = (await call(lea, "GET", `/users/${kenji.pseudo}`)).json.vehicles as {
      id: string;
      partner: unknown;
    }[];
    expect(profile.find((v) => v.id === mine.id)?.partner).toEqual(expected);
    await call(kenji, "POST", `/me/partnerships/${id}/end`);
    expect((await call(kenji, "GET", `/me/vehicles/${mine.id}`)).json.partner).toBeNull();
    expect((await call(lea, "GET", `/vehicles/${mine.id}`)).json.partner).toBeNull();
  });

  it("partner sur la voiture d'un compte privé : jamais pour un inconnu (fiche réduite) ; oui pour un abonné ; voiture vendue à un autre : null", async () => {
    const mine = await car(marc);
    await follow(proOwner, marc);
    await partner(marc, mine.id);
    const stranger = await person("Inconnu_66");
    const seen = await call(stranger, "GET", `/vehicles/${mine.id}`);
    expect(seen.json).toMatchObject({ detailed: false, partner: null });
    const follower = await person("Abonne_66");
    await follow(follower, marc);
    expect((await call(follower, "GET", `/vehicles/${mine.id}`)).json).toMatchObject({
      detailed: true,
      partner: { name: "Wrap 66" },
    });
    const brief = (await call(stranger, "GET", `/users/${marc.pseudo}`)).json.vehicles as { partner: unknown }[];
    expect(brief.every((v) => v.partner === null)).toBe(true);
    await db.update(vehicles).set({ ownerId: kenji.id }).where(eq(vehicles.id, mine.id));
    expect((await call(kenji, "GET", `/me/vehicles/${mine.id}`)).json.partner).toBeNull();
  });
});

describe("le bouton « Proposer » du profil (partnershipOffer)", () => {
  it("un pro vérifié qui regarde : disponible, puis « envoyée », puis plus rien une fois partenaires ; jamais pour un autre regard", async () => {
    const offer = async (who: TestUser, pseudo = kenji.pseudo) =>
      (await call(who, "GET", `/users/${pseudo}`)).json.partnershipOffer;
    expect(await offer(proOwner)).toEqual({ proId: pro.id, proName: "Wrap 66", state: "available" });
    expect(await offer(await person("Lea_11"))).toBeNull();
    expect(await offer(kenji, kenji.pseudo)).toBeNull();
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    expect(await offer(proOwner)).toMatchObject({ state: "pending" });
    await call(kenji, "POST", `/me/partnerships/${res.json.id}/accept`);
    expect(await offer(proOwner)).toBeNull();
    // Un compte privé : le bouton existe (une demande ne révèle rien de plus que le profil réduit).
    expect(await offer(proOwner, marc.pseudo)).toMatchObject({ state: "available" });
  });

  it("pas de bouton : fiche non vérifiée, après la date, refus récent", async () => {
    const offer = async () => (await call(proOwner, "GET", `/users/${kenji.pseudo}`)).json.partnershipOffer;
    const res = await propose(proOwner, { userPseudo: kenji.pseudo, message: "Salut" });
    await call(kenji, "POST", `/me/partnerships/${res.json.id}/decline`);
    expect(await offer()).toBeNull();
    clock.advance(31 * 86_400_000);
    expect(await offer()).toMatchObject({ state: "available" });
    await setSubscriptionFrom("2026-11-01");
    expect(await offer()).toBeNull();
    await setSubscriptionFrom("2027-06-21");
    await db.update(proProfiles).set({ verifiedAt: null });
    expect(await offer()).toBeNull();
  });
});

describe("aucun argent", () => {
  it("aucune réponse ne porte de somme, de prix ni de rémunération ; la table n'a pas de colonne d'argent", async () => {
    const mine = await car(kenji);
    const id = await partner(kenji, mine.id);
    const lea = await person("Lea_11");
    const bodies = [
      (await call(proOwner, "GET", `/pros/${pro.id}/partnerships`)).text,
      (await call(kenji, "GET", "/me/partnerships")).text,
      (await call(lea, "GET", "/pros/by-slug/wrap-66")).text,
      (await call(lea, "GET", `/users/${kenji.pseudo}`)).text,
      (await call(kenji, "GET", `/me/vehicles/${mine.id}`)).text,
      (await call(kenji, "POST", `/me/partnerships/${id}/end`)).text,
    ];
    for (const text of bodies) expect(text).not.toMatch(/€|price|prix|amount|montant|rémun|remun|salary|fee\b/i);
    const columns = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'partnerships'`,
    );
    const names = (columns.rows as { column_name: string }[]).map((r) => r.column_name);
    expect(names.sort()).toEqual(
      [
        "created_at",
        "ended_at",
        "ended_by",
        "id",
        "message",
        "pro_id",
        "proposed_at",
        "responded_at",
        "status",
        "updated_at",
        "user_id",
        "vehicle_id",
      ].sort(),
    );
  });
});

describe("export des données", () => {
  it("l'export du passionné contient ses partenariats (pro, texte, dates), jamais ceux d'un autre", async () => {
    await partner(kenji);
    await partner(marc);
    const res = await call(kenji, "GET", "/me/export");
    expect(res.status).toBe(200);
    expect(res.json.partnerships).toHaveLength(1);
    expect(res.json.partnerships[0]).toMatchObject({ pro: "Wrap 66", status: "active", message: "Covering offert" });
    expect(Object.keys(res.json.partnerships[0]).sort()).toEqual([
      "endedAt",
      "message",
      "pro",
      "proposedAt",
      "respondedAt",
      "status",
    ]);
  });
});

describe("migration", () => {
  it("un véhicule supprimé laisse le partenariat (sans voiture) ; une fiche pro supprimée emporte ses partenariats", async () => {
    const mine = await car(kenji);
    const id = await partner(kenji, mine.id);
    await db.delete(vehicles).where(eq(vehicles.id, mine.id));
    const [row] = await db.select().from(partnerships).where(eq(partnerships.id, id));
    expect(row).toMatchObject({ status: "active", vehicleId: null });
    await db.delete(proProfiles).where(eq(proProfiles.id, pro.id));
    expect(await db.select().from(partnerships)).toEqual([]);
  });
});
