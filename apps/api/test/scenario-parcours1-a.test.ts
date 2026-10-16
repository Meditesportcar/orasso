// Scénario du critère de fin du lot 05 (parcours n° 1, première moitié), de bout en bout par l'API HTTP :
// inscription → véhicule → candidature → tri (retenu / liste d'attente / refusé) → désistement d'un retenu →
// place proposée au premier de la liste d'attente → expiration → suivant ; après le verrouillage (H−2),
// un désistement tardif n'est plus « sans malus ». L'horloge est simulée ; la tâche d'expiration est exécutée
// comme pg-boss le ferait.
import { fromWallTime } from "@orasso/shared";
import { notInArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app";
import { db, pool } from "../src/db/client";
import { emailOutbox } from "../src/db/schema";
import { applicationsService } from "../src/modules/applications/service";
import { notificationsService } from "../src/modules/notifications/service";
import { call, resetDb, seedReference, signUp, type TestUser, useClock } from "./helpers";

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeAll(async () => {
  await resetDb();
  clock = useClock(paris(6, 1, 10));
  ref = await seedReference();
});

afterAll(async () => {
  await pool.end();
});

async function uploadPhoto(u: TestUser, vehicleId: string) {
  const jpeg = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#2b2f36" } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("photo", new File([new Uint8Array(jpeg)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request(`/api/me/vehicles/${vehicleId}/photos`, {
    method: "POST",
    body: form,
    headers: { cookie: u.cookie },
  });
  expect(res.status).toBe(201);
}

/** Un passionné : inscription, profil, véhicule avec photo. */
async function passionne(pseudo: string, plate: string) {
  const u = await signUp(pseudo);
  expect((await call(u, "PATCH", "/me/profile", { departments: ["66"], firstName: pseudo })).status).toBe(200);
  const v = await call(u, "POST", "/me/vehicles", {
    vehicleType: "car",
    makeId: ref.makeId,
    modelId: ref.modelId,
    generationId: ref.generationId,
    year: 1995,
    powerHp: 193,
    plate,
  });
  expect(v.status).toBe(201);
  await uploadPhoto(u, v.json.id);
  return { u, vehicleId: v.json.id as string };
}

