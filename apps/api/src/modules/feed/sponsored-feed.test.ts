// Lot R7k1 : les cartes « Sponsorisé » du Fil (D38). Positions 4, 10, 16… d'un parcours entier (jamais dans les trois
// premières, stables d'une page à l'autre), ciblage par département seulement, plafond du jour, annonceurs externes
// derrière `sponsored.external_enabled` (coupé par défaut : avis juridique), affichages et clics par surface, administration
// réservée au super administrateur.
import { randomBytes, randomUUID } from "node:crypto";
import { FEED_SPONSORED_OPEN_REASON, FEED_SPONSORED_REASON, type FeedCard } from "@orasso/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, createPro, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  feedPostPhotos,
  feedPosts,
  profileInterests,
  profiles,
  proProfiles,
  sponsoredDailySeen,
  sponsoredDailyStats,
  sponsoredPlacements,
  userFollows,
} from "../../db/schema";
import { rateLimit, rateRules, resetRateLimits } from "../../lib/rateLimit";
import { parisDay } from "../pros/service";
import { type Cursor, decodeCursor, encodeCursor, MAX_OFFSET } from "./cursor";
import { feedPhotoKey } from "./posts";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
const HOUR = 3_600_000;

beforeEach(async () => {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  ref = await seedReference();
});

const today = () => parisDay(clock.now);
const day = (offset: number) => parisDay(new Date(clock.now.getTime() + offset * 24 * HOUR));

async function person(pseudo: string, departments: string[] = ["66"]) {
  const u = await signUp(pseudo);
  await db.update(profiles).set({ visibility: "public", departments }).where(eq(profiles.userId, u.id));
  return u;
}

/** `n` publications publiques récentes (assez de cartes pour plusieurs pages). */
async function posts(author: TestUser, n: number) {
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    await db.insert(feedPosts).values({
      id,
      authorId: author.id,
      department: "66",
      createdAt: new Date(clock.now.getTime() - (i + 1) * 60_000),
    });
    await db.insert(feedPostPhotos).values({
      postId: id,
      storageKey: feedPhotoKey(id, randomBytes(16).toString("hex")),
      width: 1080,
      height: 1350,
      position: 0,
      plateBlurred: false,
      noPlateConfirmed: true,
    });
  }
}

async function placement(over: Partial<typeof sponsoredPlacements.$inferInsert> = {}) {
  const [p] = await db
    .insert(sponsoredPlacements)
    .values({
      advertiserKind: "external",
      advertiserName: "Assurance Soleil",
      title: "Assure ta sportive",
      body: "Un devis en deux minutes.",
      linkUrl: "https://www.assurance-soleil.fr/devis",
      externalUrlDomain: "assurance-soleil.fr",
      disclosure: "Publicité",
      surfaces: ["feed"],
      startsOn: day(-5),
      endsOn: day(30),
      status: "active",
      ...over,
    })
    .returning();
  return p!;
}

async function proPlacement(over: Partial<typeof sponsoredPlacements.$inferInsert> = {}) {
  const owner = await signUp(`Pro_${randomBytes(3).toString("hex")}`);
  const pro = await createPro(owner.id, { name: "Pneus 66" });
  return placement({
    advertiserKind: "pro",
    proProfileId: pro.id,
    advertiserName: "Pneus 66",
    externalUrlDomain: null,
    disclosure: null,
    ...over,
  });
}

async function fil(u: TestUser | null, query = "") {
  const res = await call(u, "GET", `/fil${query}`);
  return {
    ...res,
    items: (res.json?.items ?? []) as FeedCard[],
    next: (res.json?.nextCursor ?? null) as string | null,
  };
}

/** Tout le parcours : les pages à la suite, jusqu'à la fin. */
async function walk(u: TestUser, filter = "for_you") {
  const all: FeedCard[] = [];
  const pages: FeedCard[][] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 12; i++) {
    const r: Awaited<ReturnType<typeof fil>> = await fil(u, `?filter=${filter}${cursor ? `&cursor=${cursor}` : ""}`);
    expect(r.status).toBe(200);
    pages.push(r.items);
    all.push(...r.items);
    cursor = r.next;
    if (!cursor) break;
  }
  return { all, pages };
}

const sponsoredOf = (items: FeedCard[]) => items.filter((c) => c.kind === "sponsored");
const setting = async (admin: TestUser, key: string, value: boolean) =>
  call(admin, "PUT", `/admin/settings/${key}`, { value });
const admin = () => signUp("Admin_SponsoFil", { twoFactor: true, role: "super_admin" });

