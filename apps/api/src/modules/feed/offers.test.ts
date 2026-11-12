// Les offres du pro (R9c) : l'étiquette « Offre » d'une publication de la fiche. Droits, photo obligatoire (T1), titre et jours
// (jours civils de Paris, le dernier est compris), limite du mois (une offre compte pour une publication), rejeu, liste
// `filter=offer`, compteur `offers.current`, compatibilité de l'APK en ligne (`pro_posts` inchangés), CHECK de la base.
import { randomUUID } from "node:crypto";
import { fromWallTime, PRO_POSTS_PER_MONTH } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createPro,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { feedPosts, proPosts } from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  // Le 10 novembre 2026, 10 h à Paris.
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

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

const offer = (over: Record<string, unknown> = {}) => ({
  title: "Polish complet avant l'hiver",
  startsOn: "2026-11-08",
  endsOn: "2026-11-30",
  ...over,
});

/** Une photo pour chaque publication qui n'en a pas (insérée à la main : sans photo, une publication n'est pas servie). */
async function givePhotos() {
  await db.execute(sql`insert into feed_post_photos (post_id, storage_key, width, height, position, plate_blurred, no_plate_confirmed)
    select p.id, 'private/feed/' || p.id || '/' || md5(p.id::text) || '.webp', 1080, 1350, 0, false, true
    from feed_posts p where not exists (select 1 from feed_post_photos x where x.post_id = p.id)`);
}

async function world() {
  const owner = await signUp("Pro_R9c");
  const pro = await createPro(owner.id);
  const publishOffer = async (body: Record<string, unknown> = {}, who: TestUser = owner) =>
    call(who, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      offer: offer(),
      ...(await photoOf(who)),
      ...body,
    });
  return { owner, pro, publishOffer };
}

