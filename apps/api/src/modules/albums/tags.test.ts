// Lot R9f, T37 et T41 : qui est identifiable (taggable par regard), poser et retirer une identification. Droits par regard (média auteur,
// autre média, organisateur avec et sans second facteur, staff, passionné, sans session), voitures pointées (T37), recherche par pseudo
// (2 caractères, place ou présence), invariants (retirée par l'intéressé : jamais reposée par un autre), idempotence, concurrence.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { addMember, call, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { albumPhotoTags, applications, profiles, vehicleCategories, vehicles } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { keysOf, paris, sendUpload } from "./albums-test-helpers";
import { carAt, presentAt, type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref);
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser | null, photoId: string, body: unknown) =>
  call(u, "POST", `/album-photos/${photoId}/tags`, body);
const taggable = (u: TestUser | null, q = "") => call(u, "GET", `/albums/${s.albumId}/taggable${q}`);
const rows = () => db.select().from(albumPhotoTags);
const ids = (list: { vehicleId: string }[]) => list.map((v) => v.vehicleId).sort();

describe("qui est identifiable : les voitures (T37) par regard", () => {
  it("le média auteur voit les voitures retenues et pointées ; une voiture non pointée est absente ; aucun pseudo d'un compte privé", async () => {
    const res = await taggable(s.leo);
    expect(res.status).toBe(200);
    expect(res.json.role).toBe("media");
    expect(res.json.fallback).toBe(false);
    expect(ids(res.json.vehicles)).toEqual(
      ids([
        { vehicleId: s.car.dam.vehicle.id },
        { vehicleId: s.car.kenji.vehicle.id },
        { vehicleId: s.car.priv.vehicle.id },
      ]),
    );
    expect(res.json.people).toEqual([]);
    for (const v of res.json.vehicles) {
      expect(Object.keys(v).sort()).toEqual(
        ["categories", "label", "makeName", "mine", "modelName", "photoUrl", "private", "pseudo", "vehicleId"].sort(),
      );
    }
    const priv = res.json.vehicles.find((v: { vehicleId: string }) => v.vehicleId === s.car.priv.vehicle.id);
    expect(priv).toMatchObject({ pseudo: null, private: true, mine: false });
    expect(res.text).not.toContain("Priv_66");
    // La photo est celle de la règle de plaque (floutée), jamais la plaque ni son numéro.
    expect(res.text).not.toContain(s.car.dam.vehicle.plate ?? "plaque-introuvable");
    const dam = res.json.vehicles.find((v: { vehicleId: string }) => v.vehicleId === s.car.dam.vehicle.id);
    expect(dam).toMatchObject({ pseudo: "Dam_66", private: false });
    expect(dam.photoUrl).toContain(s.car.dam.vehicle.id);
  });

  it("l'organisateur avec second facteur voit le plateau ; sans second facteur : 403 ; le staff n'identifie que lui-même", async () => {
    const orga = await taggable(s.orga);
    expect(orga.status).toBe(200);
    expect(orga.json.role).toBe("organizer");
    expect(orga.json.vehicles).toHaveLength(3);
    const co = await signUp("CoOrga_66");
    await addMember(s.structure.id, co.id, "co_organizer");
    const res = await taggable(co);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_factor_required");
    const staff = await signUp("Staff_66");
    await addMember(s.structure.id, staff.id, "staff", ["filtering"]);
    const asStaff = await taggable(staff);
    expect(asStaff.status).toBe(200);
    expect(asStaff.json.role).toBe("owner");
    expect(asStaff.json.vehicles).toEqual([]);
    expect((await pose(staff, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
  });

  it("un autre média (accrédité, pas l'auteur) et un passionné : leurs voitures seules, jamais celles des autres", async () => {
    const marc = await taggable(s.marc);
    expect(marc.status).toBe(200);
    expect(marc.json.role).toBe("owner");
    expect(marc.json.vehicles).toEqual([]);
    expect((await pose(s.marc, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
    const dam = await taggable(s.dam);
    expect(dam.json.role).toBe("owner");
    expect(dam.json.vehicles).toHaveLength(1);
    expect(dam.json.vehicles[0]).toMatchObject({ vehicleId: s.car.dam.vehicle.id, mine: true, private: false });
    // Lui seul, par son pseudo (il avait une place).
    expect(dam.json.people).toMatchObject([{ pseudo: "Dam_66", mine: true }]);
    // Un compte privé voit sa propre voiture avec son pseudo.
    const priv = await taggable(s.priv);
    expect(priv.json.vehicles[0]).toMatchObject({ pseudo: "Priv_66", mine: true, private: false });
  });

  it("sans session : 401 ; album en brouillon : 404 pour tout autre que son média", async () => {
    expect((await taggable(null)).status).toBe(401);
    const draft = await call(s.leo, "POST", "/me/albums", { eventId: s.event.id });
    expect(draft.status).toBe(201);
    const url = `/albums/${draft.json.id}/taggable`;
    expect((await call(s.leo, "GET", url)).status).toBe(200);
    for (const who of [s.orga, s.marc, s.dam]) expect((await call(who, "GET", url)).status).toBe(404);
  });

  it("T37 : retenue non pointée, en attente, liste d'attente, refusée, compte suspendu et voiture archivée sont absentes", async () => {
    const waiting = await signUp("Wait_66");
    const pending = await signUp("Pend_66");
    const refused = await signUp("Ref_66");
    const suspended = await signUp("Susp_66");
    const sold = await signUp("Sold_66");
    await carAt(s.event.id, waiting, ref, { status: "waitlisted" });
    await carAt(s.event.id, pending, ref, { status: "pending" });
    await carAt(s.event.id, refused, ref, { status: "refused" });
    await carAt(s.event.id, suspended, ref);
    const old = await carAt(s.event.id, sold, ref);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000 * 30) })
      .where(eq(profiles.userId, suspended.id));
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, old.vehicle.id));
    const res = await taggable(s.leo);
    expect(res.json.vehicles).toHaveLength(3);
    const pseudos = res.json.vehicles.map((v: { pseudo: string | null }) => v.pseudo);
    for (const p of ["Wait_66", "Pend_66", "Ref_66", "Susp_66", "Sold_66", "Lazy_66"]) expect(pseudos).not.toContain(p);
  });

  it("T37 : sans aucun pointage à l'événement, repli sur toutes les voitures retenues (et le dit)", async () => {
    await db.execute(sql`delete from checkins`);
    const res = await taggable(s.leo);
    expect(res.json.fallback).toBe(true);
    expect(res.json.vehicles).toHaveLength(4);
    // Un seul pointage et le plateau revient aux seules voitures pointées.
    await carAt(s.event.id, await signUp("Late_66"), ref);
    const again = await taggable(s.leo);
    expect(again.json.fallback).toBe(false);
    expect(again.json.vehicles).toHaveLength(1);
  });

  it("les puces de catégorie, le filtre et la recherche par nom de voiture", async () => {
    await db.insert(vehicleCategories).values({ vehicleId: s.car.dam.vehicle.id, categoryId: ref.jdm.id });
    const all = await taggable(s.leo);
    expect(all.json.categories).toEqual([{ slug: "jdm", label: "JDM", count: 1 }]);
    const jdm = await taggable(s.leo, "?category=jdm");
    expect(jdm.json.vehicles).toHaveLength(1);
    expect(jdm.json.categories).toHaveLength(1);
    const byName = await taggable(s.leo, "?q=BMW");
    expect(byName.json.vehicles).toHaveLength(3);
    expect((await taggable(s.leo, "?q=zzzz")).json.vehicles).toHaveLength(0);
    // Le pseudo d'un compte public se cherche, jamais celui d'un compte privé.
    expect((await taggable(s.leo, "?q=Kenji")).json.vehicles).toHaveLength(1);
    expect((await taggable(s.leo, "?q=Priv_66")).json.vehicles).toHaveLength(0);
  });
});

describe("la recherche d'une personne par son pseudo (T5)", () => {
  it("sous 2 caractères : jamais de liste ; dès 2 : seulement ceux qui avaient une place ou une présence", async () => {
    const lea = await signUp("Lea_11");
    await presentAt(s.event.id, lea.id);
    await signUp("Kenzo_Nobody");
    const none = await taggable(s.leo, "?q=k");
    expect(none.json.people).toEqual([]);
    expect(none.status).toBe(200);
    const kenji = await taggable(s.leo, "?q=ke");
    expect(kenji.json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Kenji_66"]);
    expect(Object.keys(kenji.json.people[0]).sort()).toEqual(["avatarUrl", "mine", "pseudo", "userId"]);
    // Une présence validée suffit ; un inscrit sans place ni présence n'apparaît pas.
    expect((await taggable(s.leo, "?q=Lea")).json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Lea_11"]);
    expect((await taggable(s.leo, "?q=Nobody")).json.people).toEqual([]);
    // Un compte privé est proposé AVEC son pseudo (celui qui le tape le connaît).
    expect((await taggable(s.leo, "?q=priv")).json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual([
      "Priv_66",
    ]);
    // Les caractères spéciaux ne sont pas des jokers : `%` ne renvoie pas tout le monde.
    expect((await taggable(s.leo, "?q=%25%25")).json.people).toEqual([]);
    expect((await taggable(s.leo, "?q=__")).json.people).toEqual([]);
  });

  it("un compte supprimé, banni ou suspendu n'est pas proposé", async () => {
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, s.kenji.id));
    expect((await taggable(s.leo, "?q=ke")).json.people).toEqual([]);
    await db.update(profiles).set({ bannedAt: null, deletedAt: new Date() }).where(eq(profiles.userId, s.kenji.id));
    expect((await taggable(s.leo, "?q=ke")).json.people).toEqual([]);
    await db
      .update(profiles)
      .set({ deletedAt: null, suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, s.kenji.id));
    expect((await taggable(s.leo, "?q=ke")).json.people).toEqual([]);
  });

  it("un passionné ne cherche que lui-même (jamais un autre)", async () => {
    const res = await taggable(s.dam, "?q=ke");
    expect(res.json.people).toEqual([]);
    expect((await taggable(s.dam, "?q=da")).json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual(["Dam_66"]);
  });

  it("une place retenue d'un compte sans véhicule actif ou un billet : la personne reste identifiable par son pseudo", async () => {
    // Un exposant retenu mais dont la voiture est vendue : il avait une place.
    const sold = await signUp("Vendu_66");
    const car = await carAt(s.event.id, sold, ref);
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, car.vehicle.id));
    expect((await taggable(s.leo, "?q=Vendu")).json.people.map((p: { pseudo: string }) => p.pseudo)).toEqual([
      "Vendu_66",
    ]);
    // En attente : pas de place.
    const waiting = await signUp("Attente_66");
    await carAt(s.event.id, waiting, ref, { status: "pending" });
    expect((await taggable(s.leo, "?q=Attente")).json.people).toEqual([]);
  });
});

describe("poser une identification", () => {
  it("le média identifie une voiture : 201, liste blanche, `tagged_as media`, idempotent (200, une seule ligne)", async () => {
    const res = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(res.status).toBe(201);
    expect(Object.keys(res.json).sort()).toEqual([
      "canRemove",
      "id",
      "kind",
      "mine",
      "removeAs",
      "taggedAs",
      "user",
      "vehicle",
    ]);
    expect(res.json).toMatchObject({
      kind: "vehicle",
      taggedAs: "media",
      mine: false,
      canRemove: true,
      removeAs: "tagger",
      user: { pseudo: "Dam_66" },
    });
    expect(res.json.vehicle.id).toBe(s.car.dam.vehicle.id);
    expect([...keysOf(res.json)]).not.toContain("userId");
    const again = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(again.status).toBe(200);
    expect(again.json.id).toBe(res.json.id);
    expect(await rows()).toHaveLength(1);
    const [row] = await rows();
    expect(row).toMatchObject({
      userId: s.dam.id,
      taggedBy: s.leo.id,
      taggedAs: "media",
      removedAt: null,
      targetKind: "vehicle",
    });
  });

  it("deux poses simultanées de la même cible : une seule ligne", async () => {
    const both = await Promise.all([
      pose(s.leo, photo(1), { vehicleId: s.car.kenji.vehicle.id }),
      pose(s.leo, photo(1), { vehicleId: s.car.kenji.vehicle.id }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await rows()).toHaveLength(1);
  });

  it("une cible hors du plateau : 404 sans dire pourquoi (non pointée, autre événement, inconnue, personne sans place)", async () => {
    const noPlace = await signUp("Sans_Place");
    for (const body of [
      { vehicleId: s.car.lazy.vehicle.id },
      { vehicleId: "00000000-0000-4000-8000-000000000000" },
      { userId: noPlace.id },
      { userId: "n-existe-pas" },
    ]) {
      const res = await pose(s.leo, photo(0), body);
      expect(res.status).toBe(404);
      expect(res.json.error.message).toBe("Introuvable");
    }
    expect(await rows()).toHaveLength(0);
  });

  it("par pseudo : une personne qui avait une place (ou une présence) ; `kind user`", async () => {
    const res = await pose(s.leo, photo(2), { userId: s.kenji.id });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ kind: "user", vehicle: null, user: { pseudo: "Kenji_66" }, taggedAs: "media" });
    const lea = await signUp("Lea_11");
    await presentAt(s.event.id, lea.id);
    expect((await pose(s.leo, photo(2), { userId: lea.id })).status).toBe(201);
  });

  it("le corps doit désigner une voiture OU une personne", async () => {
    expect((await pose(s.leo, photo(0), {})).status).toBe(400);
    expect((await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id, userId: s.dam.id })).status).toBe(400);
    expect((await pose(s.leo, "pas-un-uuid", { userId: s.dam.id })).status).toBe(400);
  });

  it("`tagged_as` est déduit : média, organisateur (second facteur), intéressé ; un intéressé ne pose que pour lui", async () => {
    const byOrga = await pose(s.orga, photo(0), { vehicleId: s.car.kenji.vehicle.id });
    expect(byOrga.status).toBe(201);
    expect(byOrga.json.taggedAs).toBe("organizer");
    const own = await pose(s.dam, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(own.status).toBe(201);
    expect(own.json).toMatchObject({ taggedAs: "owner", mine: true, removeAs: "withdraw" });
    const self = await pose(s.dam, photo(1), { userId: s.dam.id });
    expect(self.status).toBe(201);
    expect((await pose(s.dam, photo(0), { vehicleId: s.car.kenji.vehicle.id })).status).toBe(404);
    expect((await pose(s.dam, photo(0), { userId: s.kenji.id })).status).toBe(404);
    const co = await signUp("CoOrga_66");
    await addMember(s.structure.id, co.id, "co_organizer");
    const noFactor = await pose(co, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(noFactor.status).toBe(403);
    expect(noFactor.json.error.code).toBe("two_factor_required");
  });

  it("le média identifie même sur son brouillon ; personne d'autre ne voit le brouillon ; un album supprimé : 404", async () => {
    const draft = await call(s.leo, "POST", "/me/albums", { eventId: s.event.id });
    // Une photo de brouillon : celle d'un autre album n'est jamais identifiable par un tiers.
    const sent = await sendUpload(s.leo);
    const added = await call(s.leo, "POST", `/me/albums/${draft.json.id}/photos`, {
      uploadKey: sent.key,
      plateDecision: "none",
      clientId: crypto.randomUUID(),
    });
    expect(added.status).toBe(201);
    const draftPhoto = added.json.id as string;
    expect((await pose(s.orga, draftPhoto, { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
    expect((await pose(s.dam, draftPhoto, { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
    expect((await pose(s.leo, draftPhoto, { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    // Album supprimé : plus rien à identifier.
    expect((await call(s.leo, "DELETE", `/me/albums/${s.albumId}`)).status).toBe(204);
    expect((await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
    expect((await pose(s.dam, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
  });

  it("un média dont l'accréditation est tombée n'identifie plus ; sans session : 401 ; compte suspendu : lecture seule", async () => {
    expect((await pose(null, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(401);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, s.leo.id));
    expect((await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(403);
    await db.update(profiles).set({ suspendedUntil: null }).where(eq(profiles.userId, s.leo.id));
    await db.update(applications).set({ status: "withdrawn" }).where(eq(applications.mediaProfileId, s.leoMedia));
    const res = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    // L'album n'est plus servi à personne d'autre que son média (V6) ; le média ne complète plus.
    expect([403, 404]).toContain(res.status);
    expect(await rows()).toHaveLength(0);
  });

  it("deux voitures d'un même propriétaire sur la même photo : deux lignes (l'unicité d'une personne ne vaut que par pseudo)", async () => {
    const second = await carAt(s.event.id, s.dam, ref);
    expect((await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    expect((await pose(s.leo, photo(0), { vehicleId: second.vehicle.id })).status).toBe(201);
    expect((await pose(s.leo, photo(0), { userId: s.dam.id })).status).toBe(201);
    expect(await rows()).toHaveLength(3);
  });

  it("la limite : 120 identifications par heure", async () => {
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id })).status;
    expect(last).toBe(429);
  });
});

describe("retirer : l'intéressé (T41) et le poseur", () => {
  const tagIdOf = async (p: number, vehicleId: string) => {
    const r = await pose(s.leo, photo(p), { vehicleId });
    return r.json.id as string;
  };

  it("« Ce n'est pas ma voiture » : la ligne reste (removed_*), personne ne la repose, l'intéressé le peut", async () => {
    const id = await tagIdOf(0, s.car.dam.vehicle.id);
    expect((await call(s.dam, "DELETE", `/me/album-tags/${id}`, { reason: "not_mine" })).status).toBe(204);
    const [row] = await rows();
    expect(row).toMatchObject({ removedBy: s.dam.id, removedReason: "not_mine" });
    expect(row?.removedAt).not.toBeNull();
    // Le média, l'organisateur : 409 `tag_declined`. Même par le pseudo de l'intéressé sur la même photo.
    for (const who of [s.leo, s.orga]) {
      const res = await pose(who, photo(0), { vehicleId: s.car.dam.vehicle.id });
      expect(res.status).toBe(409);
      expect(res.json.error.code).toBe("tag_declined");
    }
    expect((await pose(s.leo, photo(0), { userId: s.dam.id })).status).toBe(409);
    // La même cible sur une autre photo n'est pas concernée.
    expect((await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    // L'intéressé la repose lui-même : la ligne est réactivée.
    const mine = await pose(s.dam, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(mine.status).toBe(201);
    expect(mine.json).toMatchObject({ id, taggedAs: "owner", mine: true });
    const [back] = await db.select().from(albumPhotoTags).where(eq(albumPhotoTags.id, id));
    expect(back).toMatchObject({ removedAt: null, removedReason: null, taggedBy: s.dam.id, taggedAs: "owner" });
  });

  it("« Retirer mon identification » (posée par lui) : `withdraw`, définitive pour les autres", async () => {
    const mine = await pose(s.dam, photo(2), { vehicleId: s.car.dam.vehicle.id });
    expect((await call(s.dam, "DELETE", `/me/album-tags/${mine.json.id}`)).status).toBe(204);
    const [row] = await rows();
    expect(row?.removedReason).toBe("withdraw");
    expect((await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id })).status).toBe(409);
    // Rejouée : rien ne bouge.
    expect((await call(s.dam, "DELETE", `/me/album-tags/${mine.json.id}`)).status).toBe(204);
    expect((await rows())[0]?.removedReason).toBe("withdraw");
  });

  it("le motif envoyé doit correspondre ; l'identification d'un autre : 404", async () => {
    const id = await tagIdOf(0, s.car.dam.vehicle.id);
    expect((await call(s.dam, "DELETE", `/me/album-tags/${id}`, { reason: "withdraw" })).status).toBe(400);
    expect((await call(s.dam, "DELETE", `/me/album-tags/${id}`, { reason: "tagger" })).status).toBe(400);
    for (const who of [s.kenji, s.marc, s.orga, s.leo]) {
      expect((await call(who, "DELETE", `/me/album-tags/${id}`)).status).toBe(404);
    }
    expect((await rows())[0]?.removedAt).toBeNull();
    expect((await call(null, "DELETE", `/me/album-tags/${id}`)).status).toBe(401);
  });

  it("le poseur retire sa propre identification (erreur de voiture) et peut la reposer ; seulement celui qui l'a posée", async () => {
    const id = await tagIdOf(0, s.car.dam.vehicle.id);
    // L'intéressé passe par son propre geste ; l'organisateur ni un autre média ne retirent l'identification du média.
    for (const who of [s.dam, s.kenji, s.marc, s.orga]) {
      expect((await call(who, "DELETE", `/album-photos/${photo(0)}/tags/${id}`)).status).toBe(404);
    }
    expect((await call(s.leo, "DELETE", `/album-photos/${photo(0)}/tags/${id}`)).status).toBe(204);
    const [row] = await rows();
    expect(row).toMatchObject({ removedBy: s.leo.id, removedReason: "tagger" });
    // Reposable par un poseur (la même ligne est réactivée).
    const again = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(id);
    expect(await rows()).toHaveLength(1);
    // Une fois l'intéressé passé par là, le poseur ne retire plus rien.
    expect((await call(s.dam, "DELETE", `/me/album-tags/${id}`)).status).toBe(204);
    expect((await call(s.leo, "DELETE", `/album-photos/${photo(0)}/tags/${id}`)).status).toBe(404);
  });

  it("l'organisateur retire sa propre identification (second facteur exigé)", async () => {
    const r = await pose(s.orga, photo(0), { vehicleId: s.car.kenji.vehicle.id });
    expect((await call(s.leo, "DELETE", `/album-photos/${photo(0)}/tags/${r.json.id}`)).status).toBe(404);
    expect((await call(s.orga, "DELETE", `/album-photos/${photo(0)}/tags/${r.json.id}`)).status).toBe(204);
    expect((await rows())[0]?.removedReason).toBe("tagger");
  });

  it("une identification retirée par le poseur n'apparaît plus ; une ligne retirée garde ses traces et ne se supprime pas", async () => {
    const id = await tagIdOf(3, s.car.priv.vehicle.id);
    await call(s.leo, "DELETE", `/album-photos/${photo(3)}/tags/${id}`);
    const album = await call(s.leo, "GET", `/albums/${s.albumId}`);
    expect(album.json.tagsCount ?? 0).toBe(0);
    expect(JSON.stringify(album.json.photos)).not.toContain(`"tags"`);
    expect(
      await db
        .select()
        .from(albumPhotoTags)
        .where(and(eq(albumPhotoTags.id, id))),
    ).toHaveLength(1);
  });
});