describe("positions dans le Fil", () => {
  it("jamais dans les trois premières, puis 4, 10, 16… du parcours entier, d'une page à l'autre", async () => {
    const viewer = await person("Viewer_Pos");
    const author = await person("Auteur_Pos");
    await posts(author, 45);
    for (let i = 0; i < 6; i++) await placement({ title: `Annonce ${i}`, advertiserName: `Annonceur ${i}` });
    const root = await admin();
    expect((await setting(root, "sponsored.external_enabled", true)).status).toBe(200);

    const { all, pages } = await walk(viewer);
    expect(pages.length).toBeGreaterThan(1);
    expect(all.slice(0, 3).every((c) => c.kind !== "sponsored")).toBe(true);
    const at = all.flatMap((c, i) => (c.kind === "sponsored" ? [i + 1] : []));
    // Positions (1 = première carte) 4, 10, 16, 22, 28… sans trou ni décalage, même à la jonction des pages.
    expect(at.length).toBeGreaterThanOrEqual(6);
    expect(at).toEqual(at.map((_, k) => 4 + 6 * k));
    // Aucune carte du Fil n'est servie deux fois, Sponsorisé compris (identifiant par apparition).
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    // Jamais deux fois le même emplacement dans une page.
    for (const page of pages) {
      const spots = sponsoredOf(page).map((c) => (c.payload as { id: string }).id);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });

  it("la carte porte l'annonceur, la mention, le domaine et la raison fixe ; rien d'autre sur la personne", async () => {
    const viewer = await person("Viewer_Carte");
    await posts(await person("Auteur_Carte"), 10);
    const p = await placement();
    const root = await admin();
    await setting(root, "sponsored.external_enabled", true);
    const { items } = await fil(viewer);
    const card = sponsoredOf(items)[0];
    expect(card).toBeDefined();
    expect(items.indexOf(card as FeedCard)).toBe(3);
    expect(card?.reason).toEqual({ code: "sponsored", label: FEED_SPONSORED_OPEN_REASON });
    expect(card?.payload).toEqual({
      id: p.id,
      advertiserName: "Assurance Soleil",
      advertiserKind: "external",
      title: "Assure ta sportive",
      body: "Un devis en deux minutes.",
      imageUrl: null,
      linkUrl: "https://www.assurance-soleil.fr/devis",
      disclosure: "Publicité",
      domain: "assurance-soleil.fr",
      pro: null,
    });
  });

  it("un pro : sa fiche, et le nom de la fiche quand l'emplacement n'a pas de nom propre", async () => {
    const viewer = await person("Viewer_ProCarte");
    await posts(await person("Auteur_ProCarte"), 10);
    await proPlacement({ advertiserName: "" });
    const card = sponsoredOf((await fil(viewer)).items)[0];
    expect(card?.payload).toMatchObject({
      advertiserKind: "pro",
      advertiserName: "Pneus 66",
      domain: null,
      pro: { name: "Pneus 66" },
    });
  });

  it("le choix est le même à chaque chargement (personne, jour, position) ; pas dans « Mes abonnements »", async () => {
    const viewer = await person("Viewer_Stable");
    await posts(await person("Auteur_Stable"), 30);
    for (let i = 0; i < 4; i++) await proPlacement({ title: `Pro ${i}` });
    const a = sponsoredOf((await fil(viewer)).items).map((c) => c.id);
    const b = sponsoredOf((await fil(viewer)).items).map((c) => c.id);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(sponsoredOf((await fil(viewer, "?filter=following")).items)).toHaveLength(0);
  });

  it("« Moins de ce genre » sur Sponsorisé : plus aucune carte pendant tout le parcours", async () => {
    const viewer = await person("Viewer_Moins");
    await posts(await person("Auteur_Moins"), 30);
    await proPlacement();
    expect(sponsoredOf((await fil(viewer)).items).length).toBeGreaterThan(0);
    expect((await call(viewer, "POST", "/me/feed/less", { kind: "sponsored" })).status).toBe(200);
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(0);
  });

  it("pas de session : pas de Fil, donc aucune publicité", async () => {
    await proPlacement();
    expect((await fil(null)).status).toBe(401);
  });
});

describe("réglages : sponsored.enabled et sponsored.external_enabled", () => {
  it("sponsored.enabled coupé : aucune carte, même pour un pro ; rallumé : elle revient", async () => {
    const viewer = await person("Viewer_Enabled");
    await posts(await person("Auteur_Enabled"), 10);
    await proPlacement();
    const root = await admin();
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(1);
    await setting(root, "sponsored.enabled", false);
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(0);
    await setting(root, "sponsored.enabled", true);
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(1);
  });

  it("annonceur externe : coupé par défaut (le pro reste), allumé par l'administration, recoupé à la demande", async () => {
    const viewer = await person("Viewer_Externe");
    await posts(await person("Auteur_Externe"), 10);
    await placement({ title: "Externe" });
    await proPlacement({ title: "Pro" });
    const root = await admin();
    const settings = await call(root, "GET", "/admin/settings");
    const entry = (settings.json.entries as { key: string; value: unknown; defaultValue: unknown }[]).find(
      (e) => e.key === "sponsored.external_enabled",
    );
    expect(entry).toMatchObject({ value: false, defaultValue: false });
    const kindsOf = async () =>
      sponsoredOf((await fil(viewer)).items).map((c) => (c.payload as { advertiserKind: string }).advertiserKind);
    expect(await kindsOf()).toEqual(["pro"]);
    await setting(root, "sponsored.external_enabled", true);
    expect((await kindsOf()).sort()).toEqual(["external", "pro"]);
    await setting(root, "sponsored.external_enabled", false);
    expect(await kindsOf()).toEqual(["pro"]);
  });

  it("l'interrupteur est réservé au super administrateur", async () => {
    const plain = await person("Simple_Reglage");
    const mod = await signUp("Modo_Reglage", { twoFactor: true, role: "moderator" });
    expect((await setting(plain, "sponsored.external_enabled", true)).status).toBe(403);
    expect((await setting(mod, "sponsored.external_enabled", true)).status).toBe(403);
    expect((await call(plain, "GET", "/admin/settings")).status).toBe(403);
  });
});

describe("ciblage : le département seulement", () => {
  it("une personne d'un autre département ne voit pas l'emplacement ciblé ; un emplacement ouvert à tous reste", async () => {
    const author = await person("Auteur_Dep");
    await posts(author, 10);
    const local = await person("Local_66", ["66"]);
    const away = await person("Ailleurs_11", ["11"]);
    await proPlacement({ title: "Ciblé 66", departments: ["66"] });
    const titles = async (u: TestUser) =>
      sponsoredOf((await fil(u)).items).map((c) => (c.payload as { title: string }).title);
    expect(await titles(local)).toEqual(["Ciblé 66"]);
    expect(await titles(away)).toEqual([]);
    await proPlacement({ title: "Partout", departments: [] });
    expect(await titles(away)).toEqual(["Partout"]);
  });

  it("les centres d'intérêt de l'emplacement et de la personne ne comptent pas (non personnalisé)", async () => {
    const author = await person("Auteur_Cat");
    await posts(author, 10);
    const viewer = await person("Viewer_Cat");
    // Emplacement ciblé sur une catégorie que la personne n'a pas : montré quand même, le Fil ne regarde que le département.
    await proPlacement({ title: "Pour les JDM", categoryIds: [ref.jdm.id] });
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(1);
    // Et la catégorie de la personne n'avantage rien : même carte avec ou sans centre d'intérêt.
    await db.insert(profileInterests).values({ userId: viewer.id, categoryId: ref.jdm.id });
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(1);
  });

  it("le poids vaut 1 + les départements touchés : l'emplacement ciblé sur deux départements de la personne passe plus souvent", async () => {
    const { feedPlacementMatch } = await import("@orasso/shared");
    const base = {
      id: "p",
      status: "active" as const,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      categoryIds: [],
      dailyCap: null,
    };
    const ctx = { today: "2026-06-01", sector: ["66", "11"], impressionsToday: 0 };
    expect(feedPlacementMatch({ ...base, departments: [] }, ctx).weight).toBe(1);
    expect(feedPlacementMatch({ ...base, departments: ["66"] }, ctx).weight).toBe(2);
    expect(feedPlacementMatch({ ...base, departments: ["66", "11", "34"] }, ctx).weight).toBe(3);
    expect(feedPlacementMatch({ ...base, departments: ["34"] }, ctx).eligible).toBe(false);
  });

  it("emplacement inactif, hors période ou fiche pro non publiée : jamais montré", async () => {
    const viewer = await person("Viewer_Etat");
    await posts(await person("Auteur_Etat"), 10);
    await proPlacement({ status: "paused" });
    await proPlacement({ status: "draft" });
    await proPlacement({ status: "ended" });
    await proPlacement({ startsOn: day(2), endsOn: day(9) });
    await proPlacement({ startsOn: day(-9), endsOn: day(-2) });
    const owner = await signUp("Pro_NonPublie");
    const unpublished = await createPro(owner.id, { publishedAt: null });
    await placement({ advertiserKind: "pro", proProfileId: unpublished.id, advertiserName: "Brouillon" });
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(0);
  });
});

describe("affichages, clics et plafond par surface", () => {
  it("l'affichage et le clic se comptent par surface ; l'Accueil et le Fil ne se mélangent pas", async () => {
    const viewer = await person("Viewer_Surface");
    const p = await proPlacement({ surfaces: ["home", "feed"], dailyCap: 10 });
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    // Même personne, même jour, même surface : une seule fois.
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`, { surface: "feed" })).status).toBe(204);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`, { surface: "feed" })).status).toBe(204);
    // Sans corps : l'Accueil. Un clic à l'Accueil exige un affichage à l'Accueil (pas celui du Fil).
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`)).status).toBe(404);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`)).status).toBe(204);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`)).status).toBe(204);

    const stats = await db.select().from(sponsoredDailyStats).where(eq(sponsoredDailyStats.placementId, p.id));
    const by = Object.fromEntries(stats.map((s) => [s.surface, [s.impressions, s.clicks]]));
    expect(by).toEqual({ feed: [1, 1], home: [1, 1] });
    const [row] = await db.select().from(sponsoredPlacements).where(eq(sponsoredPlacements.id, p.id));
    expect([row?.impressions, row?.clicks]).toEqual([2, 2]);
    expect(await db.select().from(sponsoredDailySeen)).toHaveLength(2);

    const root = await admin();
    const list = await call(root, "GET", "/admin/sponsored-placements");
    expect(list.json[0].bySurface).toEqual({
      home: { impressions: 1, clicks: 1 },
      feed: { impressions: 1, clicks: 1 },
    });
  });

  it("une surface que l'emplacement n'a pas, une surface inconnue, un emplacement coupé : refusés", async () => {
    const viewer = await person("Viewer_Refus");
    const homeOnly = await proPlacement({ surfaces: ["home"] });
    expect((await call(viewer, "POST", `/sponsored/${homeOnly.id}/impression`, { surface: "feed" })).status).toBe(404);
    expect((await call(viewer, "POST", `/sponsored/${homeOnly.id}/impression`, { surface: "stories" })).status).toBe(
      400,
    );
    const feedOnly = await proPlacement({ surfaces: ["feed"] });
    expect((await call(viewer, "POST", `/sponsored/${feedOnly.id}/impression`)).status).toBe(404);
    expect((await call(null, "POST", `/sponsored/${feedOnly.id}/impression`, { surface: "feed" })).status).toBe(401);
    const root = await admin();
    await setting(root, "sponsored.enabled", false);
    expect((await call(viewer, "POST", `/sponsored/${feedOnly.id}/impression`, { surface: "feed" })).status).toBe(404);
  });

  it("un annonceur externe ne compte rien tant que sponsored.external_enabled est coupé", async () => {
    const viewer = await person("Viewer_ExtCoupe");
    const p = await placement();
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(404);
    expect(await db.select().from(sponsoredDailyStats)).toHaveLength(0);
    const root = await admin();
    await setting(root, "sponsored.external_enabled", true);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
  });

  it("plafond du jour : une fois atteint, la carte n'est plus tirée pour les autres, mais reste pour qui l'a déjà vue", async () => {
    const author = await person("Auteur_Cap");
    await posts(author, 10);
    const first = await person("Premier_Cap");
    const second = await person("Second_Cap");
    const p = await proPlacement({ dailyCap: 1 });
    expect(sponsoredOf((await fil(first)).items)).toHaveLength(1);
    expect((await call(first, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    // Plafond atteint pour le Fil : la deuxième personne ne reçoit plus la carte, et son affichage serait refusé.
    expect(sponsoredOf((await fil(second)).items)).toHaveLength(0);
    expect((await call(second, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(409);
    // Qui l'a vue aujourd'hui la revoit (le plafond ne la concerne plus).
    expect(sponsoredOf((await fil(first)).items)).toHaveLength(1);
    // Le plafond de l'Accueil est à part.
    expect((await call(second, "POST", `/sponsored/${p.id}/impression`)).status).toBe(404);
  });

  it("affichages en parallèle : le plafond n'est jamais dépassé", async () => {
    const p = await proPlacement({ surfaces: ["feed"], dailyCap: 3 });
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => person(`Para_${i}`)));
    resetRateLimits();
    const res = await Promise.all(
      users.map((u) => call(u, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })),
    );
    expect(res.filter((r) => r.status === 204)).toHaveLength(3);
    expect(res.filter((r) => r.status === 409)).toHaveLength(3);
    const [stat] = await db.select().from(sponsoredDailyStats).where(eq(sponsoredDailyStats.placementId, p.id));
    expect(stat?.impressions).toBe(3);
    expect(today()).toBe(stat?.day);
  });
});

describe("administration", () => {
  const external = {
    advertiserKind: "external",
    advertiserName: "Assurance Soleil",
    disclosure: "Publicité",
    surfaces: ["feed"],
    title: "Assure ta sportive",
    body: "Un devis en deux minutes.",
    linkUrl: "https://www.Assurance-Soleil.fr/devis?x=1",
    departments: ["66"],
    startsOn: "2026-11-01",
    endsOn: "2026-11-30",
    status: "active",
  };

  it("réservée au super administrateur", async () => {
    const plain = await person("Simple_AdminSp");
    const mod = await signUp("Modo_AdminSp", { twoFactor: true, role: "moderator" });
    for (const u of [plain, mod]) {
      expect((await call(u, "GET", "/admin/sponsored-placements")).status).toBe(403);
      expect((await call(u, "POST", "/admin/sponsored-placements", external)).status).toBe(403);
    }
    expect((await call(null, "GET", "/admin/sponsored-placements")).status).toBe(401);
  });

  it("annonceur externe : créé sans fiche pro, domaine calculé depuis le lien, jamais saisi", async () => {
    const root = await admin();
    const created = await call(root, "POST", "/admin/sponsored-placements", {
      ...external,
      externalUrlDomain: "banque-pirate.example",
    });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({
      advertiserKind: "external",
      advertiserName: "Assurance Soleil",
      proProfileId: null,
      proName: null,
      disclosure: "Publicité",
      externalUrlDomain: "assurance-soleil.fr",
      surfaces: ["feed"],
    });
    const id = created.json.id as string;
    const patched = await call(root, "PATCH", `/admin/sponsored-placements/${id}`, {
      linkUrl: "https://devis.autre-assureur.fr/",
      disclosure: null,
    });
    expect(patched.json).toMatchObject({ externalUrlDomain: "devis.autre-assureur.fr", disclosure: null });
  });

  it("règles de l'annonceur externe : nom obligatoire, pas de fiche pro, Fil seulement, département seulement", async () => {
    const root = await admin();
    const owner = await signUp("Pro_AdminSp");
    const pro = await createPro(owner.id);
    const post = (over: Record<string, unknown>) =>
      call(root, "POST", "/admin/sponsored-placements", { ...external, ...over });
    expect((await post({ advertiserName: undefined })).status).toBe(400);
    expect((await post({ proProfileId: pro.id })).status).toBe(400);
    expect((await post({ surfaces: ["home"] })).status).toBe(400);
    expect((await post({ surfaces: ["home", "feed"] })).status).toBe(400);
    expect((await post({ surfaces: [] })).status).toBe(400);
    expect((await post({ categoryIds: [ref.jdm.id] })).status).toBe(400);
    expect((await post({ disclosure: "x".repeat(41) })).status).toBe(400);
    expect((await post({ linkUrl: "javascript:alert(1)" })).status).toBe(400);
    const ok = await post({});
    expect(ok.status).toBe(201);
    const id = ok.json.id as string;
    expect((await call(root, "PATCH", `/admin/sponsored-placements/${id}`, { surfaces: ["home"] })).status).toBe(400);
    expect((await call(root, "PATCH", `/admin/sponsored-placements/${id}`, { categoryIds: [ref.jdm.id] })).status).toBe(
      400,
    );
    expect((await call(root, "PATCH", `/admin/sponsored-placements/${id}`, { advertiserName: "  " })).status).toBe(400);
  });

  it("annonceur pro : fiche obligatoire, nom de la fiche par défaut, surfaces Accueil et Fil ; ancien format toujours accepté", async () => {
    const root = await admin();
    const owner = await signUp("Pro_AdminSp2");
    const pro = await createPro(owner.id, { name: "Atelier Roc" });
    const base = {
      title: "Offre",
      body: "Texte",
      linkUrl: "https://exemple.fr",
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    };
    expect((await call(root, "POST", "/admin/sponsored-placements", { ...base, advertiserKind: "pro" })).status).toBe(
      400,
    );
    // Corps de l'ancien écran : un pro, rien d'autre → Accueil seulement, nom de la fiche.
    const legacy = await call(root, "POST", "/admin/sponsored-placements", { ...base, proProfileId: pro.id });
    expect(legacy.status).toBe(201);
    expect(legacy.json).toMatchObject({
      advertiserKind: "pro",
      advertiserName: "Atelier Roc",
      proName: "Atelier Roc",
      surfaces: ["home"],
      externalUrlDomain: null,
    });
    const both = await call(root, "PATCH", `/admin/sponsored-placements/${legacy.json.id}`, {
      surfaces: ["home", "feed"],
      categoryIds: [ref.jdm.id],
    });
    expect(both.status).toBe(200);
    expect(both.json.surfaces).toEqual(["home", "feed"]);
  });

  it("la liste mêle pros et annonceurs externes ; une journalisation tient l'écriture", async () => {
    const root = await admin();
    await proPlacement();
    await call(root, "POST", "/admin/sponsored-placements", external);
    const list = await call(root, "GET", "/admin/sponsored-placements");
    expect(list.status).toBe(200);
    expect(list.json.map((r: { advertiserKind: string }) => r.advertiserKind).sort()).toEqual(["external", "pro"]);
    for (const row of list.json)
      expect(row.bySurface).toEqual({
        home: { impressions: 0, clicks: 0 },
        feed: { impressions: 0, clicks: 0 },
      });
  });
});

describe("Accueil et Garage : inchangés", () => {
  it("l'Accueil ne montre jamais un annonceur externe, ni un emplacement réservé au Fil", async () => {
    const viewer = await person("Viewer_Accueil");
    const root = await admin();
    await setting(root, "sponsored.external_enabled", true);
    await placement({ surfaces: ["feed"] });
    await proPlacement({ surfaces: ["feed"], title: "Fil seulement" });
    const empty = await call(viewer, "GET", "/me/home?persona=fan&blocks=v2");
    expect(empty.status).toBe(200);
    expect(empty.json.sponsored).toBeNull();
    await proPlacement({ surfaces: ["home"], title: "Accueil" });
    const home = await call(viewer, "GET", "/me/home?persona=fan&blocks=v2");
    expect(home.json.sponsored?.title).toBe("Accueil");
  });
});

// --- Tour 2 (corrections après relecture Opus et Codex) -------------------------------------------------------------

describe("raison de la carte : le département n'est dit que pour un emplacement ciblé", () => {
  it("ciblé par département : « choisi d'après ton département » ; ouvert à toute la France : « Sponsorisé » seul", async () => {
    const viewer = await person("Viewer_Raison");
    await posts(await person("Auteur_Raison"), 30);
    const root = await admin();
    await setting(root, "sponsored.external_enabled", true);
    const targeted = await placement({ departments: ["66"], title: "Ciblée" });
    expect(sponsoredOf((await fil(viewer)).items)[0]?.reason).toEqual({
      code: "sponsored",
      label: FEED_SPONSORED_REASON,
    });
    await db.update(sponsoredPlacements).set({ departments: [] }).where(eq(sponsoredPlacements.id, targeted.id));
    expect(sponsoredOf((await fil(viewer)).items)[0]?.reason).toEqual({
      code: "sponsored",
      label: FEED_SPONSORED_OPEN_REASON,
    });
    expect(FEED_SPONSORED_OPEN_REASON).toBe("Sponsorisé");
  });
});

describe("curseur forgé et réinitialisation du parcours", () => {
  it("un décalage énorme ou au-delà de 100 000 : 400 « Curseur invalide » tout de suite, sans bloquer l'API", async () => {
    const viewer = await person("Viewer_Forge");
    await posts(await person("Auteur_Forge"), 45);
    await proPlacement();
    const first = await fil(viewer);
    expect(first.next).not.toBeNull();
    const real = decodeCursor(first.next as string);
    expect(real).not.toBeNull();
    const forged = (offset: number) => encodeCursor({ ...(real as Cursor), offset });
    for (const offset of [4_294_967_295, 100_001]) {
      const t0 = Date.now();
      const res = await fil(viewer, `?cursor=${forged(offset)}`);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.json)).toMatch(/Curseur invalide/);
      expect(Date.now() - t0).toBeLessThan(1500);
    }
    // La limite elle-même reste acceptée, et vite.
    const t1 = Date.now();
    const atLimit = await fil(viewer, `?cursor=${forged(MAX_OFFSET)}`);
    expect(atLimit.status).toBe(200);
    expect(Date.now() - t1).toBeLessThan(1500);
    // Le curseur suivant dépasserait la borne : la liste se termine au lieu de produire un curseur que l'API refuserait.
    expect(atLimit.items.length).toBeGreaterThan(0);
    expect(atLimit.next).toBeNull();
    // Juste en dessous de la borne, un curseur suivant valide est encore produit tant qu'il reste dans la limite.
    const below = await fil(viewer, `?cursor=${forged(MAX_OFFSET - 50)}`);
    expect(below.status).toBe(200);
    if (below.next) expect((await fil(viewer, `?cursor=${below.next}`)).status).toBe(200);
    // Un parcours normal n'est pas touché.
    expect((await fil(viewer, `?cursor=${first.next}`)).status).toBe(200);
  });

  it("`reset` en plein parcours : ni doublon, ni trou, et aucune carte Sponsorisé dans les trois premières après le reset", async () => {
    const viewer = await person("Viewer_ResetSp");
    const author = await person("Auteur_ResetSp");
    const other = await person("Autre_ResetSp");
    await posts(author, 40);
    await posts(other, 6);
    for (let i = 0; i < 4; i++) await proPlacement({ title: `Pro ${i}` });
    const first = await fil(viewer);
    const second = await fil(viewer, `?cursor=${first.next}`);
    expect(second.status).toBe(200);
    expect(second.json.reset).toBeUndefined();
    expect(sponsoredOf([...first.items, ...second.items]).length).toBeGreaterThan(2);
    // Le contexte change en plein parcours : un nouvel abonnement.
    await db
      .insert(userFollows)
      .values({ followerId: viewer.id, followedId: other.id, status: "accepted", acceptedAt: new Date() });
    const third = await fil(viewer, `?cursor=${second.next}`);
    expect(third.status).toBe(200);
    expect(third.json.reset).toBe(true);
    // Après le reset : la liste repart à zéro, rien de Sponsorisé dans les trois premières, puis 4, 10, 16…
    const all: FeedCard[] = [...third.items];
    let cursor = third.next;
    for (let i = 0; i < 12 && cursor; i++) {
      const res = await fil(viewer, `?cursor=${cursor}`);
      expect(res.status).toBe(200);
      expect(res.json.reset).toBeUndefined();
      all.push(...res.items);
      cursor = res.next;
    }
    expect(all.slice(0, 3).every((c) => c.kind !== "sponsored")).toBe(true);
    const at = all.flatMap((c, i) => (c.kind === "sponsored" ? [i + 1] : []));
    expect(at.length).toBeGreaterThanOrEqual(3);
    expect(at).toEqual(at.map((_, k) => 4 + 6 * k));
    // Ni doublon ni trou : toutes les publications sont là, une fois chacune.
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(all.filter((c) => c.kind === "feed_post")).toHaveLength(46);
  });
});

describe("un pro retiré, ou hors cible, ne compte plus rien", () => {
  const rows = async () => ({
    stats: await db.select().from(sponsoredDailyStats),
    seen: await db.select().from(sponsoredDailySeen),
  });

  it("fiche non publiée, supprimée ou titulaire suspendu : 404, rien d'écrit, plus de carte", async () => {
    const viewer = await person("Viewer_ProRetire");
    await posts(await person("Auteur_ProRetire"), 12);
    const p = await proPlacement({ surfaces: ["home", "feed"] });
    // Affiché une fois tant que la fiche est en règle.
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    expect(sponsoredOf((await fil(viewer)).items)).toHaveLength(1);
    const before = await rows();

    const proId = p.proProfileId as string;
    const [pro] = await db.select().from(proProfiles).where(eq(proProfiles.id, proId));
    const retire = async (label: string, apply: () => Promise<unknown>, restore: () => Promise<unknown>) => {
      await apply();
      for (const path of ["impression", "click"]) {
        for (const surface of ["feed", "home"]) {
          const res = await call(viewer, "POST", `/sponsored/${p.id}/${path}`, { surface });
          expect(res.status, `${label} ${path} ${surface}`).toBe(404);
        }
      }
      expect(sponsoredOf((await fil(viewer)).items), label).toHaveLength(0);
      expect(await rows(), label).toEqual(before);
      await restore();
    };
    await retire(
      "non publiée",
      () => db.update(proProfiles).set({ publishedAt: null }).where(eq(proProfiles.id, proId)),
      () =>
        db
          .update(proProfiles)
          .set({ publishedAt: pro?.publishedAt ?? new Date() })
          .where(eq(proProfiles.id, proId)),
    );
    await retire(
      "supprimée",
      () => db.update(proProfiles).set({ deletedAt: new Date() }).where(eq(proProfiles.id, proId)),
      () => db.update(proProfiles).set({ deletedAt: null }).where(eq(proProfiles.id, proId)),
    );
    await retire(
      "titulaire suspendu",
      () =>
        db
          .update(profiles)
          .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * 24 * HOUR) })
          .where(eq(profiles.userId, pro?.ownerUserId ?? "")),
      () =>
        db
          .update(profiles)
          .set({ suspendedUntil: null })
          .where(eq(profiles.userId, pro?.ownerUserId ?? "")),
    );
    // Rétablie : l'affichage et le clic repassent.
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`, { surface: "feed" })).status).toBe(204);
  });

  it("une personne hors de la cible (département) : 404, rien d'écrit ; dans la cible : compté", async () => {
    const away = await person("Viewer_Ailleurs", ["34"]);
    const local = await person("Viewer_Local", ["66"]);
    const root = await admin();
    await setting(root, "sponsored.external_enabled", true);
    const ext = await placement({ departments: ["66"] });
    const pro = await proPlacement({ departments: ["66"], surfaces: ["home", "feed"] });
    for (const [id, surface] of [
      [ext.id, "feed"],
      [pro.id, "feed"],
      [pro.id, "home"],
    ] as const) {
      expect((await call(away, "POST", `/sponsored/${id}/impression`, { surface })).status).toBe(404);
      expect((await call(away, "POST", `/sponsored/${id}/click`, { surface })).status).toBe(404);
    }
    expect(await rows()).toEqual({ stats: [], seen: [] });
    expect((await call(local, "POST", `/sponsored/${ext.id}/impression`, { surface: "feed" })).status).toBe(204);
    expect((await call(local, "POST", `/sponsored/${pro.id}/impression`, { surface: "home" })).status).toBe(204);
    expect((await rows()).stats).toHaveLength(2);
  });
});

