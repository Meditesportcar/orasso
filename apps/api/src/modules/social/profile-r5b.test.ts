// Lot R5b (maquettes R5.4, R5.5, R5.6) : réseaux du profil (règle partagée, visibilité, export, suppression), photo
// retirée, prochaine sortie avec « Toi aussi », « Vu à » (tampons de la saison). Chaque regard est vérifié : soi-même,
// ami, membre (compte public, compte privé), organisateur, aperçu, visiteur sans compte.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { applications, events, profiles, userFollows } from "../../db/schema";
import { storage } from "../../lib/storage";
import { passportService } from "../passport/service";

afterAll(async () => {
  await pool.end();
});

afterEach(() => {
  vi.restoreAllMocks();
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

/** Lot R6b : deux abonnements acceptés (ce que la migration fait d'une ancienne amitié). */
async function befriend(a: TestUser, b: TestUser) {
  await db.insert(userFollows).values([
    { followerId: a.id, followedId: b.id, status: "accepted", acceptedAt: new Date() },
    { followerId: b.id, followedId: a.id, status: "accepted", acceptedAt: new Date() },
  ]);
}

async function apply(
  u: TestUser,
  eventId: string,
  status: "pending" | "accepted" | "refused" | "withdrawn" | "waitlisted" | "offered",
) {
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
    // Aperçu de son profil : vu par un membre (privé : rien), vu par un abonné (tout).
    expect((await call(priv, "GET", "/me/public-preview?as=member")).json.socials).toBeNull();
    expect((await call(priv, "GET", "/me/public-preview?as=follower")).json.socials).toEqual({
      instagram: "kenji.supra",
    });
    expect((await call(pub, "GET", "/me/public-preview?as=member")).json.socials).toEqual({ instagram: "kenji.supra" });
  });

  it("véhicules : année et catégories pour la fiche complète seulement ; liste blanche des champs", async () => {
    const pub = await person("PubV_R5");
    const priv = await person("PrivV_R5", "private");
    const member = await person("MembreV_R5");
    for (const u of [pub, priv]) await createVehicle(u.id, ref, { year: 1997 });
    const keys = [
      "categories",
      "detailed",
      "id",
      "label",
      "main",
      "makeName",
      "modelName",
      "photoUrl",
      "vehicleType",
      "year",
    ];
    const full = (await call(member, "GET", "/users/PubV_R5")).json.vehicles[0];
    expect(Object.keys(full).sort()).toEqual(keys);
    expect(full).toMatchObject({ detailed: true, year: 1997, vehicleType: "car", categories: [] });
    const reduced = (await call(member, "GET", "/users/PrivV_R5")).json.vehicles[0];
    expect(Object.keys(reduced).sort()).toEqual(keys);
    expect(reduced).toMatchObject({ detailed: false, year: null, photoUrl: null, categories: [] });
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

  it("tour 2 : le stockage échoue, la photo reste (pas de 204) ; un nouvel essai la retire, fichier compris", async () => {
    const k = await person("Kenji_R5f");
    const key = `avatars/${k.id}/photo-r5b.webp`;
    await storage.put(key, Buffer.from("photo"));
    await db.update(profiles).set({ avatarKey: key }).where(eq(profiles.userId, k.id));
    vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("stockage indisponible"));
    const failed = await call(k, "DELETE", "/me/avatar");
    expect(failed.status).toBeGreaterThanOrEqual(500);
    // La référence est restée : la photo est toujours la sienne, et le fichier est là.
    expect((await call(k, "GET", "/me")).json.profile.avatarUrl).toBe(storage.url(key));
    expect(await storage.get(key)).not.toBeNull();
    // Nouvel essai : fichier et référence retirés.
    expect((await call(k, "DELETE", "/me/avatar")).status).toBe(204);
    expect(await storage.get(key)).toBeNull();
    expect((await call(k, "GET", "/me")).json.profile.avatarUrl).toBeNull();
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
    // Tour 2 (Opus 6) : Léa est en attente, puis en liste d'attente : « vous y serez » serait faux.
    await apply(lea, soon.id, "pending");
    expect((await view(lea)).nextOuting.together).toBe(false);
    await db.update(applications).set({ status: "waitlisted" }).where(eq(applications.userId, lea.id));
    expect((await view(lea)).nextOuting.together).toBe(false);
    // Une place offerte, puis retenue : elle y va aussi.
    await db.update(applications).set({ status: "offered" }).where(eq(applications.userId, lea.id));
    expect((await view(lea)).nextOuting.together).toBe(true);
    await db.update(applications).set({ status: "accepted" }).where(eq(applications.userId, lea.id));
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
    expect((await call(julie, "GET", "/me/public-preview?as=follower")).json.nextOuting.together).toBe(false);
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
        // Tour 2 (Opus 1) : « Vu à » ne montre que des participations retenues.
        await apply(u, e.id, "accepted");
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

  it("tour 2 (Opus 1) : seulement les participations retenues ; jamais un tampon de visite ni de staff", async () => {
    const julie = await person("Julie_R5d");
    const member = await person("Membre_R5d");
    const s = await createStructure((await signUp("Orga_R5e")).id);
    const at = (days: number) => new Date(clock.now.getTime() + days * DAY);
    const rally = await createEvent(s.id, { title: "Rallye", startsAt: at(-20) });
    const visited = await createEvent(s.id, { title: "Salon visité", startsAt: at(-15) });
    const staffed = await createEvent(s.id, { title: "Staffé", startsAt: at(-12) });
    const pending = await createEvent(s.id, { title: "Sans réponse", startsAt: at(-8) });
    // Retenue et pointée au rallye (avec un rare) ; elle y était aussi au staff : ce tampon-là reste à elle seule.
    await apply(julie, rally.id, "accepted");
    await passportService.stamp(db, julie.id, rally, "participation", { at: rally.startsAt });
    await passportService.stamp(db, julie.id, rally, "full_moon", { at: new Date(rally.startsAt.getTime() + 1000) });
    await passportService.stamp(db, julie.id, rally, "staff", { at: new Date(rally.startsAt.getTime() + 2000) });
    // Billet scanné (visite), avec le rare « première sortie » qui s'y rattache : rien sur le profil.
    await passportService.stamp(db, julie.id, visited, "visit", { at: visited.startsAt });
    await passportService.stamp(db, julie.id, visited, "first_outing", {
      at: new Date(visited.startsAt.getTime() + 1),
    });
    // Staff seulement : rien.
    await passportService.stamp(db, julie.id, staffed, "staff", { at: staffed.startsAt });
    // Un tampon de participation sans candidature retenue : rien non plus.
    await apply(julie, pending.id, "pending");
    await passportService.stamp(db, julie.id, pending, "participation", { at: pending.startsAt });

    for (const viewer of [member, julie]) {
      const seen = (await call(viewer, "GET", "/users/Julie_R5d")).json.seenAt;
      expect(seen.events).toBe(1);
      expect(seen.stamps.map((x: { event: { title: string }; kind: string }) => [x.event.title, x.kind])).toEqual([
        ["Rallye", "full_moon"],
        ["Rallye", "participation"],
      ]);
    }
    // Le passeport, lui, garde tout (à soi seul).
    const passport = JSON.stringify((await call(julie, "GET", "/me/passport")).json);
    for (const kind of ["visit", "staff", "first_outing"]) expect(passport).toContain(`"kind":"${kind}"`);
  });
});

describe("compte suspendu", () => {
  it("tour 2 (Codex 1, Opus 7) : 404 comme un compte inconnu, réseaux, sortie et tampons compris ; lui-même le voit", async () => {
    const susp = await person("Susp_R5");
    const member = await person("Membre_R5e");
    const friend = await person("Ami_R5e");
    await befriend(friend, susp);
    await call(susp, "PATCH", "/me/profile", { socials: { instagram: "susp.66" }, bio: "Bientôt de retour" });
    const s = await createStructure((await signUp("Orga_R5f")).id);
    const next = await createEvent(s.id, { title: "Prochaine", startsAt: new Date(clock.now.getTime() + 3 * DAY) });
    const done = await createEvent(s.id, { title: "Passée", startsAt: new Date(clock.now.getTime() - 10 * DAY) });
    await apply(susp, next.id, "accepted");
    await apply(susp, done.id, "accepted");
    await passportService.stamp(db, susp.id, done, "participation", { at: done.startsAt });
    // Avant la suspension : tout est là.
    const before = (await call(member, "GET", "/users/Susp_R5")).json;
    expect(before.socials).toEqual({ instagram: "susp.66" });
    expect(before.nextOuting.event.title).toBe("Prochaine");
    expect(before.seenAt.events).toBe(1);

    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * DAY) })
      .where(eq(profiles.userId, susp.id));
    const unknown = await call(member, "GET", "/users/Personne_R5");
    for (const viewer of [member, friend]) {
      const res = await call(viewer, "GET", "/users/Susp_R5");
      expect(res.status).toBe(404);
      expect(res.json).toEqual(unknown.json);
      expect(JSON.stringify(res.json)).not.toMatch(/susp\.66|Prochaine|Passée|Bientôt/);
    }
    // Lui-même voit son profil.
    const self = await call(susp, "GET", "/users/Susp_R5");
    expect(self.status).toBe(200);
    expect(self.json.socials).toEqual({ instagram: "susp.66" });
    // Suspension finie : le profil revient.
    clock.set(new Date(clock.now.getTime() + 8 * DAY));
    expect((await call(member, "GET", "/users/Susp_R5")).status).toBe(200);
  });
});