describe("1. créer une offre", () => {
  it("le propriétaire : 201, l'offre est servie avec son état, l'auteur est la fiche", async () => {
    const { pro, publishOffer } = await world();
    const res = await publishOffer({ caption: "−15 % pour les Grades Sport" });
    expect(res.status).toBe(201);
    expect(res.json.offer).toEqual({
      title: "Polish complet avant l'hiver",
      startsOn: "2026-11-08",
      endsOn: "2026-11-30",
      state: "current",
    });
    expect(res.json.author.kind).toBe("pro");
    expect(res.json.author.name).toBe(pro.name);
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, res.json.id));
    expect(row).toMatchObject({ tag: "offer", title: "Polish complet avant l'hiver", persona: "pro", proId: pro.id });
    expect(row!.offerStartsOn).toBe("2026-11-08");
    expect(row!.offerEndsOn).toBe("2026-11-30");
  });

  it("début vide : « dès la publication » ; début futur : à venir", async () => {
    const { publishOffer } = await world();
    const open = await publishOffer({ offer: offer({ startsOn: null, endsOn: "2026-12-15" }) });
    expect(open.status).toBe(201);
    expect(open.json.offer).toMatchObject({ startsOn: null, endsOn: "2026-12-15", state: "current" });
    const later = await publishOffer({ offer: offer({ startsOn: "2026-11-20", endsOn: "2026-12-01" }) });
    expect(later.json.offer.state).toBe("upcoming");
  });

  it("une structure, un prestataire et un passionné : 400 offer_requires_pro", async () => {
    await world();
    const orga = await signUp("Orga_R9c", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const asStructure = await call(orga, "POST", "/me/feed-posts", {
      persona: "organizer",
      structureId: structure.id,
      offer: offer(),
      ...(await photoOf(orga)),
    });
    expect(asStructure.status).toBe(400);
    expect(asStructure.json.error.code).toBe("offer_requires_pro");
    const fan = await signUp("Fan_R9c");
    const asFan = await call(fan, "POST", "/me/feed-posts", { offer: offer(), ...(await photoOf(fan)) });
    expect(asFan.status).toBe(400);
    expect(asFan.json.error.code).toBe("offer_requires_pro");
    // Aucune ligne n'a été écrite par ces refus.
    expect(await db.select().from(feedPosts)).toHaveLength(0);
  });

  it("le propriétaire d'une autre fiche, ou un passionné au nom de la fiche : refus d'avant (403), jamais une offre", async () => {
    const { pro } = await world();
    const other = await signUp("Autre_R9c");
    const res = await call(other, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      offer: offer(),
      ...(await photoOf(other)),
    });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("persona_forbidden");
  });

  it("sans photo : 400 photo_required (T1), une offre n'a jamais d'événement ni d'affiche de repli", async () => {
    const { owner, pro } = await world();
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      caption: "Sans photo",
      offer: offer(),
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("photo_required");
    expect(await db.select().from(feedPosts)).toHaveLength(0);
  });

  it("titre de 1 et de 81 caractères, titre vide, fin absente, fin hier, fin avant le début, jour impossible : 400 avec le champ", async () => {
    const { publishOffer } = await world();
    const refused = async (over: Record<string, unknown>, field: string, reason: string) => {
      const res = await publishOffer({ offer: offer(over) });
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(res.json.error.code).toBe("offer_invalid");
      expect(res.json.error.details).toEqual({ field, reason });
    };
    await refused({ title: "A" }, "title", "title_required");
    await refused({ title: "   " }, "title", "title_required");
    await refused({ title: "x".repeat(81) }, "title", "title_too_long");
    await refused({ endsOn: null }, "endsOn", "ends_required");
    await refused({ endsOn: "" }, "endsOn", "ends_required");
    await refused({ endsOn: "2026-11-09" }, "endsOn", "ends_past");
    await refused({ startsOn: "2026-12-05", endsOn: "2026-12-01" }, "endsOn", "ends_before_start");
    await refused({ endsOn: "2026-02-30" }, "endsOn", "dates_invalid");
    await refused({ startsOn: "demain" }, "startsOn", "dates_invalid");
    // Les bornes valides passent : 2 et 80 caractères, fin aujourd'hui.
    expect((await publishOffer({ offer: offer({ title: "Ok" }) })).status).toBe(201);
    expect((await publishOffer({ offer: offer({ title: "x".repeat(80), endsOn: "2026-11-10" }) })).status).toBe(201);
  });

  it("un seul émoji n'est pas un titre de 2 caractères (comme la base)", async () => {
    const { publishOffer } = await world();
    const res = await publishOffer({ offer: offer({ title: "🔥" }) });
    expect(res.status).toBe(400);
    expect(res.json.error.details.reason).toBe("title_required");
  });

  it("le titre est nettoyé des espaces autour", async () => {
    const { publishOffer } = await world();
    const res = await publishOffer({ offer: offer({ title: "  Polish  " }) });
    expect(res.json.offer.title).toBe("Polish");
  });

  it("fiche non publiée : 400 comme pour toute publication de la fiche ; sans offre, la requête d'avant passe", async () => {
    const owner = await signUp("ProNonPub_R9c");
    const pro = await createPro(owner.id, { publishedAt: null });
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      offer: offer(),
      ...(await photoOf(owner)),
    });
    expect(res.status).toBe(400);
  });

  it("rejeu par clientId : la même offre, une seule ligne", async () => {
    const { publishOffer } = await world();
    const clientId = randomUUID();
    const a = await publishOffer({ clientId });
    expect(a.status).toBe(201);
    const b = await publishOffer({ clientId, offer: offer({ title: "Autre titre qui ne compte pas" }) });
    expect(b.status).toBe(201);
    expect(b.json.id).toBe(a.json.id);
    expect(b.json.offer.title).toBe("Polish complet avant l'hiver");
    expect(await db.select().from(feedPosts)).toHaveLength(1);
  });
});

describe("2. le jour de fin est compris (jours civils de Paris)", () => {
  it("22 h le dernier jour : en cours ; 0 h 05 le lendemain : terminée ; changement d'heure", async () => {
    const { owner, publishOffer } = await world();
    const res = await publishOffer({ offer: offer({ startsOn: null, endsOn: "2026-11-10" }) });
    expect(res.status).toBe(201);
    const id = res.json.id as string;
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 22, minute: 0 }));
    expect((await call(owner, "GET", `/feed-posts/${id}`)).json.offer.state).toBe("current");
    clock.set(fromWallTime({ year: 2026, month: 11, day: 11, hour: 0, minute: 5 }));
    expect((await call(owner, "GET", `/feed-posts/${id}`)).json.offer.state).toBe("ended");
    // Passage à l'heure d'hiver (25 octobre 2026) : le dernier jour reste compris jusqu'à minuit, heure de Paris.
    clock.set(fromWallTime({ year: 2026, month: 10, day: 20, hour: 10, minute: 0 }));
    const dst = await publishOffer({ offer: offer({ startsOn: null, endsOn: "2026-10-25" }) });
    expect(dst.status).toBe(201);
    clock.set(fromWallTime({ year: 2026, month: 10, day: 25, hour: 23, minute: 30 }));
    expect((await call(owner, "GET", `/feed-posts/${dst.json.id}`)).json.offer.state).toBe("current");
    clock.set(fromWallTime({ year: 2026, month: 10, day: 26, hour: 0, minute: 10 }));
    expect((await call(owner, "GET", `/feed-posts/${dst.json.id}`)).json.offer.state).toBe("ended");
  });
});

