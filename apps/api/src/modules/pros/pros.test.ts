// Lot 14 : fiche pro, vérification SIRET automatique, remises par grade, annuaire, publications limitées par mois,
// abonnés, statistiques, partenaires des organisateurs.
import { fromWallTime, PRO_POSTS_PER_MONTH } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createPro,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { proPhotos, proProfiles } from "../../db/schema";
import { setGeocodeFetch } from "../../lib/geocode";
import { setRegistryFetch } from "../../lib/registry";
import { storage } from "../../lib/storage";
import { prosService } from "./service";

afterAll(async () => {
  await pool.end();
});

let clock: ReturnType<typeof useClock>;
let owner: TestUser;
let fan: TestUser;

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 10, day: 16, hour: 11, minute: 0 }));
  owner = await signUp("Garage_Pro");
  fan = await signUp("Kenji_66");
});

afterEach(() => {
  setRegistryFetch(null);
  setGeocodeFetch(null);
});

const input = (overrides: Record<string, unknown> = {}) => ({
  name: "Garage du Port",
  activities: ["garage", "detailing"],
  city: "Canet-en-Roussillon",
  postalCode: "66140",
  phone: "04 68 00 00 00",
  ...overrides,
});

async function createdPro() {
  const res = await call(owner, "POST", "/pros", input());
  expect(res.status).toBe(201);
  return res.json as { id: string; slug: string };
}

function fakeRegistry(results: unknown[], ok = true) {
  setRegistryFetch(
    (async () => new Response(JSON.stringify({ results }), { status: ok ? 200 : 503 })) as unknown as typeof fetch,
  );
}
const SIRET = "35600000000048";
const company = (siret: string, overrides: Record<string, unknown> = {}) => ({
  siren: siret.slice(0, 9),
  nom_complet: "GARAGE DU PORT",
  etat_administratif: "A",
  siege: { siret, adresse: "2 QUAI DU PORT", code_postal: "66140", libelle_commune: "CANET", etat_administratif: "A" },
  complements: { est_association: false, identifiant_association: null },
  ...overrides,
});

describe("fiche pro", () => {
  it("création en brouillon (une seule par compte), slug, abonnement en présentation sans prix", async () => {
    const res = await call(owner, "POST", "/pros", input());
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      slug: "garage-du-port",
      published: false,
      verifiedAt: null,
      canPublish: true,
      postsLimit: PRO_POSTS_PER_MONTH,
      subscription: { state: "free_until", label: "Gratuit jusqu'au 21 juin 2027" },
      department: "66",
    });
    expect(JSON.stringify(res.json.subscription)).not.toMatch(/prix|price|€/i);
    expect((await call(owner, "POST", "/pros", input({ name: "Autre" }))).status).toBe(409);
    expect((await call(null, "POST", "/pros", input())).status).toBe(401);
    expect((await call(fan, "POST", "/pros", { name: "X", activities: [] })).status).toBe(400);
  });

  it("brouillon invisible du public, visible du propriétaire ; publication exige une adresse ou une zone", async () => {
    const pro = await createdPro();
    expect((await call(fan, "GET", `/pros/by-slug/${pro.slug}`)).status).toBe(404);
    expect((await call(owner, "GET", `/pros/by-slug/${pro.slug}`)).status).toBe(200);
    // Sans adresse ni zone : publication refusée.
    const bare = await signUp("Mobile_Pro");
    const created = await call(bare, "POST", "/pros", { name: "Detailing mobile", activities: ["detailing"] });
    const refused = await call(bare, "PUT", `/pros/${created.json.id}/published`, { published: true });
    expect(refused.status).toBe(400);
    // Avec une zone d'intervention : acceptée.
    await call(bare, "PATCH", `/pros/${created.json.id}`, { interventionDepartments: ["66", "11"] });
    expect((await call(bare, "PUT", `/pros/${created.json.id}/published`, { published: true })).status).toBe(200);
    expect((await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true })).json.published).toBe(true);
    expect((await call(fan, "GET", `/pros/by-slug/${pro.slug}`)).status).toBe(200);
  });

  it("seul le propriétaire modifie sa fiche", async () => {
    const pro = await createdPro();
    expect((await call(fan, "PATCH", `/pros/${pro.id}`, { name: "Piraté" })).status).toBe(403);
    expect((await call(fan, "PUT", `/pros/${pro.id}/discounts`, { discounts: { rodage: 5 } })).status).toBe(403);
    expect((await call(fan, "GET", `/pros/${pro.id}/stats`)).status).toBe(403);
    const res = await call(owner, "PATCH", `/pros/${pro.id}`, {
      description: "Mécanique, detailing.",
      hours: { mon: "9h-18h" },
    });
    expect(res.json).toMatchObject({ description: "Mécanique, detailing.", hours: { mon: "9h-18h" } });
  });

  it("logo et photos de réalisations (WebP), 12 au plus", async () => {
    const pro = await createdPro();
    const v = await viewerOf(owner);
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } })
      .png()
      .toBuffer();
    const file = () => new File([new Uint8Array(png)], "photo.png", { type: "image/png" });
    const withLogo = await prosService.setLogo(v, pro.id, file());
    expect(withLogo.logoUrl).toMatch(/^\/api\/files\/pros\/.+\.webp$/);
    const key = withLogo.logoUrl?.replace("/api/files/", "") ?? "";
    expect(await storage.get(key)).not.toBeNull();
    const withPhoto = await prosService.addPhoto(v, pro.id, file());
    expect(withPhoto.photos).toHaveLength(1);
    const photoId = withPhoto.photos[0]!.id;
    const removed = await prosService.removePhoto(v, pro.id, photoId);
    expect(removed.photos).toHaveLength(0);
    await expect(
      prosService.addPhoto(v, pro.id, new File([Buffer.from("pas une image")], "x.png")),
    ).rejects.toMatchObject({
      status: 415,
    });
    for (let i = 0; i < 12; i++) {
      await db.insert(proPhotos).values({ proId: pro.id, storageKey: `test/${i}.webp`, position: i });
    }
    await expect(prosService.addPhoto(v, pro.id, file())).rejects.toMatchObject({ status: 409 });
  });
});

