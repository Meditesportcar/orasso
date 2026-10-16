// Lot 21 : prestataires, photographes, stands des pros. Candidature hors capacité, tri séparé, accréditation « média
// officiel », « Prestataires présents », scan « Prestataire · <type> », `live.providers`, stand d'un pro.
import { randomUUID } from "node:crypto";
import { fromWallTime, PRO_PAID_FROM } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
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
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { applications, devices, events, proDiscounts, proPhotos, providerPhotos } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { applicationsService } from "../applications/service";
import { checkinsService } from "../checkins/service";
import { notificationsService } from "../notifications/service";
import { providersService } from "./service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

const ACCEPT = { decision: "accept", sendReasons: true, note: null } as const;
const APPLY = { rulesAccepted: true, message: null } as const;

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let orgaV: Viewer;
let structureId: string;
let nocturneId: string;
let expoId: string;
let lea: TestUser;
let leaV: Viewer;
let ref: Awaited<ReturnType<typeof seedReference>>;

/** Nocturne : prestataires « Food truck » et « Photographe », capacité 1 ; Expo : « Barbier » seulement. */
beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  structureId = (await createStructure(orga.id)).id;
  const nocturne = await createEvent(structureId, {
    slug: "nocturne-de-canet-2026",
    title: "Nocturne de Canet",
    startsAt: paris(10, 17, 19),
    endsAt: paris(10, 17, 23),
    capacity: 1,
    vendorTypes: ["Food truck", "Photographe"],
  });
  nocturneId = nocturne.id;
  const expo = await createEvent(structureId, {
    slug: "expo-rivesaltes-2026",
    title: "Expo Rivesaltes",
    startsAt: paris(10, 24, 10),
    endsAt: paris(10, 24, 18),
    vendorTypes: ["Barbier"],
  });
  expoId = expo.id;
  lea = await signUp("Lea_Truck");
  leaV = await viewerOf(lea);
});

const putProfile = (u: TestUser, over: Record<string, unknown> = {}) =>
  call(u, "PUT", "/me/provider-profile", {
    type: "food_truck",
    name: "La Caravane",
    description: "Burgers et frites maison.",
    ...over,
  });

/** Une photo déjà enregistrée (le chemin d'envoi est testé à part). */
async function addPhotoRow(providerId: string) {
  await db.insert(providerPhotos).values({ providerId, storageKey: `providers/${providerId}/x.webp`, position: 0 });
}

async function readyProvider(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await putProfile(u, over);
  expect(res.status).toBe(200);
  await addPhotoRow(res.json.id);
  return res.json as { id: string };
}

const applyTo = (u: TestUser, eventId: string, over: Record<string, unknown> = {}) =>
  call(u, "POST", `/events/${eventId}/provider-applications`, { ...APPLY, ...over });

