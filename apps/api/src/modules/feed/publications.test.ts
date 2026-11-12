// Publier au nom d'une casquette, pour un événement (R8a1) : droits, visuel (T1), rôle déduit, lecture, compatibilité de
// l'APK en ligne, visibilité d'une page, compte supprimé. L'« Info importante » est dans `important.test.ts`.
import { randomUUID } from "node:crypto";
import { type FeedPostView, fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  eventPresences,
  events,
  feedPostPhotos,
  feedPosts,
  mediaProfiles,
  orders,
  profiles,
  providerProfiles,
  signingKeys,
  structureMembers,
  structures,
  tickets,
  ticketTypes,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { anonymizeFeedForDeletedAccount } from "./anonymize";
import { loadPostViews } from "./posts";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
});

const POSTER = "events/poster-r8a1.webp";

async function orgaWithStructure(pseudo = "Orga_R8") {
  const owner = await signUp(pseudo, { twoFactor: true });
  const structure = await createStructure(owner.id);
  return { owner, structure };
}

/** Événement de la structure, décalé de `startH` heures par rapport à l'horloge simulée. */
const eventAt = (structureId: string, startH: number, over: Partial<typeof events.$inferInsert> = {}) => {
  const startsAt = new Date(clock.now.getTime() + startH * HOUR);
  return createEvent(structureId, {
    title: "Rassemblement du Lydia",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * HOUR),
    posterKey: POSTER,
    ...over,
  });
};
/** Événement fini il y a `days` jours (sa fin tombe pile à `now - days`). */
const endedDaysAgo = (structureId: string, days: number, over: Partial<typeof events.$inferInsert> = {}) => {
  const endsAt = new Date(clock.now.getTime() - days * DAY);
  return createEvent(structureId, {
    title: "Rassemblement fini",
    startsAt: new Date(endsAt.getTime() - 4 * HOUR),
    endsAt,
    posterKey: POSTER,
    ...over,
  });
};