describe("vérification SIRET automatique", () => {
  it("établissement actif trouvé → badge « pro vérifié » sans validation manuelle", async () => {
    const pro = await createdPro();
    fakeRegistry([company(SIRET)]);
    const res = await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET });
    expect(res.status).toBe(200);
    expect(res.json.verifiedAt).toBe(clock.now.toISOString());
    expect(res.json.siret).toBe(SIRET);
    expect(res.json.registryCheck).toMatchObject({ status: "matched", name: "GARAGE DU PORT" });
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });
    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.verified).toBe(true);
  });

  it("établissement fermé, introuvable, registre injoignable ou RNA : pas de badge", async () => {
    const pro = await createdPro();
    fakeRegistry([company(SIRET, { siege: { siret: SIRET, etat_administratif: "F", code_postal: "66140" } })]);
    expect((await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET })).json.verifiedAt).toBeNull();
    fakeRegistry([]);
    const notFound = await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET });
    expect(notFound.json).toMatchObject({ verifiedAt: null, registryCheck: { status: "not_found" } });
    fakeRegistry([], false);
    expect(
      (await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET })).json.registryCheck.status,
    ).toBe("unavailable");
    expect((await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: "W661000001" })).status).toBe(400);
    expect((await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: "12345678901234" })).status).toBe(400);
  });

  it("un badge obtenu se perd si le contrôle suivant échoue", async () => {
    const pro = await createdPro();
    fakeRegistry([company(SIRET)]);
    await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET });
    fakeRegistry([]);
    expect((await call(owner, "POST", `/pros/${pro.id}/siret/check`, { number: SIRET })).json.verifiedAt).toBeNull();
  });
});

describe("remises par grade", () => {
  it("enregistrées, lues sur la fiche publique, retirées avec null", async () => {
    const pro = await createdPro();
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });
    const res = await call(owner, "PUT", `/pros/${pro.id}/discounts`, {
      discounts: { rodage: 5, route: 8, legende: 20 },
    });
    expect(res.json.discounts).toEqual({ rodage: 5, route: 8, legende: 20 });
    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.discounts).toEqual({
      rodage: 5,
      route: 8,
      legende: 20,
    });
    const cleared = await call(owner, "PUT", `/pros/${pro.id}/discounts`, { discounts: { route: 8, rodage: null } });
    expect(cleared.json.discounts).toEqual({ route: 8 });
  });

  it("refuse un grade supérieur moins remisé qu'un grade inférieur, ou plus de 50 %", async () => {
    const pro = await createdPro();
    expect((await call(owner, "PUT", `/pros/${pro.id}/discounts`, { discounts: { route: 10, sport: 5 } })).status).toBe(
      400,
    );
    expect((await call(owner, "PUT", `/pros/${pro.id}/discounts`, { discounts: { route: 60 } })).status).toBe(400);
  });
});

