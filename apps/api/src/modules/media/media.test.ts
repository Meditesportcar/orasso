// Lot 45 : profil média et accréditation presse. Demande (fermée, quota, date limite, doublon), décision par le tri
// existant (badge presse = pass, notifications accreditation_*), retrait, contenus (V6), mise en avant, vues, agenda,
// Explorer national (région, accréditation ouverte), carte de presse privée (AS-V6), synchro du staff, casquette.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { mediaProfiles, notifications, profiles, uploads } from "../../db/schema";
import { accountService } from "../account/service";
import { notificationsService } from "../notifications/service";
import { resetMediaViews } from "./service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

const ACCEPT = { decision: "accept", sendReasons: true, note: null } as const;
const REFUSE_QUOTA = {
  decision: "refuse",
  reasons: ["other"],
  note: "Quota presse atteint : l'organisation te propose la prochaine édition.",
  sendReasons: true,
} as const;
const REQUEST = { formats: ["photo", "video"], message: "Reportage photo et vidéo de la soirée." } as const;
const PROFILE = {
  name: "Sud Cars",
  formats: ["photo", "video"],
  description: "Média auto du Sud : photos, vidéos et articles.",
  website: "https://sudcars.example",
  pressCardNumber: "CP-123456",
  departments: [],
};
const PRESS = {
  accreditationOpen: true,
  quota: 5,
  deadline: null,
  zones: "zone piste 19 h – 21 h · paddock libre",
  instructions: "Gilet presse obligatoire.",
  contact: "presse@meditesportcar.example",
};

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let structureId: string;
let nocturneId: string;
let toulouseId: string;
let leo: TestUser;

beforeEach(async () => {
  await resetDb();
  resetMediaViews();
  clock = useClock(paris(10, 10, 12));
  orga = await signUp("Damien_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  nocturneId = (
    await createEvent(structureId, {
      slug: "nocturne-de-canet-2026",
      title: "Nocturne de Canet",
      startsAt: paris(10, 17, 19),
      endsAt: paris(10, 17, 23),
      capacity: 1,
      department: "66",
      lat: 42.7046,
      lng: 3.0352,
    })
  ).id;
  toulouseId = (
    await createEvent(structureId, {
      slug: "jap-fest-toulouse",
      title: "Jap'Fest Toulouse",
      startsAt: paris(10, 31, 10),
      endsAt: paris(10, 31, 18),
      department: "31",
      city: "Toulouse",
      lat: 43.6045,
      lng: 1.4442,
    })
  ).id;
  await createEvent(structureId, {
    slug: "classic-days-lyon",
    title: "Classic Days Lyon",
    startsAt: paris(11, 21, 10),
    endsAt: paris(11, 21, 18),
    department: "69",
    lat: 45.764,
    lng: 4.8357,
  });
  leo = await signUp("Leo_Media");
});

const putProfile = (u: TestUser, over: Record<string, unknown> = {}) =>
  call(u, "PUT", "/me/media-profile", { ...PROFILE, ...over });
const openPress = (eventId: string, over: Record<string, unknown> = {}) =>
  call(orga, "PUT", `/events/${eventId}/press-settings`, { ...PRESS, ...over });
const request = (u: TestUser, eventId: string, over: Record<string, unknown> = {}) =>
  call(u, "POST", `/events/${eventId}/accreditations`, { ...REQUEST, ...over });
const decide = (eventId: string, appId: string, input: object = ACCEPT) =>
  call(orga, "POST", `/events/${eventId}/applications/${appId}/decide`, input);

async function accredited(u: TestUser = leo, eventId = nocturneId) {
  await putProfile(u);
  await openPress(eventId);
  const app = (await request(u, eventId)).json;
  expect((await decide(eventId, app.id)).status).toBe(200);
  return app as { id: string };
}