describe("le nom d'un pro est lu sur sa fiche", () => {
  it("renommer la fiche change la carte du Fil et la liste d'administration ; un annonceur externe garde son nom", async () => {
    const viewer = await person("Viewer_Renom");
    await posts(await person("Auteur_Renom"), 12);
    const p = await proPlacement({ advertiserName: "Ancien nom" });
    await db
      .update(proProfiles)
      .set({ name: "Pneus Roussillon" })
      .where(eq(proProfiles.id, p.proProfileId as string));
    const card = sponsoredOf((await fil(viewer)).items)[0];
    expect(card?.payload).toMatchObject({ advertiserKind: "pro", advertiserName: "Pneus Roussillon" });
    const root = await admin();
    const list = await call(root, "GET", "/admin/sponsored-placements");
    expect(list.json[0]).toMatchObject({ advertiserName: "Pneus Roussillon", proName: "Pneus Roussillon" });
    // Un nom envoyé à la modification d'un pro est ignoré (la fiche fait foi).
    const patched = await call(root, "PATCH", `/admin/sponsored-placements/${p.id}`, { advertiserName: "Autre" });
    expect(patched.status).toBe(200);
    expect(patched.json.advertiserName).toBe("Pneus Roussillon");
    await setting(root, "sponsored.external_enabled", true);
    const ext = await placement({ advertiserName: "Assurance Soleil" });
    const renamed = await call(root, "PATCH", `/admin/sponsored-placements/${ext.id}`, {
      advertiserName: "Assurance Soleil Sud",
    });
    expect(renamed.json.advertiserName).toBe("Assurance Soleil Sud");
  });
});

