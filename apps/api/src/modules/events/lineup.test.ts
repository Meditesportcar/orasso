// Lot R4b : le plateau d'un Ã©vÃ©nement (`GET /events/:id/lineup`), vie privÃ©e d'abord : listes blanches des champs pour
// chaque regard (moi, membre, compte privÃ©, visiteur), absents jamais montrÃ©s aprÃ¨s l'Ã©vÃ©nement, comptes suspendus
// exclus, Ã©vÃ©nements brouillon / privÃ© / annulÃ© fermÃ©s, ligne de Mes sorties, fiche d'une voiture d'un compte privÃ©.
import { type LineupCarMember, lineupCarMemberFields, lineupCarVisitorFields, lineupProFields } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
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
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  checkins,
  events,
  proDiscounts,
  profiles,
  providerProfiles,
  vehicleCategories,
  vehicleGenerations,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { type RealtimeSocket, realtime } from "../../lib/realtime";
import { withTx } from "../../lib/tx";
import { accessService } from "../access/service";
import { lineupService } from "./lineup";
import { eventsService } from "./service";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let structureId: string;

const DAY = 86_400_000;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date());
  ref = await seedReference();
  orga = await signUp("Orga_R4b", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
});

/** Une personne avec un vÃ©hicule (une photo, plaque floutÃ©e) ; `private` pour un compte privÃ©. */
async function exhibitor(pseudo: string, opts: { private?: boolean } = {}) {
  const u = await signUp(pseudo);
  if (opts.private) await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));
  const v = await createVehicle(u.id, ref);
  await db.update(vehiclePhotos).set({ plateBlurred: true }).where(eq(vehiclePhotos.vehicleId, v.id));
  return { u, v };
}

async function apply(
  eventId: string,
  p: { u: TestUser; v: { id: string } },
  status: "accepted" | "pending" | "waitlisted" | "refused" = "accepted",
) {
  const [a] = await db
    .insert(applications)
    .values({
      eventId,
      userId: p.u.id,
      vehicleId: p.v.id,
      status,
      rulesAcceptedAt: new Date(),
      followStructure: false,
      decidedAt: status === "pending" ? null : clock.now,
      zoneId: null,
      arrivalNote: "J'arriverai vers 18 h 40",
    })
    .returning();
  return a!;
}

async function checkIn(eventId: string, applicationId: string) {
  await db.insert(checkins).values({ applicationId, eventId, method: "manual", checkedInAt: clock.now });
}

const sorted = (a: readonly string[]) => [...a].sort();