async function jpeg(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * width) / 40}" y="0" width="${width / 80}" height="${height}" fill="${i % 2 ? "#fff" : "#000"}"/>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Une photo 4:5 envoyée, prête à être publiée (« aucune plaque visible » confirmée). */
async function photoOf(u: TestUser) {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new File([new Uint8Array(await jpeg(1080, 1350))], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  const json = (await res.json()) as { key: string };
  return { photos: [{ uploadKey: json.key, noPlateConfirmed: true }] };
}

const publish = (u: TestUser, body: Record<string, unknown>) => call(u, "POST", "/me/feed-posts", body);
const get = (u: TestUser, id: string) => call(u, "GET", `/feed-posts/${id}`);

/** Candidature de `u` à l'événement (véhicule, prestataire ou média). */
async function apply(
  u: TestUser,
  eventId: string,
  status: (typeof applications.$inferInsert)["status"] = "accepted",
  kind: "vehicle" | "provider" | "media" = "vehicle",
) {
  const base = { eventId, userId: u.id, status, rulesAcceptedAt: clock.now, followStructure: false };
  if (kind === "vehicle") {
    const car = await createVehicle(u.id, ref);
    return (
      await db
        .insert(applications)
        .values({ ...base, vehicleId: car.id })
        .returning()
    )[0]!;
  }
  if (kind === "provider") {
    const [p] = await db.select().from(providerProfiles).where(eq(providerProfiles.userId, u.id));
    const profile =
      p ??
      (
        await db.insert(providerProfiles).values({ userId: u.id, type: "photographer", name: "Presta" }).returning()
      )[0]!;
    return (
      await db
        .insert(applications)
        .values({ ...base, kind, providerProfileId: profile.id })
        .returning()
    )[0]!;
  }
  const [m] = await db.select().from(mediaProfiles).where(eq(mediaProfiles.userId, u.id));
  const profile = m ?? (await db.insert(mediaProfiles).values({ userId: u.id, name: "Média" }).returning())[0]!;
  return (
    await db
      .insert(applications)
      .values({ ...base, kind, mediaProfileId: profile.id })
      .returning()
  )[0]!;
}

/** Billet de `u`, sans passer par la billetterie. */
async function ticketFor(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled" = "valid") {
  const [existing] = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const type =
    existing ??
    (await db.insert(ticketTypes).values({ eventId, name: "Entrée visiteur", capacity: 100 }).returning())[0]!;
  const [order] = await db
    .insert(orders)
    .values({
      eventId,
      userId: u.id,
      ticketTypeId: type.id,
      status: "paid",
      quantity: 1,
      amountCents: 0,
      paidAt: clock.now,
    })
    .returning();
  await db
    .insert(signingKeys)
    .values({ kid: 1, publicKey: Buffer.alloc(32) })
    .onConflictDoNothing();
  await db.insert(tickets).values({
    orderId: order!.id,
    eventId,
    userId: u.id,
    ticketTypeId: type.id,
    status,
    kid: 1,
    signature: Buffer.from("00", "hex"),
    issuedAt: clock.now,
    usedAt: status === "used" ? clock.now : null,
  });
}

const rowOf = async (id: string) => (await db.select().from(feedPosts).where(eq(feedPosts.id, id)))[0]!;

describe("publier au nom d'une casquette : droits", () => {
  it("organisateur : la publication est celle de la structure, jamais celle du compte", async () => {
    const { owner, structure } = await orgaWithStructure();
    const res = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    expect(res.status).toBe(201);
    expect(res.json.author).toMatchObject({
      key: `s:${structure.id}`,
      kind: "structure",
      name: "Club de test",
      pseudo: "Club de test",
      grade: null,
      verified: true,
    });
    // `author_id` (la personne) n'est servi nulle part pour une page.
    expect(res.text).not.toContain(owner.id);
    expect(res.text).not.toContain(owner.pseudo);
    expect(res.json.mine).toBe(true);
    const row = await rowOf(res.json.id);
    expect(row).toMatchObject({ persona: "organizer", structureId: structure.id, authorId: owner.id });
  });

  it("co-organisateur accepté ; membre du staff, passionné et ancien membre refusés (403 persona_forbidden)", async () => {
    const { owner, structure } = await orgaWithStructure();
    const co = await signUp("Co_R8", { twoFactor: true });
    const staff = await signUp("Staff_R8", { twoFactor: true });
    const ex = await signUp("Ex_R8", { twoFactor: true });
    const fan = await signUp("Fan_R8", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    await addMember(structure.id, staff.id, "staff");
    await addMember(structure.id, ex.id, "co_organizer");
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, ex.id));
    const body = async (u: TestUser) => ({ persona: "organizer", structureId: structure.id, ...(await photoOf(u)) });
    expect((await publish(co, await body(co))).status).toBe(201);
    for (const u of [staff, ex, fan]) {
      const res = await publish(u, await body(u));
      expect(res.status, u.pseudo).toBe(403);
      expect(res.json.error.code).toBe("persona_forbidden");
    }
    void owner;
  });

  it("sans second facteur : 403 two_factor_required ; structure suspendue : 403 persona_forbidden", async () => {
    const owner = await signUp("Sans2fa_R8");
    const structure = await createStructure(owner.id);
    const body = { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) };
    const noFactor = await publish(owner, body);
    expect(noFactor.status).toBe(403);
    expect(noFactor.json.error.code).toBe("two_factor_required");
    const orga = await signUp("Susp_R8", { twoFactor: true });
    const s2 = await createStructure(orga.id);
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, s2.id));
    const suspended = await publish(orga, { persona: "organizer", structureId: s2.id, ...(await photoOf(orga)) });
    expect(suspended.status).toBe(403);
    expect(suspended.json.error.code).toBe("persona_forbidden");
  });

  it("fiche pro : la sienne seulement ; prestataire et média : leur profil, résolu par le serveur", async () => {
    const owner = await signUp("Pro_R8");
    const other = await signUp("ProAutre_R8");
    const pro = await createPro(owner.id);
    const ok = await publish(owner, { persona: "pro", proId: pro.id, ...(await photoOf(owner)) });
    expect(ok.status).toBe(201);
    expect(ok.json.author).toMatchObject({ key: `p:${pro.id}`, kind: "pro", name: "Garage de test" });
    const denied = await publish(other, { persona: "pro", proId: pro.id, ...(await photoOf(other)) });
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("persona_forbidden");
    // Prestataire et média : pas de profil, 403 ; avec un profil, 201 (aucun identifiant reçu).
    const u = await signUp("Presta_R8");
    expect((await publish(u, { persona: "provider", ...(await photoOf(u)) })).status).toBe(403);
    expect((await publish(u, { persona: "media", ...(await photoOf(u)) })).status).toBe(403);
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: u.id, type: "photographer", name: "Studio R8" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: u.id, name: "Média R8" }).returning();
    const p1 = await publish(u, { persona: "provider", ...(await photoOf(u)) });
    const p2 = await publish(u, { persona: "media", ...(await photoOf(u)) });
    expect(p1.status).toBe(201);
    expect(p1.json.author).toMatchObject({ key: `v:${prov?.id}`, kind: "provider", name: "Studio R8" });
    expect(p2.json.author).toMatchObject({ key: `m:${med?.id}`, kind: "media", name: "Média R8" });
  });

  it("véhicule, carte « voiture » et collaboration commerciale : pour les publications personnelles seulement", async () => {
    const { owner, structure } = await orgaWithStructure();
    const car = await createVehicle(owner.id, ref);
    const pro = await createPro((await signUp("Collab_R8")).id);
    for (const extra of [
      { vehicleId: car.id },
      { linked: { type: "vehicle", id: car.id } },
      { commercialPartnerId: pro.id },
    ]) {
      const photos = "linked" in extra ? {} : await photoOf(owner);
      const res = await publish(owner, { persona: "organizer", structureId: structure.id, ...photos, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("une casquette inattendue pour un passionné : 400", async () => {
    const { owner, structure } = await orgaWithStructure();
    const res = await publish(owner, { structureId: structure.id, ...(await photoOf(owner)) });
    expect(res.status).toBe(400);
  });
});

describe("visuel : la photo reste obligatoire, sauf l'affiche d'un événement rattaché (T1)", () => {
  it("casquette sans photo, sans événement : 400 photo_required", async () => {
    const { owner, structure } = await orgaWithStructure();
    const res = await publish(owner, { persona: "organizer", structureId: structure.id, caption: "Du nouveau" });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("photo_required");
  });

  it("rattachée à un événement qui a une affiche, avec légende : 201, l'affiche est le visuel (une référence)", async () => {
    const { owner, structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const res = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Le plan du plateau est en ligne",
    });
    expect(res.status).toBe(201);
    expect(res.json.visual).toBe("event_poster");
    expect(res.json.photos).toEqual([{ url: storage.url(POSTER), width: 1080, height: 1350 }]);
    // Aucune copie : aucune ligne de photo pour la publication.
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, res.json.id))).toHaveLength(0);
    expect(res.json.attach).toMatchObject({ role: "organizer", phase: "before", presenceValidated: false });
    expect(res.json.attach.event).toEqual({
      id: event.id,
      slug: event.slug,
      title: "Rassemblement du Lydia",
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      city: "Canet-en-Roussillon",
    });
    expect(res.json.placeLabel).toBe("Canet-en-Roussillon");
  });

  it("avec une photo propre : la photo, visual « photos »", async () => {
    const { owner, structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const res = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      ...(await photoOf(owner)),
    });
    expect(res.status).toBe(201);
    expect(res.json.visual).toBe("photos");
    expect(res.json.photos[0].url).toMatch(/^\/api\/feed-posts\/.+\/photos\/[0-9a-f]{32}\.webp$/);
  });

  it("événement sans affiche, ou sans légende : 400 photo_required", async () => {
    const { owner, structure } = await orgaWithStructure();
    const bare = await eventAt(structure.id, 48, { posterKey: null });
    const noPoster = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: bare.id,
      caption: "Sans affiche",
    });
    expect(noPoster.status).toBe(400);
    expect(noPoster.json.error.code).toBe("photo_required");
    const withPoster = await eventAt(structure.id, 48);
    const noCaption = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: withPoster.id,
    });
    expect(noCaption.status).toBe(400);
    expect(noCaption.json.error.code).toBe("photo_required");
  });

  it("passionné sans rôle et sans photo : 400 ; avec un rôle déduit, une légende et une affiche : 201", async () => {
    const { structure } = await orgaWithStructure();
    const fan = await signUp("Kenji_R8");
    const event = await eventAt(structure.id, 48);
    const none = await publish(fan, { eventId: event.id, caption: "Hâte d'y être" });
    expect(none.status).toBe(400);
    expect(none.json.error.code).toBe("photo_required");
    await apply(fan, event.id, "accepted");
    const ok = await publish(fan, { eventId: event.id, caption: "Hâte d'y être" });
    expect(ok.status).toBe(201);
    expect(ok.json.visual).toBe("event_poster");
    expect(ok.json.attach.role).toBe("attendee");
    // Toujours rien sans événement.
    expect((await publish(fan, { caption: "Rien" })).json.error.code).toBe("photo_required");
  });

  it("légende : 500 pour un passionné, 2 000 pour une casquette", async () => {
    const { owner, structure } = await orgaWithStructure();
    const fan = await signUp("Longue_R8");
    expect((await publish(fan, { caption: "x".repeat(501), ...(await photoOf(fan)) })).status).toBe(400);
    expect((await publish(fan, { caption: "x".repeat(500), ...(await photoOf(fan)) })).status).toBe(201);
    const page = { persona: "organizer", structureId: structure.id };
    expect((await publish(owner, { ...page, caption: "y".repeat(2000), ...(await photoOf(owner)) })).status).toBe(201);
    expect((await publish(owner, { ...page, caption: "y".repeat(2001), ...(await photoOf(owner)) })).status).toBe(400);
  });
});