describe("limites de requêtes : affichages et clics séparés", () => {
  it("une longue lecture (20 pages) n'épuise pas la limite des clics ; les affichages ont la leur", async () => {
    const viewer = await person("Viewer_Longue");
    const spots = [] as { id: string }[];
    for (let i = 0; i < 5; i++) spots.push(await proPlacement({ surfaces: ["feed"], title: `Longue ${i}` }));
    // 20 pages × 5 cartes : 100 affichages (le même emplacement revient, l'appli dédoublonnera, voir R7k2).
    for (let page = 0; page < 20; page++) {
      for (const s of spots) {
        expect((await call(viewer, "POST", `/sponsored/${s.id}/impression`, { surface: "feed" })).status).toBe(204);
      }
    }
    // Après 100 affichages (plus que l'ancienne limite de 60 pour tout), un clic passe.
    const clicked = await call(viewer, "POST", `/sponsored/${spots[0]?.id}/click`, { surface: "feed" });
    expect(clicked.status).toBe(204);
    expect(rateRules.sponsoredImpression.max).toBeGreaterThanOrEqual(600);
    expect(rateRules.sponsoredClick.max).toBeLessThan(rateRules.sponsoredImpression.max);
  }, 120_000);

  it("la limite des affichages s'applique : au-delà de 600 par heure, 429 ; un clic passe encore", async () => {
    const viewer = await person("Viewer_Rafale");
    const p = await proPlacement({ surfaces: ["feed"] });
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    for (let i = 0; i < 599; i++) rateLimit("sponsoredImpression", viewer.id);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(429);
    expect((await call(viewer, "POST", `/sponsored/${p.id}/click`, { surface: "feed" })).status).toBe(204);
  });
});

