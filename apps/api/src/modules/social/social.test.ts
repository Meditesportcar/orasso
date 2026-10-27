// Social (lot 17, lot R6b) : audiences des profils, suivre et demandes d'abonnement, QR de compte, recherche de
// personnes, Journal des personnes suivies.
import { accountQrPayload, fromWallTime, privateVehicleFields } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  blurPlatesOf,
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  suspendByModeration,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  categories,
  friendships,
  notifications,
  profileInterests,
  profiles,
  structures,
  userFollows,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
} from "../../db/schema";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { anonymizeSocialForDeletedAccount } from "./anonymize";

afterAll(async () => {
  await pool.end();
});

const DAY = 86_400_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let supra: { makeId: string; modelId: string; generationId: string };

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
  ref = await seedReference();
  const [make] = await db.insert(vehicleMakes).values({ name: "Toyota", slug: "toyota", country: "JP" }).returning();
  const [model] = await db
    .insert(vehicleModels)
    .values({ makeId: make!.id, name: "Supra", slug: "supra", vehicleType: "car" })
    .returning();
  const [gen] = await db
    .insert(vehicleGenerations)
    .values({ modelId: model!.id, name: "MK4", yearFrom: 1993, yearTo: 2002 })
    .returning();
  supra = { makeId: make!.id, modelId: model!.id, generationId: gen!.id };
});

type Person = TestUser & { dept?: string };

async function person(
  pseudo: string,
  opts: { visibility?: "public" | "private"; departments?: string[]; bio?: string } = {},
) {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({
      visibility: opts.visibility ?? "public",
      departments: opts.departments ?? ["66"],
      bio: opts.bio ?? `Bio de ${pseudo}`,
    })
    .where(eq(profiles.userId, u.id));
  return u as Person;
}

const flush = () => notificationsService.flush();
const journal = async (u: TestUser) =>
  (await call(u, "GET", "/me/notifications")).json.items as {
    type: string;
    title: string;
    readAt: string | null;
    data: { actor?: { pseudo: string; userId: string }; link?: string };
  }[];

/** `follower` suit `followed`, abonnement accepté, posé directement en base. */
async function follows(follower: TestUser, followed: TestUser, status: "accepted" | "pending" = "accepted") {
  await db.insert(userFollows).values({
    followerId: follower.id,
    followedId: followed.id,
    status,
    acceptedAt: status === "accepted" ? new Date() : null,
  });
}

/** Deux abonnements acceptés (ce que la migration fait d'une ancienne amitié). */
async function befriend(a: TestUser, b: TestUser) {
  await follows(a, b);
  await follows(b, a);
}