describe("profil média", () => {
  it("crée et met à jour le profil ; la carte de presse n'apparaît que pour son titulaire", async () => {
    const created = await putProfile(leo, { website: null });
    expect(created.status).toBe(200);
    expect(created.json).toMatchObject({ name: "Sud Cars", formats: ["photo", "video"], pressCardNumber: "CP-123456" });
    expect(created.json.issue).toMatch(/lien/);
    const updated = await putProfile(leo);
    expect(updated.json.id).toBe(created.json.id);
    expect(updated.json.issue).toBeNull();

    const other = await signUp("Kenji_66");
    const pub = await call(other, "GET", `/media/${created.json.id}`);
    expect(pub.status).toBe(200);
    expect(pub.json).toMatchObject({ name: "Sud Cars", pressCardVerified: false });
    expect(pub.text).not.toContain("CP-123456");
    expect(pub.json.pressCardNumber).toBeUndefined();
    expect((await call(null, "GET", `/media/${created.json.id}`)).status).toBe(401);
  });

  it("logo : clé d'un envoi media_logo de son auteur, une seule fois", async () => {
    await putProfile(leo);
    await db.insert(uploads).values({
      key: "media-logos/logo.webp",
      userId: leo.id,
      purpose: "media_logo",
      width: 512,
      height: 512,
      bytes: 100,
    });
    const set = await call(leo, "POST", "/me/media-profile/logo", { key: "media-logos/logo.webp" });
    expect(set.status).toBe(200);
    expect(set.json.logoUrl).toContain("media-logos/logo.webp");
    expect((await call(leo, "POST", "/me/media-profile/logo", { key: "media-logos/logo.webp" })).status).toBe(400);
    expect((await call(leo, "DELETE", "/me/media-profile/logo")).json.logoUrl).toBeNull();
  });

  it("administration : liste à vérifier, vérification tracée ; refusée aux autres", async () => {
    const p = (await putProfile(leo)).json;
    const admin = await signUp("Admin_Orasso", { role: "super_admin", twoFactor: true });
    expect((await call(leo, "POST", `/admin/media/${p.id}/verify-press-card`, { verified: true })).status).toBe(403);
    const pending = await call(admin, "GET", "/admin/media?pending=1");
    expect(pending.json.map((m: { id: string }) => m.id)).toContain(p.id);
    expect(pending.json[0].pressCardNumber).toBe("CP-123456");
    const ok = await call(admin, "POST", `/admin/media/${p.id}/verify-press-card`, { verified: true });
    expect(ok.status).toBe(200);
    expect(ok.json.pressCardVerifiedAt).not.toBeNull();
    expect((await call(admin, "GET", "/admin/media?pending=1")).json).toHaveLength(0);
    // Changer de carte retire la vérification.
    expect((await putProfile(leo, { pressCardNumber: "CP-999" })).json.pressCardVerifiedAt).toBeNull();
  });
});

describe("demande d'accréditation", () => {
  it("refuse : sans profil, profil incomplet, accréditation fermée, date limite passée", async () => {
    expect((await request(leo, nocturneId)).status).toBe(404);
    await putProfile(leo, { website: null });
    await openPress(nocturneId);
    const incomplete = await request(leo, nocturneId);
    expect(incomplete.status).toBe(400);
    expect(incomplete.json.error.details.reason).toBe("profile_incomplete");
    await putProfile(leo);

    // Sans réglage presse, puis réglage fermé : 409 accreditation_closed.
    const none = await request(leo, toulouseId);
    expect(none.status).toBe(409);
    expect(none.json.error.code).toBe("accreditation_closed");
    await openPress(toulouseId, { accreditationOpen: false });
    expect((await request(leo, toulouseId)).json.error.code).toBe("accreditation_closed");

    await openPress(toulouseId, { deadline: paris(10, 9, 12).toISOString() });
    const late = await request(leo, toulouseId);
    expect(late.status).toBe(409);
    expect(late.json.error.code).toBe("accreditation_deadline_passed");
  });

  it("crée une candidature media en attente, prévient l'organisation ; doublon refusé", async () => {
    await putProfile(leo);
    await openPress(nocturneId);
    const res = await request(leo, nocturneId);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ status: "pending", formats: ["photo", "video"], pass: null, briefing: null });
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, orga.id), eq(notifications.type, "accreditation_requested")),
    });
    expect(notif?.family).toBe("staff");
    expect(notif?.body).toContain("Sud Cars");

    const twice = await request(leo, nocturneId);
    expect(twice.status).toBe(409);
    expect(twice.json.error.code).toBe("conflict");
    // Le tri existant voit la demande dans sa file `media`.
    const triage = await call(orga, "GET", `/events/${nocturneId}/applications?kind=media`);
    expect(triage.json.items).toHaveLength(1);
    expect(triage.json.items[0]).toMatchObject({ kind: "media", vehicle: null });
    const list = await call(orga, "GET", `/events/${nocturneId}/accreditations`);
    expect(list.json[0].media).toMatchObject({ name: "Sud Cars" });
    expect(list.text).not.toContain("CP-123456");
  });

  it("quota atteint : 409 press_quota_reached", async () => {
    await openPress(nocturneId, { quota: 1 });
    const first = await signUp("Media_Un");
    await putProfile(first, { name: "Média Un" });
    const app = (await request(first, nocturneId)).json;
    await decide(nocturneId, app.id);
    await putProfile(leo);
    const res = await request(leo, nocturneId);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("press_quota_reached");
  });
});