describe("plafond du jour : global à l'emplacement, toutes surfaces confondues", () => {
  it("Accueil et Fil cochés, plafond 5 : 5 au total, les statistiques restent par surface", async () => {
    const p = await proPlacement({ surfaces: ["home", "feed"], dailyCap: 5 });
    const users = await Promise.all(Array.from({ length: 8 }, (_, i) => person(`Plaf_${i}`)));
    const results: number[] = [];
    for (const [i, u] of users.entries()) {
      const surface = i % 2 === 0 ? "home" : "feed";
      results.push((await call(u, "POST", `/sponsored/${p.id}/impression`, { surface })).status);
    }
    expect(results.filter((s) => s === 204)).toHaveLength(5);
    expect(results.filter((s) => s === 409)).toHaveLength(3);
    const stats = await db.select().from(sponsoredDailyStats).where(eq(sponsoredDailyStats.placementId, p.id));
    expect(stats.reduce((n, s) => n + s.impressions, 0)).toBe(5);
    expect(Object.fromEntries(stats.map((s) => [s.surface, s.impressions]))).toEqual({ home: 3, feed: 2 });
    const [row] = await db.select().from(sponsoredPlacements).where(eq(sponsoredPlacements.id, p.id));
    expect(row?.impressions).toBe(5);
    // Une personne qui n'a rien vu n'est plus servie dans le Fil.
    const late = await person("Plaf_Tard");
    await posts(await person("Auteur_Plaf"), 10);
    expect(sponsoredOf((await fil(late)).items)).toHaveLength(0);
  });

  it("en parallèle sur les deux surfaces : jamais plus que le plafond", async () => {
    const p = await proPlacement({ surfaces: ["home", "feed"], dailyCap: 4 });
    const users = await Promise.all(Array.from({ length: 12 }, (_, i) => person(`ParaG_${i}`)));
    resetRateLimits();
    const res = await Promise.all(
      users.map((u, i) => call(u, "POST", `/sponsored/${p.id}/impression`, { surface: i % 2 === 0 ? "home" : "feed" })),
    );
    expect(res.filter((r) => r.status === 204)).toHaveLength(4);
    expect(res.filter((r) => r.status === 409)).toHaveLength(8);
    const stats = await db.select().from(sponsoredDailyStats).where(eq(sponsoredDailyStats.placementId, p.id));
    expect(stats.reduce((n, s) => n + s.impressions, 0)).toBe(4);
  });
});

