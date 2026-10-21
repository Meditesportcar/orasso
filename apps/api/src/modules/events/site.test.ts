// Lot 13 : structure (contrôle SIRET / RNA simulé, justificatifs, file de l'administration), création d'événement
// (duplication, récurrence, position de l'adresse), notification des inscrits, liens d'invitation.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  createZone,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  emailOutbox,
  events,
  eventZones,
  notifications,
  structureFollows,
  structures,
  structureVerificationDocuments,
} from "../../db/schema";
import { env } from "../../env";
import { setGeocodeFetch } from "../../lib/geocode";
import { setRegistryFetch } from "../../lib/registry";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { applicationsService } from "../applications/service";
import { notificationsService } from "../notifications/service";
import { structuresService } from "../structures/service";
import { verificationService } from "../structures/verification";
import { eventsService } from "./service";

afterAll(async () => {
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let orgaV: Viewer;
let admin: TestUser;
const previousGeocoderUrl = env.GEOCODER_URL;

beforeEach(async () => {
  // Les deux cas de géocodage injectent leur fetch : `off` dans le .env ne doit pas les désactiver.
  env.GEOCODER_URL = "https://geocoder.test";
  await resetDb();
  useClock(paris(6, 10, 10));
  ref = await seedReference();
  orga = await signUp("Orga_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  admin = await signUp("Admin_01", { twoFactor: true, role: "super_admin" });
});

afterEach(() => {
  env.GEOCODER_URL = previousGeocoderUrl;
  setRegistryFetch(null);
  setGeocodeFetch(null);
});

/** Registre simulé : renvoie les résultats donnés, quel que soit le numéro cherché. */
function fakeRegistry(results: unknown[], ok = true) {
  setRegistryFetch(
    (async () => new Response(JSON.stringify({ results }), { status: ok ? 200 : 503 })) as unknown as typeof fetch,
  );
}

const SIRET = "35600000000048";
const asso = (siret: string, overrides: Record<string, unknown> = {}) => ({
  siren: siret.slice(0, 9),
  nom_complet: "MEDITESPORTCAR",
  etat_administratif: "A",
  siege: {
    siret,
    adresse: "1 RUE DU PORT 66140 CANET",
    code_postal: "66140",
    libelle_commune: "CANET-EN-ROUSSILLON",
    etat_administratif: "A",
  },
  complements: { est_association: true, identifiant_association: "W661000001" },
  ...overrides,
});

const pdf = (name = "statuts.pdf") => new File([Buffer.from("%PDF-1.4\n%test\n")], name, { type: "application/pdf" });

async function newStructure(v: Viewer) {
  const s = await structuresService.create(v, {
    kind: "association",
    name: "MéditeSportCar",
    departments: ["66"],
    socials: {},
    city: "Canet-en-Roussillon",
    postalCode: "66140",
  } as never);
  return s;
}

describe("vérification d'une structure", () => {
  it("créée par n'importe quel utilisateur, propriétaire, non vérifiée, département déduit du code postal", async () => {
    const plain = await viewerOf(await signUp("Simple_01"));
    const s = await newStructure(plain);
    expect(s).toMatchObject({ verification: "unverified", myRole: "owner", department: "66", slug: "meditesportcar" });
  });

  it("contrôle SIRET : numéro invalide refusé sans appel réseau, numéro trouvé gardé sur la structure", async () => {
    const s = await newStructure(orgaV);
    let calls = 0;
    setRegistryFetch((async () => {
      calls++;
      return new Response(JSON.stringify({ results: [asso(SIRET)] }));
    }) as unknown as typeof fetch);
    await expect(verificationService.check(orgaV, s.id, "12345678901234")).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(calls).toBe(0);
    const view = await verificationService.check(orgaV, s.id, "356 000 000 00048");
    expect(calls).toBe(1);
    expect(view.registryCheck).toMatchObject({
      status: "matched",
      name: "MEDITESPORTCAR",
      isAssociation: true,
      department: "66",
    });
    expect(view.siret).toBe(SIRET);
    expect(view.rna).toBe("W661000001");
  });

  it("établissement fermé, introuvable ou registre injoignable : jamais « concluant »", async () => {
    const s = await newStructure(orgaV);
    fakeRegistry([asso(SIRET, { etat_administratif: "C" })]);
    expect((await verificationService.check(orgaV, s.id, SIRET)).registryCheck?.status).toBe("closed");
    fakeRegistry([]);
    const missing = await verificationService.check(orgaV, s.id, "W123456789");
    expect(missing.registryCheck?.status).toBe("not_found");
    fakeRegistry([], false);
    expect((await verificationService.check(orgaV, s.id, SIRET)).registryCheck?.status).toBe("unavailable");
  });

  it("RNA : trouvé par l'identifiant d'association", async () => {
    const s = await newStructure(orgaV);
    fakeRegistry([asso(SIRET)]);
    const view = await verificationService.check(orgaV, s.id, "W661000001");
    expect(view.registryCheck).toMatchObject({ status: "matched", source: "rna" });
  });

  it("envoi à l'équipe : justificatif obligatoire, contrôle concluant (ou pièce d'identité d'un club non déclaré)", async () => {
    const s = await newStructure(orgaV);
    await expect(verificationService.submit(orgaV, s.id)).rejects.toMatchObject({ code: "validation_error" });
    await verificationService.addDocument(orgaV, s.id, "statutes", pdf());
    // Document seul, sans contrôle du registre : refusé.
    await expect(verificationService.submit(orgaV, s.id)).rejects.toMatchObject({ code: "validation_error" });
    fakeRegistry([asso(SIRET)]);
    await verificationService.check(orgaV, s.id, SIRET);
    const view = await verificationService.submit(orgaV, s.id);
    expect(view.verification).toBe("pending");
    await expect(verificationService.submit(orgaV, s.id)).rejects.toMatchObject({ code: "conflict" });

    // Club non déclaré : la pièce d'identité du responsable remplace le registre.
    const club = await newStructure(await viewerOf(await signUp("Club_01", { twoFactor: true })));
    const clubOwner = await viewerOf(await signUp("Club_02", { twoFactor: true }));
    const other = await structuresService.create(clubOwner, {
      kind: "club",
      name: "Les Amis du Pont",
      departments: [],
      socials: {},
    } as never);
    await verificationService.addDocument(clubOwner, other.id, "identity", pdf("cni.pdf"));
    expect((await verificationService.submit(clubOwner, other.id)).verification).toBe("pending");
    void club;
  });

  it("fichiers : type vérifié sur le contenu, taille limitée, privés (jamais servis publiquement)", async () => {
    const s = await newStructure(orgaV);
    const fake = new File([Buffer.from("<script>alert(1)</script>")], "x.pdf", { type: "application/pdf" });
    await expect(verificationService.addDocument(orgaV, s.id, "kbis", fake)).rejects.toMatchObject({ status: 415 });
    const doc = await verificationService.addDocument(orgaV, s.id, "kbis", pdf("kbis.pdf"));
    const row = await db.query.structureVerificationDocuments.findFirst({
      where: eq(structureVerificationDocuments.id, doc.id),
    });
    expect(row?.storageKey.startsWith("private/")).toBe(true);
    const publicRead = await call(null, "GET", `/files/${row?.storageKey}`);
    expect(publicRead.status).toBe(404);
    // Un autre utilisateur n'envoie rien pour cette structure.
    const intruder = await viewerOf(await signUp("Intrus_01", { twoFactor: true }));
    await expect(verificationService.addDocument(intruder, s.id, "kbis", pdf())).rejects.toMatchObject({ status: 403 });
  });

  it("file de l'administration : réservée au super admin, validation → badge, pièce d'identité supprimée, e-mail au propriétaire", async () => {
    const s = await newStructure(orgaV);
    fakeRegistry([asso(SIRET)]);
    await verificationService.check(orgaV, s.id, SIRET);
    await verificationService.addDocument(orgaV, s.id, "statutes", pdf());
    const id = await verificationService.addDocument(orgaV, s.id, "identity", pdf("cni.pdf"));
    await verificationService.submit(orgaV, s.id);

    expect((await call(orga, "GET", "/admin/structures")).status).toBe(403);
    const queue = await call(admin, "GET", "/admin/structures");
    expect(queue.status).toBe(200);
    expect(queue.json).toHaveLength(1);
    expect(queue.json[0]).toMatchObject({
      name: "MéditeSportCar",
      verification: "pending",
      owner: { pseudo: "Orga_66" },
    });
    expect(queue.json[0].documents).toHaveLength(2);

    const file = await call(admin, "GET", `/admin/verification-documents/${id.id}`);
    expect(file.status).toBe(200);

    // Publication impossible tant que la structure n'est pas vérifiée.
    const draft = await eventsService.create(orgaV, s.id, eventInput() as never);
    await expect(eventsService.publish(orgaV, draft.id)).rejects.toMatchObject({ status: 403 });

    expect(
      (await call(admin, "POST", `/admin/structures/${s.id}/verify`, { verified: true, note: "Statuts reçus" })).status,
    ).toBe(204);
    const after = await db.query.structures.findFirst({ where: eq(structures.id, s.id) });
    expect(after?.verification).toBe("verified");
    expect(after?.badgeExpiresAt).not.toBeNull();
    const left = await db.query.structureVerificationDocuments.findMany({
      where: eq(structureVerificationDocuments.structureId, s.id),
    });
    expect(left.map((d) => d.kind)).toEqual(["statutes"]);
    expect(
      await storage.get((await db.query.structureVerificationDocuments.findFirst())?.storageKey ?? "x"),
    ).not.toBeNull();
    const mails = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "structure_verification"));
    expect(mails).toHaveLength(1);
    expect((await eventsService.publish(orgaV, draft.id)).status).toBe("published");
    expect((await call(null, "GET", "/structures")).json.items.map((x: { slug: string }) => x.slug)).toContain(s.slug);
  });

  it("refus : la structure reste non vérifiée, le propriétaire reçoit le motif", async () => {
    const s = await newStructure(orgaV);
    await verificationService.addDocument(orgaV, s.id, "identity", pdf("cni.pdf"));
    await verificationService.submit(orgaV, s.id);
    await call(admin, "POST", `/admin/structures/${s.id}/verify`, { verified: false, note: "Pièce illisible" });
    const after = await db.query.structures.findFirst({ where: eq(structures.id, s.id) });
    expect(after?.verification).toBe("unverified");
    const mail = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.template, "structure_verification") });
    expect(mail?.subject).toContain("à compléter");
  });
});

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Rassemblement du port",
    format: "gathering" as const,
    startsAt: paris(7, 5, 18),
    endsAt: paris(7, 5, 23),
    addressLine: "Place de la République",
    postalCode: "66140",
    city: "Canet-en-Roussillon",
    admittedVehicleTypes: ["car" as const],
    capacity: 50,
    maxVehiclesPerUser: 1,
    admission: "filtered" as const,
    publicAccess: "free" as const,
    registrationsOpenAt: paris(6, 11, 10),
    previewHours: 24,
    lockOffsetMinutes: 120,
    vendorTypes: ["Food truck", "Barbier"],
    ...overrides,
  };
}