describe("annuaire", () => {
  it("fiches publiées seulement, filtres activité / département / texte, vérifiés d'abord", async () => {
    const other = await signUp("Autre_Pro");
    const third = await signUp("Tiers_Pro");
    await createPro(owner.id, { slug: "garage-a", name: "Garage A", activities: ["garage"], department: "66" });
    await createPro(other.id, {
      slug: "covering-b",
      name: "Covering B",
      activities: ["covering"],
      department: "11",
      city: "Narbonne",
      verifiedAt: new Date(),
    });
    await createPro(third.id, { slug: "brouillon-c", name: "Brouillon C", publishedAt: null });
    const all = await call(null, "GET", "/pros");
    expect(all.json.items.map((p: { slug: string }) => p.slug)).toEqual(["covering-b", "garage-a"]);
    expect(all.json.items[0]).toMatchObject({ verified: true, followersCount: 0 });
    const byActivity = await call(null, "GET", "/pros?activity=garage");
    expect(byActivity.json.items.map((p: { slug: string }) => p.slug)).toEqual(["garage-a"]);
    expect((await call(null, "GET", "/pros?department=11")).json.items).toHaveLength(1);
    expect((await call(null, "GET", "/pros?q=narbon")).json.items[0].slug).toBe("covering-b");
    expect((await call(null, "GET", "/pros?activity=inconnue")).status).toBe(400);
    expect((await call(null, "GET", "/pros?limit=1")).json.nextCursor).not.toBeNull();
  });

  it("un pro sans local est trouvé par sa zone d'intervention", async () => {
    await createPro(owner.id, { slug: "mobile", city: null, department: null, interventionDepartments: ["66", "09"] });
    expect((await call(null, "GET", "/pros?department=09")).json.items).toHaveLength(1);
    expect((await call(null, "GET", "/pros?department=75")).json.items).toHaveLength(0);
  });
});

describe("publications et abonnés", () => {
  it("publications visibles des abonnés seulement ; limite mensuelle, libérée au mois suivant", async () => {
    const pro = await createdPro();
    // Brouillon : pas de publication.
    expect(
      (await call(owner, "POST", `/pros/${pro.id}/posts`, { title: "Promo", body: "-10 % cette semaine" })).status,
    ).toBe(400);
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });
    for (let i = 1; i <= PRO_POSTS_PER_MONTH; i++) {
      const res = await call(owner, "POST", `/pros/${pro.id}/posts`, { title: `Offre ${i}`, body: "Texte de l'offre" });
      expect(res.status).toBe(201);
    }
    const over = await call(owner, "POST", `/pros/${pro.id}/posts`, { title: "Trop", body: "Une de trop" });
    expect(over.status).toBe(409);
    const mine = await call(owner, "GET", "/me/pro");
    expect(mine.json).toMatchObject({ postsUsed: PRO_POSTS_PER_MONTH, postsRemaining: 0 });

    // Visiteur non abonné : compteur seulement ; abonné : le contenu.
    const visitor = (await call(fan, "GET", `/pros/by-slug/${pro.slug}`)).json;
    expect(visitor).toMatchObject({ postsCount: PRO_POSTS_PER_MONTH, posts: null, isFollowing: false });
    expect((await call(fan, "POST", `/pros/${pro.id}/follow`)).status).toBe(204);
    const follower = (await call(fan, "GET", `/pros/by-slug/${pro.slug}`)).json;
    expect(follower.isFollowing).toBe(true);
    expect(follower.followersCount).toBe(1);
    expect(follower.posts).toHaveLength(PRO_POSTS_PER_MONTH);
    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.posts).toBeNull();

    // Mois suivant : le compteur repart.
    clock.set(fromWallTime({ year: 2026, month: 11, day: 2, hour: 9, minute: 0 }));
    expect(
      (await call(owner, "POST", `/pros/${pro.id}/posts`, { title: "Novembre", body: "Nouvelle offre" })).status,
    ).toBe(201);

    expect((await call(fan, "DELETE", `/pros/${pro.id}/follow`)).status).toBe(204);
    expect((await call(owner, "POST", `/pros/${pro.id}/follow`)).status).toBe(400);
  });
});