describe("coût d'une page : « déjà montré » filtré en base", () => {
  it("50 000 lignes du jour : la carte reste servie à qui l'a déjà vue (plafond atteint), pas aux autres, et la page reste rapide", async () => {
    const viewer = await person("Viewer_Volume");
    const stranger = await person("Etranger_Volume");
    await posts(await person("Auteur_Volume"), 12);
    const p = await proPlacement({ surfaces: ["feed"], dailyCap: 1 });
    expect((await call(viewer, "POST", `/sponsored/${p.id}/impression`, { surface: "feed" })).status).toBe(204);
    // 50 000 empreintes d'autres personnes pour ce jour, cet emplacement et ce Fil.
    await db.execute(sql`
      insert into sponsored_daily_seen (placement_id, user_hash, day, surface)
      select ${p.id}::uuid, md5(g::text), ${today()}::date, 'feed' from generate_series(1, 50000) g
    `);
    const count = await db.execute(sql`select count(*)::int as n from sponsored_daily_seen`);
    expect((count.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(50_000);
    const t0 = Date.now();
    const mine = await fil(viewer);
    const elapsed = Date.now() - t0;
    expect(mine.status).toBe(200);
    expect(sponsoredOf(mine.items)).toHaveLength(1);
    expect(sponsoredOf((await fil(stranger)).items)).toHaveLength(0);
    expect(elapsed).toBeLessThan(3000);
  }, 120_000);
});

describe("administration : modifier un emplacement existant", () => {
  it("surfaces, mention, annonceur et départements (dédoublonnés) par le PATCH existant", async () => {
    const root = await admin();
    const created = await call(root, "POST", "/admin/sponsored-placements", {
      advertiserKind: "external",
      advertiserName: "Assurance Soleil",
      surfaces: ["feed"],
      title: "Assure ta sportive",
      body: "Un devis en deux minutes.",
      linkUrl: "https://www.assurance-soleil.fr/devis",
      departments: ["66", "66", "11", "66"],
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      status: "draft",
    });
    expect(created.status).toBe(201);
    expect(created.json.departments).toEqual(["66", "11"]);
    const id = created.json.id as string;
    const patched = await call(root, "PATCH", `/admin/sponsored-placements/${id}`, {
      advertiserName: "Assurance Soleil Sud",
      disclosure: "Publicité",
      surfaces: ["feed"],
      departments: ["34", "34"],
    });
    expect(patched.status).toBe(200);
    expect(patched.json).toMatchObject({
      advertiserName: "Assurance Soleil Sud",
      disclosure: "Publicité",
      departments: ["34"],
      externalUrlDomain: "assurance-soleil.fr",
    });
    // Un annonceur externe ne peut toujours pas passer à l'Accueil.
    const refused = await call(root, "PATCH", `/admin/sponsored-placements/${id}`, { surfaces: ["home", "feed"] });
    expect(refused.status).toBe(400);
    // Un pro : les surfaces se modifient.
    const pro = await proPlacement({ surfaces: ["home"] });
    const both = await call(root, "PATCH", `/admin/sponsored-placements/${pro.id}`, {
      surfaces: ["home", "feed"],
      disclosure: "Partenaire",
    });
    expect(both.json).toMatchObject({ surfaces: ["home", "feed"], disclosure: "Partenaire" });
  });
});