describe("profil prestataire", () => {
  it("crée, met à jour, signale ce qui manque et refuse un type libre sans précision", async () => {
    const created = await putProfile(lea);
    expect(created.status).toBe(200);
    expect(created.json).toMatchObject({ type: "food_truck", typeLabel: "Food truck", name: "La Caravane" });
    expect(created.json.issue).toMatch(/photo/);

    const updated = await putProfile(lea, { name: "La Caravane 66", departments: ["66"], instagram: "@lacaravane66" });
    expect(updated.json.id).toBe(created.json.id);
    expect(updated.json).toMatchObject({ name: "La Caravane 66", departments: ["66"] });

    const other = await putProfile(await signUp("Zoe_Anim"), { type: "other" });
    expect(other.status).toBe(400);
    const ok = await putProfile(await signUp("Zoe_Anim2"), { type: "other", customType: "Glacier" });
    expect(ok.json).toMatchObject({ type: "other", typeLabel: "Glacier" });
    // « stand » vient de la fiche pro, jamais du formulaire.
    expect((await putProfile(await signUp("Max_Stand"), { type: "stand" })).status).toBe(400);
  });

  it("une photo envoyée est recompressée en WebP et le profil devient complet", async () => {
    const view = (await putProfile(lea)).json as { id: string };
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff8800" } })
      .png()
      .toBuffer();
    const photo = await providersService.addPhoto(
      leaV,
      new File([new Uint8Array(png)], "stand.png", { type: "image/png" }),
    );
    expect(photo.photos).toHaveLength(1);
    expect(photo.issue).toBeNull();
    const key = (await db.query.providerPhotos.findFirst({ where: eq(providerPhotos.providerId, view.id) }))
      ?.storageKey;
    expect(key).toMatch(/\.webp$/);
    expect(await storage.get(key as string)).not.toBeNull();
    const removed = await providersService.removePhoto(leaV, photo.photos[0]?.id as string);
    expect(removed.photos).toHaveLength(0);
  });

  it("un photographe est complet avec un Instagram ou un portfolio, sans photo", async () => {
    const view = await putProfile(lea, { type: "photographer", name: "Lea Photo" });
    expect(view.json.issue).toMatch(/Instagram|portfolio/);
    const withLink = await putProfile(lea, { type: "photographer", name: "Lea Photo", instagram: "@lea.photo" });
    expect(withLink.json.issue).toBeNull();
  });

  it("le profil public d'un prestataire n'a ni téléphone ni e-mail", async () => {
    const view = await readyProvider(lea, { phone: "06 11 22 33 44", email: "lea@truck.fr" });
    const other = await signUp("Kenji_66");
    const res = await call(other, "GET", `/providers/${view.id}`);
    expect(res.status).toBe(200);
    expect(res.json.phone).toBeUndefined();
    expect(res.json.email).toBeUndefined();
    expect((await call(null, "GET", `/providers/${view.id}`)).status).toBe(401);
  });
});

describe("candidature", () => {
  it("refuse : type absent de l'événement, profil incomplet, doublon, événement verrouillé, sans profil", async () => {
    // Sans profil.
    expect((await applyTo(lea, nocturneId)).status).toBe(400);
    // Profil incomplet (aucune photo).
    await putProfile(lea);
    const incomplete = await applyTo(lea, nocturneId);
    expect(incomplete.status).toBe(400);
    expect(incomplete.json.error.details).toMatchObject({ reason: "profile_incomplete" });
    const profile = await call(lea, "GET", "/me/provider-profile");
    await addPhotoRow(profile.json.profile.id);

    // Type non accepté.
    const refused = await applyTo(lea, expoId);
    expect(refused.status).toBe(400);
    expect(refused.json.error.details).toMatchObject({ reason: "type_not_accepted" });

    // Acceptée en pending, puis doublon.
    const ok = await applyTo(lea, nocturneId, { message: "Je viens avec ma remorque" });
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({
      status: "pending",
      accreditedMedia: false,
      event: { slug: "nocturne-de-canet-2026" },
    });
    const dup = await applyTo(lea, nocturneId);
    expect(dup.status).toBe(409);

    // Une candidature d'une autre personne sur un événement verrouillé (veille 17:00 → verrou à H-2).
    const zed = await signUp("Zed_Truck");
    await readyProvider(zed, { name: "Chez Zed" });
    clock.set(paris(10, 17, 18));
    const locked = await applyTo(zed, nocturneId);
    expect(locked.status).toBe(423);
  });

  it("jamais admise d'office, même sur un événement « sans sélection » ; événement privé refusé", async () => {
    const open = await createEvent(structureId, {
      slug: "libre-2026",
      vendorTypes: ["Food truck"],
      admission: "open",
      startsAt: paris(10, 30, 10),
      endsAt: paris(10, 30, 18),
    });
    await readyProvider(lea);
    const res = await applyTo(lea, open.id);
    expect(res.status).toBe(201);
    expect(res.json.status).toBe("pending");
    const priv = await createEvent(structureId, {
      slug: "prive-2026",
      vendorTypes: ["Food truck"],
      admission: "invite_only",
      startsAt: paris(11, 5, 10),
      endsAt: paris(11, 5, 18),
    });
    expect((await applyTo(lea, priv.id)).status).toBe(403);
  });

  it("événements ouverts : seulement ceux dont les types attendus incluent le mien", async () => {
    await readyProvider(lea);
    const res = await call(lea, "GET", "/events/open-to-providers");
    expect(res.status).toBe(200);
    expect(res.json.map((e: { slug: string }) => e.slug)).toEqual(["nocturne-de-canet-2026"]);
    const barbers = await call(lea, "GET", "/events/open-to-providers?type=barber");
    expect(barbers.json.map((e: { slug: string }) => e.slug)).toEqual(["expo-rivesaltes-2026"]);
    await applyTo(lea, nocturneId);
    const after = await call(lea, "GET", "/events/open-to-providers");
    expect(after.json[0].myApplication).toMatchObject({ status: "pending" });
  });

  it("un type libre est accepté si l'organisateur a coché « Autres » ou saisi le même texte", async () => {
    const gina = await signUp("Gina_Glace");
    await readyProvider(gina, { type: "other", customType: "Glacier" });
    await createEvent(structureId, {
      slug: "libre-glaces",
      vendorTypes: ["glacier"],
      startsAt: paris(11, 1, 10),
      endsAt: paris(11, 1, 18),
    });
    await createEvent(structureId, {
      slug: "autres-2026",
      vendorTypes: ["Autres"],
      startsAt: paris(11, 2, 10),
      endsAt: paris(11, 2, 18),
    });
    const slugs = (await providersService.openEvents(await viewerOf(gina))).map((e) => e.slug).sort();
    expect(slugs).toEqual(["autres-2026", "libre-glaces"]);
  });
});

