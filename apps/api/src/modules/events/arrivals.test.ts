// Lot 47 : créneaux d'arrivée (exposants, public) sur l'événement, case « J'ai vu » à la candidature (seule, chef de
// crew, membre qui confirme), note visible au tri, consignes préfixées du créneau.
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
import { applications, eventAnnouncements, notifications, vehicles } from "../../db/schema";

afterAll(async () => {
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  useClock(paris(10, 1, 10));
  ref = await seedReference();
  orga = await signUp("Damien", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
});

const NOCTURNE = {
  exhibitors: { from: "18:30", to: "19:15", strict: true, note: "Entrée côté capitainerie." },
  public: { from: "19:30", to: null, strict: false, note: "Parking visiteurs avenue de la Méditerranée." },
};

/** Nocturne : samedi 24 octobre, 19 h – 23 h 30. */
async function nocturne(arrivals: typeof NOCTURNE | null = NOCTURNE) {
  const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23, 30) });
  if (arrivals) expect((await call(orga, "PATCH", `/events/${e.id}`, { arrivals })).status).toBe(200);
  return e;
}

describe("créneaux d'arrivée de l'événement", () => {
  it("PATCH les enregistre ; la fiche publique ne renvoie que celui du public (lot M4)", async () => {
    const e = await nocturne();
    const page = await call(null, "GET", `/events/by-slug/${e.slug}`);
    expect(page.status).toBe(200);
    expect(page.json.arrivals).toEqual({ exhibitors: null, public: NOCTURNE.public });
    expect((await call(orga, "GET", `/events/by-slug/${e.slug}`)).json.arrivals).toEqual(NOCTURNE);
    // `null` les retire.
    expect((await call(orga, "PATCH", `/events/${e.id}`, { arrivals: null })).json.arrivals).toEqual({
      exhibitors: null,
      public: null,
    });
  });

  it("refuse une fin avant le début (400)", async () => {
    const e = await nocturne(null);
    const res = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { exhibitors: { from: "19:15", to: "18:30", strict: true }, public: null },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
    expect(res.json.error.details.reason).toBe("exhibitors_order");
  });

  it("refuse un public qui arrive avant les exposants (400)", async () => {
    const e = await nocturne(null);
    const res = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { ...NOCTURNE, public: { from: "18:00", to: null, strict: false } },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.details.reason).toBe("public_before_exhibitors");
  });

  it("refuse une heure illisible et un créneau d'exposants après la fin", async () => {
    const e = await nocturne(null);
    const bad = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { exhibitors: { from: "25:00", to: null, strict: false }, public: null },
    });
    expect(bad.status).toBe(400);
    const late = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { exhibitors: { from: "23:45", to: null, strict: false }, public: null },
    });
    expect(late.json.error.details.reason).toBe("exhibitors_after_event");
  });

  it("POST /structures/:id/events accepte les créneaux à la création", async () => {
    const res = await call(orga, "POST", `/structures/${structureId}/events`, {
      title: "Nocturne de Canet",
      format: "gathering",
      startsAt: paris(10, 24, 19).toISOString(),
      endsAt: paris(10, 24, 23, 30).toISOString(),
      addressLine: "Quai du Port",
      postalCode: "66140",
      city: "Canet-en-Roussillon",
      lat: 42.7,
      lng: 3.03,
      admittedVehicleTypes: ["car"],
      admission: "filtered",
      registrationsOpenAt: paris(10, 2, 10).toISOString(),
      arrivals: NOCTURNE,
    });
    expect(res.status).toBe(201);
    expect(res.json.arrivals).toEqual(NOCTURNE);
  });

  it("un créneau peut passer minuit (23:30 – 00:30) ; plus de 12 h, non", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 23), endsAt: paris(10, 25, 3) });
    const ok = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { exhibitors: { from: "23:30", to: "00:30", strict: true }, public: { from: "00:15" } },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.arrivals.exhibitors).toMatchObject({ from: "23:30", to: "00:30" });
    const bad = await call(orga, "PATCH", `/events/${e.id}`, {
      arrivals: { exhibitors: { from: "23:30", to: "12:00" }, public: null },
    });
    expect(bad.json.error.details.reason).toBe("exhibitors_order");
  });

  it("les jours d'un événement sur plusieurs jours gardent les créneaux (revalidés aux nouvelles bornes)", async () => {
    const e = await nocturne();
    const ok = await call(orga, "PUT", `/events/${e.id}/days`, {
      days: [
        { date: "2026-10-24", startTime: "10:00", endTime: "20:00" },
        { date: "2026-10-25", startTime: "10:00", endTime: "12:00" },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.json.arrivals).toEqual(NOCTURNE);
  });

  it("un organisateur d'une autre structure ne touche pas aux créneaux", async () => {
    const e = await nocturne(null);
    const other = await signUp("Autre", { twoFactor: true });
    await createStructure(other.id);
    expect((await call(other, "PATCH", `/events/${e.id}`, { arrivals: NOCTURNE })).status).toBe(403);
  });
});