describe("rôle déduit, jamais reçu", () => {
  it("un `eventRole` envoyé est ignoré", async () => {
    const { structure } = await orgaWithStructure();
    const fan = await signUp("Intrus_R8");
    const event = await eventAt(structure.id, 48);
    const res = await publish(fan, {
      eventId: event.id,
      eventRole: "organizer",
      role: "organizer",
      ...(await photoOf(fan)),
    });
    expect(res.status).toBe(201);
    expect((await rowOf(res.json.id)).eventRole).toBeNull();
    expect(res.json.attach.role).toBeNull();
  });

  it("organisateur : fenêtre de 30 jours (borne comprise), brouillon et structure d'un autre refusés (422)", async () => {
    const { owner, structure } = await orgaWithStructure();
    const base = { persona: "organizer", structureId: structure.id };
    const at30 = await endedDaysAgo(structure.id, 30);
    const at31 = await endedDaysAgo(structure.id, 31);
    const draft = await eventAt(structure.id, 48, { status: "draft" });
    const cancelled = await eventAt(structure.id, 48, { status: "cancelled" });
    const otherOwner = await signUp("AutreOrga_R8", { twoFactor: true });
    const otherStructure = await createStructure(otherOwner.id);
    const foreign = await eventAt(otherStructure.id, 48);
    const ok = (e: { id: string }) => publish(owner, { ...base, eventId: e.id, caption: "Info" });
    expect((await ok(at30)).status).toBe(201);
    expect((await ok(cancelled)).status).toBe(201);
    for (const e of [at31, draft, foreign]) {
      const res = await ok(e);
      expect(res.status).toBe(422);
      expect(res.json.error.code).toBe("event_not_attachable");
    }
    expect((await ok({ id: randomUUID() })).status).toBe(422);
  });

  it("prestataire et média : leur candidature retenue seulement ; fiche pro : jamais", async () => {
    const { structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const other = await eventAt(structure.id, 72);
    const presta = await signUp("Presta2_R8");
    const media = await signUp("Media2_R8");
    const proOwner = await signUp("Pro2_R8");
    await apply(presta, event.id, "accepted", "provider");
    await apply(presta, other.id, "pending", "provider");
    await apply(media, event.id, "accepted", "media");
    const pro = await createPro(proOwner.id);
    const body = (e: { id: string }) => ({ eventId: e.id, caption: "Présent" });
    const p1 = await publish(presta, { persona: "provider", ...body(event) });
    expect(p1.status).toBe(201);
    expect(p1.json.attach.role).toBe("on_site");
    expect((await publish(presta, { persona: "provider", ...body(other) })).status).toBe(422);
    const m1 = await publish(media, { persona: "media", ...body(event) });
    expect(m1.status).toBe(201);
    expect(m1.json.attach.role).toBe("on_site");
    expect((await publish(media, { persona: "media", ...body(other) })).status).toBe(422);
    const proRes = await publish(proOwner, { persona: "pro", proId: pro.id, ...body(event) });
    expect(proRes.status).toBe(422);
    expect(proRes.json.error.code).toBe("event_not_attachable");
    // Un prestataire d'un autre événement ne peut pas se rattacher à celui-ci.
    const stranger = await signUp("Presta3_R8");
    await apply(stranger, other.id, "accepted", "provider");
    expect((await publish(stranger, { persona: "provider", ...body(event) })).status).toBe(422);
  });

  it("passionné à venir : candidature acceptée ou en attente, billet valable ; désistée, refusée, billet annulé : sans rôle", async () => {
    const { structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const roleFor = async (setup: (u: TestUser) => Promise<unknown>) => {
      const u = await signUp(`Fan${Math.random().toString(36).slice(2, 7)}`);
      await setup(u);
      const res = await publish(u, { eventId: event.id, ...(await photoOf(u)) });
      expect(res.status).toBe(201);
      return res.json.attach.role as string | null;
    };
    expect(await roleFor((u) => apply(u, event.id, "accepted"))).toBe("attendee");
    expect(await roleFor((u) => apply(u, event.id, "pending"))).toBe("attendee");
    expect(await roleFor((u) => ticketFor(u, event.id, "valid"))).toBe("attendee");
    expect(await roleFor((u) => apply(u, event.id, "withdrawn"))).toBeNull();
    expect(await roleFor((u) => apply(u, event.id, "refused"))).toBeNull();
    expect(await roleFor((u) => ticketFor(u, event.id, "cancelled"))).toBeNull();
    expect(await roleFor(async () => undefined)).toBeNull();
  });

  it("passionné après la fin : présence validée et 30 jours au plus ; sinon accepté sans rôle", async () => {
    const { structure } = await orgaWithStructure();
    const recent = await endedDaysAgo(structure.id, 2);
    const border = await endedDaysAgo(structure.id, 30);
    const old = await endedDaysAgo(structure.id, 31);
    const present = await signUp("Present_R8");
    const absent = await signUp("Absent_R8");
    for (const e of [recent, border, old]) {
      await apply(present, e.id, "accepted");
      await db.insert(eventPresences).values({ eventId: e.id, userId: present.id, validatedAt: e.endsAt });
      await apply(absent, e.id, "accepted");
    }
    const send = async (u: TestUser, e: { id: string }) => {
      const res = await publish(u, { eventId: e.id, ...(await photoOf(u)) });
      expect(res.status).toBe(201);
      return res.json.attach;
    };
    expect((await send(present, recent)).role).toBe("attendee");
    expect((await send(present, recent)).presenceValidated).toBe(true);
    expect((await send(present, border)).role).toBe("attendee");
    expect((await send(present, old)).role).toBeNull();
    expect((await send(absent, recent)).role).toBeNull();
    expect((await send(absent, recent)).presenceValidated).toBe(false);
  });

  it("T12 : après la fin, un « j'y serai » sans présence validée perd son verbe à la lecture", async () => {
    const { structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 6);
    const fan = await signUp("Serai_R8");
    await apply(fan, event.id, "accepted");
    const res = await publish(fan, { eventId: event.id, ...(await photoOf(fan)) });
    expect(res.json.attach).toMatchObject({ role: "attendee", phase: "before" });
    expect((await rowOf(res.json.id)).eventRole).toBe("attendee");
    // L'événement passe : la phase est calculée à la lecture, le verbe disparaît sans présence.
    clock.advance(20 * HOUR);
    const later = await get(fan, res.json.id);
    expect(later.json.attach).toMatchObject({ role: null, phase: "after", presenceValidated: false });
    await db.insert(eventPresences).values({ eventId: event.id, userId: fan.id, validatedAt: clock.now });
    expect((await get(fan, res.json.id)).json.attach).toMatchObject({
      role: "attendee",
      phase: "after",
      presenceValidated: true,
    });
  });

  it("le lieu libre ne vaut que sans événement", async () => {
    const { owner, structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const page = { persona: "organizer", structureId: structure.id };
    const free = await publish(owner, { ...page, placeLabel: "Le port de Collioure", ...(await photoOf(owner)) });
    expect(free.json.placeLabel).toBe("Le port de Collioure");
    const attached = await publish(owner, {
      ...page,
      eventId: event.id,
      placeLabel: "Ailleurs",
      ...(await photoOf(owner)),
    });
    expect(attached.json.placeLabel).toBe("Canet-en-Roussillon");
    expect((await rowOf(attached.json.id)).placeLabel).toBeNull();
    expect((await publish(owner, { ...page, placeLabel: "x".repeat(81), ...(await photoOf(owner)) })).status).toBe(400);
  });

  it("département : celui de la personne, de la page, sinon de l'événement", async () => {
    const { owner, structure } = await orgaWithStructure();
    const fan = await signUp("Dept_R8");
    await db
      .update(profiles)
      .set({ departments: ["11"] })
      .where(eq(profiles.userId, fan.id));
    expect((await rowOf((await publish(fan, await photoOf(fan))).json.id)).department).toBe("11");
    const page = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    expect((await rowOf(page.json.id)).department).toBe("66");
    await db.update(structures).set({ department: null }).where(eq(structures.id, structure.id));
    const event = await eventAt(structure.id, 48, { department: "34" });
    const viaEvent = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Département de l'événement",
    });
    expect((await rowOf(viaEvent.json.id)).department).toBe("34");
  });
});

describe("compatibilité avec l'APK en ligne", () => {
  it("une requête d'avant le lot (sans persona, événement public quelconque, une photo) rend 201 et les anciens champs", async () => {
    const { structure } = await orgaWithStructure();
    const fan = await signUp("Ancien_R8");
    const event = await eventAt(structure.id, 48);
    const res = await publish(fan, {
      caption: "Avant",
      eventId: event.id,
      aspect: "portrait_4_5",
      ...(await photoOf(fan)),
    });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      caption: "Avant",
      aspect: "portrait_4_5",
      mine: true,
      reactionsCount: 0,
      reactedByMe: false,
      vehicle: null,
      commercialPartner: null,
      event: { slug: event.slug, title: "Rassemblement du Lydia" },
    });
    // `author` garde les champs de `FeedPerson` ; `photos` et `event` ne changent pas de forme.
    expect(res.json.author).toMatchObject({ pseudo: fan.pseudo, avatarUrl: null, official: false });
    expect(typeof res.json.author.grade).toBe("string");
    expect(res.json.photos).toHaveLength(1);
    expect(res.json.visual).toBe("photos");
    // Sans place : accepté, sans verbe.
    expect(res.json.attach.role).toBeNull();
    const row = await rowOf(res.json.id);
    expect(row).toMatchObject({ persona: "fan", structureId: null, eventRole: null, eventId: event.id });
  });
});

