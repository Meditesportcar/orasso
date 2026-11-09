// Lot R7b1 (D38, maquette R7.12) : le Profil avec le Garage. L'en-tête et les deux onglets (Garage, Sorties) se lisent tous
// dans `GET /users/:pseudo` ; ce fichier fige, regard par regard, ce que chacun y reçoit : les nombres pour tout membre
// connecté (compte privé compris), le Garage en photos et les Sorties seulement pour soi, un abonné accepté ou
// l'organisateur ; une photo de véhicule seulement quand sa plaque est floutée ; jamais le numéro de plaque.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
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
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications, profiles, userFollows } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
  ref = await seedReference();
});

async function person(pseudo: string, visibility: "public" | "private" = "public") {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ visibility, departments: ["66"], bio: `Bio de ${pseudo}` })
    .where(eq(profiles.userId, u.id));
  return u;
}

const follow = (a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") =>
  db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status, acceptedAt: status === "accepted" ? new Date() : null });

const PLATE = /[A-Z]{2}-\d{3}-[A-Z]{2}/;

describe("en-tête du profil : les trois nombres sont pour tout membre connecté", () => {
  it("compte public et compte privé : abonnés, abonnements et sorties pour chaque regard", async () => {
    const pub = await person("Pub_R7b1");
    const priv = await person("Priv_R7b1", "private");
    const stranger = await person("Inconnu_R7b1");
    const pending = await person("Attente_R7b1");
    const follower = await person("Abonne_R7b1");
    await follow(follower, priv);
    await follow(follower, pub);
    await follow(pending, priv, "pending");
    await follow(priv, pub);

    for (const viewer of [priv, stranger, pending, follower]) {
      const asPub = (await call(viewer, "GET", "/users/Pub_R7b1")).json;
      expect(asPub, `public vu par ${viewer.pseudo}`).toMatchObject({
        followersCount: 2,
        followingCount: 0,
        outingsCount: 0,
      });
    }
    // Compte privé : la demande en attente ne compte pas dans les abonnés ; les nombres restent visibles de tous.
    for (const viewer of [pub, stranger, pending, follower]) {
      const asPriv = (await call(viewer, "GET", "/users/Priv_R7b1")).json;
      expect(asPriv, `privé vu par ${viewer.pseudo}`).toMatchObject({
        followersCount: 1,
        followingCount: 1,
        outingsCount: 0,
      });
    }
    // Moi : les mêmes nombres que `/me/network` (l'en-tête de mon profil).
    const mine = (await call(priv, "GET", "/users/Priv_R7b1")).json;
    const network = (await call(priv, "GET", "/me/network")).json;
    expect([mine.followersCount, mine.followingCount, mine.outingsCount]).toEqual([
      network.followers,
      network.following,
      network.outings,
    ]);
  });

  it("sans session : refusé ; compte suspendu ou inconnu : 404, ni nombre ni profil", async () => {
    const pub = await person("Pub2_R7b1");
    const gone = await person("Suspendu_R7b1");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, gone.id));
    expect((await call(null, "GET", "/users/Pub2_R7b1")).status).toBe(401);
    expect((await call(pub, "GET", "/users/Suspendu_R7b1")).status).toBe(404);
    expect((await call(pub, "GET", "/users/Introuvable_R7b1")).status).toBe(404);
  });
});

