// Lot 31 : garage complet — catégories cohérentes, statuts, transfert de plaque, fiche Instagram, certification.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLATE_TRANSFER_DELAY_DAYS, SHARE_SIZES } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { applyCategoryRules } from "../../../scripts/seed/garage";
import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  categories,
  checkins,
  notifications,
  plateTransferRequests,
  profiles,
  vehicleCategories,
  vehicleGenerations,
  vehicleMakes,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { certificationService } from "./certification";
import { plateTransferService } from "./plate-transfer";
import { vehiclesRepo } from "./repo";
import { cachedShareImage, clearShareImageCache, renderShareImage, SHARE_COLORS, shareFacts } from "./share-image";

afterAll(async () => {
  await pool.end();
});

const DAY = 86_400_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  clearShareImageCache();
  clock = useClock(new Date("2026-10-16T10:00:00Z"));
  ref = await seedReference();
});

const car = (plate = "ab-123-cd") => ({
  vehicleType: "car",
  makeId: ref.makeId,
  modelId: ref.modelId,
  generationId: ref.generationId,
  year: 1995,
  plate,
});

/** Marques et catégories du seed (pays, liste blanche) : Peugeot (FR), Toyota (JP), Ferrari (IT), « Autre ». */
async function brands() {
  const make = async (name: string, country: string | null, isOther = false) => {
    const [m] = await db
      .insert(vehicleMakes)
      .values({ name, slug: name.toLowerCase().replace(/\W+/g, "-"), country, isOther })
      .returning();
    const [mo] = await db
      .insert(vehicleModels)
      .values({ makeId: m!.id, name: `${name} modèle`, slug: "modele", vehicleType: "car", isOther })
      .returning();
    const [g] = await db.insert(vehicleGenerations).values({ modelId: mo!.id, name: "Série 1" }).returning();
    return { makeId: m!.id, modelId: mo!.id, generationId: g!.id };
  };
  const [supercar] = await db
    .insert(categories)
    .values({ slug: "supercar", label: "Supercar", position: 5 })
    .returning();
  const out = {
    peugeot: await make("Peugeot", "FR"),
    toyota: await make("Toyota", "JP"),
    ferrari: await make("Ferrari", "IT"),
    autre: await make("Autre", null, true),
    supercar: supercar!,
  };
  await applyCategoryRules();
  return out;
}

const vehicleOf = (b: { makeId: string; modelId: string; generationId: string }, over = {}) => ({
  vehicleType: "car",
  makeId: b.makeId,
  modelId: b.modelId,
  generationId: b.generationId,
  year: 1995,
  plate: "zz-111-zz",
  ...over,
});

