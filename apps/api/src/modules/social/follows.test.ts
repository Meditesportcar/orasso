// Lot R4c : véhicule principal, suivre une personne, listes du réseau (vie privée), aperçu du profil public.
import { fromWallTime } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  suspendByModeration,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { friendships, notifications, profiles, structureFollows, userFollows, vehicles } from "../../db/schema";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { anonymizeSocialForDeletedAccount } from "./anonymize";
import { socialRepo } from "./repo";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
  ref = await seedReference();
});

async function person(pseudo: string, visibility: "public" | "private" = "public") {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ visibility, departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

async function befriend(a: TestUser, b: TestUser) {
  await db
    .insert(friendships)
    .values({ requesterId: a.id, addresseeId: b.id, status: "accepted", respondedAt: new Date() });
  await socialRepo.recountFriends([a.id, b.id]);
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe("véhicule principal", () => {
  it("par défaut le plus ancien ; « Mettre en avant » le passe en tête du garage, du profil et de /me", async () => {
    const a = await person("Main_A");
    const v1 = await createVehicle(a.id, ref, { createdAt: minutesAgo(30) });
    const v2 = await createVehicle(a.id, ref, { createdAt: minutesAgo(10) });
    expect(((await call(a, "GET", "/me")).json as { profile: { mainVehicleId: string } }).profile.mainVehicleId).toBe(
      v1.id,
    );
    expect((await call(a, "GET", "/me/vehicles")).json.map((v: { id: string }) => v.id)).toEqual([v1.id, v2.id]);

    const put = await call(a, "PUT", "/me/main-vehicle", { vehicleId: v2.id });
    expect(put.status).toBe(200);
    expect((await call(a, "GET", "/me/vehicles")).json.map((v: { id: string }) => v.id)).toEqual([v2.id, v1.id]);
    expect(((await call(a, "GET", "/me")).json as { profile: { mainVehicleId: string } }).profile.mainVehicleId).toBe(
      v2.id,
    );
    const b = await person("Main_B");
    const seen = await call(b, "GET", "/users/Main_A");
    expect(seen.json.vehicles.map((v: { id: string; main: boolean }) => [v.id, v.main])).toEqual([
      [v2.id, true],
      [v1.id, false],
    ]);
  });

  it("seulement un véhicule actif à soi ; un principal archivé ou supprimé cède sa place au plus ancien", async () => {
    const a = await person("Main_C");
    const b = await person("Main_D");
    const v1 = await createVehicle(a.id, ref, { createdAt: minutesAgo(30) });
    const v2 = await createVehicle(a.id, ref, { createdAt: minutesAgo(20) });
    const v3 = await createVehicle(a.id, ref, { createdAt: minutesAgo(10) });
    const other = await createVehicle(b.id, ref);
    expect((await call(a, "PUT", "/me/main-vehicle", { vehicleId: other.id })).status).toBe(404);
    expect((await call(a, "PUT", "/me/main-vehicle", { vehicleId: "nope" })).status).toBe(400);

    await call(a, "PUT", "/me/main-vehicle", { vehicleId: v3.id });
    await db.update(vehicles).set({ status: "sold", archivedAt: new Date() }).where(eq(vehicles.id, v3.id));
    expect((await call(a, "PUT", "/me/main-vehicle", { vehicleId: v3.id })).status).toBe(409);
    const me = async () => ((await call(a, "GET", "/me")).json as { profile: { mainVehicleId: string } }).profile;
    expect((await me()).mainVehicleId).toBe(v1.id);

    await call(a, "PUT", "/me/main-vehicle", { vehicleId: v1.id });
    expect((await call(a, "DELETE", `/me/vehicles/${v1.id}`)).status).toBe(204);
    expect((await me()).mainVehicleId).toBe(v2.id);
    expect((await db.query.profiles.findFirst({ where: eq(profiles.userId, a.id) }))?.mainVehicleId).toBeNull();
  });
});

describe("suivre une personne", () => {
  it("suivre un compte public : idempotent, nombres visibles, « Suivi » sur son profil, ne plus suivre", async () => {
    const a = await person("Fol_A");
    const b = await person("Fol_B");
    expect((await call(a, "POST", "/users/Fol_B/follow")).json).toEqual({ following: true });
    expect((await call(a, "POST", "/users/fol_b/follow")).status).toBe(200);
    const seen = await call(a, "GET", "/users/Fol_B");
    expect(seen.json).toMatchObject({
      followersCount: 1,
      followingCount: 0,
      follow: { canFollow: true, following: true },
    });
    expect((await call(b, "GET", "/users/Fol_A")).json).toMatchObject({
      followersCount: 0,
      followingCount: 1,
      follow: { following: false },
    });
    expect((await call(a, "DELETE", "/users/Fol_B/follow")).json).toEqual({ following: false });
    expect((await call(a, "GET", "/users/Fol_B")).json).toMatchObject({
      followersCount: 0,
      follow: { following: false },
    });
  });

  it("compte privé : pas de « Suivre » (403), nombres visibles de tout membre, profil sans compte refusé", async () => {
    const a = await person("Priv_A");
    const p = await person("Priv_P", "private");
    const f = await person("Priv_F");
    await befriend(p, f);
    const refused = await call(a, "POST", "/users/Priv_P/follow");
    expect(refused.status).toBe(403);
    expect(await db.select().from(userFollows)).toHaveLength(0);
    // Damien, 24/10 : les nombres sont visibles de tout membre connecté, même d'un compte privé.
    const stranger = await call(a, "GET", "/users/Priv_P");
    expect(stranger.json).toMatchObject({
      followersCount: 0,
      followingCount: 0,
      friendsCount: 1,
      outingsCount: 0,
      follow: { canFollow: false, following: false },
    });
    // Le reste du profil privé reste réservé aux amis.
    expect(stranger.json).toMatchObject({ audience: "public_limited", upcomingEvents: null, crews: null, bio: null });
    expect((await call(null, "GET", "/users/Priv_P")).status).toBe(401);
    // Un ami voit les nombres ; « Suivre » n'existe toujours pas vers un compte privé (même pour un ami).
    const friend = await call(f, "GET", "/users/Priv_P");
    expect(friend.json).toMatchObject({
      followersCount: 0,
      followingCount: 0,
      friendsCount: 1,
      follow: { canFollow: false },
    });
    expect((await call(f, "POST", "/users/Priv_P/follow")).status).toBe(403);
  });

  it("jamais soi-même ; compte suspendu ou banni exclu des suivis, des listes et des nombres", async () => {
    const a = await person("Self_A");
    const s = await person("Susp_S");
    expect((await call(a, "POST", "/users/Self_A/follow")).status).toBe(400);
    expect((await call(a, "GET", "/users/Self_A")).json.follow.canFollow).toBe(false);
    await call(s, "POST", "/users/Self_A/follow");
    expect((await call(a, "GET", "/me/network")).json.followers).toBe(1);
    await suspendByModeration(s);
    expect((await call(a, "POST", "/users/Susp_S/follow")).status).toBe(404);
    expect((await call(a, "GET", "/me/network")).json.followers).toBe(0);
    expect((await call(a, "GET", "/me/followers")).json.items).toEqual([]);
  });

  it("les listes ne sont visibles que par soi : aucune route ne donne celles d'un autre", async () => {
    const a = await person("List_A");
    const b = await person("List_B");
    await call(a, "POST", "/users/List_B/follow");
    // `/me/...` répond toujours pour la personne connectée : B voit A dans ses abonnés, A ne voit rien chez lui.
    expect((await call(b, "GET", "/me/followers")).json.items.map((p: { pseudo: string }) => p.pseudo)).toEqual([
      "List_A",
    ]);
    expect((await call(a, "GET", "/me/followers")).json.items).toEqual([]);
    for (const path of ["/users/List_B/followers", "/users/List_B/following", "/users/List_B/friends"]) {
      expect((await call(a, "GET", path)).status).toBe(404);
    }
    expect((await call(null, "GET", "/me/followers")).status).toBe(401);
    // Le profil d'un autre ne contient aucune liste, seulement des nombres.
    const view = (await call(a, "GET", "/users/List_B")).json as Record<string, unknown>;
    expect(Object.keys(view).filter((k) => /follower|following/i.test(k))).toEqual([
      "followersCount",
      "followingCount",
    ]);
  });

  it("listes : « Suivre aussi » / « Suivi », amis, groupes, recherche, pagination par 30", async () => {
    const me = await person("Net_Me");
    const lea = await person("Net_Lea");
    const priv = await person("Net_Priv", "private");
    await befriend(me, lea);
    await call(lea, "POST", "/users/Net_Me/follow");
    await call(priv, "POST", "/users/Net_Me/follow");
    await call(me, "POST", "/users/Net_Lea/follow");
    const s = await createStructure((await signUp("Orga_Net")).id);
    await db.insert(structureFollows).values({ structureId: s.id, userId: me.id, source: "manual" });

    const fol = (await call(me, "GET", "/me/followers")).json;
    expect(fol.total).toBe(2);
    const byPseudo = Object.fromEntries(fol.items.map((p: { pseudo: string }) => [p.pseudo, p]));
    expect(byPseudo.Net_Lea).toMatchObject({ friend: true, following: true, canFollow: true });
    expect(byPseudo.Net_Priv).toMatchObject({ friend: false, following: false, canFollow: false });

    const net = (await call(me, "GET", "/me/network")).json;
    expect(net).toMatchObject({
      followers: 2,
      following: 2,
      friends: 1,
      followingBy: { people: 1, structures: 1, pros: 0 },
    });
    expect((await call(me, "GET", "/me/following?kind=structures")).json.items[0]).toMatchObject({
      name: "Club de test",
    });
    expect(
      (await call(me, "GET", "/me/followers?q=net_l")).json.items.map((p: { pseudo: string }) => p.pseudo),
    ).toEqual(["Net_Lea"]);
    expect((await call(me, "GET", "/me/friends?q=zz")).json.items).toEqual([]);

    // 32 abonnés de plus : une page de 30, puis la suite.
    for (let i = 0; i < 32; i++) {
      const u = await signUp(`Pg_${String(i).padStart(2, "0")}`);
      await db.insert(userFollows).values({ followerId: u.id, followedId: me.id, createdAt: minutesAgo(100 + i) });
    }
    const p1 = (await call(me, "GET", "/me/followers")).json;
    expect(p1.items).toHaveLength(30);
    expect(p1.total).toBe(34);
    const p2 = (await call(me, "GET", `/me/followers?cursor=${p1.nextCursor}`)).json;
    expect(p2.items).toHaveLength(4);
    expect(p2.nextCursor).toBeNull();
    const all = [...p1.items, ...p2.items].map((p: { userId: string }) => p.userId);
    expect(new Set(all).size).toBe(34);
  });

  it("notification « … te suit » regroupée, une seule par paire et par 24 h, coupée avec la famille social", async () => {
    const target = await person("Notif_T");
    const k = await person("Kenji_R4c");
    const l = await person("Lea_R4c");
    const m = await person("Marc_R4c");
    await call(k, "POST", "/users/Notif_T/follow");
    await call(k, "DELETE", "/users/Notif_T/follow");
    await call(k, "POST", "/users/Notif_T/follow");
    const rows = () => db.select().from(notifications).where(eq(notifications.type, "user_followed"));
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]?.body).toBe("Kenji_R4c te suit.");
    await call(l, "POST", "/users/Notif_T/follow");
    await call(m, "POST", "/users/Notif_T/follow");
    const grouped = await rows();
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.body).toBe("Marc_R4c et 2 autres personnes te suivent.");
    await notificationsService.flush();

    // Famille « social » coupée : la ligne reste au Journal, rien n'est livré en direct.
    const quiet = await person("Notif_Q");
    await call(quiet, "PATCH", "/me/profile", {
      notificationPrefs: { application: true, event: true, social: false, grade: true },
    });
    await call(k, "POST", "/users/Notif_Q/follow");
    await notificationsService.deliverDue();
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, quiet.id));
    expect(row?.pushSentAt ?? null).toBeNull();
    expect(row?.emailSentAt ?? null).toBeNull();
  });

  it("compte supprimé : ses suivis disparaissent dans les deux sens, et les alertes qui le citent", async () => {
    const a = await person("Del_A");
    const b = await person("Del_B");
    await call(a, "POST", "/users/Del_B/follow");
    await call(b, "POST", "/users/Del_A/follow");
    await withTx((tx) => anonymizeSocialForDeletedAccount(tx, a.id));
    expect(await db.select().from(userFollows)).toHaveLength(0);
    expect(
      await db
        .select()
        .from(notifications)
        .where(sql`${notifications.data} -> 'actorIds' @> jsonb_build_array(${a.id}::text)`),
    ).toHaveLength(0);
  });
});