describe("visibilité d'une publication de page", () => {
  it("un membre connecté la voit même si le compte de qui l'a publiée est privé ; sans session, rien", async () => {
    const { owner, structure } = await orgaWithStructure();
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, owner.id));
    const res = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    expect(res.status).toBe(201);
    const member = await signUp("Membre_R8");
    const seen = await get(member, res.json.id);
    expect(seen.status).toBe(200);
    expect(seen.json.author.key).toBe(`s:${structure.id}`);
    expect(seen.json.mine).toBe(false);
    expect(seen.text).not.toContain(owner.id);
    // La photo suit la même règle.
    const photo = await app.request(res.json.photos[0].url, { headers: { origin: ORIGIN, cookie: member.cookie } });
    expect(photo.status).toBe(200);
    expect((await call(null, "GET", `/feed-posts/${res.json.id}`)).status).toBe(401);
  });

  it("une publication personnelle d'un compte privé reste réservée à ses abonnés (inchangé)", async () => {
    const fan = await signUp("Prive_R8");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, fan.id));
    const res = await publish(fan, await photoOf(fan));
    const stranger = await signUp("Etranger_R8");
    expect((await get(stranger, res.json.id)).status).toBe(404);
    await db.insert(userFollows).values({ followerId: stranger.id, followedId: fan.id, status: "accepted" });
    expect((await get(stranger, res.json.id)).status).toBe(200);
  });

  it("la page n'est plus en règle, ou la personne qui a publié est bannie : la publication se tait", async () => {
    const { owner, structure } = await orgaWithStructure();
    const res = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    const member = await signUp("Membre2_R8");
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structure.id));
    expect((await get(member, res.json.id)).status).toBe(404);
    await db.update(structures).set({ verification: "verified" }).where(eq(structures.id, structure.id));
    expect((await get(member, res.json.id)).status).toBe(200);
    await db.update(profiles).set({ bannedAt: clock.now }).where(eq(profiles.userId, owner.id));
    expect((await get(member, res.json.id)).status).toBe(404);
  });

  it("une publication sans photo dont l'événement n'existe plus n'est pas servie", async () => {
    const { owner, structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const res = await publish(owner, {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Pour le Lydia",
    });
    const member = await signUp("Membre3_R8");
    expect((await get(member, res.json.id)).status).toBe(200);
    await db.delete(events).where(eq(events.id, event.id));
    expect((await get(member, res.json.id)).status).toBe(404);
    expect((await get(owner, res.json.id)).status).toBe(404);
  });

  it("une publication de page entre dans GET /fil (R8c1) sous le nom de la page, jamais dans GET /me/feed-posts, ni chez les abonnés de la personne qui l'a publiée dans « Abonnements »", async () => {
    // Le Fil lit `created_at` (heure de la base) : l'horloge simulée est juste après.
    clock.set(new Date(Date.now() + 10 * 60_000));
    const { owner, structure } = await orgaWithStructure();
    const follower = await signUp("Suiveur_R8");
    await db.insert(userFollows).values({ followerId: follower.id, followedId: owner.id, status: "accepted" });
    const page = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    const own = await publish(owner, await photoOf(owner));
    expect(page.status).toBe(201);
    const mine = await call(owner, "GET", "/me/feed-posts");
    expect(mine.json.items.map((p: FeedPostView) => p.id)).toEqual([own.json.id]);
    for (const filter of ["for_you", "nearby"]) {
      const fil = await call(follower, "GET", `/fil?filter=${filter}`);
      expect(fil.text, filter).toContain(page.json.id);
      const card = fil.json.items.find((c: { id: string }) => c.id === `feed_post:${page.json.id}`);
      expect(card.payload.post.author.key, filter).toBe(`s:${structure.id}`);
      expect(JSON.stringify(card), filter).not.toContain(owner.id);
    }
    // « Abonnements » : la personne suivie, pas la page (le follower ne suit pas la structure).
    const fil = await call(follower, "GET", "/fil?filter=following");
    expect(fil.text).toContain(own.json.id);
    expect(fil.text).not.toContain(page.json.id);
  });
});

