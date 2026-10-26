// Lot R5b (maquettes R5.4, R5.5, R5.6) : réseaux du profil (règle partagée, visibilité, export, suppression), photo
// retirée, prochaine sortie avec « Toi aussi », « Vu à » (tampons de la saison). Chaque regard est vérifié : soi-même,
// ami, membre (compte public, compte privé), organisateur, aperçu, visiteur sans compte.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
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
import { applications, events, friendships, profiles } from "../../db/schema";
import { passportService } from "../passport/service";
import { socialRepo } from "./repo";

afterAll(async () => {
  await pool.end();
});

const DAY = 86_400_000;
let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 17, hour: 15, minute: 0 }));
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

async function apply(u: TestUser, eventId: string, status: "pending" | "accepted" | "refused" | "withdrawn") {
  const v = await createVehicle(u.id, ref);
  await db.insert(applications).values({
    eventId,
    userId: u.id,
    vehicleId: v.id,
    status,
    rulesAcceptedAt: new Date(),
    followStructure: false,
  });
}

const SOCIALS = {
  instagram: "https://www.instagram.com/kenji.supra/",
  tiktok: "@kenji66.drift",
  youtube: "",
  facebook: null,
  snapchat: "kenji66",
};

describe("réseaux du profil", () => {
  it("PATCH /me/profile : pseudos propres, lien de profil ramené au pseudo, vide retiré ; /me les rend", async () => {
    const k = await person("Kenji_R5");
    const res = await call(k, "PATCH", "/me/profile", { socials: SOCIALS });
    expect(res.status).toBe(200);
    expect(res.json.profile.socials).toEqual({
      instagram: "kenji.supra",
      tiktok: "kenji66.drift",
      snapchat: "kenji66",
    });
    const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, k.id) });
    expect(row?.socials).toEqual({ instagram: "kenji.supra", tiktok: "kenji66.drift", snapchat: "kenji66" });
    // Remplace tout : un réseau absent est retiré.
    const again = await call(k, "PATCH", "/me/profile", { socials: { youtube: "@kenji66" } });
    expect(again.json.profile.socials).toEqual({ youtube: "kenji66" });
    // Les autres champs ne touchent pas aux réseaux.
    await call(k, "PATCH", "/me/profile", { bio: "Supra et glisse" });
    expect((await call(k, "GET", "/me")).json.profile.socials).toEqual({ youtube: "kenji66" });
  });

  it("refus expliqué : publication, autre site, adresse libre ; rien n'est enregistré", async () => {
    const k = await person("Kenji_R5b");
    await call(k, "PATCH", "/me/profile", { socials: { instagram: "kenji.supra" } });
    const post = await call(k, "PATCH", "/me/profile", {
      socials: { instagram: "https://www.instagram.com/p/C1abc/", tiktok: "kenji" },
    });
    expect(post.status).toBe(400);
    expect(post.json.error.details.fields["socials.instagram"]).toBe(
      "Ce lien mène à une publication. Mets ton pseudo Instagram, par exemple kenji.supra.",
    );
    const other = await call(k, "PATCH", "/me/profile", { socials: { facebook: "https://evil.example/kenji" } });
    expect(other.json.error.details.fields["socials.facebook"]).toMatch(/autre site/);
    const free = await call(k, "PATCH", "/me/profile", { socials: { snapchat: "javascript://x" } });
    expect(free.status).toBe(400);
    const unknown = await call(k, "PATCH", "/me/profile", { socials: { myspace: "kenji" } });
    expect(unknown.status).toBe(400);
    const tooLong = await call(k, "PATCH", "/me/profile", { socials: { instagram: "a".repeat(301) } });
    expect(tooLong.status).toBe(400);
    expect((await call(k, "GET", "/me")).json.profile.socials).toEqual({ instagram: "kenji.supra" });
  });

  it("visibles du profil complet : compte public (membres), compte privé (amis, organisateur) ; jamais sans compte", async () => {
    const pub = await person("Pub_R5");
    const priv = await person("Priv_R5", "private");
    const member = await person("Membre_R5");
    const friend = await person("Ami_R5");
    const orga = await person("Orga_R5");
    for (const u of [pub, priv]) await call(u, "PATCH", "/me/profile", { socials: { instagram: "kenji.supra" } });
    await befriend(friend, priv);
    // Organisateur : le compte privé candidate à un de ses événements.
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id);
    await apply(priv, e.id, "pending");

    const seen = async (viewer: TestUser | null, pseudo: string) => {
      const r = await call(viewer, "GET", `/users/${pseudo}`);
      return { status: r.status, socials: r.json?.socials };
    };
    expect(await seen(member, "Pub_R5")).toEqual({ status: 200, socials: { instagram: "kenji.supra" } });
    expect(await seen(pub, "Pub_R5")).toEqual({ status: 200, socials: { instagram: "kenji.supra" } });
    expect(await seen(member, "Priv_R5")).toEqual({ status: 200, socials: null });
    expect(await seen(friend, "Priv_R5")).toEqual({ status: 200, socials: { instagram: "kenji.supra" } });
    expect(await seen(orga, "Priv_R5")).toEqual({ status: 200, socials: { instagram: "kenji.supra" } });
    expect((await seen(null, "Pub_R5")).status).toBe(401);
    // Aperçu de son profil : vu par un membre (privé : rien), vu par un ami (tout).
    expect((await call(priv, "GET", "/me/public-preview?as=member")).json.socials).toBeNull();
    expect((await call(priv, "GET", "/me/public-preview?as=friend")).json.socials).toEqual({
      instagram: "kenji.supra",
    });
    expect((await call(pub, "GET", "/me/public-preview?as=member")).json.socials).toEqual({ instagram: "kenji.supra" });
  });

  it("export des données : les réseaux y sont ; suppression du compte : ils partent", async () => {
    const k = await person("Kenji_R5c");
    await call(k, "PATCH", "/me/profile", { socials: { instagram: "kenji.supra", snapchat: "kenji66" } });
    const exported = await call(k, "GET", "/me/export");
    expect(exported.json.profile.socials).toEqual({ instagram: "kenji.supra", snapchat: "kenji66" });
    // Suppression (mot de passe de l'inscription des tests).
    const del = await call(k, "DELETE", "/me", { password: "motdepasse-test-123" });
    expect(del.status).toBe(200);
    const row = await db.query.profiles.findFirst({ where: eq(profiles.userId, k.id) });
    expect(row?.socials).toEqual({});
  });
});

