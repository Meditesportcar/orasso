import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, setTheme } from "./helpers";
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

// Lot R7k2 (D38), côté site : la carte « Sponsorisé » du Fil (`/app/fil`). Mêmes règles que l'appli : en 4e position
// (jamais dans les trois premières), étiquette, image 4:5, affichage compté une fois (`IntersectionObserver`, surface
// « feed », vérifié par l'API d'administration), clic compté, lien d'un annonceur externe avec `rel="noopener nofollow
// sponsored"` dans un autre onglet, menu « ⋯ » sans « Moins de ce genre » et avec « Signaler » (e-mail), « Pourquoi je vois
// ça » (texte exact), refus de l'API (409) : la carte est retirée ; aucun emplacement : aucune carte.
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7k2-captures/apres/recette-site`;
const WHY_TARGETED = "Sponsorisé. Choisi d'après ton département, rien d'autre.";

function trackSponsored(page: Page) {
  const calls: { kind: "impression" | "click"; id: string; body: unknown }[] = [];
  page.on("request", (r) => {
    const m = /\/sponsored\/([0-9a-f-]+)\/(impression|click)$/.exec(r.url());
    if (m && r.method() === "POST")
      calls.push({ kind: m[2] as "impression" | "click", id: m[1] as string, body: r.postDataJSON() });
  });
  return calls;
}

async function openFil(page: Page, email: string) {
  await loginInBrowser(page, email, undefined, "/app/fil");
  await page.goto("/app/fil");
  await page.waitForSelector('[data-testid="fil-list"]', { timeout: 30_000 });
}

test("carte en 4e position, étiquette, image 4:5, affichage compté une fois, clic, menu, texte exact", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await setTheme(page, "beton");
  const admin = await adminCookie();
  const mine = await createFeedPlacement(admin, { image: true, disclosure: "Publicité", departments: ["66"] });
  const restore = await pauseOthers(admin, mine.id);
  try {
    const user = await freshUser();
    const calls = trackSponsored(page);
    await openFil(page, user.email);
    const cards = page.locator('[data-testid="fil-list"] > *');
    await expect(cards.nth(3).getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    for (const i of [0, 1, 2]) await expect(cards.nth(i).getByTestId("feed-card-sponsored")).toHaveCount(0);
    const card = page.getByTestId("feed-card-sponsored");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("feed-sponsored-tag")).toHaveText(/Sponsorisé/i);
    await expect(card.getByTestId("feed-sponsored-title")).toHaveText(mine.title);
    await expect(card.getByTestId("feed-sponsored-mention")).toHaveText("Publicité");

    // Image 4:5.
    const image = card.getByTestId("feed-sponsored-image");
    await image.scrollIntoViewIfNeeded();
    const box = await image.boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeGreaterThan(0.78);
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeLessThan(0.82);
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/carte-1280.png` });

    // L'affichage : compté une fois (surface « feed »), et pas une seconde fois après un retour sur le même Fil.
    await expect.poll(() => calls.filter((c) => c.kind === "impression").length, { timeout: 15_000 }).toBe(1);
    expect(calls.find((c) => c.kind === "impression")?.body).toEqual({ surface: "feed" });
    await expect.poll(async () => (await placementById(admin, mine.id)).bySurface.feed?.impressions).toBe(1);
    expect((await placementById(admin, mine.id)).bySurface.home?.impressions ?? 0).toBe(0);
    await page.getByTestId("fil-filters-nearby").click();
    await page.waitForTimeout(1500);
    await page.getByTestId("fil-filters-for_you").click();
    await expect(page.getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("feed-card-sponsored").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    expect(calls.filter((c) => c.kind === "impression")).toHaveLength(1);

    // Menu « ⋯ » : pas de « Moins de ce genre », « Signaler » par e-mail ; « Pourquoi je vois ça » : texte exact.
    await card.getByTestId("feed-card-more").click();
    await expect(page.getByTestId("feed-menu-why")).toBeVisible();
    await expect(page.getByTestId("feed-menu-less")).toHaveCount(0);
    const report = page.getByTestId("feed-menu-report");
    await expect(report).toBeVisible();
    const href = (await report.getAttribute("href")) ?? "";
    expect(href).toMatch(/^mailto:contact@orasso\.fr\?/);
    expect(decodeURIComponent(href)).toContain(mine.id);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/menu-1280.png` });
    await page.getByTestId("feed-menu-why").click();
    await expect(page.getByTestId("feed-why-text")).toHaveText(WHY_TARGETED);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/pourquoi-1280.png` });
    await page.getByTestId("feed-why-ok").click();

    // Le clic : compté (surface « feed »), la fiche du pro s'ouvre sur le site.
    await card.getByTestId("feed-sponsored-open").click();
    await expect.poll(() => calls.filter((c) => c.kind === "click").length).toBe(1);
    expect(calls.find((c) => c.kind === "click")?.body).toEqual({ surface: "feed" });
    await expect.poll(async () => (await placementById(admin, mine.id)).bySurface.feed?.clicks).toBe(1);
    await expect(page).toHaveURL(/\/p\//);
  } finally {
    await restore();
    await deletePlacement(admin, mine.id).catch(() => undefined);
  }
});