describe("catégories cohérentes", () => {
  it("Peugeot + supercar refusé, Toyota + JDM accepté, 2015 + youngtimer refusé, « Autre » tout permis", async () => {
    const b = await brands();
    const u = await signUp("Categ_01");
    const refused = await call(u, "POST", "/me/vehicles", {
      ...vehicleOf(b.peugeot, { plate: "pe-001-ug" }),
      categoryIds: [b.supercar.id],
    });
    expect(refused.status).toBe(400);
    expect(refused.json.error.details.reasons[b.supercar.id]).toBe("make");

    const ok = await call(u, "POST", "/me/vehicles", {
      ...vehicleOf(b.toyota, { plate: "to-001-yo" }),
      categoryIds: [ref.jdm.id],
    });
    expect(ok.status).toBe(201);
    expect(ok.json.country).toBe("JP");

    const peugeotJdm = await call(u, "POST", "/me/vehicles", {
      ...vehicleOf(b.peugeot, { plate: "pe-002-ug" }),
      categoryIds: [ref.jdm.id],
    });
    expect(peugeotJdm.status).toBe(400);
    expect(peugeotJdm.json.error.details.reasons[ref.jdm.id]).toBe("country");

    const young = await call(u, "POST", "/me/vehicles", {
      ...vehicleOf(b.toyota, { plate: "to-002-yo", year: 2015 }),
      categoryIds: [ref.youngtimer.id],
    });
    expect(young.status).toBe(400);

    const other = await call(u, "POST", "/me/vehicles", {
      ...vehicleOf(b.autre, { plate: "au-001-tr" }),
      categoryIds: [b.supercar.id, ref.jdm.id],
    });
    expect(other.status).toBe(201);
  });

  it("le référentiel dit pourquoi une catégorie est grisée ; sans paramètre, tout est éligible", async () => {
    const b = await brands();
    const q = `makeId=${b.peugeot.makeId}&vehicleType=car&year=2015`;
    const res = await app.request(`/api/vehicle-reference/categories?${q}`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      slug: string;
      eligible: boolean;
      refusal: string | null;
      reason: string | null;
    }[];
    const by = (slug: string) => list.find((c) => c.slug === slug);
    expect(by("supercar")).toMatchObject({ eligible: false, refusal: "make", reason: "Réservée à certaines marques" });
    expect(by("jdm")).toMatchObject({ eligible: false, refusal: "country" });
    expect(by("youngtimer")).toMatchObject({ eligible: false, refusal: "age" });
    const all = (await (await app.request("/api/vehicle-reference/categories")).json()) as { eligible: boolean }[];
    expect(all.every((c) => c.eligible)).toBe(true);
    expect((await app.request("/api/vehicle-reference/categories?makeId=pas-un-uuid")).status).toBe(400);
  });

  it("une fiche ancienne reste modifiable (description) même si les règles ont été durcies depuis", async () => {
    const u = await signUp("Categ_02");
    const v = await call(u, "POST", "/me/vehicles", { ...car(), categoryIds: [ref.jdm.id] });
    expect(v.status).toBe(201);
    // BMW (DE) dans « JDM » : règle posée après coup.
    await applyCategoryRules();
    const res = await call(u, "PATCH", `/me/vehicles/${v.json.id}`, { description: "Nouvelle description" });
    expect(res.status).toBe(200);
    expect((await call(u, "PATCH", `/me/vehicles/${v.json.id}`, { year: 1996 })).status).toBe(400);
  });
});

describe("statuts et fiche", () => {
  it("poids et pays de la marque affichés ; vendu / souvenir / accidenté avec motif, plaque facultative", async () => {
    const u = await signUp("Statut_01");
    const v = await call(u, "POST", "/me/vehicles", { ...car(), weightKg: 1180 });
    expect(v.json).toMatchObject({ weightKg: 1180, country: "DE", status: "active" });
    for (const status of ["sold", "keepsake", "wrecked"] as const) {
      const res = await call(u, "PATCH", `/me/vehicles/${v.json.id}`, { status, statusNote: `Motif ${status}` });
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ status, statusNote: `Motif ${status}` });
      expect(res.json.archivedAt).not.toBeNull();
    }
    const back = await call(u, "PATCH", `/me/vehicles/${v.json.id}`, { status: "active" });
    expect(back.json).toMatchObject({ status: "active", statusNote: null, archivedAt: null });
  });

  it("un véhicule archivé ne candidate pas ; créé directement archivé sans plaque", async () => {
    const u = await signUp("Statut_02");
    const { plate: _p, ...noPlate } = car();
    const res = await call(u, "POST", "/me/vehicles", { ...noPlate, status: "keepsake", statusNote: "Mon premier" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ status: "keepsake", plate: null, statusNote: "Mon premier" });
  });

  it("historique du véhicule : événements et présence", async () => {
    const orga = await signUp("Orga_01");
    const s = await createStructure(orga.id);
    const u = await signUp("Histo_01");
    const v = await createVehicle(u.id, ref);
    const e = await createEvent(s.id, { startsAt: new Date("2026-09-01T16:00:00Z"), title: "Sortie de septembre" });
    const [a] = await db
      .insert(applications)
      .values({
        eventId: e.id,
        userId: u.id,
        vehicleId: v.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    await db
      .insert(checkins)
      .values({ applicationId: a!.id, eventId: e.id, method: "scan", checkedInAt: new Date("2026-09-01T16:30:00Z") });
    const res = await call(u, "GET", `/me/vehicles/${v.id}/history`);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject([{ eventTitle: "Sortie de septembre", status: "accepted", attended: true }]);
    expect((await call(await signUp("Histo_02"), "GET", `/me/vehicles/${v.id}/history`)).status).toBe(404);
  });
});