describe("retirer, gérer, lire", () => {
  it("DELETE : une publication de page se retire au nom de la page, jamais par le seul author_id", async () => {
    const { owner, structure } = await orgaWithStructure();
    const co = await signUp("Co2_R8", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    const stranger = await signUp("Passant_R8", { twoFactor: true });
    const make = async () =>
      (await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) })).json.id;
    const a = await make();
    expect((await call(stranger, "DELETE", `/me/feed-posts/${a}`)).status).toBe(404);
    expect((await call(co, "DELETE", `/me/feed-posts/${a}`)).status).toBe(204);
    // L'auteur qui a quitté la structure ne peut plus retirer la publication de la page.
    const b = await make();
    await db
      .update(structureMembers)
      .set({ status: "removed" })
      .where(and(eq(structureMembers.userId, owner.id), eq(structureMembers.structureId, structure.id)));
    expect((await call(owner, "DELETE", `/me/feed-posts/${b}`)).status).toBe(404);
    expect((await rowOf(b)).deletedAt).toBeNull();
    // Un passionné retire la sienne.
    const fan = await signUp("Retire_R8");
    const mine = await publish(fan, await photoOf(fan));
    expect((await call(fan, "DELETE", `/me/feed-posts/${mine.json.id}`)).status).toBe(204);
  });

  it("`mine` d'une publication de page : les gestionnaires de la page, pas les autres", async () => {
    const { owner, structure } = await orgaWithStructure();
    const co = await signUp("Co3_R8", { twoFactor: true });
    const staff = await signUp("Staff3_R8", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    await addMember(structure.id, staff.id, "staff");
    const res = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    expect((await get(owner, res.json.id)).json.mine).toBe(true);
    expect((await get(co, res.json.id)).json.mine).toBe(true);
    expect((await get(staff, res.json.id)).json.mine).toBe(false);
  });

  it("liste blanche : aucun author_id, ni dans une publication de page ni dans une publication personnelle", async () => {
    const { owner, structure } = await orgaWithStructure();
    const fan = await signUp("Liste_R8");
    const page = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    const own = await publish(fan, await photoOf(fan));
    const keys = [
      "aspect",
      "attach",
      "author",
      "caption",
      "coAuthor",
      "coAuthorInvite",
      "coAuthoredByMe",
      "commentsCount",
      "commentsOff",
      "commercialPartner",
      "createdAt",
      "event",
      "id",
      "important",
      "lastComments",
      "mine",
      "photos",
      "pinned",
      "placeLabel",
      "reactedByMe",
      "reactionsCount",
      "vehicle",
      "visual",
    ];
    expect(Object.keys(page.json).sort()).toEqual(keys);
    expect(Object.keys(own.json).sort()).toEqual(keys);
    expect(Object.keys(page.json.author).sort()).toEqual(
      ["avatarUrl", "grade", "key", "kind", "name", "official", "pseudo", "verified"].sort(),
    );
    expect(page.json).not.toHaveProperty("authorId");
    expect(page.text).not.toContain(owner.id);
    expect(page.json).toMatchObject({
      coAuthor: null,
      pinned: false,
      commentsCount: 0,
      commentsOff: false,
      lastComments: [],
    });
  });

  it("aucune requête par publication : autant de requêtes pour une publication que pour huit", async () => {
    const { owner, structure } = await orgaWithStructure();
    const fan = await signUp("Requetes_R8");
    const event = await eventAt(structure.id, 48);
    await apply(fan, event.id, "accepted");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ids.push(
        (
          await publish(owner, {
            persona: "organizer",
            structureId: structure.id,
            eventId: event.id,
            caption: `Page ${i}`,
          })
        ).json.id,
      );
      ids.push((await publish(fan, { eventId: event.id, ...(await photoOf(fan)) })).json.id);
    }
    const count = async (list: string[]) => {
      const spy = vi.spyOn(pool, "query");
      const views = await loadPostViews(db, list, owner.id, clock.now);
      const n = spy.mock.calls.length;
      spy.mockRestore();
      return { n, views };
    };
    const one = await count([ids[0] as string, ids[1] as string]);
    const many = await count(ids);
    expect(one.views).toHaveLength(2);
    expect(many.views).toHaveLength(8);
    expect(many.n).toBe(one.n);
  });
});