describe("audience d'un profil", () => {
  it("public : complet ; privé : pseudo, photo, grade, marque et modèle ; la plaque n'est jamais visible", async () => {
    const a = await person("Alpha_Pub", { bio: "Passionné d'E36" });
    const b = await person("Bravo_Priv", { visibility: "private", bio: "secret" });
    const c = await person("Charlie_C");
    const va = await createVehicle(a.id, ref, { plate: "AB-123-CD", plateNormalized: "AB123CD" });
    const vb = await createVehicle(b.id, ref, { plate: "ZY-987-XW", plateNormalized: "ZY987XW" });

    const full = await call(c, "GET", "/users/Alpha_Pub");
    expect(full.status).toBe(200);
    expect(full.json).toMatchObject({ audience: "public_full", bio: "Passionné d'E36", departments: ["66"] });
    expect(full.json.vehicles[0]).toMatchObject({ label: "BMW Série 3 E36", detailed: true });
    // Vague R4, après fusion : une photo sans décision de plaque ne sort pas du garage (profil, fiche) ; floutée, oui.
    expect(full.json.vehicles[0].photoUrl).toBeNull();
    expect((await call(c, "GET", `/vehicles/${va.id}`)).json.photos).toEqual([]);
    expect((await call(a, "GET", `/me/vehicles/${va.id}`)).json.photos).toHaveLength(1);
    // Lot R4e (Damien) : le propriétaire qui regarde sa propre vitrine voit sa photo sans décision ; un autre membre
    // voit `null`, et son aperçu « vu par un membre » aussi.
    expect((await call(a, "GET", "/users/Alpha_Pub")).json.vehicles[0].photoUrl).toContain("test/");
    expect((await call(a, "GET", `/vehicles/${va.id}`)).json.photos).toHaveLength(1);
    expect((await call(a, "GET", "/me/public-preview?as=member")).json.vehicles[0].photoUrl).toBeNull();
    expect((await call(c, "GET", "/users/Alpha_Pub")).json.vehicles[0].photoUrl).toBeNull();
    await blurPlatesOf(a.id);
    expect((await call(c, "GET", "/users/Alpha_Pub")).json.vehicles[0].photoUrl).toContain("test/");

    const limited = await call(c, "GET", "/users/Bravo_Priv");
    expect(limited.json).toMatchObject({ audience: "public_limited", bio: null, departments: null });
    expect(limited.json.upcomingEvents).toBeNull();
    expect(limited.json.pastEvents).toBeNull();
    expect(limited.json.crews).toBeNull();
    expect(limited.json.contact).toBeNull();
    expect(limited.json.vehicles[0]).toMatchObject({ label: "BMW Série 3", detailed: false, photoUrl: null });

    // Fiches de véhicule : complète / réduite.
    const fa = await call(c, "GET", `/vehicles/${va.id}`);
    expect(fa.json).toMatchObject({ label: "BMW Série 3 E36", generationName: "E36" });
    expect(fa.json.photos).toHaveLength(1);
    // Lot R4b (choix validé par Damien) : compte privé, photo masquée, marque, modèle, génération et catégories,
    // rien d'autre (liste blanche `privateVehicleFields`, plus `detailed` et `owner`).
    // Tour 2 : seulement une photo dont la plaque est floutée.
    expect((await call(c, "GET", `/vehicles/${vb.id}`)).json.photoUrl).toBeNull();
    await db.update(vehiclePhotos).set({ plateBlurred: true }).where(eq(vehiclePhotos.vehicleId, vb.id));
    const fb = await call(c, "GET", `/vehicles/${vb.id}`);
    expect(fb.json).toMatchObject({ label: "BMW Série 3 E36", makeName: "BMW", modelName: "Série 3" });
    expect(fb.json.generationName).toBe("E36");
    expect(fb.json.photoUrl).toContain("test/");
    expect(Object.keys(fb.json).sort()).toEqual([...privateVehicleFields, "detailed", "owner"].sort());
    expect(fb.json.year).toBeUndefined();

    for (const res of [full, limited, fa, fb]) {
      const text = res.text.toLowerCase().replaceAll(/[\s-]/g, "");
      expect(text).not.toContain("ab123cd");
      expect(text).not.toContain("zy987xw");
      // Lot 51 : la pastille `plateBlurred` des photos (plaque floutée, booléen) n'est pas une plaque.
      expect(res.text.replaceAll('"plateBlurred"', "")).not.toContain("plate");
    }
    // Ni nom, ni e-mail, ni téléphone.
    expect(full.text).not.toContain("@orasso.test");
    expect(full.json).not.toHaveProperty("firstName");
  });

  it("réservé aux connectés ; compte supprimé : 404 ; son propre profil : audience self", async () => {
    const a = await person("Alpha_Pub");
    expect((await call(null, "GET", "/users/Alpha_Pub")).status).toBe(401);
    expect((await call(null, "GET", "/vehicles/00000000-0000-4000-8000-000000000000")).status).toBe(401);
    expect((await call(a, "GET", "/users/Alpha_Pub")).json.audience).toBe("self");
    const b = await person("Bravo_B");
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, a.id));
    expect((await call(b, "GET", "/users/Alpha_Pub")).status).toBe(404);
  });

  it("un abonné accepté voit tout d'un profil privé ; celui que le privé suit, non ; l'aperçu est celui d'un inconnu", async () => {
    const b = await person("Bravo_Priv", { visibility: "private", bio: "secret" });
    const c = await person("Charlie_C");
    const d = await person("Delta_D");
    await createVehicle(b.id, ref);
    await follows(c, b);
    await follows(b, d);
    const res = await call(c, "GET", "/users/Bravo_Priv");
    expect(res.json).toMatchObject({ audience: "follower", bio: "secret", departments: ["66"] });
    expect(res.json.vehicles[0]).toMatchObject({ label: "BMW Série 3 E36", detailed: true });
    expect(res.json.follow).toEqual({ canFollow: true, mine: "accepted", followsMe: false });
    expect(res.json).toMatchObject({ followersCount: 1, followingCount: 1 });
    // Bravo suit Delta, Delta ne suit pas Bravo : Delta ne voit que le réduit, avec « Te suit ».
    const fromD = await call(d, "GET", "/users/Bravo_Priv");
    expect(fromD.json).toMatchObject({ audience: "public_limited", bio: null });
    expect(fromD.json.follow).toEqual({ canFollow: true, mine: "none", followsMe: true });
    // Aperçu de Bravo : réduit, même s'il a des abonnés ; vu par un abonné : tout.
    const preview = await call(b, "GET", "/me/public-preview");
    expect(preview.json).toMatchObject({ audience: "public_limited", bio: null, departments: null });
    const asFollower = await call(b, "GET", "/me/public-preview?as=follower");
    expect(asFollower.json).toMatchObject({ audience: "follower", bio: "secret" });
    expect(asFollower.json.follow.mine).toBe("accepted");
  });

  it("l'équipe organisatrice d'un événement où la personne a candidaté voit ses coordonnées, personne d'autre", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const other = await person("Autre_O");
    const k = await person("Kenji_66", { visibility: "private" });
    await db
      .update(profiles)
      .set({ firstName: "Kenji", lastName: "Mori", phone: "0600000000" })
      .where(eq(profiles.userId, k.id));
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id, { admission: "open", capacity: 5 });
    const v = await createVehicle(k.id, ref);
    await applicationsService.apply(await viewerOf(k), e.id, {
      vehicleIds: [v.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    const asOrga = await call(orga, "GET", "/users/Kenji_66");
    expect(asOrga.json.audience).toBe("organizer");
    expect(asOrga.json.contact).toMatchObject({ firstName: "Kenji", lastName: "Mori", phone: "0600000000" });
    expect(asOrga.json.contact.email).toContain("@orasso.test");
    expect(asOrga.json.bio).toBe("Bio de Kenji_66");
    expect(asOrga.text.toLowerCase().replaceAll(/[\s-]/g, "")).not.toContain((v.plateNormalized ?? "").toLowerCase());
    const asOther = await call(other, "GET", "/users/Kenji_66");
    expect(asOther.json.audience).toBe("public_limited");
    expect(asOther.json.contact).toBeNull();
    // Un staff ordinaire de la structure n'est pas organisateur.
    const staff = await signUp("Staff_S");
    await addMember(s.id, staff.id, "staff");
    expect((await call(staff, "GET", "/users/Kenji_66")).json.audience).toBe("public_limited");
  });

  it("événements à venir et passés d'un profil complet ; jamais un événement sur invitation", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const k = await person("Kenji_66");
    const viewer = await person("Curieux_C");
    const s = await createStructure(orga.id);
    const futur = await createEvent(s.id, { admission: "open", capacity: 5, title: "Nocturne de Canet" });
    const prive = await createEvent(s.id, { admission: "invite_only", title: "Soirée privée" });
    const v = await createVehicle(k.id, ref);
    const kv = await viewerOf(k);
    const form = {
      vehicleIds: [v.id],
      rulesAccepted: true as const,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    };
    await applicationsService.apply(kv, futur.id, form);
    // Candidature acceptée à un événement sur invitation, insérée à la main.
    await db.insert(applications).values({
      eventId: prive.id,
      userId: k.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
    const res = await call(viewer, "GET", "/users/Kenji_66");
    expect(res.json.upcomingEvents.map((e: { title: string }) => e.title)).toEqual(["Nocturne de Canet"]);
    expect(res.json.pastEvents).toEqual({ count: 0, titles: [] });
    expect(res.text).not.toContain("Soirée privée");
  });
});