describe("3. la limite du mois compte les offres", () => {
  it("trois publications et une offre : la cinquième est refusée ; supprimer ne rend rien", async () => {
    const { owner, pro, publishOffer } = await world();
    for (let i = 0; i < PRO_POSTS_PER_MONTH - 1; i++) {
      const res = await call(owner, "POST", "/me/feed-posts", {
        persona: "pro",
        proId: pro.id,
        ...(await photoOf(owner)),
      });
      expect(res.status).toBe(201);
    }
    const last = await publishOffer();
    expect(last.status).toBe(201);
    const over = await publishOffer();
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("conflict");
    expect((await call(owner, "GET", "/me/pro")).json).toMatchObject({ postsUsed: 4, postsRemaining: 0 });
    expect((await call(owner, "DELETE", `/me/feed-posts/${last.json.id}`)).status).toBe(204);
    expect((await publishOffer()).status).toBe(409);
  });

  it("une offre et trois anciennes « offres et actualités » : la route de l'APK en ligne est refusée aussi", async () => {
    const { owner, pro, publishOffer } = await world();
    expect((await publishOffer()).status).toBe(201);
    for (let i = 0; i < 3; i++) {
      expect(
        (await call(owner, "POST", `/pros/${pro.id}/posts`, { title: `Ancienne ${i}`, body: "Texte de l'offre" }))
          .status,
      ).toBe(201);
    }
    expect((await call(owner, "POST", `/pros/${pro.id}/posts`, { title: "Trop", body: "Une de trop" })).status).toBe(
      409,
    );
    expect((await publishOffer()).status).toBe(409);
  });

  it("deux envois simultanés quand il reste une place : un seul passe", async () => {
    const { owner, pro } = await world();
    for (let i = 0; i < PRO_POSTS_PER_MONTH - 1; i++) {
      await db
        .insert(feedPosts)
        .values({ authorId: owner.id, persona: "pro", proId: pro.id, caption: "x", createdAt: clock.now });
    }
    const body = async () => ({
      persona: "pro",
      proId: pro.id,
      offer: offer(),
      ...(await photoOf(owner)),
    });
    const [a, b] = await Promise.all([
      call(owner, "POST", "/me/feed-posts", await body()),
      call(owner, "POST", "/me/feed-posts", await body()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.select().from(feedPosts).where(eq(feedPosts.tag, "offer"))).toHaveLength(1);
  }, 30_000);
});

describe("4. lister les offres : GET /authors/p:<fiche>/feed-posts?filter=offer", () => {
  it("les offres non terminées seulement : ni terminée, ni supprimée, ni d'une autre fiche, ni publication simple", async () => {
    const { owner, pro, publishOffer } = await world();
    const viewer = await signUp("Visiteur_R9c");
    const current = await publishOffer({ offer: offer({ title: "En cours" }) });
    const later = await publishOffer({
      offer: offer({ title: "À venir", startsOn: "2026-11-20", endsOn: "2026-12-01" }),
    });
    // Une offre terminée, une publication simple, une offre supprimée (insertion directe : l'API refuse une fin passée).
    await db.insert(feedPosts).values({
      authorId: owner.id,
      persona: "pro",
      proId: pro.id,
      caption: "Terminée",
      tag: "offer",
      title: "Terminée",
      offerEndsOn: "2026-11-09",
      createdAt: new Date(clock.now.getTime() - 3_600_000),
    });
    await db.insert(feedPosts).values({
      authorId: owner.id,
      persona: "pro",
      proId: pro.id,
      caption: "Supprimée",
      tag: "offer",
      title: "Supprimée",
      offerEndsOn: "2026-12-31",
      deletedAt: clock.now,
    });
    const other = await signUp("AutrePro_R9c");
    const otherPro = await createPro(other.id, { name: "Autre fiche" });
    await db.insert(feedPosts).values({
      authorId: other.id,
      persona: "pro",
      proId: otherPro.id,
      caption: "Autre fiche",
      tag: "offer",
      title: "D'une autre fiche",
      offerEndsOn: "2026-12-31",
    });
    await givePhotos();
    const ids = async (key: string, who: TestUser = viewer) =>
      ((await call(who, "GET", `/authors/${key}/feed-posts?filter=offer`)).json.items as { id: string }[]).map(
        (p) => p.id,
      );
    expect((await ids(`p:${pro.id}`)).sort()).toEqual([current.json.id, later.json.id].sort());
    // Le propriétaire voit la même liste.
    expect((await ids(`p:${pro.id}`, owner)).sort()).toEqual([current.json.id, later.json.id].sort());
    // Toutes les publications : les offres y sont aussi (une offre est une publication comme une autre).
    const all = (await call(viewer, "GET", `/authors/p:${pro.id}/feed-posts`)).json.items as { id: string }[];
    expect(all.map((p) => p.id)).toEqual(expect.arrayContaining([current.json.id, later.json.id]));
  });

  it("une clé qui n'est pas une fiche pro : liste vide ; sans session : 401", async () => {
    const { owner } = await world();
    const orga = await signUp("OrgaListe_R9c", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const viewer = await signUp("Visiteur2_R9c");
    const s = await call(viewer, "GET", `/authors/s:${structure.id}/feed-posts?filter=offer`);
    expect(s.status).toBe(200);
    expect(s.json.items).toEqual([]);
    const u = await call(viewer, "GET", `/authors/u:${owner.id}/feed-posts?filter=offer`);
    expect(u.status).toBe(200);
    expect(u.json.items).toEqual([]);
    const anon = await app.request(`/api/authors/p:${randomUUID()}/feed-posts?filter=offer`);
    expect([401, 404]).toContain(anon.status);
  });

  it("curseur : 25 offres, deux pages, sans doublon ni oubli", async () => {
    const { owner, pro } = await world();
    const rows = Array.from({ length: 25 }, (_, i) => ({
      authorId: owner.id,
      persona: "pro" as const,
      proId: pro.id,
      caption: `Offre ${i}`,
      tag: "offer" as const,
      title: `Offre ${i}`,
      offerEndsOn: "2026-12-31",
      createdAt: new Date(clock.now.getTime() - i * 60_000),
    }));
    const inserted = await db.insert(feedPosts).values(rows).returning({ id: feedPosts.id });
    await givePhotos();
    const viewer = await signUp("Curseur_R9c");
    const first = await call(viewer, "GET", `/authors/p:${pro.id}/feed-posts?filter=offer`);
    expect(first.json.items).toHaveLength(20);
    expect(first.json.nextCursor).toBeTruthy();
    const second = await call(
      viewer,
      "GET",
      `/authors/p:${pro.id}/feed-posts?filter=offer&cursor=${encodeURIComponent(first.json.nextCursor)}`,
    );
    expect(second.json.items).toHaveLength(5);
    const seen = [...first.json.items, ...second.json.items].map((p: { id: string }) => p.id);
    expect(new Set(seen).size).toBe(25);
    expect(new Set(seen)).toEqual(new Set(inserted.map((r) => r.id)));
  });
});

describe("5. le compteur offers.current de la fiche", () => {
  it("avec session : les offres non terminées ; sans session : absent ; /me/pro aussi", async () => {
    const { owner, pro, publishOffer } = await world();
    await publishOffer({ offer: offer({ title: "Une" }) });
    await publishOffer({ offer: offer({ title: "Deux", startsOn: "2026-11-20", endsOn: "2026-12-01" }) });
    await db.insert(feedPosts).values({
      authorId: owner.id,
      persona: "pro",
      proId: pro.id,
      tag: "offer",
      title: "Terminée",
      offerEndsOn: "2026-11-09",
    });
    const viewer = await signUp("Compteur_R9c");
    const seen = await call(viewer, "GET", `/pros/by-slug/${pro.slug}`);
    expect(seen.json.offers).toEqual({ current: 2 });
    expect((await call(owner, "GET", "/me/pro")).json.offers).toEqual({ current: 2 });
    const anon = await app.request(`/api/pros/by-slug/${pro.slug}`);
    expect(anon.status).toBe(200);
    expect(((await anon.json()) as Record<string, unknown>).offers).toBeUndefined();
    // Le lendemain de la fin de « Une » (30 novembre), il n'en reste qu'une.
    clock.set(fromWallTime({ year: 2026, month: 12, day: 1, hour: 0, minute: 5 }));
    expect((await call(viewer, "GET", `/pros/by-slug/${pro.slug}`)).json.offers).toEqual({ current: 1 });
  });
});

describe("6. l'APK en ligne : les anciennes routes et la forme d'avant", () => {
  it("POST /pros/:id/posts crée toujours un pro_post ; `posts` garde sa forme, réservée aux abonnés ; aucun feed_post", async () => {
    const { owner, pro } = await world();
    const created = await call(owner, "POST", `/pros/${pro.id}/posts`, {
      title: "Révision d'automne",
      body: "Contrôle offert.",
    });
    expect(created.status).toBe(201);
    expect(await db.select().from(proPosts)).toHaveLength(1);
    expect(await db.select().from(feedPosts)).toHaveLength(0);
    const mine = await call(owner, "GET", `/pros/by-slug/${pro.slug}`);
    expect(mine.json.posts).toHaveLength(1);
    expect(Object.keys(mine.json.posts[0]).sort()).toEqual(["body", "createdAt", "id", "title"]);
    expect(mine.json.postsCount).toBe(1);
    // Un passionné qui ne suit pas la fiche : `posts` nul ; abonné : la liste d'avant.
    const fan = await signUp("Abonne_R9c");
    expect((await call(fan, "GET", `/pros/by-slug/${pro.slug}`)).json.posts).toBeNull();
    expect((await call(fan, "POST", `/pros/${pro.id}/follow`)).status).toBeLessThan(300);
    const followed = await call(fan, "GET", `/pros/by-slug/${pro.slug}`);
    expect(followed.json.posts).toEqual(mine.json.posts);
    // PATCH et DELETE d'avant.
    const id = created.json.id as string;
    expect((await call(owner, "PATCH", `/pros/${pro.id}/posts/${id}`, { title: "Révision d'hiver" })).status).toBe(200);
    expect((await call(owner, "DELETE", `/pros/${pro.id}/posts/${id}`)).status).toBe(204);
  });

  it("une requête de publication sans `offer` rend les anciens champs, `offer` nul", async () => {
    const { owner, pro } = await world();
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      ...(await photoOf(owner)),
    });
    expect(res.status).toBe(201);
    expect(res.json.offer).toBeNull();
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, res.json.id));
    expect(row).toMatchObject({ tag: null, title: null, offerStartsOn: null, offerEndsOn: null });
    for (const k of ["id", "author", "caption", "aspect", "photos", "createdAt", "mine", "visual", "pinned"]) {
      expect(res.json).toHaveProperty(k);
    }
  });
});