describe("compte supprimé", () => {
  it("les publications personnelles partent, celles d'une page restent à la page", async () => {
    const { owner, structure } = await orgaWithStructure();
    const member = await signUp("Reste_R8");
    const page = await publish(owner, { persona: "organizer", structureId: structure.id, ...(await photoOf(owner)) });
    const own = await publish(owner, await photoOf(owner));
    const keys = await withTx((tx) => anonymizeFeedForDeletedAccount(tx, owner.id));
    expect(keys).toHaveLength(1);
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, own.json.id))).length).toBe(0);
    expect((await db.select().from(feedPosts).where(eq(feedPosts.id, page.json.id))).length).toBe(1);
    expect((await get(member, page.json.id)).status).toBe(200);
  });
});

describe("schéma", () => {
  it("une publication existante est `fan` ; exactement la colonne de la casquette, aucune pour `fan`", async () => {
    const { owner, structure } = await orgaWithStructure();
    const id = randomUUID();
    await db.insert(feedPosts).values({ id, authorId: owner.id, caption: "Avant le lot" });
    expect(await rowOf(id)).toMatchObject({
      persona: "fan",
      structureId: null,
      proId: null,
      providerId: null,
      mediaId: null,
      eventRole: null,
      pinnedAt: null,
      importantReason: null,
      commentsCount: 0,
      commentsOff: false,
    });
    const bad = (values: Partial<typeof feedPosts.$inferInsert>) =>
      db.insert(feedPosts).values({ authorId: owner.id, ...values });
    await expect(bad({ persona: "organizer" })).rejects.toThrow();
    await expect(bad({ persona: "fan", structureId: structure.id })).rejects.toThrow();
    await expect(bad({ persona: "organizer", structureId: structure.id, proId: randomUUID() })).rejects.toThrow();
    await expect(bad({ persona: "organizer", structureId: structure.id, caption: "z".repeat(2001) })).rejects.toThrow();
    await expect(bad({ persona: "fan", caption: "z".repeat(501) })).rejects.toThrow();
    await expect(
      bad({ persona: "organizer", structureId: structure.id, caption: "z".repeat(2000) }),
    ).resolves.toBeDefined();
  });

  it("une seule publication épinglée par événement", async () => {
    const { owner, structure } = await orgaWithStructure();
    const event = await eventAt(structure.id, 48);
    const pinned = (deletedAt: Date | null = null) =>
      db.insert(feedPosts).values({
        authorId: owner.id,
        persona: "organizer",
        structureId: structure.id,
        eventId: event.id,
        pinnedAt: clock.now,
        deletedAt,
      });
    await pinned();
    await expect(pinned()).rejects.toThrow();
    await expect(pinned(clock.now)).resolves.toBeDefined();
  });
});