describe("statistiques", () => {
  it("vues, appels, itinéraires, abonnés ; les actions du propriétaire ne comptent pas", async () => {
    const pro = await createdPro();
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });
    const track = (u: TestUser | null, kind: string) => call(u, "POST", `/pros/by-slug/${pro.slug}/track`, { kind });
    expect((await track(fan, "view")).status).toBe(204);
    await track(null, "view");
    await track(fan, "call");
    await track(fan, "route");
    await track(fan, "route");
    await track(owner, "view");
    await call(fan, "POST", `/pros/${pro.id}/follow`);
    const stats = (await call(owner, "GET", `/pros/${pro.id}/stats?days=7`)).json;
    expect(stats).toMatchObject({ days: 7, views: 2, calls: 1, routes: 2, followers: 1, discounts: 0 });
    expect(stats.series).toHaveLength(7);
    expect(stats.series.at(-1)).toMatchObject({ day: "2026-10-16", views: 2, calls: 1, routes: 2 });
    expect((await track(fan, "invalide")).status).toBe(400);
  });

  it("compteurs limités par visiteur et par fiche (pas de gonflement)", async () => {
    const pro = await createdPro();
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });
    let last = 204;
    for (let i = 0; i < 31; i++) {
      last = (await call(fan, "POST", `/pros/by-slug/${pro.slug}/track`, { kind: "view" })).status;
    }
    expect(last).toBe(429);
  });
});

describe("partenaires des organisateurs", () => {
  it("le pro propose, l'organisateur accepte : le partenaire apparaît sur la fiche et la page de la structure", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const pro = await createdPro();
    await call(owner, "PUT", `/pros/${pro.id}/published`, { published: true });

    const asked = await call(owner, "POST", `/pros/${pro.id}/partners`, { structureSlug: structure.slug });
    expect(asked.status).toBe(201);
    expect(asked.json.partnerLinks).toEqual([
      expect.objectContaining({ structureSlug: structure.slug, status: "pending" }),
    ]);
    // En attente : rien de public.
    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.partners).toEqual([]);
    expect((await call(null, "GET", `/structures/by-slug/${structure.slug}/pros`)).json).toEqual([]);

    // Côté organisateur.
    expect((await call(fan, "GET", `/structures/${structure.id}/partners`)).status).toBe(403);
    const list = await call(orga, "GET", `/structures/${structure.id}/partners`);
    expect(list.json).toEqual([expect.objectContaining({ proSlug: pro.slug, status: "pending" })]);
    expect((await call(fan, "PUT", `/structures/${structure.id}/partners/${pro.slug}`)).status).toBe(403);
    const accepted = await call(orga, "PUT", `/structures/${structure.id}/partners/${pro.slug}`);
    expect(accepted.json[0].status).toBe("accepted");

    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.partners).toEqual([
      expect.objectContaining({ slug: structure.slug }),
    ]);
    expect((await call(null, "GET", `/structures/by-slug/${structure.slug}/pros`)).json).toEqual([
      expect.objectContaining({ slug: pro.slug }),
    ]);

    // Retrait par l'organisateur.
    expect((await call(orga, "DELETE", `/structures/${structure.id}/partners/${pro.slug}`)).json).toEqual([]);
    expect((await call(null, "GET", `/pros/by-slug/${pro.slug}`)).json.partners).toEqual([]);
  });

  it("une structure non vérifiée ne peut pas recevoir de demande", async () => {
    const orga = await signUp("Orga_66", { twoFactor: true });
    const structure = await createStructure(orga.id, false);
    const pro = await createdPro();
    expect((await call(owner, "POST", `/pros/${pro.id}/partners`, { structureSlug: structure.slug })).status).toBe(404);
  });
});

describe("suppression de compte", () => {
  it("la fiche suit le compte (cascade)", async () => {
    const pro = await createdPro();
    await db.execute((await import("drizzle-orm")).sql`delete from "user" where id = ${owner.id}`);
    expect(await db.query.proProfiles.findFirst({ where: eq(proProfiles.id, pro.id) })).toBeUndefined();
  });
});
