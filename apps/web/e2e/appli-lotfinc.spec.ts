import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie C, côté appli (version web compilée de recette, `APP_URL`) : « Partager » d'une publication ouvre sa
// feuille sur tout l'écran, collée au bas de la fenêtre, où que la carte soit posée (Le Fil, Profil › Publications › Une par une,
// page d'une publication), et elle se ferme. L'icône des réglages (profil) est une roue dentée, plus un soleil.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-fin-c-captures/apres`;
const HEIGHT = 860;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function open(browser: Browser, theme: "beton" | "sable" = "beton") {
  const ctx = await browser.newContext({ viewport: { width: 384, height: HEIGHT }, baseURL: APP });
  await ctx.addInitScript((th) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", th);
  }, theme);
  return { ctx, page: await ctx.newPage() };
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** La feuille de partage couvre l'écran : sa boîte est dans la fenêtre, collée au bas ; elle se ferme. */
async function expectSheetAtBottom(page: Page, name: string, author?: string) {
  const card = page
    .getByTestId("feed-card-feed_post")
    .filter(author ? { hasText: author } : {})
    .first();
  await card.getByTestId("feed-post-share").scrollIntoViewIfNeeded();
  await card.getByTestId("feed-post-share").click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("share-dest-external")).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box).toBeTruthy();
  expect((box?.y ?? -1) >= 0).toBe(true);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - HEIGHT)).toBeLessThan(40);
  expect(Math.abs((box?.width ?? 0) - 384)).toBeLessThan(40);
  await shot(page, name);
  await page.getByTestId("share-close").click();
  await expect(sheet).toHaveCount(0, { timeout: 10_000 });
}

for (const theme of ["beton", "sable"] as const) {
  test(`Partager : feuille sur tout l'écran (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    // Profil : l’icône des réglages (roue dentée), puis Publications › Une par une
    await go(page, "/profil");
    await expect(page.getByTestId("profil-gear").first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `profil-reglages-${theme}`);
    await expect(page.getByTestId("publications-grid")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Une par une" }).click();
    await expect(page.getByTestId("feed-card-feed_post").first()).toBeVisible({ timeout: 30_000 });
    await expectSheetAtBottom(page, `profil-partager-${theme}`);
    await ctx.close();
    // Le Fil (vu par Damien : les publications de Kenji_66)
    const damien = await open(browser, theme);
    const { ctx: ctx2, page: page2 } = damien;
    await signIn(page2, "damien@orasso.local");
    await go(page2, "/fil");
    await expect(page2.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
    await page2.getByTestId("fil-filters-for_you").click();
    await expect(page2.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
    await expect(page2.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
    await expect(page2.getByTestId("feed-card-feed_post").filter({ hasText: "Kenji_66" }).first()).toBeAttached({
      timeout: 30_000,
    });
    await expectSheetAtBottom(page2, `fil-partager-${theme}`, "Kenji_66");
    await ctx2.close();
  });
}

async function expectBottomSheet(page: Page, name: string) {
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  const box = await sheet.boundingBox();
  expect((box?.y ?? -1) >= 0).toBe(true);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - HEIGHT)).toBeLessThan(40);
  await shot(page, name);
  await page.getByTestId("share-close").click();
  await expect(sheet).toHaveCount(0, { timeout: 10_000 });
}

test("Partager depuis la Page (Garage du Port › Publications)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "garage@orasso.local");
  await go(page, "/moi");
  await page.getByTestId("casquette-pro").first().click();
  await page.waitForURL((u) => !/\/(moi|profil)(\?|$)/.test(u.pathname), { timeout: 30_000 });
  await page.getByTestId("persona-tabbar").getByRole("tab", { name: "Page", exact: true }).click();
  await page.getByTestId("page-tab-publications").first().click();
  const share = page.getByTestId("feed-post-share").first();
  await expect(share).toBeVisible({ timeout: 30_000 });
  await share.scrollIntoViewIfNeeded();
  await share.click();
  await expectBottomSheet(page, "page-partager");
  await ctx.close();
});

test("Tri (feuille dans un Modal natif) : un motif de refus s'ouvre, se coche et se ferme, le contenu est cliquable", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser);
  await signIn(page, "damien@orasso.local");
  await go(page, "/moi");
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await page.waitForURL(/\/direct/, { timeout: 20_000 });
  await page.getByRole("tab", { name: "Tri", exact: true }).click();
  await page.getByTestId("triage-event-picker").click();
  await page.getByTestId("triage-event-choice").filter({ hasText: "Nocturne de Canet" }).click();
  await expect(page.getByTestId("triage-counters")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("triage-refuse").click();
  await expect(page.getByTestId("triage-refusal-confirm")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("checkbox", { name: /Hors thème/ }).click();
  await expect(page.getByRole("checkbox", { name: /Hors thème/ })).toBeChecked();
  await shot(page, "tri-motifs");
  await page.getByRole("button", { name: "Annuler" }).last().click();
  await expect(page.getByTestId("triage-refusal-confirm")).toHaveCount(0, { timeout: 10_000 });
  await ctx.close();
});
