import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, SEED_PASSWORD, signUpApi, unique } from "./helpers";
import { RELAIS } from "./relais";

// Lot 59c, retours de l'APK d'essai, côté appli (version web de recette) : note des captures sous le QR de compte (le
// blocage lui-même n'existe que sur le téléphone), changement de casquette depuis l'Administration (pastille de la
// barre du haut, puis Mon profil), carte de l'Explorer : l'étiquette touchée montre sa fiche, dans l'écran.
// Lancer avec APP_URL=http://localhost:<relais> (Metro, EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SITE_URL et CORS_ORIGINS posés).
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-59c-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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
  await page.waitForURL(/accueil|direct|scanner|candidatures|administration/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens, "pas de vert").toEqual([]);
  expect(a.horizontalScroll, "pas de défilement horizontal").toBe(false);
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`QR de compte : la note des captures bloquées est sous le code (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const pseudo = `Qr59_${unique()}`.slice(0, 20);
    const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
    await signUpApi(pseudo, email);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);
    await page.goto("/profil");
    await afterOpening(page);
    await page.getByTestId("profil-account-qr").click();
    const note = page.getByTestId("qr-capture-note");
    await expect(note).toBeVisible({ timeout: 30_000 });
    await expect(note).toContainText("Captures et enregistrement d'écran bloqués sur cet écran");
    await expect(note).toContainText("une à deux minutes");
    await audit(page);
    await shot(page, `qr-compte-note-${theme}`);
    await ctx.close();
  });
}

test("Administration : la pastille de la barre ramène à Mon profil, d'où l'on change de casquette", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  for (const theme of ["beton", "sable"] as Theme[]) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-admin").click();
    await page.waitForURL(/administration/, { timeout: 20_000 });
    await afterOpening(page);
    await expect(page.getByTestId("topbar-persona")).toBeVisible();
    await shot(page, `admin-accueil-${theme}`);

    // La pastille « A » : Mon profil de la casquette de base, avec la liste des casquettes.
    await page.getByTestId("topbar-persona").click();
    await page.waitForURL(/\/profil/, { timeout: 20_000 });
    await expect(page.getByTestId("casquette-admin")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("casquette-organizer").first()).toBeVisible();
    await audit(page);
    await shot(page, `admin-vers-profil-${theme}`);

    // Une autre casquette, puis retour à l'Administration et de nouveau ailleurs.
    await page.getByTestId("casquette-organizer").first().click();
    await page.waitForURL(/\/direct/, { timeout: 20_000 });
    await page.goto("/moi");
    await afterOpening(page);
    await page.getByTestId("casquette-admin").click();
    await page.waitForURL(/administration/, { timeout: 20_000 });
    await afterOpening(page);
    // Lot 59c : l'entrée visible en bas de l'accueil de l'Administration.
    const row = page.getByTestId("admin-switch-persona");
    await row.scrollIntoViewIfNeeded();
    await expect(row).toContainText("Mon profil et mes casquettes");
    await shot(page, `admin-entree-casquettes-${theme}`);
    await row.click();
    await page.waitForURL(/\/profil/, { timeout: 20_000 });
    await expect(page.getByTestId("casquette-admin")).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/administration/);
    await ctx.close();
  }
});

test("Explorer : l'étiquette touchée sur la carte montre sa fiche, dans l'écran", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const theme of ["beton", "sable"] as Theme[]) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.goto("/explorer");
    await afterOpening(page);
    await page.getByText("Plus tard", { exact: true }).click({ timeout: 30_000 });
    await page.getByText("Carte", { exact: true }).click();
    const canvas = page.getByTestId("explorer-map-canvas");
    await expect(canvas).toHaveAttribute("data-map-style", `orasso-${theme}`, { timeout: 45_000 });
    // Carte plus haute : 55 % de l'écran (464 px sur 844).
    const box = await canvas.boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(455);
    await page.waitForTimeout(2500);
    await canvas.getByTestId("map-marker").first().click();
    const picked = page.getByTestId("map-picked");
    await expect(picked).toBeVisible({ timeout: 15_000 });
    // La page a défilé jusqu'à la fiche : son haut est dans l'écran.
    await expect(picked.getByTestId("event-row").first()).toBeInViewport({ ratio: 0.3, timeout: 5_000 });
    await audit(page);
    await shot(page, `explorer-carte-fiche-${theme}`);
    await ctx.close();
  }
});