// Lot M4 (correction de Damien, 23/10) : l'horaire strict des exposants est privé. Seuls l'organisation, l'exposant
// concerné et qui peut candidater (véhicule actif : la feuille le montre avant « J'ai vu ») le reçoivent.
describe("créneau des exposants privé", () => {
  const leaks = (json: unknown) => {
    const text = JSON.stringify(json);
    return text.includes(NOCTURNE.exhibitors.from) || text.includes(NOCTURNE.exhibitors.note);
  };

  it("absent des réponses anonymes : fiche, liste de l'Explorer, page de la structure", async () => {
    const e = await nocturne();
    const page = await call(null, "GET", `/events/by-slug/${e.slug}`);
    expect(page.json.arrivals.exhibitors).toBeNull();
    expect(leaks(page.json)).toBe(false);
    const list = await call(null, "GET", "/events");
    expect(list.status).toBe(200);
    expect(list.json.items.some((x: { id: string }) => x.id === e.id)).toBe(true);
    expect(leaks(list.json)).toBe(false);
    const structure = await call(null, "GET", `/structures/by-slug/${page.json.structure.slug}`);
    expect(structure.status).toBe(200);
    expect(leaks(structure.json)).toBe(false);
  });

  it("absent pour un visiteur connecté sans véhicule ; donné à qui peut candidater, à l'inscrit, à l'organisation", async () => {
    const e = await nocturne();
    const visitor = await signUp("Nina");
    const seen = await call(visitor, "GET", `/events/by-slug/${e.slug}`);
    expect(seen.status).toBe(200);
    expect(seen.json.arrivals).toEqual({ exhibitors: null, public: NOCTURNE.public });
    expect(leaks(seen.json)).toBe(false);
    expect(leaks((await call(visitor, "GET", "/events")).json)).toBe(false);

    const kenji = await signUp("Kenji");
    const v = await createVehicle(kenji.id, ref);
    expect((await call(kenji, "GET", `/events/by-slug/${e.slug}`)).json.arrivals.exhibitors).toEqual(
      NOCTURNE.exhibitors,
    );
    const applied = await call(kenji, "POST", `/events/${e.id}/applications`, {
      vehicleIds: [v.id],
      rulesAccepted: true,
      arrivalSeen: true,
    });
    expect(applied.status).toBe(201);
    // Véhicule vendu après la candidature : l'inscrit garde son créneau.
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, v.id));
    expect((await call(kenji, "GET", `/events/by-slug/${e.slug}`)).json.arrivals.exhibitors).toEqual(
      NOCTURNE.exhibitors,
    );
    expect((await call(orga, "GET", `/events/${e.id}`)).json.arrivals.exhibitors).toEqual(NOCTURNE.exhibitors);
  });
});