describe("le plateau : champs par regard (liste blanche)", () => {
  it("moi, membre, compte privÃ©, visiteur : rien d'autre que les champs prÃ©vus, jamais d'heure ni de plaque", async () => {
    const e = await createEvent(structureId);
    const kenji = await exhibitor("Kenji_R4b");
    const julie = await exhibitor("Julie_R4b");
    const priv = await exhibitor("Prive_R4b", { private: true });
    for (const p of [julie, priv, kenji]) await apply(e.id, p);

    // Moi : ma voiture en tÃªte, Â« Toi Â».
    const mine = await call(kenji.u, "GET", `/events/${e.id}/lineup`);
    expect(mine.status).toBe(200);
    expect(mine.json.phase).toBe("accepted");
    expect(mine.json.counts.cars).toBe(3);
    const cars = mine.json.cars as LineupCarMember[];
    expect(cars[0]).toMatchObject({ pseudo: "Kenji_R4b", me: true, private: false });
    for (const c of cars) expect(sorted(Object.keys(c))).toEqual(sorted(lineupCarMemberFields));
    // Compte privÃ© : le pseudo et la voiture restent visibles, avec le cadenas.
    expect(cars.find((c) => c.pseudo === "Prive_R4b")).toMatchObject({ private: true, me: false });
    expect(cars.find((c) => c.pseudo === "Julie_R4b")).toMatchObject({ private: false, me: false });

    // Membre (connectÃ©, sans voiture) : mÃªmes champs, personne n'est Â« Toi Â».
    const member = await signUp("Membre_R4b");
    const seen = await call(member, "GET", `/events/${e.id}/lineup`);
    for (const c of seen.json.cars) {
      expect(sorted(Object.keys(c))).toEqual(sorted(lineupCarMemberFields));
      expect(c.me).toBe(false);
    }

    // Visiteur sans compte : ni pseudo ni identifiant de compte (ni le champ `vehicleId`).
    const visitor = await call(null, "GET", `/events/${e.id}/lineup`);
    expect(visitor.status).toBe(200);
    expect(visitor.json.cars).toHaveLength(3);
    for (const c of visitor.json.cars) expect(sorted(Object.keys(c))).toEqual(sorted(lineupCarVisitorFields));
    for (const p of [kenji, julie, priv]) {
      expect(visitor.text).not.toContain(p.u.pseudo);
      expect(visitor.text).not.toContain(p.u.id);
    }

    // Aucun regard : ni identifiant de compte, ni plaque, ni heure, ni zone, ni dÃ©partement, ni note d'arrivÃ©e.
    for (const res of [mine, seen, visitor]) {
      expect(sorted(Object.keys(res.json))).toEqual(
        sorted(["eventId", "phase", "cars", "pros", "counts", "filtered", "categories", "nextCursor"]),
      );
      for (const p of [kenji, julie, priv]) expect(res.text).not.toContain(p.u.id);
      const flat = res.text.toLowerCase().replaceAll(/[\s-]/g, "");
      expect(flat).not.toMatch(/aa\d{3}zz/);
      expect(res.text).not.toMatch(/plate|zone|arrival|checkedIn|department|userId|ownerId|18 h 40/i);
    }
  });

  it("les pros : prestataires retenus, remise pour mon grade, champs prÃ©vus seulement", async () => {
    const e = await createEvent(structureId);
    const res = await call(null, "GET", `/events/${e.id}/lineup`);
    expect(res.json.pros).toEqual([]);
    expect(res.json.counts).toEqual({ cars: 0, pros: 0 });
    // Un food truck retenu, stand d'un pro du rÃ©seau qui accorde une remise au grade Rodage.
    const owner = await signUp("Truck_R4b");
    const pro = await createPro(owner.id);
    await db.insert(proDiscounts).values({ proId: pro.id, grade: "rodage", percent: 8 });
    const [provider] = await db
      .insert(providerProfiles)
      .values({ userId: owner.id, type: "food_truck", name: "La Caravane", proProfileId: pro.id, phone: "0600000000" })
      .returning();
    await db.insert(applications).values({
      eventId: e.id,
      userId: owner.id,
      kind: "provider",
      providerProfileId: provider!.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
      spotLabel: "B2",
    });
    const member = await signUp("Membre_Pro_R4b");
    const seen = await call(member, "GET", `/events/${e.id}/lineup`);
    expect(seen.json.pros).toEqual([
      {
        id: provider!.id,
        kind: "provider",
        name: "La Caravane",
        job: "Food truck",
        logoUrl: null,
        officialMedia: false,
        discount: { percent: 8, from: null },
      },
    ]);
    for (const p of seen.json.pros) expect(sorted(Object.keys(p))).toEqual(sorted(lineupProFields));
    // Ni emplacement de stand, ni tÃ©lÃ©phone ; un visiteur n'a pas de remise.
    expect(seen.text).not.toMatch(/B2|0600000000/);
    const visitor = await call(null, "GET", `/events/${e.id}/lineup`);
    expect(visitor.json.pros[0].discount).toBeNull();
    expect(visitor.json.counts.pros).toBe(1);
  });
});