describe("tour 2 : nombres, comptes indisponibles, concurrence, export", () => {
  it("nombres d'un compte privé : membre, ami et organisateur les voient ; listes toujours à soi seul", async () => {
    const p = await person("T2_Prive", "private");
    const member = await person("T2_Membre");
    const orgaUser = await person("T2_Orga");
    const s = await createStructure(orgaUser.id);
    await db.insert(structureFollows).values({ structureId: s.id, userId: p.id, source: "manual" });
    const asOrga = (await call(orgaUser, "GET", "/users/T2_Prive")).json;
    expect(asOrga.audience).toBe("organizer");
    expect(asOrga).toMatchObject({ followersCount: 0, followingCount: 1, friendsCount: 0 });
    expect((await call(member, "GET", "/users/T2_Prive")).json).toMatchObject({
      followersCount: 0,
      followingCount: 1,
      friendsCount: 0,
      outingsCount: 0,
    });
    await befriend(p, member);
    expect((await call(member, "GET", "/users/T2_Prive")).json).toMatchObject({ friendsCount: 1 });
    await person("T2_Public");
    expect((await call(member, "GET", "/users/T2_Public")).json).toMatchObject({ followersCount: 0, friendsCount: 0 });
    expect((await call(member, "GET", "/users/T2_Prive/followers")).status).toBe(404);
  });

  it("compte suspendu : pas de « Suivre », « ne plus suivre » en 404 ; compte devenu privé : on peut le quitter", async () => {
    const a = await person("T2_A");
    const s = await person("T2_Susp");
    const p = await person("T2_DevPrive");
    await call(a, "POST", "/users/T2_Susp/follow");
    await call(a, "POST", "/users/T2_DevPrive/follow");
    await suspendByModeration(s);
    // Lot R5b, tour 2 (relectures Codex 1, Opus 7) : le profil d'un compte suspendu répond 404, comme un inconnu.
    expect((await call(a, "GET", "/users/T2_Susp")).status).toBe(404);
    expect((await call(a, "DELETE", "/users/T2_Susp/follow")).status).toBe(404);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, p.id));
    expect((await call(a, "DELETE", "/users/T2_DevPrive/follow")).json).toEqual({ following: false });
  });

  it("31 organisateurs suivis au même instant : deux pages, aucun perdu ni répété (curseur à la milliseconde)", async () => {
    const me = await person("T2_Pages");
    const owner = await signUp("T2_Owner");
    const ids: string[] = [];
    for (let i = 0; i < 31; i++) ids.push((await createStructure(owner.id)).id);
    const at = new Date();
    await db
      .insert(structureFollows)
      .values(ids.map((structureId) => ({ structureId, userId: me.id, source: "manual" as const, createdAt: at })));
    const p1 = (await call(me, "GET", "/me/following?kind=structures")).json;
    expect(p1.items).toHaveLength(30);
    const p2 = (await call(me, "GET", `/me/following?kind=structures&cursor=${p1.nextCursor}`)).json;
    expect(p2.items).toHaveLength(1);
    expect(new Set([...p1.items, ...p2.items].map((x: { id: string }) => x.id)).size).toBe(31);
  });

  it("amis : un compte banni ou suspendu n'est ni listé ni compté", async () => {
    const a = await person("T2_Amis");
    const b = await person("T2_Banni");
    const c = await person("T2_Ok");
    await befriend(a, b);
    await befriend(a, c);
    await suspendByModeration(b, "ban");
    expect((await call(a, "GET", "/me/friends")).json.items.map((f: { pseudo: string }) => f.pseudo)).toEqual([
      "T2_Ok",
    ]);
    expect((await call(a, "GET", "/me/network")).json.friends).toBe(1);
  });

  it("suivis simultanés : une seule notification regroupée", async () => {
    const t = await person("T2_Cible");
    const fans = await Promise.all(["T2_F1", "T2_F2", "T2_F3"].map((x) => person(x)));
    await Promise.all(fans.map((f) => call(f, "POST", "/users/T2_Cible/follow")));
    const rows = await db.select().from(notifications).where(eq(notifications.userId, t.id));
    expect(rows.filter((r) => r.type === "user_followed")).toHaveLength(1);
    expect(rows[0]?.body).toMatch(/et 2 autres personnes te suivent\.$/);
  });

  it("l'export des données contient abonnements, abonnés et amitiés ; un refus reste silencieux", async () => {
    const a = await person("T2_Export");
    const b = await person("T2_Suivi");
    const c = await person("T2_Refus");
    await call(a, "POST", "/users/T2_Suivi/follow");
    await call(b, "POST", "/users/T2_Export/follow");
    await db
      .insert(friendships)
      .values({ requesterId: a.id, addresseeId: c.id, status: "declined", respondedAt: new Date() });
    const net = (await call(a, "GET", "/me/export")).json.network;
    expect(net.following.map((x: { pseudo: string }) => x.pseudo)).toEqual(["T2_Suivi"]);
    expect(net.followers.map((x: { pseudo: string }) => x.pseudo)).toEqual(["T2_Suivi"]);
    expect(net.friendships).toEqual([
      expect.objectContaining({ pseudo: "T2_Refus", status: "pending", requestedByMe: true }),
    ]);
  });

  it("aperçu : chaque élément visible correspond à un champ de GET /users/:pseudo pour ce regard", async () => {
    const pub = await person("T2_Apercu");
    const other = await person("T2_Regard");
    const preview = (await call(pub, "GET", "/me/public-preview?as=member")).json;
    const seen = (await call(other, "GET", "/users/T2_Apercu")).json;
    for (const key of [
      "upcomingEvents",
      "pastEvents",
      "crews",
      "followersCount",
      "followingCount",
      "friendsCount",
      "departments",
      "bio",
    ]) {
      expect(preview[key], key).toEqual(seen[key]);
    }
    // Compte public : les sorties à venir et le crew sont visibles de tout membre (le texte de l'aperçu le dit).
    expect(Array.isArray(preview.upcomingEvents)).toBe(true);
    expect(Array.isArray(preview.crews)).toBe(true);
  });
});

describe("aperçu de mon profil public", () => {
  it("vu par un membre ou par un ami ; jamais les coordonnées ; boutons d'un autre", async () => {
    const p = await person("Prev_P", "private");
    await createVehicle(p.id, ref);
    const member = (await call(p, "GET", "/me/public-preview")).json;
    expect(member).toMatchObject({ audience: "public_limited", followersCount: 0, contact: null });
    expect(member.vehicles[0]).toMatchObject({ detailed: false, photoUrl: null });
    const friend = (await call(p, "GET", "/me/public-preview?as=friend")).json;
    expect(friend).toMatchObject({
      audience: "friend",
      followersCount: 0,
      contact: null,
      friendship: { state: "friends" },
    });
    expect(friend.vehicles[0].detailed).toBe(true);
    await db.update(profiles).set({ visibility: "public" }).where(eq(profiles.userId, p.id));
    const pub = (await call(p, "GET", "/me/public-preview?as=member")).json;
    expect(pub).toMatchObject({
      audience: "public_full",
      followersCount: 0,
      follow: { canFollow: true, following: false },
    });
    expect((await call(p, "GET", "/me/public-preview?as=organizer")).status).toBe(400);
  });
});