describe("tri, hors capacité, pass", () => {
  it("un événement plein accepte encore un prestataire ; compteurs et files séparés", async () => {
    // Le véhicule de Kenji remplit la seule place.
    const kenji = await signUp("Kenji_66");
    const kv = await viewerOf(kenji);
    const car = await createVehicle(kenji.id, ref);
    const [vApp] = await applicationsService.apply(kv, nocturneId, {
      vehicleIds: [car.id],
      rulesAccepted: true,
      followStructure: true,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    await applicationsService.decide(orgaV, nocturneId, vApp?.id as string, ACCEPT);
    expect((await call(orga, "GET", `/events/${nocturneId}/counters`)).json).toMatchObject({
      accepted: 1,
      remaining: 0,
    });

    await readyProvider(lea);
    const created = await applyTo(lea, nocturneId);
    expect(created.status).toBe(201);

    // Files séparées : les véhicules (défaut) ne montrent pas Léa, les prestataires oui.
    const vehicles = await call(orga, "GET", `/events/${nocturneId}/applications`);
    expect(vehicles.json.items).toHaveLength(1);
    expect(vehicles.json.items[0].kind).toBe("vehicle");
    const providers = await call(orga, "GET", `/events/${nocturneId}/applications?kind=provider`);
    expect(providers.json.items).toHaveLength(1);
    expect(providers.json.items[0]).toMatchObject({
      kind: "provider",
      vehicle: null,
      provider: { name: "La Caravane", type: "food_truck", typeLabel: "Food truck" },
    });
    expect((await call(orga, "GET", `/events/${nocturneId}/applications/next`)).json.item).toBeNull();
    const next = await call(orga, "GET", `/events/${nocturneId}/applications/next?kind=provider`);
    expect(next.json.item.id).toBe(created.json.id);

    // Retenue malgré l'événement plein ; le compteur de places ne bouge pas ; le pass est émis.
    const decided = await call(orga, "POST", `/events/${nocturneId}/applications/${created.json.id}/decide`, ACCEPT);
    expect(decided.status).toBe(200);
    expect((await call(orga, "GET", `/events/${nocturneId}/counters`)).json).toMatchObject({
      accepted: 1,
      remaining: 0,
    });
    const pass = await call(lea, "GET", `/applications/${created.json.id}/pass`);
    expect(pass.status).toBe(200);
    expect(pass.json.payload).toBeTruthy();

    // Ni dans « mes candidatures » de véhicules, ni dans la fiche de l'événement côté candidatures de véhicule.
    expect((await call(lea, "GET", "/me/applications")).json).toEqual([]);
    const mine = await call(lea, "GET", "/me/provider-applications");
    expect(mine.json).toHaveLength(1);
    expect(mine.json[0]).toMatchObject({ status: "accepted", canWithdraw: true });
    const event = await call(lea, "GET", "/events/by-slug/nocturne-de-canet-2026");
    expect(event.json.myApplications).toEqual([]);
  });

  it("la liste d'attente d'un prestataire est manuelle : jamais d'offre automatique, rangs séparés", async () => {
    await readyProvider(lea);
    const a = await applyTo(lea, nocturneId);
    const w = await call(orga, "POST", `/events/${nocturneId}/applications/${a.json.id}/decide`, {
      decision: "waitlist",
      sendReasons: true,
    });
    expect(w.status).toBe(200);
    const mine = await call(lea, "GET", "/me/provider-applications");
    expect(mine.json[0]).toMatchObject({ status: "waitlisted", waitlistRank: 1 });
    // Une place se libère côté véhicules : le prestataire n'est pas servi.
    const kenji = await signUp("Kenji_66");
    const car = await createVehicle(kenji.id, ref);
    const [vApp] = await applicationsService.apply(await viewerOf(kenji), nocturneId, {
      vehicleIds: [car.id],
      rulesAccepted: true,
      followStructure: true,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    await applicationsService.decide(orgaV, nocturneId, vApp?.id as string, ACCEPT);
    await applicationsService.withdraw(await viewerOf(kenji), vApp?.id as string);
    const after = await db.query.applications.findFirst({ where: eq(applications.id, a.json.id) });
    expect(after?.status).toBe("waitlisted");
  });
});

describe("accréditation « média officiel »", () => {
  it("réservée aux photographes retenus, par événement", async () => {
    const photo = await signUp("Paul_Photo");
    await readyProvider(photo, { type: "photographer", name: "Paul Photo", instagram: "@paul.photo" });
    await readyProvider(lea);
    const pApp = (await applyTo(photo, nocturneId)).json;
    const lApp = (await applyTo(lea, nocturneId)).json;
    const accredit = (id: string, accredited = true) =>
      call(orga, "PATCH", `/events/${nocturneId}/applications/${id}/accreditation`, { accredited });

    // En attente : refusé. Food truck retenu : refusé.
    expect((await accredit(pApp.id)).status).toBe(400);
    await call(orga, "POST", `/events/${nocturneId}/applications/${lApp.id}/decide`, ACCEPT);
    expect((await accredit(lApp.id)).status).toBe(400);
    // Un passionné quelconque ne peut pas accréditer.
    expect(
      (await call(lea, "PATCH", `/events/${nocturneId}/applications/${pApp.id}/accreditation`, { accredited: true }))
        .status,
    ).toBe(403);

    await call(orga, "POST", `/events/${nocturneId}/applications/${pApp.id}/decide`, ACCEPT);
    const done = await accredit(pApp.id);
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ accreditedMedia: true });

    const present = await call(null, "GET", "/events/by-slug/nocturne-de-canet-2026/providers");
    expect(present.status).toBe(200);
    expect(present.json).toHaveLength(2);
    const paul = present.json.find((p: { name: string }) => p.name === "Paul Photo");
    expect(paul).toMatchObject({ type: "photographer", accreditedMedia: true });
    expect(paul.instagram).toContain("instagram.com/paul.photo");
    const truck = present.json.find((p: { name: string }) => p.name === "La Caravane");
    // L'Instagram n'est montré que pour les photographes.
    expect(truck).toMatchObject({ accreditedMedia: false, instagram: null, typeLabel: "Food truck" });

    // Retrait de l'accréditation.
    expect((await accredit(pApp.id, false)).json.accreditedMedia).toBe(false);
  });
});

describe("jour J", () => {
  it("Léa retenue : synchro « Food truck · La Caravane », scan « Prestataire », live.providers arrivé = 1", async () => {
    const staff = await signUp("Julie_66");
    await addMember(structureId, staff.id, "staff", ["scan"]);
    const staffV = await viewerOf(staff);
    const [dev] = await db.insert(devices).values({ userId: staff.id, platform: "android", name: "Pixel" }).returning();
    await readyProvider(lea);
    const app = (await applyTo(lea, nocturneId)).json;
    await call(orga, "POST", `/events/${nocturneId}/applications/${app.id}/decide`, ACCEPT);
    const pass = (await call(lea, "GET", `/applications/${app.id}/pass`)).json;

    clock.set(paris(10, 17, 18, 30));
    const sync = await call(staff, "GET", `/events/${nocturneId}/staff/sync`);
    expect(sync.status).toBe(200);
    const entry = sync.json.entries.find((e: { passId: string }) => e.passId === pass.passId);
    expect(entry).toMatchObject({
      kind: "provider",
      vehicleLabel: "Food truck · La Caravane",
      providerType: "Food truck",
      providerName: "La Caravane",
      plateHint: null,
      categories: [],
    });

    const live0 = await checkinsService.liveCounters(nocturneId);
    expect(live0).toMatchObject({ arrived: 0, expected: 0, providers: { expected: 1, arrived: 0 } });

    const scanned = await checkinsService.receiveBatch(staffV, nocturneId, {
      deviceId: dev?.id as string,
      items: [
        {
          kind: "scan",
          id: randomUUID(),
          passId: pass.passId,
          decision: "ok",
          reason: null,
          zoneCode: null,
          scannedAt: paris(10, 17, 18, 40),
        },
      ],
    });
    expect(scanned.results[0]?.result).toBe("accepted");
    const live = await call(orga, "GET", `/events/${nocturneId}/live`);
    expect(live.json).toMatchObject({ arrived: 0, expected: 0, providers: { expected: 1, arrived: 1 } });
  });
});

describe("stand d'un pro", () => {
  it("crée le profil lié (nom et photos copiés), le réutilise, et la casquette apparaît dans /me", async () => {
    const pro = await signUp("Pro_Garage");
    const proRow = await createPro(pro.id, { name: "Garage du Port", description: "Mécanique et préparation" });
    const key = `pros/${proRow.id}/photo-test.webp`;
    await storage.put(
      key,
      await sharp({ create: { width: 32, height: 32, channels: 3, background: "#222" } })
        .webp()
        .toBuffer(),
    );
    await db.insert(proPhotos).values({ proId: proRow.id, storageKey: key, position: 0 });

    const stand = await call(pro, "POST", "/me/provider-profile/from-pro");
    expect(stand.status).toBe(201);
    expect(stand.json).toMatchObject({ type: "stand", name: "Garage du Port", proProfileId: proRow.id, issue: null });
    expect(stand.json.photos).toHaveLength(1);
    expect(stand.json.photos[0].url).not.toContain("pros/");

    const again = await call(pro, "POST", "/me/provider-profile/from-pro");
    expect(again.json.id).toBe(stand.json.id);

    const me = await call(pro, "GET", "/me");
    const kinds = me.json.personas.map((p: { kind: string }) => p.kind);
    expect(kinds).toEqual(["fan", "pro", "provider"]);

    // Un compte sans fiche pro ne peut pas.
    expect((await call(lea, "POST", "/me/provider-profile/from-pro")).status).toBe(403);

    // Un événement qui attend des stands de professionnels l'accueille.
    const salon = await createEvent(structureId, {
      slug: "salon-pros",
      vendorTypes: ["Stand de professionnel"],
      startsAt: paris(11, 8, 10),
      endsAt: paris(11, 8, 18),
    });
    expect((await call(pro, "POST", `/events/${salon.id}/provider-applications`, APPLY)).status).toBe(201);
  });

  it("la casquette Prestataire d'un compte simple porte le badge des décisions non vues", async () => {
    await readyProvider(lea);
    const app = (await applyTo(lea, nocturneId)).json;
    expect((await call(lea, "GET", "/me")).json.personas.at(-1)).toMatchObject({
      kind: "provider",
      label: "La Caravane",
      badge: 0,
    });
    await call(orga, "POST", `/events/${nocturneId}/applications/${app.id}/decide`, ACCEPT);
    await notificationsService.flush();
    const me = await call(lea, "GET", "/me");
    expect(me.json.personas.at(-1)).toMatchObject({ kind: "provider", badge: 1 });
  });
});

describe("fiche de base des pros après le 21/06/2027", () => {
  it("avant : remises visibles ; après : masquées, statistiques et publications fermées, bandeau pour le pro", async () => {
    const pro = await signUp("Pro_Garage");
    const row = await createPro(pro.id, { name: "Garage du Port" });
    await db.insert(proDiscounts).values({ proId: row.id, grade: "route", percent: 10 });
    const before = await call(null, "GET", `/pros/by-slug/${row.slug}`);
    expect(before.json.discounts).toEqual({ route: 10 });
    expect((await call(pro, "GET", `/pros/${row.id}/stats`)).status).toBe(200);
    expect((await call(pro, "GET", "/me/pro")).json.visibility).toMatchObject({ full: true, banner: null });

    clock.set(new Date(PRO_PAID_FROM.getTime() + 3_600_000));
    const after = await call(null, "GET", `/pros/by-slug/${row.slug}`);
    expect(after.json).toMatchObject({ name: "Garage du Port", discounts: {}, posts: null, postsCount: 0 });
    expect((await call(pro, "GET", `/pros/${row.id}/stats`)).status).toBe(403);
    const owner = await call(pro, "GET", "/me/pro");
    expect(owner.json.visibility.full).toBe(false);
    expect(owner.json.visibility.banner).toMatch(/fiche de base/i);
    // Le propriétaire voit encore ses remises pour les modifier.
    expect(owner.json.discounts).toEqual({ route: 10 });
  });
});

describe("paiement sur place", () => {
  it("un événement payant sans billetterie est sérialisé sans adresse (paid_external, externalTicketUrl null)", async () => {
    const res = await call(orga, "POST", `/structures/${structureId}/events`, {
      title: "Course de côte",
      format: "gathering",
      startsAt: paris(11, 20, 9).toISOString(),
      endsAt: paris(11, 20, 18).toISOString(),
      admittedVehicleTypes: ["car"],
      capacity: null,
      maxVehiclesPerUser: 1,
      admission: "open",
      publicAccess: "paid_external",
      externalTicketUrl: null,
      registrationsOpenAt: paris(10, 12, 9).toISOString(),
      previewHours: 0,
      lockOffsetMinutes: 120,
      vendorTypes: [],
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ publicAccess: "paid_external", externalTicketUrl: null });
    await db.update(events).set({ status: "published", publishedAt: new Date() }).where(eq(events.id, res.json.id));
    const pub = await call(null, "GET", `/events/by-slug/${res.json.slug}`);
    expect(pub.json).toMatchObject({ publicAccess: "paid_external", externalTicketUrl: null });
  });
});

describe("mes candidatures", () => {
  it("désistement possible (pas d'événement hors capacité), puis candidature refaite", async () => {
    await readyProvider(lea);
    const app = (await applyTo(lea, nocturneId)).json;
    const w = await call(lea, "POST", `/applications/${app.id}/withdraw`);
    expect(w.status).toBe(200);
    const mine = await call(lea, "GET", "/me/provider-applications");
    expect(mine.json[0]).toMatchObject({ status: "withdrawn", canWithdraw: false });
    expect((await applyTo(lea, nocturneId)).status).toBe(201);
  });
});