describe("le plateau : qui y apparaÃ®t", () => {
  it("avant la fin : les retenues seulement (ni en attente, ni liste d'attente, ni refusÃ©es)", async () => {
    const e = await createEvent(structureId);
    const a = await exhibitor("Retenu_R4b");
    await apply(e.id, a);
    await apply(e.id, await exhibitor("Attente_R4b"), "pending");
    await apply(e.id, await exhibitor("Liste_R4b"), "waitlisted");
    await apply(e.id, await exhibitor("Refus_R4b"), "refused");
    const res = await call(orga, "GET", `/events/${e.id}/lineup`);
    expect(res.json.cars.map((c: LineupCarMember) => c.pseudo)).toEqual(["Retenu_R4b"]);
    expect(res.json.counts.cars).toBe(1);
  });

  it("aprÃ¨s l'Ã©vÃ©nement : seulement les prÃ©sentes ; les absents jamais montrÃ©s, mÃªme en nombre", async () => {
    const e = await createEvent(structureId);
    const present = await exhibitor("Present_R4b");
    const absent = await exhibitor("Absent_R4b");
    const ap = await apply(e.id, present);
    await apply(e.id, absent);
    await checkIn(e.id, ap.id);
    clock.set(new Date(e.endsAt.getTime() + DAY));
    const res = await call(orga, "GET", `/events/${e.id}/lineup`);
    expect(res.json.phase).toBe("present");
    expect(res.json.cars.map((c: LineupCarMember) => c.pseudo)).toEqual(["Present_R4b"]);
    expect(res.json.counts.cars).toBe(1);
    expect(res.json.filtered).toBe(1);
    expect(res.text).not.toContain("Absent_R4b");
    // L'absent lui-mÃªme ne s'y voit pas.
    const self = await call(absent.u, "GET", `/events/${e.id}/lineup`);
    expect(self.json.cars.some((c: LineupCarMember) => c.me)).toBe(false);
  });

  it("compte suspendu, supprimÃ© ou banni : exclu ; vÃ©hicule archivÃ© : exclu", async () => {
    const e = await createEvent(structureId);
    const ok = await exhibitor("Regle_R4b");
    const susp = await exhibitor("Suspendu_R4b");
    const gone = await exhibitor("Parti_R4b");
    const sold = await exhibitor("Vendu_R4b");
    for (const p of [ok, susp, gone, sold]) await apply(e.id, p);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * DAY) })
      .where(eq(profiles.userId, susp.u.id));
    await db.update(profiles).set({ deletedAt: clock.now }).where(eq(profiles.userId, gone.u.id));
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, sold.v.id));
    const res = await call(null, "GET", `/events/${e.id}/lineup`);
    expect(res.json.counts.cars).toBe(1);
  });

  it("brouillon, privÃ©, annulÃ©, inconnu : rien (404)", async () => {
    const draft = await createEvent(structureId, { status: "draft" });
    const priv = await createEvent(structureId, { admission: "invite_only" });
    const cancelled = await createEvent(structureId, { status: "cancelled", cancelledAt: new Date() });
    for (const id of [draft.id, priv.id, cancelled.id, "00000000-0000-4000-8000-000000000000"]) {
      expect((await call(orga, "GET", `/events/${id}/lineup`)).status).toBe(404);
      expect((await call(null, "GET", `/events/${id}/lineup`)).status).toBe(404);
    }
  });

  it("une vignette par vÃ©hicule, filtre par catÃ©gorie cÃ´tÃ© serveur, pages de 30", async () => {
    const e = await createEvent(structureId);
    for (let i = 0; i < 32; i++) {
      const p = await exhibitor(`Pilote_R4b${String(i).padStart(2, "0")}`);
      await apply(e.id, p);
      if (i < 3) await db.insert(vehicleCategories).values({ vehicleId: p.v.id, categoryId: ref.jdm.id });
    }
    const first = await call(orga, "GET", `/events/${e.id}/lineup`);
    expect(first.json.cars).toHaveLength(30);
    expect(first.json.nextCursor).toBe(30);
    const next = await call(orga, "GET", `/events/${e.id}/lineup?cursor=30`);
    expect(next.json.cars).toHaveLength(2);
    expect(next.json.nextCursor).toBeNull();
    const pseudos = new Set([...first.json.cars, ...next.json.cars].map((c: LineupCarMember) => c.pseudo));
    expect(pseudos.size).toBe(32);
    expect(first.json.categories).toEqual([{ slug: "jdm", label: "JDM", count: 3 }]);
    const jdm = await call(orga, "GET", `/events/${e.id}/lineup?category=jdm`);
    expect(jdm.json.cars).toHaveLength(3);
    expect(jdm.json.filtered).toBe(3);
    expect(jdm.json.counts.cars).toBe(32);
    expect((await call(orga, "GET", `/events/${e.id}/lineup?category=JDM%20!`)).status).toBe(400);
  });

  it("route publique limitÃ©e en dÃ©bit", async () => {
    resetRateLimits();
    const e = await createEvent(structureId);
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await call(null, "GET", `/events/${e.id}/lineup`)).status;
    expect(last).toBe(429);
  });
});