describe("décision et badge presse", () => {
  it("acceptée par le tri, hors capacité : pass émis, notification accreditation_accepted, consignes", async () => {
    // Capacité 1 déjà prise par un véhicule ? La presse ne la compte pas : acceptée même sur un événement plein.
    const app = await accredited();
    const mine = await call(leo, "GET", "/me/accreditations");
    expect(mine.status).toBe(200);
    expect(mine.json[0]).toMatchObject({
      id: app.id,
      status: "accepted",
      briefing: { zones: "zone piste 19 h – 21 h · paddock libre" },
    });
    expect(mine.json[0].pass).toMatchObject({ valid: true });
    const pass = await call(leo, "GET", `/applications/${app.id}/pass`);
    expect(pass.status).toBe(200);
    expect(pass.json.payload).toBeTruthy();
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, leo.id), eq(notifications.type, "accreditation_accepted")),
    });
    expect(notif?.family).toBe("event");
    const generic = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, leo.id), eq(notifications.type, "application_accepted")),
    });
    expect(generic).toBeUndefined();
    // Capacité inchangée.
    expect((await call(orga, "GET", `/events/${nocturneId}/counters`)).json.remaining).toBe(1);
  });

  it("refusée avec la raison affichée ; pas de liste d'attente pour la presse", async () => {
    await putProfile(leo);
    await openPress(nocturneId);
    const app = (await request(leo, nocturneId)).json;
    const wait = await decide(nocturneId, app.id, { decision: "waitlist", sendReasons: true });
    expect(wait.status).toBe(400);
    expect((await decide(nocturneId, app.id, REFUSE_QUOTA)).status).toBe(200);
    const mine = (await call(leo, "GET", "/me/accreditations")).json;
    expect(mine[0]).toMatchObject({ status: "refused", refusalNote: REFUSE_QUOTA.note, pass: null });
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, leo.id), eq(notifications.type, "accreditation_refused")),
    });
    expect(notif?.body).toContain("Quota presse atteint");
    // Refusé : une nouvelle demande est possible (plus d'accréditation active).
    expect((await request(leo, nocturneId)).status).toBe(201);
  });

  it("retrait par la route existante : pass révoqué", async () => {
    const app = await accredited();
    expect((await call(leo, "POST", `/applications/${app.id}/withdraw`)).status).toBe(200);
    const mine = (await call(leo, "GET", "/me/accreditations")).json;
    expect(mine[0]).toMatchObject({ status: "withdrawn", canWithdraw: false });
    expect(mine[0].pass).toMatchObject({ valid: false });
  });

  it("synchro du staff : « Presse · Sud Cars », kind media", async () => {
    const staff = await signUp("Julie_66");
    await addMember(structureId, staff.id, "staff", ["scan"]);
    const app = await accredited();
    const pass = (await call(leo, "GET", `/applications/${app.id}/pass`)).json;
    clock.set(paris(10, 17, 18, 30));
    const sync = await call(staff, "GET", `/events/${nocturneId}/staff/sync`);
    expect(sync.status).toBe(200);
    const entry = sync.json.entries.find((e: { passId: string }) => e.passId === pass.passId);
    expect(entry).toMatchObject({
      kind: "media",
      vehicleLabel: "Presse · Sud Cars",
      providerType: "Presse",
      providerName: "Sud Cars",
      plateHint: null,
    });
  });

  it("casquette média dans /me, badge = décisions non vues", async () => {
    await putProfile(leo);
    expect((await call(leo, "GET", "/me")).json.personas.at(-1)).toMatchObject({ kind: "media", badge: 0 });
    await openPress(nocturneId);
    const app = (await request(leo, nocturneId)).json;
    await decide(nocturneId, app.id);
    expect((await call(leo, "GET", "/me")).json.personas.at(-1)).toMatchObject({
      kind: "media",
      label: "Sud Cars",
      badge: 1,
    });
  });
});