describe("photo de profil retirée", () => {
  it("DELETE /me/avatar : l'initiale revient, deux fois sans erreur ; connexion exigée", async () => {
    const k = await person("Kenji_R5d");
    await db.update(profiles).set({ avatarKey: "avatars/test/photo.webp" }).where(eq(profiles.userId, k.id));
    expect((await call(k, "GET", "/me")).json.profile.avatarUrl).not.toBeNull();
    expect((await call(k, "DELETE", "/me/avatar")).status).toBe(204);
    expect((await call(k, "GET", "/me")).json.profile.avatarUrl).toBeNull();
    expect((await call(k, "DELETE", "/me/avatar")).status).toBe(204);
    expect((await call(null, "DELETE", "/me/avatar")).status).toBe(401);
  });
});

describe("prochaine sortie et « Toi aussi »", () => {
  it("la première sortie à venir ; « Toi aussi » pour qui y va (candidature en cours ou billet), jamais dans l'aperçu", async () => {
    const julie = await person("Julie_R5");
    const kenji = await person("Kenji_R5e");
    const lea = await person("Lea_R5");
    const paul = await person("Paul_R5");
    const orga = await signUp("Orga_R5b", { twoFactor: true });
    const s = await createStructure(orga.id);
    const later = await createEvent(s.id, {
      title: "Nuit des Moteurs",
      startsAt: new Date(clock.now.getTime() + 20 * DAY),
    });
    const soon = await createEvent(s.id, { title: "Cars & Coffee", startsAt: new Date(clock.now.getTime() + 2 * DAY) });
    await apply(julie, soon.id, "accepted");
    await apply(julie, later.id, "accepted");

    const view = async (viewer: TestUser) => (await call(viewer, "GET", "/users/Julie_R5")).json;
    // Kenji n'y va pas.
    const none = await view(kenji);
    expect(none.nextOuting).toMatchObject({
      together: false,
      event: { slug: soon.slug, title: "Cars & Coffee", city: "Canet-en-Roussillon", structureName: "Club de test" },
    });
    expect(none.upcomingEvents.map((x: { slug: string }) => x.slug)).toEqual([soon.slug, later.slug]);
    // Léa a une candidature en attente : elle y va aussi.
    await apply(lea, soon.id, "pending");
    expect((await view(lea)).nextOuting.together).toBe(true);
    // Une candidature refusée ou retirée n'en est pas une.
    await apply(kenji, soon.id, "withdrawn");
    expect((await view(kenji)).nextOuting.together).toBe(false);
    // Paul a un billet (réservation gratuite du public).
    await db.update(events).set({ publicAccess: "free_reservation" }).where(eq(events.id, soon.id));
    expect((await call(orga, "PUT", `/events/${soon.id}/ticketing`, { enabled: true, capacity: 50 })).status).toBe(200);
    expect((await call(paul, "POST", `/events/${soon.id}/tickets/reserve`, { quantity: 1 })).status).toBe(201);
    expect((await view(paul)).nextOuting.together).toBe(true);
    // Soi-même et l'aperçu : jamais « Toi aussi ».
    expect((await view(julie)).nextOuting.together).toBe(false);
    expect((await call(julie, "GET", "/me/public-preview?as=friend")).json.nextOuting.together).toBe(false);
  });

  it("compte privé vu par un membre : pas de sortie ; sans sortie à venir : rien", async () => {
    const priv = await person("Priv_R5b", "private");
    const member = await person("Membre_R5b");
    const s = await createStructure((await signUp("Orga_R5c")).id);
    const e = await createEvent(s.id);
    await apply(priv, e.id, "accepted");
    expect((await call(member, "GET", "/users/Priv_R5b")).json.nextOuting).toBeNull();
    expect((await call(member, "GET", "/users/Membre_R5b")).json.nextOuting).toBeNull();
  });
});