describe("compte privé : le Garage et les Sorties sont réservés", () => {
  it("un inconnu et une demande en attente : les nombres et rien d'autre ; un abonné accepté : tout", async () => {
    const priv = await person("Prive_R7b1", "private");
    const stranger = await person("Etranger_R7b1");
    const pending = await person("Demande_R7b1");
    const follower = await person("Suiveur_R7b1");
    await createVehicle(priv.id, ref, { year: 1990 });
    await blurPlatesOf(priv.id);
    await call(priv, "PATCH", "/me/profile", { socials: { instagram: "prive.r7b1" } });
    await follow(pending, priv, "pending");
    await follow(follower, priv);

    for (const viewer of [stranger, pending]) {
      const res = (await call(viewer, "GET", "/users/Prive_R7b1")).json;
      const who = viewer.pseudo;
      expect(res.audience, who).toBe("public_limited");
      // Pas d'onglet Garage en photos ni d'onglet Sorties : tous ces champs sont vides.
      expect(res.bio, who).toBeNull();
      expect(res.socials, who).toBeNull();
      expect(res.crews, who).toBeNull();
      expect(res.departments, who).toBeNull();
      expect(res.upcomingEvents, who).toBeNull();
      expect(res.pastEvents, who).toBeNull();
      expect(res.nextOuting, who).toBeNull();
      expect(res.seenAt, who).toBeNull();
      expect(res.contact, who).toBeNull();
      // Les nombres, le bouton de suivi, la marque et le modèle des véhicules (jamais de photo, jamais de plaque).
      expect(res.followersCount, who).toBe(1);
      expect(res.vehicles, who).toHaveLength(1);
      expect(res.vehicles[0], who).toMatchObject({ detailed: false, photoUrl: null, year: null, categories: [] });
      expect(JSON.stringify(res), who).not.toMatch(PLATE);
    }
    expect((await call(pending, "GET", "/users/Prive_R7b1")).json.follow).toMatchObject({ mine: "pending" });

    const full = (await call(follower, "GET", "/users/Prive_R7b1")).json;
    expect(full.audience).toBe("follower");
    expect(full.bio).toBe("Bio de Prive_R7b1");
    expect(full.socials).toEqual({ instagram: "prive.r7b1" });
    expect(full.upcomingEvents).toEqual([]);
    expect(full.seenAt).toEqual({ events: 0, stamps: [] });
    expect(full.vehicles[0]).toMatchObject({ detailed: true, year: 1990 });
    expect(full.vehicles[0].photoUrl).toContain("test/");
    expect(JSON.stringify(full)).not.toMatch(PLATE);
  });

  it("l'organisateur d'une candidature en cours voit le profil complet et les coordonnées ; sans candidature, un inconnu", async () => {
    const priv = await person("Candidat_R7b1", "private");
    const orga = await person("Orga_R7b1");
    const other = await person("AutreOrga_R7b1");
    const structure = await createStructure(orga.id);
    await createStructure(other.id);
    expect((await call(orga, "GET", "/users/Candidat_R7b1")).json).toMatchObject({
      audience: "public_limited",
      contact: null,
    });
    const event = await createEvent(structure.id);
    const vehicle = await createVehicle(priv.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: priv.id,
      vehicleId: vehicle.id,
      status: "pending",
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
    const asOrga = (await call(orga, "GET", "/users/Candidat_R7b1")).json;
    expect(asOrga.audience).toBe("organizer");
    expect(asOrga.contact).toMatchObject({ firstName: expect.anything() });
    // L'autre structure n'a aucun lien avec cette personne : elle reste un inconnu.
    expect((await call(other, "GET", "/users/Candidat_R7b1")).json).toMatchObject({
      audience: "public_limited",
      contact: null,
    });
    expect(JSON.stringify(asOrga)).not.toMatch(PLATE);
  });
});

describe("photos de véhicule : seulement à plaque floutée, pour chaque regard", () => {
  it("compte public : la photo non floutée est masquée aux autres, le propriétaire voit sa couverture", async () => {
    const owner = await person("Garage_R7b1");
    const member = await person("Visiteur_R7b1");
    const follower = await person("Abonne2_R7b1");
    await follow(follower, owner);
    await createVehicle(owner.id, ref, { year: 2001 });

    expect((await call(member, "GET", "/users/Garage_R7b1")).json.vehicles[0].photoUrl).toBeNull();
    expect((await call(follower, "GET", "/users/Garage_R7b1")).json.vehicles[0].photoUrl).toBeNull();
    // Aperçu de mon profil : la règle des autres (pas de couverture non floutée).
    expect((await call(owner, "GET", "/me/public-preview?as=member")).json.vehicles[0].photoUrl).toBeNull();
    expect((await call(owner, "GET", "/users/Garage_R7b1")).json.vehicles[0].photoUrl).toContain("test/");

    await blurPlatesOf(owner.id);
    for (const viewer of [member, follower, owner]) {
      const res = (await call(viewer, "GET", "/users/Garage_R7b1")).json;
      expect(res.vehicles[0].photoUrl, viewer.pseudo).toContain("test/");
      expect(JSON.stringify(res), viewer.pseudo).not.toMatch(PLATE);
    }
  });

  it("le véhicule principal est en tête et une seule fois ; la liste ne contient que les véhicules actifs", async () => {
    const owner = await person("Principal_R7b1");
    const member = await person("Lecteur_R7b1");
    const a = await createVehicle(owner.id, ref, { createdAt: new Date(Date.now() - 60_000) });
    const b = await createVehicle(owner.id, ref, { createdAt: new Date(Date.now() - 30_000) });
    await call(owner, "PUT", "/me/main-vehicle", { vehicleId: b.id });
    const list = (await call(member, "GET", "/users/Principal_R7b1")).json.vehicles as { id: string; main: boolean }[];
    expect(list.map((v) => [v.id, v.main])).toEqual([
      [b.id, true],
      [a.id, false],
    ]);
  });
});