describe("contenus", () => {
  const LINK = { kind: "link", title: "Le roll de minuit", url: "https://youtube.com/watch?v=x", platform: "youtube" };

  it("non accrédité : 403 ; accrédité : publié, modifié, retiré", async () => {
    await putProfile(leo);
    const refused = await call(leo, "POST", "/me/media-contents", { ...LINK, eventId: nocturneId });
    expect(refused.status).toBe(403);
    await openPress(nocturneId);
    const app = (await request(leo, nocturneId)).json;
    // En attente : toujours pas.
    expect((await call(leo, "POST", "/me/media-contents", { ...LINK, eventId: nocturneId })).status).toBe(403);
    await decide(nocturneId, app.id);
    const created = await call(leo, "POST", "/me/media-contents", { ...LINK, eventId: nocturneId });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ title: "Le roll de minuit", platform: "youtube", featured: false, views: 0 });
    const updated = await call(leo, "PATCH", `/me/media-contents/${created.json.id}`, { title: "Roll de minuit" });
    expect(updated.json.title).toBe("Roll de minuit");
    // Un autre compte ne touche pas au contenu.
    const other = await signUp("Kenji_66");
    expect((await call(other, "DELETE", `/me/media-contents/${created.json.id}`)).status).toBe(404);
    expect((await call(leo, "GET", "/me/media-contents")).json).toHaveLength(1);
    expect((await call(leo, "DELETE", `/me/media-contents/${created.json.id}`)).status).toBe(204);
    expect((await call(leo, "GET", "/me/media-contents")).json).toHaveLength(0);
  });

  it("galerie : photos envoyées en media_content ; clé inconnue refusée", async () => {
    await accredited();
    const bad = await call(leo, "POST", "/me/media-contents", {
      eventId: nocturneId,
      kind: "gallery",
      title: "La nuit des japonaises",
      photoKeys: ["media-contents/inconnue.webp"],
    });
    expect(bad.status).toBe(400);
    await db.insert(uploads).values({
      key: "media-contents/a.webp",
      userId: leo.id,
      purpose: "media_content",
      width: 1600,
      height: 900,
      bytes: 100,
    });
    const ok = await call(leo, "POST", "/me/media-contents", {
      eventId: nocturneId,
      kind: "gallery",
      title: "La nuit des japonaises",
      photoKeys: ["media-contents/a.webp"],
    });
    expect(ok.status).toBe(201);
    expect(ok.json.photos).toHaveLength(1);
  });

  it("mise en avant par l'organisation seulement ; page publique : mis en avant d'abord ; vues par session et heure", async () => {
    await accredited();
    const a = (await call(leo, "POST", "/me/media-contents", { ...LINK, eventId: nocturneId })).json;
    const b = (
      await call(leo, "POST", "/me/media-contents", {
        kind: "link",
        title: "La nuit des japonaises",
        url: "https://sudcars.example/article",
        platform: "website",
        eventId: nocturneId,
      })
    ).json;
    expect(
      (await call(leo, "PATCH", `/events/${nocturneId}/media-contents/${a.id}/feature`, { featured: true })).status,
    ).toBe(403);
    const featured = await call(orga, "PATCH", `/events/${nocturneId}/media-contents/${a.id}/feature`, {
      featured: true,
    });
    expect(featured.status).toBe(200);
    expect(featured.json.featured).toBe(true);
    const notif = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, leo.id), eq(notifications.type, "media_content_featured")),
    });
    expect(notif).toBeTruthy();

    const page = await call(null, "GET", "/events/by-slug/nocturne-de-canet-2026/media-contents");
    expect(page.status).toBe(200);
    expect(page.json.map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    expect(page.text).not.toContain("CP-123456");

    const visitor = await signUp("Kenji_66");
    expect((await call(visitor, "POST", `/media-contents/${b.id}/view`)).json.views).toBe(1);
    expect((await call(visitor, "POST", `/media-contents/${b.id}/view`)).json.views).toBe(1);
    // Le média lui-même ne se compte pas.
    expect((await call(leo, "POST", `/media-contents/${b.id}/view`)).json.views).toBe(1);
    clock.advance(3_600_000);
    expect((await call(visitor, "POST", `/media-contents/${b.id}/view`)).json.views).toBe(2);
    // Couverture dans « Mes accréditations ».
    expect((await call(leo, "GET", "/me/accreditations")).json[0].coverage).toEqual({ contents: 2, views: 2 });
  });
});