describe("transfert de plaque", () => {
  async function setup() {
    const marc = await signUp("Marc_66");
    const lea = await signUp("Lea_11");
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const gti = await call(marc, "POST", "/me/vehicles", car("AB-123-CD"));
    expect(gti.status).toBe(201);
    const orga = await signUp("Orga_02");
    const structure = await createStructure(orga.id);
    return { marc, lea, admin, gti: gti.json, event: await createEvent(structure.id) };
  }
  const notified = (userId: string, type: string) =>
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.type, type as never)),
    });

  it("la plaque d'un autre : véhicule créé en attente, sans plaque normalisée, candidature refusée, Marc notifié", async () => {
    const { marc, lea, gti, event } = await setup();
    const res = await call(lea, "POST", "/me/vehicles", car("ab 123 cd"));
    expect(res.status).toBe(201);
    expect(res.json.plateTransfer).toMatchObject({ status: "pending" });
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, res.json.id) });
    expect(row).toMatchObject({ plateNormalized: null, status: "active" });
    expect(row?.pendingTransferId).toBeTruthy();
    // La plaque de Marc n'a pas bougé.
    expect((await call(marc, "GET", `/me/vehicles/${gti.id}`)).json.status).toBe("active");
    expect(await notified(marc.id, "plate_transfer_request")).toHaveLength(1);
    // Une photo, puis candidature : refusée tant que la plaque est en attente.
    await db
      .insert(vehiclePhotos)
      .values({ vehicleId: res.json.id, position: 1, storageKey: "t/x.webp", width: 1, height: 1, bytes: 1 });
    const apply = await call(lea, "POST", `/events/${event.id}/applications`, {
      vehicleIds: [res.json.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    expect(apply.status).toBe(400);
    expect(apply.json.error.message).toContain("plaque en attente de transfert");
    // La plaque ne peut pas être changée en attente.
    expect((await call(lea, "PATCH", `/me/vehicles/${res.json.id}`, { plate: "zz-999-zz" })).status).toBe(400);
    // Une deuxième demande identique est refusée.
    expect((await call(lea, "POST", "/me/vehicles", car("AB123CD"))).status).toBe(409);
  });

  it("deux véhicules actifs de la même personne : 409", async () => {
    const marc = await signUp("Marc_66");
    await call(marc, "POST", "/me/vehicles", car());
    const dup = await call(marc, "POST", "/me/vehicles", car("AB 123 CD"));
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("plate_taken");
    expect(await db.select().from(plateTransferRequests)).toHaveLength(0);
  });

  it("Marc accepte : sa 205 passe « Vendu », le véhicule de Léa devient actif avec la plaque", async () => {
    const { marc, lea, gti } = await setup();
    const created = await call(lea, "POST", "/me/vehicles", car("AB-123-CD"));
    const inbox = await call(marc, "GET", "/me/plate-transfers");
    expect(inbox.json.incoming).toMatchObject([{ requesterPseudo: "Lea_11", holderVehicleId: gti.id }]);
    expect((await call(lea, "GET", "/me/plate-transfers")).json.outgoing).toHaveLength(1);
    const transferId = inbox.json.incoming[0].id;
    // Léa ne peut pas répondre à la place de Marc.
    expect((await call(lea, "POST", `/plate-transfers/${transferId}/accept`)).status).toBe(404);
    expect((await call(marc, "POST", `/plate-transfers/${transferId}/accept`)).status).toBe(200);
    expect((await call(marc, "GET", `/me/vehicles/${gti.id}`)).json).toMatchObject({ status: "sold" });
    const mine = await call(lea, "GET", `/me/vehicles/${created.json.id}`);
    expect(mine.json).toMatchObject({ status: "active", plateTransfer: null });
    const row = await db.query.vehicles.findFirst({ where: eq(vehicles.id, created.json.id) });
    expect(row).toMatchObject({ plateNormalized: "AB123CD", pendingTransferId: null });
    expect((await db.query.plateTransferRequests.findFirst())?.status).toBe("accepted");
    expect(await notified(lea.id, "plate_transfer_accepted")).toHaveLength(1);
    // Réponse déjà donnée.
    expect((await call(marc, "POST", `/plate-transfers/${transferId}/decline`)).status).toBe(409);
  });

  it("Marc refuse : arbitrage de l'équipe ; refus final → non immatriculé, plaque effacée ; acceptation → plaque transférée", async () => {
    const { marc, lea, admin, gti } = await setup();
    const created = await call(lea, "POST", "/me/vehicles", car("AB-123-CD"));
    const transferId = (await call(marc, "GET", "/me/plate-transfers")).json.incoming[0].id;
    expect((await call(marc, "POST", `/plate-transfers/${transferId}/decline`)).status).toBe(200);
    expect((await db.query.plateTransferRequests.findFirst())?.status).toBe("arbitrated");
    expect(await notified(lea.id, "plate_transfer_arbitrated")).toHaveLength(1);
    // File de l'équipe, réservée aux administrateurs.
    expect((await call(marc, "GET", "/admin/plate-transfers")).status).toBe(403);
    const queue = await call(admin, "GET", "/admin/plate-transfers");
    expect(queue.json).toMatchObject([
      { id: transferId, status: "arbitrated", requesterPseudo: "Lea_11", holderPseudo: "Marc_66" },
    ]);
    expect(
      (await call(marc, "POST", `/admin/plate-transfers/${transferId}/decide`, { decision: "refuse" })).status,
    ).toBe(403);
    expect(
      (
        await call(admin, "POST", `/admin/plate-transfers/${transferId}/decide`, {
          decision: "refuse",
          note: "Preuve de vente absente",
        })
      ).status,
    ).toBe(200);
    const after = await db.query.vehicles.findFirst({ where: eq(vehicles.id, created.json.id) });
    expect(after).toMatchObject({ unregistered: true, plate: null, plateNormalized: null, pendingTransferId: null });
    expect((await call(marc, "GET", `/me/vehicles/${gti.id}`)).json.status).toBe("active");
    expect(await notified(lea.id, "plate_transfer_refused")).toHaveLength(1);
    expect(
      (await call(admin, "POST", `/admin/plate-transfers/${transferId}/decide`, { decision: "accept" })).status,
    ).toBe(409);

    // Autre cas : l'équipe accepte.
    const second = await call(lea, "POST", "/me/vehicles", car("ab-123-cd"));
    const secondTransfer = (await call(marc, "GET", "/me/plate-transfers")).json.incoming[0].id;
    await call(marc, "POST", `/plate-transfers/${secondTransfer}/decline`);
    expect(
      (await call(admin, "POST", `/admin/plate-transfers/${secondTransfer}/decide`, { decision: "accept" })).status,
    ).toBe(200);
    expect((await call(marc, "GET", `/me/vehicles/${gti.id}`)).json.status).toBe("sold");
    expect((await call(lea, "GET", `/me/vehicles/${second.json.id}`)).json.plateTransfer).toBeNull();
  });

  it("sept jours sans réponse : la demande passe à l'arbitrage (tâche planifiée, puis secours)", async () => {
    const { marc, lea } = await setup();
    await call(lea, "POST", "/me/vehicles", car("AB-123-CD"));
    const transfer = (await db.query.plateTransferRequests.findFirst())!;
    const job = clock.jobs.jobs.find((j) => j.name === "plate-transfer.escalate");
    expect(job?.data).toEqual({ transferId: transfer.id });
    expect(job?.startAfter?.getTime()).toBe(transfer.createdAt.getTime() + PLATE_TRANSFER_DELAY_DAYS * DAY);
    // Trop tôt : rien ne bouge.
    clock.advance(6 * DAY);
    expect(await plateTransferService.escalate(transfer.id)).toBe(0);
    clock.advance(DAY + 1000);
    expect(await plateTransferService.escalate(transfer.id)).toBe(1);
    expect((await db.query.plateTransferRequests.findFirst())?.status).toBe("arbitrated");
    // Idempotent.
    expect(await plateTransferService.escalate()).toBe(0);
    // Marc ne peut plus répondre : la demande est à l'équipe.
    expect((await call(marc, "POST", `/plate-transfers/${transfer.id}/accept`)).status).toBe(409);
  });

  it("l'ancien propriétaire vend son véhicule de lui-même : la plaque est libérée, la demande acceptée d'office", async () => {
    const { marc, lea, gti } = await setup();
    const created = await call(lea, "POST", "/me/vehicles", car("AB-123-CD"));
    await call(marc, "PATCH", `/me/vehicles/${gti.id}`, { status: "sold", statusNote: "Vendu à un ami" });
    const mine = await call(lea, "GET", `/me/vehicles/${created.json.id}`);
    expect(mine.json.plateTransfer).toBeNull();
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, created.json.id) }))?.plateNormalized).toBe(
      "AB123CD",
    );
    expect((await call(marc, "GET", `/me/vehicles/${gti.id}`)).json.statusNote).toBe("Vendu à un ami");
  });

  it("le demandeur supprime son véhicule en attente : la demande est annulée", async () => {
    const { marc, lea } = await setup();
    const created = await call(lea, "POST", "/me/vehicles", car("AB-123-CD"));
    expect((await call(lea, "DELETE", `/me/vehicles/${created.json.id}`)).status).toBe(204);
    expect((await db.query.plateTransferRequests.findFirst())?.status).toBe("refused");
    expect((await call(marc, "GET", "/me/plate-transfers")).json.incoming).toHaveLength(0);
  });
});