describe("case « J'ai vu » à la candidature", () => {
  it("obligatoire quand un créneau exposants existe ; la note se lit au tri", async () => {
    const e = await nocturne();
    const kenji = await signUp("Kenji");
    const v = await createVehicle(kenji.id, ref);
    const body = { vehicleIds: [v.id], rulesAccepted: true };
    const refused = await call(kenji, "POST", `/events/${e.id}/applications`, body);
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe("arrival_not_seen");
    expect((await call(kenji, "POST", `/events/${e.id}/applications`, { ...body, arrivalSeen: false })).status).toBe(
      400,
    );
    const ok = await call(kenji, "POST", `/events/${e.id}/applications`, {
      ...body,
      arrivalSeen: true,
      arrivalNote: "J'arriverai vers 19 h 30 à cause du travail",
    });
    expect(ok.status).toBe(201);
    const triage = await call(orga, "GET", `/events/${e.id}/applications`);
    expect(triage.status).toBe(200);
    const item = triage.json.items.find((x: { applicant: { userId: string } }) => x.applicant.userId === kenji.id);
    expect(item.arrivalNote).toBe("J'arriverai vers 19 h 30 à cause du travail");
    expect(item.arrivalSeenAt).toBeTruthy();
  });

  it("note de 200 caractères au plus", async () => {
    const e = await nocturne();
    const kenji = await signUp("Kenji");
    const v = await createVehicle(kenji.id, ref);
    const res = await call(kenji, "POST", `/events/${e.id}/applications`, {
      vehicleIds: [v.id],
      rulesAccepted: true,
      arrivalSeen: true,
      arrivalNote: "x".repeat(201),
    });
    expect(res.status).toBe(400);
  });

  it("sans créneau exposants, la case est ignorée", async () => {
    const e = await nocturne({ ...NOCTURNE, exhibitors: null } as unknown as typeof NOCTURNE);
    const kenji = await signUp("Kenji");
    const v = await createVehicle(kenji.id, ref);
    const res = await call(kenji, "POST", `/events/${e.id}/applications`, {
      vehicleIds: [v.id],
      rulesAccepted: true,
      arrivalNote: "Sans objet",
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(applications).where(eq(applications.userId, kenji.id));
    expect(row?.arrivalSeenAt).toBeNull();
    expect(row?.arrivalNote).toBeNull();
  });

  it("crew : la case vaut pour le chef, chaque membre la coche à sa confirmation", async () => {
    const e = await nocturne();
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const [vk, vl] = await Promise.all([createVehicle(kenji.id, ref), createVehicle(lea.id, ref)]);
    const crew = await call(kenji, "POST", "/crews", { name: "Roussillon Drift", department: "66" });
    expect(crew.status).toBe(201);
    expect((await call(lea, "POST", `/crews/${crew.json.id}/requests`, { message: null })).status).toBe(201);
    expect((await call(kenji, "POST", `/crews/${crew.json.id}/requests/${lea.id}/accept`)).status).toBe(204);
    const body = {
      crewId: crew.json.id,
      members: [
        { userId: kenji.id, vehicleId: vk.id },
        { userId: lea.id, vehicleId: vl.id },
      ],
      rulesAccepted: true,
    };
    const refused = await call(kenji, "POST", `/events/${e.id}/crew-applications`, body);
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe("arrival_not_seen");
    expect(
      (await call(kenji, "POST", `/events/${e.id}/crew-applications`, { ...body, arrivalSeen: true })).status,
    ).toBe(201);
    const rows = await db.select().from(applications).where(eq(applications.eventId, e.id));
    const leader = rows.find((r) => r.userId === kenji.id);
    const member = rows.find((r) => r.userId === lea.id);
    expect(leader?.arrivalSeenAt).toBeTruthy();
    expect(member?.arrivalSeenAt).toBeNull();
    const notSeen = await call(lea, "POST", `/applications/${member?.id}/confirm-crew`, { rulesAccepted: true });
    expect(notSeen.status).toBe(400);
    expect(notSeen.json.error.code).toBe("arrival_not_seen");
    const confirmed = await call(lea, "POST", `/applications/${member?.id}/confirm-crew`, {
      rulesAccepted: true,
      arrivalSeen: true,
      arrivalNote: "Vers 19 h",
    });
    expect(confirmed.status).toBe(200);
    const [after] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, member?.id ?? ""));
    expect(after?.arrivalSeenAt).toBeTruthy();
    expect(after?.arrivalNote).toBe("Vers 19 h");
  });
});

describe("invitation acceptée", () => {
  it("même règle : « J'ai vu » obligatoire avec un créneau exposants, créneau donné à l'écran", async () => {
    const e = await createEvent(structureId, {
      startsAt: paris(10, 24, 19),
      endsAt: paris(10, 24, 23, 30),
      admission: "invite_only",
    });
    expect((await call(orga, "PATCH", `/events/${e.id}`, { arrivals: NOCTURNE })).status).toBe(200);
    const kenji = await signUp("Kenji");
    const car = await createVehicle(kenji.id, ref);
    expect((await call(orga, "POST", `/events/${e.id}/invitations`, { pseudos: ["Kenji"] })).json.created).toBe(1);
    const mine = await call(kenji, "GET", "/me/event-invitations");
    const inv = mine.json[0];
    expect(inv.event.arrivalExhibitors).toEqual(NOCTURNE.exhibitors);
    const refused = await call(kenji, "POST", `/event-invitations/${inv.id}/accept`, { vehicleId: car.id });
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe("arrival_not_seen");
    const ok = await call(kenji, "POST", `/event-invitations/${inv.id}/accept`, {
      vehicleId: car.id,
      arrivalSeen: true,
      arrivalNote: "Vers 19 h",
    });
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(applications).where(eq(applications.userId, kenji.id));
    expect(row?.arrivalSeenAt).toBeTruthy();
    expect(row?.arrivalNote).toBe("Vers 19 h");
  });
});

describe("consignes aux retenus", () => {
  it("commencent par le créneau des exposants", async () => {
    const e = await nocturne();
    const kenji = await signUp("Kenji");
    const v = await createVehicle(kenji.id, ref);
    await db.insert(applications).values({
      eventId: e.id,
      userId: kenji.id,
      vehicleId: v.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
    });
    const sent = await call(orga, "POST", `/events/${e.id}/instructions/send`, { instructions: "Gilet jaune." });
    expect(sent.status).toBe(200);
    const [entry] = await db.select().from(eventAnnouncements).where(eq(eventAnnouncements.eventId, e.id));
    expect(entry?.body).toBe("Arrivée 18 h 30 – 19 h 15 (strict) · Entrée côté capitainerie.\n\nGilet jaune.");
    const [notif] = await db.select().from(notifications).where(eq(notifications.userId, kenji.id));
    expect(notif?.body.startsWith("Arrivée 18 h 30 – 19 h 15 (strict)")).toBe(true);
  });
});
