import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";

// Lot R8b2 : captures « avant » / « après » du Profil, de ses onglets et de « Mes publications » (appli et site). CAPTURES_DIR =
// dossier de sortie, CAPTURE_TARGET = `app` (APP_URL) ou `site`, CAPTURE_PHASE = `avant` (seuls les repères d'avant servent) ou
// `apres` (les deux vues, les états vides, la publication seule).
const TARGET = process.env.CAPTURE_TARGET ?? "app";
const PHASE = process.env.CAPTURE_PHASE ?? "avant";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "captures-r8b2";
test.use({ actionTimeout: 30_000 });
mkdirSync(DIR, { recursive: true });

type Theme = "beton" | "sable";

async function openApp(browser: Browser, theme: Theme, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [scale, theme] as const,
  );
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
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const combos: [Theme, number, number][] = [
  ["beton", 390, 1],
  ["sable", 390, 1],
  ["beton", 384, 1.3],
  ["sable", 384, 1.3],
];

test.describe("appli", () => {
  test.skip(TARGET !== "app" || !APP, "Appli : CAPTURE_TARGET=app et APP_URL");

  test("mon profil, un autre, un compte privé, Mes publications", async ({ browser }) => {
    test.setTimeout(900_000);
    for (const [theme, width, scale] of combos) {
      const tag = `${theme}-${width}-x${scale}`;
      const { ctx, page } = await openApp(browser, theme, width, scale);
      await signIn(page, "kenji@orasso.local");
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      if (PHASE === "avant") {
        await shot(page, `mon-profil-garage-${tag}`);
        await page.getByRole("tab", { name: /^Sorties/ }).click();
        await shot(page, `mon-profil-sorties-${tag}`);
      } else {
        await shot(page, `mon-profil-publications-grille-${tag}`);
        await page.getByRole("tab", { name: /^Garage/ }).click();
        await shot(page, `mon-profil-garage-${tag}`);
        await page.getByRole("tab", { name: /^Sorties/ }).click();
        await shot(page, `mon-profil-sorties-${tag}`);
        await page.getByRole("tab", { name: /^Publications/ }).click();
        await page.getByRole("button", { name: "Une par une" }).click();
        await shot(page, `mon-profil-publications-une-par-une-${tag}`);
      }
      await go(page, "/u/Lea_11");
      await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
      await shot(page, `profil-autre-${tag}`);
      await go(page, "/u/Marc_66");
      await shot(page, `profil-prive-${tag}`);
      if (PHASE === "avant") {
        await go(page, "/fil/mes-publications");
        await shot(page, `mes-publications-${tag}`);
      } else {
        await go(page, "/u/Kenji_66");
        await shot(page, `profil-kenji-${tag}`);
      }
      await ctx.close();
    }
  });
});

test.describe("site", () => {
  test.skip(TARGET !== "site", "Site : CAPTURE_TARGET=site");

  test("Mon compte, un autre, un compte privé, Béton et Sable, 390 et 1280 px", async ({ page }) => {
    test.setTimeout(600_000);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
    for (const theme of ["beton", "sable"] as const) {
      await setTheme(page, theme);
      for (const width of [390, 1280]) {
        const tag = `${theme}-${width}`;
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/app/moi");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-mon-compte-${tag}.png` });
        if (PHASE === "avant") {
          await page.goto("/app/moi?onglet=sorties");
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: `${DIR}/site-mon-compte-sorties-${tag}.png` });
          await page.goto("/app/fil/mes-publications");
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: `${DIR}/site-mes-publications-${tag}.png` });
        } else {
          await page.goto("/app/moi?onglet=garage");
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: `${DIR}/site-mon-compte-garage-${tag}.png` });
          await page.goto("/app/moi?onglet=sorties");
          await page.waitForLoadState("networkidle");
          await page.screenshot({ path: `${DIR}/site-mon-compte-sorties-${tag}.png` });
        }
        await page.goto("/u/Lea_11");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-profil-autre-${tag}.png` });
        await page.goto("/u/Marc_66");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-profil-prive-${tag}.png` });
      }
    }
  });
});
