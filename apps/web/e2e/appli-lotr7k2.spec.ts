import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import {
  adminCookie,
  createFeedPlacement,
  deletePlacement,
  freshUser,
  pauseOthers,
  placementById,
  setExternalEnabled,
} from "./lotr7k2-setup";
import { RELAIS } from "./relais";

// Lot R7k2 (D38), côté appli (version web compilée de recette, `APP_URL`) : la carte « Sponsorisé » du Fil. En 4e position
// (jamais dans les trois premières), étiquette « Sponsorisé », image 4:5, annonceur, titre, texte, mention ; affichage compté
// une fois par session avec `surface: "feed"` (vérifié par l'API d'administration), clic compté ; menu « ⋯ » sans « Moins de
// ce genre » et avec « Signaler » (e-mail) ; « Pourquoi je vois ça » (texte exact, ciblé ou ouvert à la France) ; refus de
// l'API (409) : la carte est retirée ; aucun emplacement : aucune carte ; l'Accueil envoie `surface: "home"`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7k2-captures/apres/recette-appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const WHY_TARGETED = "Sponsorisé. Choisi d'après ton département, rien d'autre.";

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme = "beton", width = 384) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
    // Les ouvertures hors de l'appli (lien de l'annonceur, e-mail de signalement) sont notées au lieu d'ouvrir un onglet.
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url?: string | URL) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  }, theme);
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function goFil(page: Page) {
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/** Les requêtes d'affichage et de clic envoyées par la page, avec leur corps. */
function trackSponsored(page: Page) {
  const calls: { kind: "impression" | "click"; id: string; body: unknown }[] = [];
  page.on("request", (r) => {
    const m = /\/sponsored\/([0-9a-f-]+)\/(impression|click)$/.exec(r.url());
    if (m && r.method() === "POST")
      calls.push({ kind: m[2] as "impression" | "click", id: m[1] as string, body: r.postDataJSON() });
  });
  return calls;
}

test("carte en 4e position : étiquette, image 4:5, affichage compté une fois, clic, menu, texte exact", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const admin = await adminCookie();
  const mine = await createFeedPlacement(admin, { image: true, disclosure: "Publicité", departments: ["66"] });
  const restore = await pauseOthers(admin, mine.id);
  try {
    const user = await freshUser();
    const { ctx, page } = await open(browser, user.email);
    const calls = trackSponsored(page);
    await goFil(page);

    // En 4e position, jamais dans les trois premières.
    const cards = page.getByTestId("fil-list").locator(":scope > *");
    await expect(cards.nth(3).getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    for (const i of [0, 1, 2]) await expect(cards.nth(i).getByTestId("feed-card-sponsored")).toHaveCount(0);
    await expect(page.getByTestId("feed-card-sponsored")).toHaveCount(1);

    const card = page.getByTestId("feed-card-sponsored");
    await expect(card.getByTestId("feed-sponsored-tag")).toHaveText("Sponsorisé");
    await expect(card.getByTestId("feed-sponsored-title")).toHaveText(mine.title);
    await expect(card.getByTestId("feed-sponsored-mention")).toHaveText("Publicité");
    // Le bouton « Voir » n'est jamais le bouton principal de l'écran : « Publier » reste le seul.
    await expect(card.getByTestId("feed-sponsored-open")).toBeVisible();
    // L'image est au format 4:5.
    await card.getByTestId("feed-sponsored-image").scrollIntoViewIfNeeded();
    const box = await card.getByTestId("feed-sponsored-image").boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeGreaterThan(0.78);
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeLessThan(0.82);
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/carte-image-384.png` });

    // L'affichage : compté une fois, avec surface « feed », sur le Fil seulement.
    await expect.poll(() => calls.filter((c) => c.kind === "impression").length, { timeout: 15_000 }).toBe(1);
    expect(calls.find((c) => c.kind === "impression")?.body).toEqual({ surface: "feed" });
    await expect.poll(async () => (await placementById(admin, mine.id)).bySurface.feed?.impressions).toBe(1);
    expect((await placementById(admin, mine.id)).bySurface.home?.impressions ?? 0).toBe(0);
    // Un autre filtre puis le retour : la carte revient dans la même session, rien de plus n'est envoyé.
    await page.getByTestId("fil-filters-nearby").click();
    await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId("fil-filters-for_you").click();
    await expect(page.getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("feed-card-sponsored").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    expect(calls.filter((c) => c.kind === "impression")).toHaveLength(1);
    expect((await placementById(admin, mine.id)).bySurface.feed?.impressions).toBe(1);

    // « ⋯ » : Pourquoi je vois ça, pas de « Moins de ce genre », Signaler.
    await card.getByTestId("feed-card-more").click();
    await expect(page.getByTestId("feed-menu-why")).toBeVisible();
    await expect(page.getByTestId("feed-menu-less")).toHaveCount(0);
    await expect(page.getByTestId("feed-menu-report")).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/menu-384.png` });
    await page.getByTestId("feed-menu-why").click();
    await expect(page.getByTestId("feed-why-text")).toHaveText(WHY_TARGETED);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/pourquoi-384.png` });
    await page.getByTestId("feed-why-ok").click();
    // Signaler : un e-mail à l'assistance avec l'annonceur et l'emplacement.
    await card.getByTestId("feed-card-more").click();
    await page.getByTestId("feed-menu-report").click();
    await expect.poll(async () => (await opened(page)).length).toBe(1);
    const mail = (await opened(page))[0] ?? "";
    expect(mail).toMatch(/^mailto:contact@orasso\.fr\?/);
    expect(decodeURIComponent(mail)).toContain(mine.id);

    // Le clic : compté (surface « feed »), la fiche du pro s'ouvre dans l'appli.
    await card.getByTestId("feed-sponsored-open").click();
    await expect.poll(() => calls.filter((c) => c.kind === "click").length).toBe(1);
    expect(calls.find((c) => c.kind === "click")?.body).toEqual({ surface: "feed" });
    await expect(page).toHaveURL(/\/p\//);
    await expect.poll(async () => (await placementById(admin, mine.id)).bySurface.feed?.clicks).toBe(1);
    await ctx.close();
  } finally {
    await restore();
    await deletePlacement(admin, mine.id).catch(() => undefined);
  }
});

test("annonceur externe ouvert à toute la France : domaine, lien hors de l'appli, texte sans département", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const admin = await adminCookie();
  let mine: { id: string; title: string } | null = null;
  let restore: (() => Promise<void>) | null = null;
  try {
    // Le réglage « annonceurs externes » est allumé dans le `try` : le `finally` le remet à « non » en premier.
    await setExternalEnabled(admin, true);
    mine = await createFeedPlacement(admin, {
      kind: "external",
      advertiserName: "Assurance Soleil",
      departments: [],
      disclosure: "Publicité",
      linkUrl: "https://www.assurance-soleil.fr/devis",
    });
    restore = await pauseOthers(admin, mine.id);
    const user = await freshUser();
    const { ctx, page } = await open(browser, user.email, "sable");
    const calls = trackSponsored(page);
    await goFil(page);
    const card = page.getByTestId("feed-card-sponsored");
    await expect(card).toBeVisible({ timeout: 30_000 });
    // Sans image : le titre est dans un bloc de texte ; la mention dit « Publicité · domaine ».
    await expect(card.getByTestId("feed-sponsored-block")).toContainText(mine.title);
    await expect(card.getByTestId("feed-sponsored-mention")).toHaveText("Publicité · assurance-soleil.fr");
    await expect(card.getByTestId("feed-sponsored-tag")).toHaveText("Sponsorisé");
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/carte-externe-sable-384.png` });
    // Ouvert à toute la France : le texte ne parle d'aucun département.
    await card.getByTestId("feed-card-more").click();
    await page.getByTestId("feed-menu-why").click();
    const why = (await page.getByTestId("feed-why-text").textContent()) ?? "";
    expect(why).toBe("Cette publicité n'est pas ciblée : elle peut être montrée partout en France.");
    await page.getByTestId("feed-why-ok").click();
    // Le lien s'ouvre hors de l'appli, le clic est compté.
    await card.getByTestId("feed-sponsored-open").click();
    await expect.poll(async () => (await opened(page)).length).toBe(1);
    expect((await opened(page))[0]).toBe("https://www.assurance-soleil.fr/devis");
    expect(calls.filter((c) => c.kind === "click")).toHaveLength(1);
    await ctx.close();
  } finally {
    try {
      await setExternalEnabled(admin, false);
    } catch (e) {
      console.error("sponsored.external_enabled : retour à « non » impossible", e);
    }
    await restore?.().catch(() => undefined);
    if (mine) await deletePlacement(admin, mine.id).catch(() => undefined);
  }
});