test("annonceur externe : domaine, lien dans un autre onglet (rel sponsored), texte sans département, 390 px Sable", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "sable");
  const admin = await adminCookie();
  await setExternalEnabled(admin, true);
  const mine = await createFeedPlacement(admin, {
    kind: "external",
    advertiserName: "Assurance Soleil",
    departments: [],
    disclosure: "Publicité",
    linkUrl: "https://www.assurance-soleil.fr/devis",
    image: true,
  });
  const restore = await pauseOthers(admin, mine.id);
  try {
    const user = await freshUser();
    await openFil(page, user.email);
    const card = page.getByTestId("feed-card-sponsored");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("feed-sponsored-mention")).toHaveText("Publicité · assurance-soleil.fr");
    for (const id of ["feed-sponsored-open", "feed-sponsored-image"]) {
      const link = card.getByTestId(id);
      await expect(link).toHaveAttribute("href", "https://www.assurance-soleil.fr/devis");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener nofollow sponsored");
    }
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: `${DIR}/carte-externe-sable-390.png` });
    // Ouvert à toute la France : le texte ne parle d'aucun département.
    await card.getByTestId("feed-card-more").click();
    await page.getByTestId("feed-menu-why").click();
    const why = (await page.getByTestId("feed-why-text").textContent()) ?? "";
    expect(why).toMatch(/^Sponsorisé\./);
    expect(why).not.toMatch(/département/i);
  } finally {
    await restore();
    await deletePlacement(admin, mine.id).catch(() => undefined);
    await setExternalEnabled(admin, false);
  }
});

test("aucun emplacement : aucune carte ; un refus de l'API (plafond) retire la carte", async ({ page }) => {
  test.setTimeout(240_000);
  const admin = await adminCookie();
  const restoreAll = await pauseOthers(admin, null);
  let mine: { id: string } | null = null;
  try {
    const user = await freshUser();
    await openFil(page, user.email);
    await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("feed-card-sponsored")).toHaveCount(0);
    const before = await page.locator('[data-testid="fil-list"] > *').count();
    expect(before).toBeGreaterThan(3);

    mine = await createFeedPlacement(admin, {});
    const user2 = await freshUser();
    const second = await page.context().newPage();
    await second.route("**/api/sponsored/*/impression", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "conflict", message: "Emplacement complet pour aujourd'hui" } }),
      }),
    );
    await second.context().clearCookies();
    await loginInBrowser(second, user2.email, undefined, "/app/fil");
    await second.goto("/app/fil");
    await second.waitForSelector('[data-testid="fil-list"]', { timeout: 30_000 });
    await expect(second.getByTestId("feed-card-sponsored")).toBeVisible({ timeout: 30_000 });
    await second.getByTestId("feed-card-sponsored").scrollIntoViewIfNeeded();
    await expect(second.getByTestId("feed-card-sponsored")).toHaveCount(0, { timeout: 30_000 });
    expect(await second.locator('[data-testid="fil-list"] > *').count()).toBeGreaterThan(3);
  } finally {
    await restoreAll();
    if (mine) await deletePlacement(admin, mine.id).catch(() => undefined);
  }
});