describe("parcours n° 1, première moitié", () => {
  it("de l'inscription à la liste d'attente automatique, puis le verrouillage", async () => {
    // L'organisateur crée sa structure, l'équipe Orasso la vérifie, il crée et publie un événement de 2 places.
    const damien = await signUp("Damien_66", { twoFactor: true });
    const admin = await signUp("Equipe_Orasso", { twoFactor: true, role: "super_admin" });
    const structure = await call(damien, "POST", "/structures", {
      kind: "association",
      name: "MéditeSportCar",
      city: "Canet-en-Roussillon",
      department: "66",
      departments: ["66"],
    });
    expect(structure.status).toBe(201);
    expect(
      (await call(admin, "POST", `/admin/structures/${structure.json.id}/verify`, { verified: true })).status,
    ).toBe(204);
    const created = await call(damien, "POST", `/structures/${structure.json.id}/events`, {
      title: "Nocturne de Canet",
      format: "night",
      startsAt: paris(6, 20, 19).toISOString(),
      endsAt: paris(6, 20, 23).toISOString(),
      addressLine: "Parking du port",
      city: "Canet-en-Roussillon",
      department: "66",
      admittedVehicleTypes: ["car"],
      capacity: 2,
      admission: "filtered",
      registrationsOpenAt: paris(6, 2, 12).toISOString(),
    });
    expect(created.status).toBe(201);
    const eventId: string = created.json.id;
    expect((await call(damien, "POST", `/events/${eventId}/zones`, { code: "JDM", name: "JDM" })).status).toBe(201);
    expect((await call(damien, "POST", `/events/${eventId}/publish`)).json.status).toBe("published");

    // Cinq passionnés candidatent dès l'ouverture.
    clock.set(paris(6, 2, 12));
    const [kenji, lea, nina, marc, theo] = [
      await passionne("Kenji_66", "AB-123-CD"),
      await passionne("Lea_11", "BC-234-DE"),
      await passionne("Nina_34", "CD-345-EF"),
      await passionne("Marc_66", "DE-456-FG"),
      await passionne("Theo_66", "EF-567-GH"),
    ];
    const page = await call(kenji.u, "GET", `/events/by-slug/${created.json.slug}`);
    expect(page.json.remaining).toBe(2);
    const appIds: Record<string, string> = {};
    for (const p of [kenji, lea, nina, marc, theo]) {
      const res = await call(p.u, "POST", `/events/${eventId}/applications`, {
        vehicleIds: [p.vehicleId],
        rulesAccepted: true,
        followStructure: true,
        newsletterOptIn: false,
      });
      expect(res.status).toBe(201);
      expect(res.json[0].status).toBe("pending");
      appIds[p.u.pseudo] = res.json[0].id;
      clock.advance(60_000);
    }

    // Tri : file une par une ; Kenji et Léa retenus, Nina puis Marc en liste d'attente, Théo refusé.
    const decide = async (pseudo: string, body: object) => {
      const res = await call(damien, "POST", `/events/${eventId}/applications/${appIds[pseudo]}/decide`, body);
      expect(res.status).toBe(200);
      return res.json;
    };
    const next = await call(damien, "GET", `/events/${eventId}/applications/next`);
    expect(next.json.item.applicant.pseudo).toBe("Kenji_66");
    expect(next.json.item.vehicle.plate).toBe("AB-123-CD");
    await decide("Kenji_66", { decision: "accept" });
    await decide("Lea_11", { decision: "accept" });
    expect((await decide("Nina_34", { decision: "waitlist" })).waitlistRank).toBe(1);
    expect((await decide("Marc_66", { decision: "waitlist" })).waitlistRank).toBe(2);
    await decide("Theo_66", { decision: "refuse", reasons: ["off_theme"] });
    expect((await call(damien, "GET", `/events/${eventId}/counters`)).json).toEqual({
      remaining: 0,
      accepted: 2,
      pending: 0,
      waitlisted: 2,
      refused: 1,
    });
    const theoCard = (await call(theo.u, "GET", "/me/applications")).json[0];
    expect(theoCard).toMatchObject({ status: "refused", refusalReasons: ["off_theme"] });
    const marcCard = (await call(marc.u, "GET", "/me/applications")).json[0];
    expect(marcCard).toMatchObject({ status: "waitlisted", waitlistRank: 2 });
    expect(marcCard.withdrawDeadline).toBe(paris(6, 20, 17).toISOString());

    // J−5 : Kenji se désiste (avant le verrouillage, sans malus) → la place est offerte à Nina, 24 h pour accepter.
    clock.set(paris(6, 15, 10));
    const withdrawn = await call(kenji.u, "POST", `/applications/${appIds.Kenji_66}/withdraw`);
    expect(withdrawn.json).toMatchObject({ status: "withdrawn", withdrawnAfterLock: false });
    const ninaCard = (await call(nina.u, "GET", "/me/applications")).json[0];
    expect(ninaCard).toMatchObject({ status: "offered", offerExpiresAt: paris(6, 16, 10).toISOString() });
    await notificationsService.flush();
    const ninaJournal = (await call(nina.u, "GET", "/me/notifications")).json.items.map(
      (n: { type: string }) => n.type,
    );
    expect(ninaJournal).toContain("offer_received");

    // Nina ne répond pas : à l'échéance, la tâche fait expirer l'offre et propose la place à Marc.
    clock.set(paris(6, 16, 10));
    const job = clock.jobs.jobs.find((j) => j.name === "waitlist.offer-expire");
    expect(job?.startAfter).toEqual(paris(6, 16, 10));
    expect(await applicationsService.expireOffer(String(job?.data.applicationId), String(job?.data.offeredAt))).toBe(
      true,
    );
    expect((await call(nina.u, "GET", "/me/applications")).json[0].status).toBe("expired");
    const marcOffer = (await call(marc.u, "GET", "/me/applications")).json[0];
    expect(marcOffer).toMatchObject({ status: "offered", offerExpiresAt: paris(6, 17, 10).toISOString() });
    // Marc accepte à temps.
    clock.set(paris(6, 16, 18));
    expect((await call(marc.u, "POST", `/applications/${appIds.Marc_66}/offer/accept`)).json.status).toBe("accepted");

    // Jour J, 18:00 : verrouillé depuis 17:00. Plus de candidature ; le désistement de Léa n'est plus sans malus.
    clock.set(paris(6, 20, 18));
    const late = await call(theo.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [theo.vehicleId],
      rulesAccepted: true,
    });
    expect(late.status).toBe(423);
    const leaOut = await call(lea.u, "POST", `/applications/${appIds.Lea_11}/withdraw`);
    expect(leaOut.json).toMatchObject({ status: "withdrawn", withdrawnAfterLock: true });
    expect((await call(damien, "GET", `/events/${eventId}/counters`)).json).toMatchObject({
      accepted: 1,
      remaining: 1,
    });

    // Chaque décision a été annoncée au candidat (sans appareil : par e-mail, transport « journal »).
    await notificationsService.flush();
    const mails = await db
      .select({ to: emailOutbox.to, subject: emailOutbox.subject })
      .from(emailOutbox)
      .where(notInArray(emailOutbox.template, ["structure_verification", "email_verification"]));
    expect(mails.map((m) => m.subject).sort()).toEqual(
      [
        "Candidature refusée",
        "Candidature retenue",
        "Candidature retenue",
        "Liste d'attente",
        "Liste d'attente",
        "Offre expirée",
        "Place libérée",
        "Place libérée",
      ].sort(),
    );
  });
});