describe("agenda et Explorer national", () => {
  it("agenda : accréditations et événements gardés, par semaine", async () => {
    await accredited();
    expect((await call(leo, "POST", `/me/media/saved/${toulouseId}`)).status).toBe(204);
    const agenda = await call(leo, "GET", "/me/media/agenda");
    expect(agenda.status).toBe(200);
    expect(agenda.json.weeks).toHaveLength(2);
    expect(agenda.json.weeks[0]).toMatchObject({ weekStart: "2026-10-12" });
    expect(agenda.json.weeks[0].items[0]).toMatchObject({
      event: { title: "Nocturne de Canet" },
      accreditation: { status: "accepted" },
      saved: false,
    });
    expect(agenda.json.weeks[1]).toMatchObject({ weekStart: "2026-10-26" });
    expect(agenda.json.weeks[1].items[0]).toMatchObject({ saved: true, accreditation: null, accreditationOpen: false });
    await call(leo, "DELETE", `/me/media/saved/${toulouseId}`);
    expect((await call(leo, "GET", "/me/media/agenda")).json.weeks).toHaveLength(1);
  });

  it("GET /events : filtre région et accréditation ouverte ; état et temps de route pour un média", async () => {
    await putProfile(leo);
    await db
      .update(profiles)
      .set({ departments: ["66"] })
      .where(eq(profiles.userId, leo.id));
    await openPress(toulouseId);
    await openPress(nocturneId, { accreditationOpen: false });

    const occ = await call(null, "GET", "/events?region=OCC");
    expect(occ.status).toBe(200);
    expect(occ.json.items.map((e: { title: string }) => e.title)).toEqual(["Nocturne de Canet", "Jap'Fest Toulouse"]);
    const ara = await call(null, "GET", "/events?region=ARA");
    expect(ara.json.items.map((e: { title: string }) => e.title)).toEqual(["Classic Days Lyon"]);
    expect((await call(null, "GET", "/events?region=XYZ")).status).toBe(400);

    const open = await call(leo, "GET", "/events?accreditationOpen=1&region=OCC");
    expect(open.json.items).toHaveLength(1);
    const card = open.json.items[0];
    expect(card).toMatchObject({ title: "Jap'Fest Toulouse", accreditation: { open: true, mine: null } });
    // 66 → Toulouse ≈ 190 km à vol d'oiseau, 70 km/h : un peu moins de 3 h.
    expect(card.travelMinutes).toBeGreaterThanOrEqual(120);
    expect(card.travelMinutes).toBeLessThanOrEqual(210);

    await request(leo, toulouseId);
    const after = (await call(leo, "GET", "/events?accreditationOpen=1")).json.items[0];
    expect(after.accreditation).toEqual({ open: true, mine: "pending" });
    // Sans profil média ni filtre presse : pas d'état d'accréditation sur les cartes.
    const plain = (await call(orga, "GET", "/events")).json.items[0];
    expect(plain.accreditation).toBeUndefined();
  });
});

describe("anonymisation", () => {
  it("profil retiré, carte de presse effacée, contenus retirés", async () => {
    await accredited();
    await call(leo, "POST", "/me/media-contents", {
      kind: "link",
      title: "Article",
      url: "https://sudcars.example/a",
      eventId: nocturneId,
    });
    await accountService.anonymize(leo.id, null);
    const p = await db.query.mediaProfiles.findFirst({ where: eq(mediaProfiles.userId, leo.id) });
    expect(p).toMatchObject({ name: "Média supprimé", pressCardNumber: null, website: null });
    expect(p?.deletedAt).toBeTruthy();
    expect((await call(null, "GET", "/events/by-slug/nocturne-de-canet-2026/media-contents")).json).toHaveLength(0);
  });
});