test("aucun emplacement : aucune carte ; un refus de l'API (plafond) retire la carte", async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await adminCookie();
  const restoreAll = await pauseOthers(admin, null);
  let mine: { id: string } | null = null;
  try {
    const user = await freshUser();
    const { ctx, page } = await open(browser, user.email);
    await goFil(page);
    await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("feed-card-sponsored")).toHaveCount(0);
    const before = await page.getByTestId("fil-list").locator(":scope > *").count();
    expect(before).toBeGreaterThan(3);
    await ctx.close();

    // Un emplacement apparaît, mais l'API refuse son affichage (409 : plafond atteint) : la carte est retirée.
    mine = await createFeedPlacement(admin, {});
    const user2 = await freshUser();
    const second = await open(browser, user2.email);
    // Réponse 409 simulée (l'appli et l'API sont sur deux origines : les en-têtes CORS doivent suivre).
    const cors = {
      "access-control-allow-origin": APP ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    await second.page.route("**/sponsored/*/impression", (route) =>
      route.request().method() === "OPTIONS"
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({
            status: 409,
            headers: cors,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "conflict", message: "Emplacement complet pour aujourd'hui" } }),
          }),
    );
    await goFil(second.page);
    await expect(second.page.getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    await second.page.getByTestId("feed-card-sponsored").scrollIntoViewIfNeeded();
    await expect(second.page.getByTestId("feed-card-sponsored")).toHaveCount(0, { timeout: 30_000 });
    expect(await second.page.getByTestId("fil-list").locator(":scope > *").count()).toBeGreaterThan(3);
    await second.ctx.close();
  } finally {
    await restoreAll();
    if (mine) await deletePlacement(admin, mine.id).catch(() => undefined);
  }
});

test("l'Accueil envoie « home » pour son clic ; le Fil ne change rien à l'Accueil", async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page } = await open(browser, "kenji@orasso.local");
  const calls = trackSponsored(page);
  const tile = page.getByTestId("home-rail").getByTestId("sponsored-card");
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await expect.poll(() => calls.filter((c) => c.kind === "click").length).toBe(1);
  expect(calls.find((c) => c.kind === "click")?.body).toEqual({ surface: "home" });
  await ctx.close();
});