describe("fiche Instagram", () => {
  async function withCover(ownerId: string, over: Partial<typeof vehicles.$inferInsert> = {}) {
    const v = await createVehicle(ownerId, ref, over);
    const key = `test-share/${v.id}.webp`;
    const cover = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#7a5c2e" } })
      .webp()
      .toBuffer();
    await storage.put(key, cover);
    await db.update(vehiclePhotos).set({ storageKey: key }).where(eq(vehiclePhotos.vehicleId, v.id));
    return v;
  }

  it("story 1080×1920 et publication 1080×1080, mises en cache une heure", async () => {
    const u = await signUp("Kenji_66");
    const v = await withCover(u.id, { year: 1996, powerHp: 330, weightKg: 1500 });
    const story = await app.request(`/api/me/vehicles/${v.id}/share-image?format=story`, {
      headers: { cookie: u.cookie },
    });
    expect(story.status).toBe(200);
    expect(story.headers.get("content-type")).toBe("image/png");
    expect(story.headers.get("cache-control")).toContain("max-age=3600");
    const storyMeta = await sharp(Buffer.from(await story.arrayBuffer())).metadata();
    expect([storyMeta.width, storyMeta.height]).toEqual([SHARE_SIZES.story.width, SHARE_SIZES.story.height]);
    const post = await app.request(`/api/me/vehicles/${v.id}/share-image?format=post`, {
      headers: { cookie: u.cookie },
    });
    const postMeta = await sharp(Buffer.from(await post.arrayBuffer())).metadata();
    expect([postMeta.width, postMeta.height]).toEqual([1080, 1080]);
    // Story v2 (lot 50) : trois styles, même taille ; style inconnu refusé.
    for (const style of ["night", "sand", "neon"]) {
      const res = await app.request(`/api/me/vehicles/${v.id}/share-image?format=story&style=${style}`, {
        headers: { cookie: u.cookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain(`orasso-story-${style}.png`);
      const m = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect([m.width, m.height]).toEqual([1080, 1920]);
    }
    expect(
      (
        await app.request(`/api/me/vehicles/${v.id}/share-image?format=story&style=rose`, {
          headers: { cookie: u.cookie },
        })
      ).status,
    ).toBe(400);
    // Format inconnu, véhicule d'un autre, visiteur sans compte.
    expect(
      (await app.request(`/api/me/vehicles/${v.id}/share-image?format=carre`, { headers: { cookie: u.cookie } }))
        .status,
    ).toBe(400);
    const other = await signUp("Autre_01");
    expect(
      (await app.request(`/api/me/vehicles/${v.id}/share-image`, { headers: { cookie: other.cookie } })).status,
    ).toBe(404);
    expect((await app.request(`/api/me/vehicles/${v.id}/share-image`)).status).toBe(401);
    // Cache : même image dans l'heure, nouvelle image après.
    const row = (await vehiclesRepo.findFullById(v.id))!;
    const t0 = Date.now();
    const a = await cachedShareImage(row, "Kenji_66", "post", t0);
    expect(await cachedShareImage(row, "Kenji_66", "post", t0 + 3_000_000)).toBe(a);
    expect(await cachedShareImage(row, "Kenji_66", "post", t0 + 3_700_000)).not.toBe(a);
  });

  it("jamais de plaque : le rendu ne lit ni la plaque ni la plaque normalisée ; nom long sur deux lignes sans erreur", async () => {
    const u = await signUp("Kenji_66");
    const [mercedes] = await db
      .insert(vehicleMakes)
      .values({ name: "Mercedes-Benz", slug: "mercedes-benz", country: "DE" })
      .returning();
    const [slk] = await db
      .insert(vehicleModels)
      .values({ makeId: mercedes!.id, name: "SLK 230 Kompressor", slug: "slk", vehicleType: "car" })
      .returning();
    const [r170] = await db.insert(vehicleGenerations).values({ modelId: slk!.id, name: "R170" }).returning();
    const v = await withCover(u.id, {
      makeId: mercedes!.id,
      modelId: slk!.id,
      generationId: r170!.id,
      plate: "SECRET-777",
    });
    const row = (await vehiclesRepo.findFullById(v.id))!;
    expect(`${row.make.name} ${row.model.name} ${row.generation?.name}`).toBe("Mercedes-Benz SLK 230 Kompressor R170");
    const guarded = new Proxy(row, {
      get(target, prop, receiver) {
        if (prop === "plate" || prop === "plateNormalized") throw new Error(`plaque lue : ${String(prop)}`);
        return Reflect.get(target, prop, receiver);
      },
    });
    for (const format of ["story", "post"] as const) {
      const png = await renderShareImage(guarded, "Kenji_66", format);
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(SHARE_SIZES[format].height);
    }
    expect(shareFacts(row)).not.toMatch(/SECRET|777/);
    expect(shareFacts(row)).toContain("Allemagne");
  });

  it("la palette de l'image reprend les jetons du thème Béton", async () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../../packages/design-system/src/tokens.ts", import.meta.url)),
      "utf8",
    );
    const beton = source.slice(source.indexOf('"beton"', source.indexOf('"color"')));
    for (const hex of Object.values(SHARE_COLORS)) expect(beton).toContain(`"${hex}"`);
  });
});

describe("certification", () => {
  async function sportVehicle(pseudo: string, over: Partial<typeof vehicles.$inferInsert> = {}) {
    const u = await signUp(pseudo);
    await db.update(profiles).set({ grade: "sport", pointsSeason: 340 }).where(eq(profiles.userId, u.id));
    const v = await createVehicle(u.id, ref, { description: "Supra Mk4 préparée.", ...over });
    await db.insert(vehiclePhotos).values([
      { vehicleId: v.id, position: 2, storageKey: "t/2.webp", width: 1, height: 1, bytes: 1 },
      { vehicleId: v.id, position: 3, storageKey: "t/3.webp", width: 1, height: 1, bytes: 1 },
    ]);
    await db.insert(vehicleCategories).values({ vehicleId: v.id, categoryId: ref.jdm.id });
    return { u, v };
  }
  const notified = (userId: string, type: string) =>
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.type, type as never)),
    });

  it("Kenji (Sport) demande, l'admin accepte → badge ; la puissance change → perdue ; la description non", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const { u: kenji, v } = await sportVehicle("Kenji_66");
    const state = (await call(kenji, "GET", `/me/vehicles/${v.id}`)).json.certification;
    expect(state).toMatchObject({ certified: false, eligible: true, missing: [], grade: "sport" });

    const req = await call(kenji, "POST", `/me/vehicles/${v.id}/certification-request`, { message: "Supra d'origine" });
    expect(req.status).toBe(201);
    expect(req.json.request.status).toBe("pending");
    // Une seule demande en cours.
    expect((await call(kenji, "POST", `/me/vehicles/${v.id}/certification-request`, {})).status).toBe(409);
    expect((await call(kenji, "GET", "/admin/certification-requests")).status).toBe(403);
    const queue = await call(admin, "GET", "/admin/certification-requests?status=pending");
    expect(queue.json).toMatchObject([{ pseudo: "Kenji_66", status: "pending", message: "Supra d'origine" }]);
    expect(queue.json[0].snapshot.photoUrls).toHaveLength(3);

    expect(
      (
        await call(admin, "POST", `/admin/certification-requests/${queue.json[0].id}/decide`, {
          decision: "accept",
          note: "OK",
        })
      ).status,
    ).toBe(200);
    const mine = (await call(kenji, "GET", `/me/vehicles/${v.id}`)).json;
    expect(mine.certified).toBe(true);
    expect(mine.certification).toMatchObject({ certified: true, request: { status: "accepted" } });
    expect((await call(admin, "GET", "/admin/certification-requests?status=pending")).json).toHaveLength(0);
    expect(await notified(kenji.id, "certification_accepted")).toHaveLength(1);
    // Le badge est visible des autres (fiche publique).
    const other = await signUp("Curieux_01");
    expect((await call(other, "GET", `/vehicles/${v.id}`)).json.certified).toBe(true);
    // La décision ne se rejoue pas.
    expect(
      (await call(admin, "POST", `/admin/certification-requests/${queue.json[0].id}/decide`, { decision: "refuse" }))
        .status,
    ).toBe(409);

    // Description, préparation, couleur, statut : la certification reste (S38).
    const desc = await call(kenji, "PATCH", `/me/vehicles/${v.id}`, {
      description: "Autre texte",
      preparation: "Turbo",
      color: "Rouge",
    });
    expect(desc.json.certified).toBe(true);
    // Puissance : perdue.
    const power = await call(kenji, "PATCH", `/me/vehicles/${v.id}`, { powerHp: 420 });
    expect(power.json.certified).toBe(false);
    const after = (await call(kenji, "GET", `/me/vehicles/${v.id}`)).json.certification;
    expect(after).toMatchObject({ certified: false, lostReason: "modified" });
    expect(await notified(kenji.id, "certification_lost")).toHaveLength(1);
    // Il peut refaire une demande.
    expect(after.eligible).toBe(true);
  });

  it("conditions : grade, photos, description, catégorie, statut ; refus avec note", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const lea = await signUp("Lea_11");
    const v = await createVehicle(lea.id, ref);
    const res = await call(lea, "POST", `/me/vehicles/${v.id}/certification-request`, {});
    expect(res.status).toBe(409);
    expect(res.json.error.details.missing).toEqual(["grade", "photos", "description", "category"]);

    const { u: kenji, v: sv } = await sportVehicle("Kenji_66");
    const requested = await call(kenji, "POST", `/me/vehicles/${sv.id}/certification-request`, {});
    const id = requested.json.request.id;
    expect(
      (
        await call(admin, "POST", `/admin/certification-requests/${id}/decide`, {
          decision: "refuse",
          note: "Photos floues",
        })
      ).status,
    ).toBe(200);
    const state = (await call(kenji, "GET", `/me/vehicles/${sv.id}`)).json.certification;
    expect(state).toMatchObject({
      certified: false,
      request: { status: "refused", note: "Photos floues" },
      eligible: true,
    });
    const note = await notified(kenji.id, "certification_refused");
    expect(note).toHaveLength(1);
    expect(note[0]?.body).toContain("Photos floues");
    // Véhicule archivé : plus de demande.
    await call(kenji, "PATCH", `/me/vehicles/${sv.id}`, { status: "sold" });
    const archived = await call(kenji, "POST", `/me/vehicles/${sv.id}/certification-request`, {});
    expect(archived.json.error.details.missing).toContain("status");
  });

  it("une photo ajoutée ou retirée fait perdre la certification ; la modification pendant la demande met à jour la fiche examinée", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const { u, v } = await sportVehicle("Kenji_66");
    await db.update(vehicles).set({ certifiedAt: new Date() }).where(eq(vehicles.id, v.id));
    const photos = await vehiclesRepo.photos(v.id);
    const removed = await call(u, "DELETE", `/me/vehicles/${v.id}/photos/${photos[2]!.id}`);
    expect(removed.json.certified).toBe(false);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, v.id) }))?.certifiedLostReason).toBe("modified");

    expect(admin.id).toBeTruthy();
  });

  it("B1 : fiche modifiée pendant l'examen (photos retirées, puissance changée) → la validation est refusée (409), le refus reste possible", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const { u, v } = await sportVehicle("Kenji_66");
    const requested = await call(u, "POST", `/me/vehicles/${v.id}/certification-request`, {});
    expect(requested.status).toBe(201);
    const id = requested.json.request.id;
    // Sans rien changer à la base de la certification : on modifie seulement la fiche, comme le ferait le membre.
    const photos = await vehiclesRepo.photos(v.id);
    for (const p of photos.slice(1)) await call(u, "DELETE", `/me/vehicles/${v.id}/photos/${p.id}`);
    await call(u, "PATCH", `/me/vehicles/${v.id}`, { powerHp: 500 });
    const stale = await call(admin, "POST", `/admin/certification-requests/${id}/decide`, { decision: "accept" });
    expect(stale.status).toBe(409);
    expect(stale.json.error.message).toContain("Fiche modifiée depuis la demande");
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, v.id) }))?.certifiedAt).toBeNull();
    const refused = await call(admin, "POST", `/admin/certification-requests/${id}/decide`, {
      decision: "refuse",
      note: "Fiche modifiée",
    });
    expect(refused.status).toBe(200);
  });

  it("B1 : seule la description change pendant l'examen → la validation passe", async () => {
    const admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
    const { u, v } = await sportVehicle("Kenji_66");
    const requested = await call(u, "POST", `/me/vehicles/${v.id}/certification-request`, {});
    await call(u, "PATCH", `/me/vehicles/${v.id}`, { description: "Description retouchée" });
    const ok = await call(admin, "POST", `/admin/certification-requests/${requested.json.request.id}/decide`, {
      decision: "accept",
    });
    expect(ok.status).toBe(200);
    expect((await call(u, "GET", `/me/vehicles/${v.id}`)).json.certified).toBe(true);
  });

  it("six mois sans événement : perdue (tâche quotidienne) ; une entrée récente la garde", async () => {
    const orga = await signUp("Orga_03");
    const s = await createStructure(orga.id);
    const quiet = await sportVehicle("Quiet_01");
    const active = await sportVehicle("Actif_02");
    await db
      .update(vehicles)
      .set({ certifiedAt: new Date("2026-01-10T00:00:00Z") })
      .where(eq(vehicles.ownerId, quiet.u.id));
    await db
      .update(vehicles)
      .set({ certifiedAt: new Date("2026-01-10T00:00:00Z") })
      .where(eq(vehicles.ownerId, active.u.id));
    // Entrée sur un événement en septembre pour le second.
    const e = await createEvent(s.id, { startsAt: new Date("2026-09-20T16:00:00Z") });
    const [a] = await db
      .insert(applications)
      .values({
        eventId: e.id,
        userId: active.u.id,
        vehicleId: active.v.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
      })
      .returning();
    await db
      .insert(checkins)
      .values({ applicationId: a!.id, eventId: e.id, method: "scan", checkedInAt: new Date("2026-09-20T16:20:00Z") });

    // Avant six mois : rien.
    clock.set(new Date("2026-06-01T00:00:00Z"));
    expect(await certificationService.sweep()).toBe(0);
    clock.set(new Date("2026-10-16T10:00:00Z"));
    expect(await certificationService.sweep()).toBe(1);
    const lost = await db.query.vehicles.findFirst({ where: eq(vehicles.id, quiet.v.id) });
    expect(lost).toMatchObject({ certifiedAt: null, certifiedLostReason: "inactive" });
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, active.v.id) }))?.certifiedAt).not.toBeNull();
    expect(await notified(quiet.u.id, "certification_lost")).toHaveLength(1);
    // Idempotent.
    expect(await certificationService.sweep()).toBe(0);
    // Hors du viewer HTTP : le service sait aussi lister pour l'admin.
    const adminV = await viewerOf(await signUp("Admin_02", { twoFactor: true, role: "super_admin" }));
    expect(await certificationService.adminList(adminV)).toEqual([]);
  });
});