describe("Mes sorties et la fiche d'une voiture", () => {
  it("lineupPreview : nombre et trois mini-photos des autres, sur les places retenues seulement", async () => {
    const e = await createEvent(structureId);
    const other = await createEvent(structureId, { title: "En attente" });
    const kenji = await exhibitor("Kenji_R4b");
    await apply(e.id, kenji);
    for (let i = 0; i < 4; i++) await apply(e.id, await exhibitor(`Autre_R4b${i}`));
    const pend = await createVehicle(kenji.u.id, ref);
    await apply(other.id, { u: kenji.u, v: pend }, "pending");
    const res = await call(kenji.u, "GET", "/me/applications?scope=upcoming");
    const accepted = res.json.find((a: { event: { id: string } }) => a.event.id === e.id);
    expect(accepted.lineupPreview).toMatchObject({ phase: "accepted", count: 5 });
    expect(accepted.lineupPreview.photoUrls).toHaveLength(3);
    expect(accepted.lineupPreview.photoUrls.join()).not.toContain(kenji.v.id);
    const pending = res.json.find((a: { event: { id: string } }) => a.event.id === other.id);
    expect(pending.lineupPreview).toBeNull();
  });

  it("passÃ©e : Â« Â· N prÃ©sentes Â» ; Ã©vÃ©nement privÃ© : pas de ligne", async () => {
    const e = await createEvent(structureId);
    const kenji = await exhibitor("Kenji_R4b");
    const ak = await apply(e.id, kenji);
    await apply(e.id, await exhibitor("Absent_R4b"));
    await checkIn(e.id, ak.id);
    clock.set(new Date(e.endsAt.getTime() + DAY));
    const previews = await lineupService.previews([e.id], kenji.u.id);
    expect(previews.get(e.id)).toMatchObject({ phase: "present", count: 1 });
    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, e.id));
    expect((await lineupService.previews([e.id], kenji.u.id)).size).toBe(0);
  });

  it("canal en direct : rÃ©servÃ© aux Ã©vÃ©nements dont le plateau se montre", async () => {
    const e = await createEvent(structureId);
    const priv = await createEvent(structureId, { admission: "invite_only" });
    expect(await lineupService.canSubscribe(`event:${e.id}:lineup`)).toBe(true);
    expect(await lineupService.canSubscribe(`event:${priv.id}:lineup`)).toBe(false);
    expect(await lineupService.canSubscribe(`event:${e.id}:triage`)).toBe(false);
  });
});