describe("création d'un événement", () => {
  it("brouillon avec prestataires, département et position de l'adresse", async () => {
    const s = await createStructure(orga.id);
    setGeocodeFetch(
      (async () =>
        new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [3.00721, 42.705804] },
                properties: {
                  label: "Place de la République 66140 Canet",
                  score: 0.95,
                  postcode: "66140",
                  city: "Canet",
                },
              },
            ],
          }),
        )) as unknown as typeof fetch,
    );
    const e = await eventsService.create(orgaV, s.id, eventInput() as never);
    expect(e).toMatchObject({ status: "draft", department: "66", lat: 42.705804, lng: 3.00721 });
    expect(e.vendorTypes).toEqual(["Food truck", "Barbier"]);
    // Une adresse introuvable ne bloque pas l'enregistrement.
    setGeocodeFetch((async () => new Response("{}", { status: 500 })) as unknown as typeof fetch);
    const sans = await eventsService.create(orgaV, s.id, eventInput({ title: "Autre rendez-vous" }) as never);
    expect(sans).toMatchObject({ lat: null, lng: null, department: "66" });
  });

  it("changer l'adresse d'un événement recalcule sa position", async () => {
    const s = await createStructure(orga.id);
    const e = await eventsService.create(orgaV, s.id, eventInput() as never);
    expect(e.lat).toBeNull();
    setGeocodeFetch(
      (async () =>
        new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [2.35, 48.85] },
                properties: { label: "Paris", score: 0.9, postcode: "75001" },
              },
            ],
          }),
        )) as unknown as typeof fetch,
    );
    const moved = await eventsService.update(orgaV, e.id, {
      addressLine: "1 rue de Rivoli",
      postalCode: "75001",
      city: "Paris",
    });
    expect(moved).toMatchObject({ lat: 48.85, lng: 2.35, department: "75" });
  });
});