describe("GET /me/feed-posts/attachable-events", () => {
  it("organisateur : ses événements dans la fenêtre, les plus proches d'abord, liste blanche, important", async () => {
    const { owner, structure } = await orgaWithStructure();
    const soon = await eventAt(structure.id, 24, { title: "Demain" });
    const later = await eventAt(structure.id, 24 * 20, { title: "Dans vingt jours" });
    const past = await endedDaysAgo(structure.id, 5);
    await endedDaysAgo(structure.id, 40);
    await eventAt(structure.id, 24, { title: "Brouillon", status: "draft" });
    const res = await call(
      owner,
      "GET",
      `/me/feed-posts/attachable-events?persona=organizer&structureId=${structure.id}`,
    );
    expect(res.status).toBe(200);
    expect(res.json.items.map((i: { id: string }) => i.id)).toEqual([soon.id, past.id, later.id]);
    expect(Object.keys(res.json.items[0]).sort()).toEqual(
      [
        "city",
        "endsAt",
        "hasVisual",
        "id",
        "important",
        "phase",
        "posterUrl",
        "role",
        "slug",
        "startsAt",
        "title",
      ].sort(),
    );
    expect(res.json.items[0]).toMatchObject({
      role: "organizer",
      phase: "before",
      hasVisual: true,
      posterUrl: storage.url(POSTER),
      important: { leftToday: 1, leftWeek: 3 },
    });
    expect(res.json.items[1]).toMatchObject({ phase: "after" });
    expect(res.text).not.toContain(owner.id);
  });

  it("casquette sans droit : 403 ; fiche pro : aucun événement ; passionné : ses sorties, sans `important`", async () => {
    const { owner, structure } = await orgaWithStructure();
    const fan = await signUp("Sorties_R8");
    const mine = await eventAt(structure.id, 24, { title: "Ma sortie" });
    const other = await eventAt(structure.id, 48, { title: "Pas la mienne" });
    const past = await endedDaysAgo(structure.id, 3);
    const pastNoPresence = await endedDaysAgo(structure.id, 4);
    await apply(fan, mine.id, "accepted");
    await apply(fan, past.id, "accepted");
    await apply(fan, pastNoPresence.id, "accepted");
    await db.insert(eventPresences).values({ eventId: past.id, userId: fan.id, validatedAt: past.endsAt });
    void other;
    const res = await call(fan, "GET", "/me/feed-posts/attachable-events");
    expect(res.status).toBe(200);
    expect(res.json.items.map((i: { id: string }) => i.id)).toEqual([mine.id, past.id]);
    expect(
      res.json.items.every((i: { role: string; important: unknown }) => i.role === "attendee" && i.important === null),
    ).toBe(true);
    const denied = await call(
      fan,
      "GET",
      `/me/feed-posts/attachable-events?persona=organizer&structureId=${structure.id}`,
    );
    expect(denied.status).toBe(403);
    expect(denied.json.error.code).toBe("persona_forbidden");
    const proOwner = await signUp("ProSorties_R8");
    const pro = await createPro(proOwner.id);
    const proRes = await call(proOwner, "GET", `/me/feed-posts/attachable-events?persona=pro&proId=${pro.id}`);
    expect(proRes.json).toEqual({ items: [] });
    expect((await call(null, "GET", "/me/feed-posts/attachable-events")).status).toBe(401);
    void owner;
  });

  it("prestataire : les événements où il est retenu, rôle on_site", async () => {
    const { structure } = await orgaWithStructure();
    const presta = await signUp("PrestaListe_R8");
    const kept = await eventAt(structure.id, 24);
    const waiting = await eventAt(structure.id, 48);
    await apply(presta, kept.id, "accepted", "provider");
    await apply(presta, waiting.id, "pending", "provider");
    const res = await call(presta, "GET", "/me/feed-posts/attachable-events?persona=provider");
    expect(res.json.items).toHaveLength(1);
    expect(res.json.items[0]).toMatchObject({ id: kept.id, role: "on_site", important: null });
  });

  it("50 événements au plus", async () => {
    const { owner, structure } = await orgaWithStructure();
    for (let i = 0; i < 53; i++) await eventAt(structure.id, 24 + i);
    const res = await call(
      owner,
      "GET",
      `/me/feed-posts/attachable-events?persona=organizer&structureId=${structure.id}`,
    );
    expect(res.json.items).toHaveLength(50);
  });
});