describe("7. les CHECK de la base", () => {
  it("une étiquette sur une publication de structure ou de passionné est refusée par la base elle-même", async () => {
    const { owner } = await world();
    const orga = await signUp("OrgaCheck_R9c", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const attempt = (values: Record<string, unknown>) =>
      db.insert(feedPosts).values({ authorId: owner.id, ...values } as typeof feedPosts.$inferInsert);
    await expect(
      attempt({
        persona: "organizer",
        structureId: structure.id,
        tag: "offer",
        title: "Offre",
        offerEndsOn: "2026-12-01",
      }),
    ).rejects.toThrow();
    await expect(
      attempt({ persona: "fan", tag: "offer", title: "Offre", offerEndsOn: "2026-12-01" }),
    ).rejects.toThrow();
    // Un titre ou un jour sans étiquette, un titre trop court ou trop long, une fin absente, un début après la fin.
    await expect(attempt({ persona: "fan", title: "Titre sans étiquette" })).rejects.toThrow();
    await expect(attempt({ persona: "fan", offerEndsOn: "2026-12-01" })).rejects.toThrow();
  });

  it("fiche pro : titre de 1 ou 81 caractères, fin absente, début après la fin : refusés", async () => {
    const { owner, pro } = await world();
    const attempt = (values: Record<string, unknown>) =>
      db
        .insert(feedPosts)
        .values({
          authorId: owner.id,
          persona: "pro",
          proId: pro.id,
          tag: "offer",
          ...values,
        } as typeof feedPosts.$inferInsert);
    await expect(attempt({ title: "A", offerEndsOn: "2026-12-01" })).rejects.toThrow();
    await expect(attempt({ title: "x".repeat(81), offerEndsOn: "2026-12-01" })).rejects.toThrow();
    await expect(attempt({ title: "Titre", offerEndsOn: null })).rejects.toThrow();
    await expect(attempt({ title: "Titre", offerStartsOn: "2026-12-05", offerEndsOn: "2026-12-01" })).rejects.toThrow();
    await expect(
      attempt({ title: "Titre", offerStartsOn: "2026-12-01", offerEndsOn: "2026-12-01" }),
    ).resolves.toBeDefined();
  });
});