describe("lot R4b, tour 2", () => {
  it("photo : seulement une photo floutÃ©e (la seconde si la premiÃ¨re ne l'est pas), sinon aucune", async () => {
    const e = await createEvent(structureId);
    const a = await exhibitor("Floue_R4b");
    // PremiÃ¨re photo non floutÃ©e, seconde floutÃ©e : la seconde.
    await db.update(vehiclePhotos).set({ plateBlurred: false }).where(eq(vehiclePhotos.vehicleId, a.v.id));
    await db.insert(vehiclePhotos).values({
      vehicleId: a.v.id,
      position: 2,
      storageKey: `test/${a.v.id}-floue.webp`,
      width: 10,
      height: 10,
      bytes: 10,
      plateBlurred: true,
    });
    // Aucune photo floutÃ©e : aucune.
    const b = await exhibitor("Nette_R4b", { private: true });
    await db.update(vehiclePhotos).set({ plateBlurred: false }).where(eq(vehiclePhotos.vehicleId, b.v.id));
    // Tour 3 : Â« aucune plaque visible Â» confirmÃ© Ã  l'envoi suffit.
    const c = await exhibitor("SansPlaque_R4b");
    await db
      .update(vehiclePhotos)
      .set({ plateBlurred: false, noPlateConfirmed: true })
      .where(eq(vehiclePhotos.vehicleId, c.v.id));
    for (const p of [a, b, c]) await apply(e.id, p);
    const res = await call(null, "GET", `/events/${e.id}/lineup`);
    const urls = res.json.cars.map((x: { photoUrl: string | null }) => x.photoUrl);
    expect(urls.filter(Boolean)).toHaveLength(2);
    expect(urls.some((u: string | null) => u?.includes("-floue.webp"))).toBe(true);
    expect(urls.some((u: string | null) => u?.includes(c.v.id))).toBe(true);
    // MÃªme rÃ¨gle pour la voiture d'un compte privÃ© et pour la ligne de Mes sorties.
    const viewer = await signUp("Voit_R4b");
    expect((await call(viewer, "GET", `/vehicles/${b.v.id}`)).json.photoUrl).toBeNull();
    const previews = await lineupService.previews([e.id], viewer.id);
    expect(previews.get(e.id)?.photoUrls).toHaveLength(2);
    // VÃ©hicule non immatriculÃ© : la premiÃ¨re photo.
    await db.update(vehicles).set({ unregistered: true }).where(eq(vehicles.id, b.v.id));
    expect((await call(viewer, "GET", `/vehicles/${b.v.id}`)).json.photoUrl).toContain(b.v.id);
  });

  it("aprÃ¨s la fin : ni retenus ni places restantes publics (les deux routes croisÃ©es), l'organisation garde les siens", async () => {
    const e = await createEvent(structureId, { capacity: 10 });
    const present = await exhibitor("Present2_R4b");
    const ap = await apply(e.id, present);
    await apply(e.id, await exhibitor("Absent2_R4b"));
    await checkIn(e.id, ap.id);
    const member = await signUp("Membre2_R4b");
    const before = await call(member, "GET", `/events/by-slug/${e.slug}`);
    expect(before.json.acceptedCount).toBe(2);
    expect(before.json.remaining).toBe(8);
    clock.set(new Date(e.endsAt.getTime() + DAY));
    for (const who of [member, null]) {
      const ev = await call(who, "GET", `/events/by-slug/${e.slug}`);
      const lineup = await call(who, "GET", `/events/${e.id}/lineup`);
      expect(ev.json.acceptedCount).toBeNull();
      expect(ev.json.remaining).toBeNull();
      expect(lineup.json.counts.cars).toBe(1);
    }
    const orgaView = await call(orga, "GET", `/events/${e.id}`);
    expect(orgaView.json.acceptedCount).toBe(2);
    expect(orgaView.json.remaining).toBe(8);
    expect((await eventsService.getPublic(e.slug, null)).acceptedCount).toBeNull();
  });

  it("le canal en direct : pointage, accrÃ©ditation d'un photographe", async () => {
    const e = await createEvent(structureId);
    const got: string[] = [];
    const socket: RealtimeSocket = { send: (m) => got.push(JSON.parse(m).type) };
    realtime.subscribe(`event:${e.id}:lineup`, socket);
    try {
      const p = await exhibitor("Pointe_R4b");
      const app = await apply(e.id, p);
      // Un retenu a son pass (Ã©mis Ã  l'acceptation dans le vrai parcours) ; le pointage s'ouvre le jour J.
      await withTx((tx) => accessService.issue(tx, app));
      clock.set(new Date(e.startsAt.getTime() + 3_600_000));
      const res = await call(orga, "POST", `/events/${e.id}/checkins`, { applicationId: app.id });
      expect([200, 201]).toContain(res.status);
      await new Promise((r) => setTimeout(r, 50));
      expect(got).toContain("lineup.changed");
      got.length = 0;
      const owner = await signUp("Photo_R4b");
      const [provider] = await db
        .insert(providerProfiles)
        .values({ userId: owner.id, type: "photographer", name: "Photo R4b" })
        .returning();
      const [pApp] = await db
        .insert(applications)
        .values({
          eventId: e.id,
          userId: owner.id,
          kind: "provider",
          providerProfileId: provider!.id,
          status: "accepted",
          rulesAcceptedAt: new Date(),
          followStructure: false,
        })
        .returning();
      const acc = await call(orga, "PATCH", `/events/${e.id}/applications/${pApp!.id}/accreditation`, {
        accredited: true,
      });
      expect(acc.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(got).toContain("lineup.changed");
    } finally {
      realtime.unsubscribe(`event:${e.id}:lineup`, socket);
    }
  });
});

describe("vague R4 : le nom tapÃ© (lot R4a) sur le plateau", () => {
  it("un modÃ¨le absent de la liste s'affiche sous le nom tapÃ© (Â« Peugeot 207 CC Â»), pas Â« Autre Â»", async () => {
    const e = await createEvent(structureId);
    const [other] = await db
      .insert(vehicleModels)
      .values({ makeId: ref.makeId, name: "Autre", slug: "autre-r4", vehicleType: "car", isOther: true })
      .returning();
    const [otherGen] = await db
      .insert(vehicleGenerations)
      .values({ modelId: other!.id, name: "Autre", isOther: true })
      .returning();
    const u = await signUp("Tape_R4");
    const v = await createVehicle(
      u.id,
      { makeId: ref.makeId, modelId: other!.id, generationId: otherGen!.id },
      {
        generationId: null,
        proposedModel: "207 CC",
        year: 2008,
      },
    );
    await db.update(vehiclePhotos).set({ plateBlurred: true }).where(eq(vehiclePhotos.vehicleId, v.id));
    await apply(e.id, { u, v });

    const res = await call(orga, "GET", `/events/${e.id}/lineup`);
    expect(res.status).toBe(200);
    const car = (res.json.cars as LineupCarMember[]).find((c) => c.pseudo === "Tape_R4");
    expect(car?.modelName).toBe("207 CC");
    expect(car?.label).toContain("207 CC");
    expect(car?.modelName).not.toBe("Autre");
  });
});