describe("suivre, demandes d'abonnement (lot R6b, D37)", () => {
  const followRow = async (follower: TestUser, followed: TestUser) =>
    (
      await db
        .select()
        .from(userFollows)
        .where(and(eq(userFollows.followerId, follower.id), eq(userFollows.followedId, followed.id)))
    )[0];

  it("compte public : abonné tout de suite (« X te suit ») ; compte privé : demande (« X demande à te suivre »)", async () => {
    const pub = await person("Alpha_Pub");
    const priv = await person("Bravo_Priv", { visibility: "private", bio: "secret" });
    const c = await person("Charlie_C");
    await createVehicle(priv.id, ref);

    expect((await call(c, "POST", "/users/Alpha_Pub/follow")).json).toEqual({ mine: "accepted" });
    expect((await followRow(c, pub))?.acceptedAt).not.toBeNull();
    const asked = await call(c, "POST", "/users/Bravo_Priv/follow");
    expect(asked.json).toEqual({ mine: "pending" });
    expect(await followRow(c, priv)).toMatchObject({ status: "pending", acceptedAt: null });
    // Idempotent : une deuxième demande ne change rien.
    expect((await call(c, "POST", "/users/Bravo_Priv/follow")).json).toEqual({ mine: "pending" });
    await flush();
    const types = (await journal(priv)).map((n) => n.type);
    expect(types.filter((t) => t === "follow_request")).toHaveLength(1);
    expect((await journal(pub)).map((n) => n.type)).toContain("user_followed");

    // Une demande en attente ne donne rien de plus, ni dans les nombres.
    const seen = await call(c, "GET", "/users/Bravo_Priv");
    expect(seen.json).toMatchObject({ audience: "public_limited", bio: null, followersCount: 0 });
    expect(seen.json.follow).toEqual({ canFollow: true, mine: "pending", followsMe: false });
    expect(seen.json).not.toHaveProperty("friendsCount");
    expect(seen.json).not.toHaveProperty("friendship");

    // Les demandes reçues : moi seul, avec la pastille de la Boîte.
    const reqs = await call(priv, "GET", "/me/follow-requests");
    expect(reqs.json.total).toBe(1);
    expect(Object.keys(reqs.json.items[0]).sort()).toEqual(
      ["avatarUrl", "canFollow", "followsMe", "grade", "mine", "pseudo", "userId", "vehicle", "visibility"].sort(),
    );
    expect(reqs.json.items[0]).toMatchObject({ pseudo: "Charlie_C", mine: "none", followsMe: false });
    expect((await call(priv, "GET", "/me/inbox/summary")).json.requests.follow).toBe(1);
    expect((await call(priv, "GET", "/me/network")).json).toMatchObject({ requestsIn: 1, private: true, followers: 0 });

    // Accepter : la personne est prévenue, elle voit tout.
    const acc = await call(priv, "POST", `/me/follow-requests/${c.id}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.json).toMatchObject({ pseudo: "Charlie_C", followsMe: true });
    await flush();
    const accepted = (await journal(c)).find((n) => n.type === "follow_accepted");
    expect(accepted?.data.actor?.pseudo).toBe("Bravo_Priv");
    const full = await call(c, "GET", "/users/Bravo_Priv");
    expect(full.json).toMatchObject({ audience: "follower", bio: "secret", followersCount: 1 });
    expect(full.json.vehicles[0]).toMatchObject({ detailed: true });
    expect((await call(priv, "GET", "/me/inbox/summary")).json.requests.follow).toBe(0);
    // Elle voit « Te suit » chez lui.
    expect((await call(priv, "GET", "/users/Charlie_C")).json.follow).toMatchObject({ mine: "none", followsMe: true });
    // Une demande déjà traitée : 404.
    expect((await call(priv, "POST", `/me/follow-requests/${c.id}/accept`)).status).toBe(404);
  });

  it("refuser : la demande disparaît sans prévenir ; annuler une demande envoyée retire son alerte", async () => {
    const priv = await person("Bravo_Priv", { visibility: "private" });
    const c = await person("Charlie_C");
    const d = await person("Delta_D");
    await call(c, "POST", "/users/Bravo_Priv/follow");
    await call(d, "POST", "/users/Bravo_Priv/follow");
    await flush();
    const before = (await journal(c)).length;
    expect((await call(priv, "POST", `/me/follow-requests/${c.id}/decline`)).status).toBe(204);
    expect(await followRow(c, priv)).toBeUndefined();
    await flush();
    expect((await journal(c)).length).toBe(before);
    expect((await call(c, "GET", "/users/Bravo_Priv")).json.follow.mine).toBe("none");
    // L'alerte de la demande refusée est lue.
    const reqNotif = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, priv.id), eq(notifications.type, "follow_request")),
    });
    expect(
      reqNotif.find((n) => (n.data as { actor?: { userId: string } }).actor?.userId === c.id)?.readAt,
    ).not.toBeNull();

    // Annuler (« Demandé ») : la ligne et l'alerte disparaissent.
    expect((await call(d, "DELETE", "/users/Bravo_Priv/follow")).json).toEqual({ mine: "none" });
    expect(await followRow(d, priv)).toBeUndefined();
    const left = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, priv.id), eq(notifications.type, "follow_request")),
    });
    expect(left.some((n) => (n.data as { actor?: { userId: string } }).actor?.userId === d.id)).toBe(false);
    expect((await call(priv, "GET", "/me/follow-requests")).json.total).toBe(0);
    // Redemander dans les 24 h : la demande existe, sans nouvelle alerte.
    await call(c, "POST", "/users/Bravo_Priv/follow");
    await flush();
    const again = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, priv.id), eq(notifications.type, "follow_request")),
    });
    expect(again.filter((n) => (n.data as { actor?: { userId: string } }).actor?.userId === c.id)).toHaveLength(1);
    expect((await call(priv, "GET", "/me/follow-requests")).json.total).toBe(1);
  });

  it("passer de privé à public accepte toutes les demandes en attente", async () => {
    const priv = await person("Bravo_Priv", { visibility: "private" });
    const c = await person("Charlie_C");
    const d = await person("Delta_D");
    await call(c, "POST", "/users/Bravo_Priv/follow");
    await call(d, "POST", "/users/Bravo_Priv/follow");
    expect((await call(priv, "PATCH", "/me/settings", { visibility: "public" })).status).toBe(200);
    expect((await followRow(c, priv))?.status).toBe("accepted");
    expect((await followRow(d, priv))?.acceptedAt).not.toBeNull();
    expect((await call(priv, "GET", "/me/network")).json).toMatchObject({
      followers: 2,
      requestsIn: 0,
      private: false,
    });
    // Repasser privé ne retire personne (comme Instagram) ; un nouveau venu redemande.
    await call(priv, "PATCH", "/me/settings", { visibility: "private" });
    expect((await call(c, "GET", "/users/Bravo_Priv")).json.audience).toBe("follower");
    const e = await person("Echo_E");
    expect((await call(e, "POST", "/users/Bravo_Priv/follow")).json.mine).toBe("pending");
    // Même règle par « Modifier mon profil » (`PATCH /me/profile`).
    expect((await call(priv, "PATCH", "/me/profile", { visibility: "public" })).status).toBe(200);
    expect((await followRow(e, priv))?.status).toBe("accepted");
  });

  it("ni soi-même, ni un compte supprimé, banni ou suspendu (404) ; listes et demandes sans eux", async () => {
    const a = await person("Alpha_Pub", { visibility: "private" });
    const c = await person("Charlie_C");
    const s = await person("Sierra_S");
    expect((await call(a, "POST", "/users/Alpha_Pub/follow")).status).toBe(400);
    await call(s, "POST", "/users/Alpha_Pub/follow");
    await call(c, "POST", "/users/Alpha_Pub/follow");
    await suspendByModeration(s, "suspension_7d");
    expect((await call(a, "GET", "/me/follow-requests")).json.items.map((p: { pseudo: string }) => p.pseudo)).toEqual([
      "Charlie_C",
    ]);
    expect((await call(c, "POST", "/users/Sierra_S/follow")).status).toBe(404);
    expect((await call(a, "POST", `/me/follow-requests/${s.id}/accept`)).status).toBe(404);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, c.id));
    expect((await call(a, "GET", "/me/follow-requests")).json.total).toBe(0);
    // Les anciennes routes d'amitié n'existent plus.
    expect((await call(c, "POST", "/friends/requests", { pseudo: "Alpha_Pub" })).status).toBe(404);
    expect((await call(c, "GET", "/me/friends")).status).toBe(404);
  });
});

describe("QR de compte et lien de profil (lot R6b : suivre)", () => {
  async function qrOf(u: TestUser, at = clock.now) {
    const res = await call(u, "GET", "/me/account-qr-secret");
    const { hmacSha1 } = await import("../account-qr/service");
    return accountQrPayload(
      Buffer.from(res.json.secret, "base64url"),
      Buffer.from(res.json.shortId, "base64url"),
      at,
      hmacSha1,
    );
  }

  it("QR de compte de B scanné par C : C suit B ; rejeu, expiré, soi-même ; compte privé : demande", async () => {
    const b = await person("Bravo_B");
    const c = await person("Charlie_C");
    const payload = await qrOf(b);
    const ok = await call(c, "POST", "/follows/by-qr", { payload });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ mine: "accepted", pseudo: "Bravo_B" });

    const replay = await call(c, "POST", "/follows/by-qr", { payload });
    expect(replay.status).toBe(400);
    expect(replay.json.error.details.reason).toBe("replayed");
    const old = await qrOf(b, new Date(clock.now.getTime() - 3 * 60_000));
    expect((await call(c, "POST", "/follows/by-qr", { payload: old })).json.error.details.reason).toBe("expired");
    const bad = await call(c, "POST", "/follows/by-qr", { payload: "OR1ABCDEFGHIJKL" });
    expect(bad.json.error.details.reason).toBe("malformed");
    clock.advance(2 * 60_000);
    expect((await call(c, "POST", "/follows/by-qr", { payload: await qrOf(c) })).status).toBe(400);

    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, c.id));
    clock.advance(2 * 60_000);
    expect((await call(b, "POST", "/follows/by-qr", { payload: await qrOf(c) })).json).toEqual({
      mine: "pending",
      pseudo: "Charlie_C",
    });
  });

  it("trop de codes refusés : le lecteur est bloqué", async () => {
    const c = await person("Charlie_C");
    for (let i = 0; i < 10; i++) {
      expect((await call(c, "POST", "/follows/by-qr", { payload: "OA1AAAAAAAAAAAAAAAAAAA" })).status).toBe(400);
    }
    expect((await call(c, "POST", "/follows/by-qr", { payload: "OA1AAAAAAAAAAAAAAAAAAA" })).status).toBe(429);
  });

  it("lien de profil : suivre la personne ; jeton inconnu : 404", async () => {
    const b = await person("Bravo_B");
    const c = await person("Charlie_C");
    const token = (await db.query.profiles.findFirst({ where: eq(profiles.userId, b.id) }))!.inviteToken;
    const res = await call(c, "POST", "/follows/by-invite", { token });
    expect(res.json).toEqual({ mine: "accepted", pseudo: "Bravo_B" });
    expect((await call(c, "POST", "/follows/by-invite", { token: "inconnu-inconnu" })).status).toBe(404);
  });
});

describe("recherche de personnes", () => {
  it("par pseudo (début), par véhicule, par département, par grade ; privés réduits, supprimés et suspendus exclus", async () => {
    const me = await person("Moi_Meme");
    const a = await person("Supra_Fan", { departments: ["66", "11"] });
    const b = await person("Priv_Owner", { visibility: "private", departments: ["66"] });
    const gone = await person("Supra_Gone");
    const susp = await person("Supra_Susp");
    const e36 = await createVehicle(a.id, ref);
    await createVehicle(a.id, supra);
    await createVehicle(b.id, supra);
    await createVehicle(gone.id, supra);
    await createVehicle(susp.id, supra);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, gone.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 400 * DAY) })
      .where(eq(profiles.userId, susp.id));
    await createVehicle(me.id, supra);
    void e36;

    const none = await call(me, "GET", "/users/search");
    expect(none.status).toBe(400);
    expect((await call(me, "GET", "/users/search?q=a")).status).toBe(400);

    const byPseudo = await call(me, "GET", "/users/search?q=supra_");
    expect(byPseudo.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Supra_Fan"]);
    // Casse ignorée, jamais soi-même.
    expect((await call(me, "GET", "/users/search?q=MOI_")).json.items).toEqual([]);

    // « Supra » : les propriétaires (public complet, privé réduit), pas le supprimé, pas le suspendu, pas moi.
    const bySupra = await call(me, "GET", "/users/search?q=Supra");
    const pseudos = bySupra.json.items.map((i: { pseudo: string }) => i.pseudo);
    expect(pseudos).toContain("Priv_Owner");
    expect(pseudos).toContain("Supra_Fan");
    expect(pseudos).not.toContain("Supra_Gone");
    expect(pseudos).not.toContain("Supra_Susp");
    expect(pseudos).not.toContain("Moi_Meme");
    const priv = bySupra.json.items.find((i: { pseudo: string }) => i.pseudo === "Priv_Owner");
    expect(priv).toMatchObject({
      departments: null,
      vehicles: [{ label: "Toyota Supra" }],
      follow: { mine: "none", followsMe: false },
    });
    const pub = bySupra.json.items.find((i: { pseudo: string }) => i.pseudo === "Supra_Fan");
    expect(pub.departments).toEqual(["66", "11"]);
    expect(pub.vehicles.map((v: { label: string }) => v.label)).toContain("Toyota Supra MK4");
    expect(bySupra.text).not.toMatch(/AA-\d{3}-ZZ/);

    // Lot R4e : la version se cherche avec le modèle (« supra rz »), comme lui, pour le privé aussi.
    await db.execute(sql`update vehicles set version = 'RZ' where model_id = ${supra.modelId}`);
    const byVersion = await call(me, "GET", "/users/search?q=supra%20rz");
    const withVersion = byVersion.json.items.map((i: { pseudo: string }) => i.pseudo);
    expect(withVersion).toEqual(expect.arrayContaining(["Priv_Owner", "Supra_Fan"]));
    expect(withVersion).not.toContain("Supra_Gone");
    expect(byVersion.json.items.find((i: { pseudo: string }) => i.pseudo === "Priv_Owner").vehicles).toEqual([
      { id: expect.any(String), label: "Toyota Supra RZ" },
    ]);
    expect(
      (await call(me, "GET", "/users/search?q=toyota%20supra%20mk4%20rz")).json.items.map(
        (i: { pseudo: string }) => i.pseudo,
      ),
    ).not.toContain("Priv_Owner");
    await db.execute(sql`update vehicles set version = null`);

    // Lot R2, tour 2 (plus aucun annuaire) : un filtre seul ne liste personne, il affine une recherche par texte.
    for (const filter of [
      `generationId=${supra.generationId}`,
      `modelId=${supra.modelId}`,
      "department=11",
      "grade=route",
      `categoryId=${ref.jdm.id}`,
    ]) {
      expect((await call(me, "GET", `/users/search?${filter}`)).status, filter).toBe(400);
    }
    const found = async (query: string) =>
      (await call(me, "GET", `/users/search?q=Toyota&${query}`)).json.items
        .map((i: { pseudo: string }) => i.pseudo)
        .sort();
    // « Toyota » trouve les deux propriétaires (marque et modèle publics) ; les filtres de détail (génération, modèle,
    // département, grade, centre d'intérêt) ne portent que sur les comptes au détail visible : jamais le privé inconnu.
    expect(await found("")).toEqual(["Priv_Owner", "Supra_Fan"]);
    expect(await found(`generationId=${supra.generationId}`)).toEqual(["Supra_Fan"]);
    expect(await found(`modelId=${supra.modelId}`)).toEqual(["Supra_Fan"]);
    expect(await found("department=11")).toEqual(["Supra_Fan"]);
    expect(await found("department=66")).not.toContain("Priv_Owner");
    // Une fois amis, tout ressort pour le privé.
    await befriend(me, b);
    expect(await found("department=66")).toContain("Priv_Owner");
    expect(await found(`generationId=${supra.generationId}`)).toEqual(["Priv_Owner", "Supra_Fan"]);
    // Grade minimum.
    await db.update(profiles).set({ grade: "sport" }).where(eq(profiles.userId, a.id));
    expect(await found("grade=route")).toEqual(["Supra_Fan"]);
    // Centre d'intérêt.
    await db.insert(profileInterests).values({ userId: a.id, categoryId: ref.jdm.id });
    expect(await found(`categoryId=${ref.jdm.id}`)).toEqual(["Supra_Fan"]);
    void categories;
  });

  it("pagination par curseur, ordre alphabétique", async () => {
    const me = await person("Moi_Meme");
    for (const n of ["Pilote_C", "Pilote_A", "Pilote_B"]) await person(n);
    const p1 = await call(me, "GET", "/users/search?q=pilote&limit=2");
    expect(p1.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Pilote_A", "Pilote_B"]);
    expect(p1.json.nextCursor).toBeTruthy();
    const p2 = await call(me, "GET", `/users/search?q=pilote&limit=2&cursor=${p1.json.nextCursor}`);
    expect(p2.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Pilote_C"]);
    expect(p2.json.nextCursor).toBeNull();
  });

  it("autres propriétaires près de chez moi : même génération, départements communs, sans moi ni le propriétaire", async () => {
    const owner = await person("Alpha_Supra", { departments: ["66"] });
    const near = await person("Voisin_66", { departments: ["66", "34"] });
    const far = await person("Lointain_29", { departments: ["29"] });
    const privNear = await person("Prive_66", { visibility: "private", departments: ["66"] });
    const me = await person("Moi_66", { departments: ["66"] });
    const nowhere = await person("Sans_Secteur", { departments: [] });
    const v = await createVehicle(owner.id, supra);
    await createVehicle(near.id, supra);
    await createVehicle(far.id, supra);
    await createVehicle(privNear.id, supra);
    await createVehicle(me.id, supra);
    await createVehicle(nowhere.id, supra);

    const res = await call(me, "GET", `/vehicles/${v.id}/owners-nearby`);
    expect(res.status).toBe(200);
    expect(res.json.sector).toEqual(["66"]);
    // Voisin_66 seulement : l'éloigné n'est pas du secteur, le privé ne dévoile pas son département, moi et le propriétaire exclus.
    expect(res.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Voisin_66"]);
    // Sans secteur renseigné : rien à chercher.
    const empty = await call(nowhere, "GET", `/vehicles/${v.id}/owners-nearby`);
    expect(empty.json).toMatchObject({ items: [], sector: [] });
    // Ami du privé : il ressort.
    await befriend(me, privNear);
    expect(
      (await call(me, "GET", `/vehicles/${v.id}/owners-nearby`)).json.items
        .map((i: { pseudo: string }) => i.pseudo)
        .sort(),
    ).toEqual(["Prive_66", "Voisin_66"]);
  });

  it("propriétaires depuis la voiture d'un compte privé : recherche par modèle seulement (la génération ne fuit pas)", async () => {
    const owner = await person("Prive_Owner", { visibility: "private", departments: ["66"] });
    const me = await person("Moi_66", { departments: ["66"] });
    const other = await person("Autre_66", { departments: ["66"] });
    const v = await createVehicle(owner.id, supra);
    // Même modèle, autre génération (« Autre ») : trouvé quand on ne connaît que le modèle.
    const [otherGen] = await db
      .insert(vehicleGenerations)
      .values({ modelId: supra.modelId, name: "MK5", yearFrom: 2019 })
      .returning();
    await createVehicle(other.id, { ...supra, generationId: otherGen!.id });
    const res = await call(me, "GET", `/vehicles/${v.id}/owners-nearby`);
    expect(res.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Autre_66"]);
  });
});

describe("Journal des amis", () => {
  const form = (vehicleIds: string[]) => ({
    vehicleIds,
    rulesAccepted: true as const,
    followStructure: false,
    newsletterOptIn: false,
    companions: 0,
    message: null,
  });

  it("A retenu : « A va à … » dans le Journal de ses abonnés acceptés, une fois ; rien pour une demande", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id, { admission: "open", capacity: 5, title: "Nocturne de Canet" });
    const a = await person("Alpha_A", { visibility: "private" });
    const friend = await person("Abonne_F");
    const stranger = await person("Inconnu_I");
    const followed = await person("Suivi_S");
    // Abonné accepté (sens unique) : reçoit ; demande en attente : rien ; quelqu'un qu'A suit : rien.
    await follows(friend, a);
    await follows(stranger, a, "pending");
    await follows(a, followed);
    const v1 = await createVehicle(a.id, ref);

    await applicationsService.apply(await viewerOf(a), e.id, form([v1.id]));
    await flush();
    const items = (await journal(friend)).filter((n) => n.type === "friend_going_event");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Alpha_A va à Nocturne de Canet", readAt: null });
    expect(items[0]?.data.actor?.pseudo).toBe("Alpha_A");
    expect(items[0]?.data.link).toMatch(/^\/e\//);
    expect((await journal(stranger)).filter((n) => n.type === "friend_going_event")).toHaveLength(0);
    expect((await journal(followed)).filter((n) => n.type === "friend_going_event")).toHaveLength(0);
    expect((await journal(a)).filter((n) => n.type === "friend_going_event")).toHaveLength(0);
    // Ni push ni e-mail : jamais « livrée » par un canal, uniquement dans le Journal.
    const row = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, friend.id), eq(notifications.type, "friend_going_event")),
    });
    expect(row).toMatchObject({ pushSentAt: null, emailSentAt: null, inJournal: true });
    expect(row?.deliveredAt).toBeTruthy();
  });

  it("deux candidatures retenues de la même personne au même événement : une seule actualité", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id, { admission: "open", capacity: 5, maxVehiclesPerUser: 2 });
    const a = await person("Alpha_A");
    const friend = await person("Ami_F");
    await befriend(a, friend);
    const v1 = await createVehicle(a.id, ref);
    const v2 = await createVehicle(a.id, ref);
    await applicationsService.apply(await viewerOf(a), e.id, form([v1.id, v2.id]));
    await flush();
    expect((await journal(friend)).filter((n) => n.type === "friend_going_event")).toHaveLength(1);
  });

  it("événement sur invitation ou non publié : rien ; candidature seulement en attente : rien", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const s = await createStructure(orga.id);
    const a = await person("Alpha_A");
    const friend = await person("Ami_F");
    await befriend(a, friend);
    const v = await createVehicle(a.id, ref);
    // Sélection : en attente d'abord.
    const filtered = await createEvent(s.id, { admission: "filtered", capacity: 5 });
    const [app] = await applicationsService.apply(await viewerOf(a), filtered.id, form([v.id]));
    await flush();
    expect((await journal(friend)).filter((n) => n.type === "friend_going_event")).toHaveLength(0);
    // L'organisateur retient : l'actualité apparaît.
    await applicationsService.decide(await viewerOf(orga), filtered.id, app!.id, {
      decision: "accept",
      sendReasons: true,
    } as never);
    await flush();
    expect((await journal(friend)).filter((n) => n.type === "friend_going_event")).toHaveLength(1);
    // Événement sur invitation.
    const priv = await createEvent(s.id, { admission: "invite_only", capacity: 5 });
    const row = await db
      .insert(applications)
      .values({
        eventId: priv.id,
        userId: a.id,
        vehicleId: v.id,
        status: "pending",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    await db.transaction((tx) =>
      applicationsService.transition(tx, row[0]!, "accepted", { kind: "organizer", userId: orga.id }),
    );
    await flush();
    expect((await journal(friend)).filter((n) => n.type === "friend_going_event")).toHaveLength(1);
  });

  it("nouveau véhicule : annoncé aux abonnés acceptés d'un profil public, pas d'un profil privé ; une seule fois", async () => {
    const pub = await person("Alpha_Pub");
    const priv = await person("Bravo_Priv", { visibility: "private" });
    const friend = await person("Ami_F");
    await befriend(pub, friend);
    await befriend(priv, friend);
    const body = (makeId: string, modelId: string) => ({
      vehicleType: "car",
      makeId,
      modelId,
      year: 1995,
      plate: "AB-123-CD",
      unregistered: false,
      status: "active",
      categoryIds: [],
    });
    const created = await call(pub, "POST", "/me/vehicles", body(ref.makeId, ref.modelId));
    expect(created.status).toBe(201);
    const second = await call(priv, "POST", "/me/vehicles", { ...body(ref.makeId, ref.modelId), plate: "ZZ-999-ZZ" });
    expect(second.status).toBe(201);
    await flush();
    const items = (await journal(friend)).filter((n) => n.type === "friend_new_vehicle");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Alpha_Pub a ajouté BMW Série 3 à son garage");
    expect(items[0]?.data.link).toBe(`/v/${created.json.id}`);
    // Rejouer l'annonce ne double rien.
    const { socialJournal } = await import("./journal");
    expect(await socialJournal.friendNewVehicle(pub.id, created.json.id)).toBe(0);
  });

  it("fenêtre de 7 jours sauf non lues ; seulement in_journal ; pastille de la cloche", async () => {
    const u = await person("Alpha_A");
    // La notification de sécurité de l'inscription est lue : elle ne fausse pas le compte.
    await call(u, "POST", "/me/notifications/read", { all: true });
    const base = {
      userId: u.id,
      family: "social" as const,
      title: "t",
      body: "b",
      deliverAfter: new Date(),
      deliveredAt: new Date(),
    };
    // La fenêtre se calcule sur l'horloge figée du fichier (17/10), pas sur la vraie date.
    const old = new Date(clock.now.getTime() - 10 * DAY);
    await db.insert(notifications).values([
      { ...base, type: "friend_request", title: "ancienne lue", createdAt: old, readAt: old },
      { ...base, type: "friend_request", title: "ancienne non lue", createdAt: old },
      { ...base, type: "friend_request", title: "récente lue", readAt: new Date() },
      { ...base, type: "friend_request", title: "récente" },
      { ...base, type: "friend_request", title: "push seul", inJournal: false },
    ]);
    const titles = (await journal(u))
      .filter((n) => n.type === "friend_request")
      .map((n) => n.title)
      .sort();
    expect(titles).toEqual(["ancienne non lue", "récente", "récente lue"]);
    // Cloche : les non lues du Journal (ni le push seul, ni rien d'autre).
    const me = await call(u, "GET", "/me");
    expect(me.json.counts.unreadNotifications).toBe(2);
  });
});

describe("compte supprimé", () => {
  it("abonnements et demandes disparaissent dans les deux sens, les nombres des autres suivent", async () => {
    const a = await person("Alpha_A");
    const b = await person("Bravo_B");
    const c = await person("Charlie_C", { visibility: "private" });
    await befriend(a, b);
    await follows(a, c, "pending");
    await follows(b, c, "pending");
    await db.transaction((tx) => anonymizeSocialForDeletedAccount(tx, a.id));
    const left = await db.select().from(userFollows);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ followerId: b.id, followedId: c.id, status: "pending" });
    expect((await call(b, "GET", "/me/network")).json).toMatchObject({ followers: 0, following: 0 });
    expect((await call(c, "GET", "/me/network")).json).toMatchObject({ requestsIn: 1 });
  });
});

describe("relecture de confidentialité (lot 17)", () => {
  const apply = async (userId: string, eventId: string, status: "pending" | "accepted" | "refused" | "withdrawn") => {
    const v = await createVehicle(userId, ref);
    await db
      .insert(applications)
      .values({ eventId, userId, vehicleId: v.id, status, rulesAcceptedAt: new Date(), followStructure: false });
  };
  const setup = async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const s = await createStructure(orga.id);
    const k = await person("Kenji_66", { visibility: "private" });
    await db.update(profiles).set({ firstName: "Kenji", phone: "0600000000" }).where(eq(profiles.userId, k.id));
    return { orga, s, k };
  };
  const audience = async (orga: TestUser) => (await call(orga, "GET", "/users/Kenji_66")).json.audience;

  it("organisateur : candidature en cours seulement, événement non fini depuis plus de 7 jours, structure en règle", async () => {
    const { orga, s, k } = await setup();
    const future = await createEvent(s.id, { admission: "open" });
    // Candidature refusée, retirée : rien.
    await apply(k.id, future.id, "refused");
    expect(await audience(orga)).toBe("public_limited");
    await db.delete(applications);
    await apply(k.id, future.id, "withdrawn");
    expect(await audience(orga)).toBe("public_limited");
    // Candidature en cours : coordonnées visibles.
    await db.delete(applications);
    await apply(k.id, future.id, "pending");
    expect(await audience(orga)).toBe("organizer");
    // Structure suspendue ou supprimée : rien.
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s.id));
    expect(await audience(orga)).toBe("public_limited");
    await db.update(structures).set({ verification: "verified", deletedAt: new Date() }).where(eq(structures.id, s.id));
    expect(await audience(orga)).toBe("public_limited");
    await db.update(structures).set({ deletedAt: null }).where(eq(structures.id, s.id));
    expect(await audience(orga)).toBe("organizer");
  });

  it("organisateur : un événement fini depuis plus de 7 jours n'ouvre plus rien, un événement fini il y a 3 jours oui ; l'abonné reste visible", async () => {
    const { orga, s, k } = await setup();
    const day = 86_400_000;
    const old = await createEvent(s.id, {
      admission: "open",
      startsAt: new Date(clock.now.getTime() - 9 * day),
      endsAt: new Date(clock.now.getTime() - 8 * day),
    });
    await apply(k.id, old.id, "accepted");
    expect(await audience(orga)).toBe("public_limited");
    const recent = await createEvent(s.id, {
      admission: "open",
      startsAt: new Date(clock.now.getTime() - 4 * day),
      endsAt: new Date(clock.now.getTime() - 3 * day),
    });
    await apply(k.id, recent.id, "accepted");
    expect(await audience(orga)).toBe("organizer");
    await db.delete(applications);
    expect(await audience(orga)).toBe("public_limited");
    // Abonné de la structure : visible, sans limite de temps.
    await db.execute(
      sql`insert into structure_follows (structure_id, user_id, source) values (${s.id}, ${k.id}, 'manual')`,
    );
    expect(await audience(orga)).toBe("organizer");
  });

  it("suspendus : pas de demande vers eux, absents des demandes reçues, aucune actualité émise", async () => {
    const b = await person("Bravo_B");
    const c = await person("Charlie_C", { visibility: "private" });
    const d = await person("Delta_D");
    // Lot 32 : suspension par la vraie route de la modération.
    await suspendByModeration(b);
    expect((await call(c, "POST", "/users/Bravo_B/follow")).status).toBe(404);
    // Demande reçue d'un compte devenu suspendu : n'apparaît plus.
    await call(d, "POST", "/users/Charlie_C/follow");
    expect((await call(c, "GET", "/me/follow-requests")).json.items).toHaveLength(1);
    await suspendByModeration(d);
    expect((await call(c, "GET", "/me/follow-requests")).json.items).toEqual([]);
    expect((await call(c, "GET", "/me/inbox/summary")).json.requests.follow).toBe(0);
    // Un suspendu qui a des abonnés ne produit aucune actualité.
    const { socialJournal } = await import("./journal");
    await follows(c, d);
    await createVehicle(d.id, ref);
    const v = (await db.query.vehicles.findFirst({ where: (t, { eq: e }) => e(t.ownerId, d.id) }))!;
    expect(await socialJournal.friendNewVehicle(d.id, v.id)).toBe(0);
  });

  it("anonymisation : les notifications des autres qui le citent disparaissent, et l'archive des amitiés aussi", async () => {
    const b = await person("Bravo_B", { visibility: "private" });
    const c = await person("Charlie_C");
    const e = await person("Echo_E");
    await call(c, "POST", "/users/Bravo_B/follow");
    await befriend(c, e);
    // Archive d'avant le lot R6b : plus lue, mais ses lignes sont des données personnelles.
    await db.insert(friendships).values({ requesterId: c.id, addresseeId: e.id, status: "accepted" });
    await flush();
    expect((await journal(b)).some((n) => n.type === "follow_request" && n.data.actor?.pseudo === "Charlie_C")).toBe(
      true,
    );
    await db.transaction((tx) => anonymizeSocialForDeletedAccount(tx, c.id));
    expect((await journal(b)).some((n) => n.data.actor?.userId === c.id)).toBe(false);
    expect(await db.select().from(friendships)).toHaveLength(0);
    expect(await db.select().from(userFollows)).toHaveLength(0);
  });

  it("recherche : le texte cherche aussi dans le pseudo quand un filtre de marque est posé", async () => {
    const me = await person("Moi_Meme");
    const a = await person("Supra_Fan");
    const o = await person("Supra_Autre");
    await createVehicle(a.id, supra);
    await createVehicle(o.id, ref);
    const res = await call(me, "GET", `/users/search?q=supra&makeId=${supra.makeId}`);
    expect(res.json.items.map((i: { pseudo: string }) => i.pseudo)).toEqual(["Supra_Fan"]);
  });
});