describe("« Vu à » : les tampons de la saison", () => {
  it("événements publics finis de la saison en cours ; ni invitation, ni en cours, ni saison passée, ni compte privé", async () => {
    const julie = await person("Julie_R5c");
    const priv = await person("Priv_R5c", "private");
    const member = await person("Membre_R5c");
    const s = await createStructure((await signUp("Orga_R5d")).id);
    // Dates prises sur l'horloge simulée (17/10/2026, 15 h).
    const at = (days: number) => new Date(clock.now.getTime() + days * DAY);
    const done1 = await createEvent(s.id, { title: "Balade", startsAt: at(-30) });
    const done2 = await createEvent(s.id, { title: "Expo", startsAt: at(-10), format: "exhibition" });
    const invite = await createEvent(s.id, { title: "Privée", startsAt: at(-5), admission: "invite_only" });
    const draft = await createEvent(s.id, { title: "Brouillon", startsAt: at(-4), status: "draft" });
    const lastYear = await createEvent(s.id, { title: "Ancienne", startsAt: new Date("2025-06-01T10:00:00Z") });
    const live = await createEvent(s.id, { title: "En cours", startsAt: at(-1 / 24) });
    for (const u of [julie, priv]) {
      for (const e of [done1, done2, invite, draft, lastYear, live]) {
        await passportService.stamp(db, u.id, e, "participation", { at: e.startsAt });
      }
      await passportService.stamp(db, u.id, done2, "first_outing", { at: new Date(done2.startsAt.getTime() + 1000) });
    }
    const seen = (await call(member, "GET", "/users/Julie_R5c")).json.seenAt;
    expect(seen.events).toBe(2);
    expect(seen.stamps.map((x: { event: { title: string }; kind: string }) => [x.event.title, x.kind])).toEqual([
      ["Expo", "first_outing"],
      ["Expo", "participation"],
      ["Balade", "participation"],
    ]);
    // Liste blanche d'un tampon.
    expect(Object.keys(seen.stamps[0]).sort()).toEqual(
      ["event", "id", "ink", "kind", "rare", "seed", "shape", "stampedAt"].sort(),
    );
    expect(Object.keys(seen.stamps[0].event).sort()).toEqual(
      ["city", "department", "format", "id", "slug", "startsAt", "title"].sort(),
    );
    // Compte privé vu par un membre : rien ; vu par lui-même : ses tampons.
    expect((await call(member, "GET", "/users/Priv_R5c")).json.seenAt).toBeNull();
    expect((await call(priv, "GET", "/users/Priv_R5c")).json.seenAt.events).toBe(2);
    // L'événement en cours apparaît une fois fini.
    clock.set(new Date(live.endsAt.getTime() + 60_000));
    expect((await call(member, "GET", "/users/Julie_R5c")).json.seenAt.events).toBe(3);
  });
});