describe("duplication et récurrence", () => {
  it("duplication : brouillon, mêmes réglages et mêmes zones, mêmes jour et heure 52 semaines plus tard, parent mémorisé", async () => {
    const s = await createStructure(orga.id);
    const source = await createEvent(s.id, {
      title: "Nocturne de Canet",
      startsAt: paris(6, 6, 19),
      endsAt: paris(6, 6, 23),
      status: "published",
      capacity: 80,
      vendorTypes: ["Food truck"],
      rulesText: "Pas de burn.",
    });
    await createZone(source.id, "JDM");
    useClock(paris(6, 20, 10));
    const copy = await eventsService.duplicate(orgaV, source.id);
    expect(copy).toMatchObject({
      status: "draft",
      title: "Nocturne de Canet",
      capacity: 80,
      vendorTypes: ["Food truck"],
      rulesText: "Pas de burn.",
      parentEventId: source.id,
    });
    expect(new Date(copy.startsAt)).toEqual(fromWallTime({ year: 2027, month: 6, day: 5, hour: 19, minute: 0 }));
    expect(new Date(copy.endsAt).getTime() - new Date(copy.startsAt).getTime()).toBe(4 * 3_600_000);
    expect(copy.slug).not.toBe(source.slug);
    expect(copy.zones.map((z) => z.code)).toEqual(["JDM"]);
    expect(copy.counters.accepted).toBe(0);
    // Les zones de la source sont intactes.
    expect(await db.select().from(eventZones).where(eq(eventZones.eventId, source.id))).toHaveLength(1);
  });

  it("duplication : réservée aux organisateurs de la structure", async () => {
    const s = await createStructure(orga.id);
    const source = await createEvent(s.id);
    const other = await viewerOf(await signUp("Autre_01", { twoFactor: true }));
    await expect(eventsService.duplicate(other, source.id)).rejects.toMatchObject({ status: 403 });
  });

  it("récurrence « chaque premier dimanche du mois » : occurrences créées une seule fois, en brouillon", async () => {
    const s = await createStructure(orga.id);
    // Premier dimanche de juillet 2026 : le 5.
    const origin = await createEvent(s.id, { startsAt: paris(7, 5, 9), endsAt: paris(7, 5, 13), status: "published" });
    const occurrences = await eventsService.createRecurrence(orgaV, origin.id, {
      kind: "monthly_nth_weekday",
      nth: 1,
      weekday: 0,
      count: 3,
    });
    expect(occurrences.map((o) => o.startsAt)).toEqual([
      paris(8, 2, 9).toISOString(),
      paris(9, 6, 9).toISOString(),
      paris(10, 4, 9).toISOString(), // passage à l'heure d'hiver le 25 octobre : l'heure affichée reste 9 h
    ]);
    expect(occurrences.every((o) => o.status === "draft")).toBe(true);
    const saved = await db.query.events.findFirst({ where: eq(events.id, origin.id) });
    expect(saved?.recurrenceRule).toMatchObject({ kind: "monthly_nth_weekday", count: 3 });
    const children = await db.select().from(events).where(eq(events.parentEventId, origin.id));
    expect(children).toHaveLength(3);
    // Créée une seule fois : une deuxième demande est refusée, une occurrence ne porte pas de série.
    await expect(
      eventsService.createRecurrence(orgaV, origin.id, { kind: "weekly", interval: 1, count: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      eventsService.createRecurrence(orgaV, children[0]?.id ?? "", { kind: "weekly", interval: 1, count: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("récurrence : règle invalide refusée par l'API", async () => {
    const s = await createStructure(orga.id);
    const origin = await createEvent(s.id);
    const bad = await call(orga, "POST", `/events/${origin.id}/recurrence`, {
      rule: { kind: "weekly", interval: 1, count: 40 },
    });
    expect(bad.status).toBe(400);
  });
});

describe("prévenir les inscrits", () => {
  async function registered(eventId: string, pseudo: string) {
    const u = await signUp(pseudo);
    const v = await createVehicle(u.id, ref);
    await applicationsService.apply(await viewerOf(u), eventId, {
      vehicleIds: [v.id],
      rulesAccepted: true,
      followStructure: false,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    return u;
  }

  it("changement de date ou d'adresse après publication : tous les inscrits actifs sont prévenus, pas les autres", async () => {
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id, { startsAt: paris(7, 5, 18), endsAt: paris(7, 5, 23) });
    const a = await registered(e.id, "Inscrit_01");
    const b = await registered(e.id, "Inscrit_02");
    // Une personne qui s'est désistée n'est plus prévenue.
    const gone = await registered(e.id, "Parti_01");
    const goneApp = await db.query.applications.findFirst({ where: (t, { eq: is }) => is(t.userId, gone.id) });
    await applicationsService.withdraw(await viewerOf(gone), goneApp?.id ?? "");
    await eventsService.update(orgaV, e.id, { startsAt: paris(7, 12, 18), endsAt: paris(7, 12, 23) });
    await eventsService.update(orgaV, e.id, { city: "Perpignan" });
    // Un changement qui ne touche ni la date ni l'adresse ne prévient personne.
    await eventsService.update(orgaV, e.id, { description: "Nouveau programme" });
    await notificationsService.flush();
    const updates = await db.select().from(notifications).where(eq(notifications.type, "event_updated"));
    expect(updates.map((n) => n.userId).sort()).toEqual([a.id, a.id, b.id, b.id].sort());
    expect(updates.some((n) => n.body.includes("nouvelle date"))).toBe(true);
    expect(updates.some((n) => n.body.includes("nouvelle adresse"))).toBe(true);
  });

  it("brouillon : modifier la date ne prévient personne", async () => {
    const s = await createStructure(orga.id);
    const draft = await eventsService.create(orgaV, s.id, eventInput() as never);
    await eventsService.update(orgaV, draft.id, { startsAt: paris(7, 6, 18), endsAt: paris(7, 6, 23) });
    expect(await db.select().from(notifications)).toHaveLength(0);
  });

  it("annulation : tous les inscrits actifs prévenus", async () => {
    const s = await createStructure(orga.id);
    const e = await createEvent(s.id);
    await registered(e.id, "Inscrit_03");
    await registered(e.id, "Inscrit_04");
    await eventsService.cancel(orgaV, e.id);
    await notificationsService.flush();
    expect(await db.select().from(notifications).where(eq(notifications.type, "event_cancelled"))).toHaveLength(2);
  });
});

describe("pages publiques", () => {
  it("liste : à venir par défaut, passés avec scope=past, position pour la carte", async () => {
    const s = await createStructure(orga.id);
    await createEvent(s.id, {
      title: "À venir",
      startsAt: paris(7, 5, 18),
      endsAt: paris(7, 5, 23),
      lat: 42.7,
      lng: 3.0,
    });
    await createEvent(s.id, { title: "Passé", startsAt: paris(5, 5, 18), endsAt: paris(5, 5, 23) });
    // Les dates réelles servent ici : la liste publique lit l'horloge du service.
    useClock(paris(6, 10, 10));
    const upcoming = await call(null, "GET", "/events");
    expect(upcoming.json.items.map((e: { title: string }) => e.title)).toEqual(["À venir"]);
    expect(upcoming.json.items[0]).toMatchObject({ lat: 42.7, lng: 3 });
    const past = await call(null, "GET", "/events?scope=past");
    expect(past.json.items.map((e: { title: string }) => e.title)).toEqual(["Passé"]);
  });

  it("structure : note moyenne seulement à partir de 3 avis", async () => {
    const s = await createStructure(orga.id);
    const pub = await call(null, "GET", `/structures/by-slug/${s.slug}`);
    expect(pub.json.rating).toEqual({ average: null, count: 0 });
  });

  it("lien d'invitation d'un organisateur : le compte créé suit la structure (source invite_link)", async () => {
    const s = await createStructure(orga.id);
    const info = await call(null, "GET", `/invitations/${s.inviteToken}`);
    expect(info.status).toBe(200);
    expect(info.json.slug).toBe(s.slug);
    expect((await call(null, "POST", `/invitations/${s.inviteToken}/accept`)).status).toBe(401);
    const fan = await signUp("Fan_66");
    const ok = await call(fan, "POST", `/invitations/${s.inviteToken}/accept`);
    expect(ok.status).toBe(200);
    expect(ok.json.isFollowing).toBe(true);
    const follow = await db.query.structureFollows.findFirst({
      where: and(eq(structureFollows.userId, fan.id), eq(structureFollows.structureId, s.id)),
    });
    expect(follow?.source).toBe("invite_link");
    expect((await call(null, "GET", "/invitations/jeton-inconnu")).status).toBe(404);
  });

  it("référentiel des véhicules lisible sans compte (formulaire express)", async () => {
    const makes = await call(null, "GET", "/vehicle-reference/makes");
    expect(makes.status).toBe(200);
    expect(makes.json[0].id).toBe(ref.makeId);
  });
});
