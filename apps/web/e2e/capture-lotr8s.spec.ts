import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { sql } from "./lotr7f2-setup";
import { RELAIS } from "./relais";

// Lot R8s : captures « avant » et « après » de la barre des stories et de la visionneuse (appli compilée `APP_URL`, site).
// `PHASE=avant|apres` choisit le dossier `lot-r8s-captures/<phase>/`. Béton et Sable ; appli à 384 et 390 px (police ×1 et ×1,3),
// site à 390 et 1280 px. Les vues du seed sont remises à zéro : la barre part « non vue ».
const APP = process.env.APP_URL;
const PHASE = process.env.PHASE ?? "avant";
const DIR = `${RELAIS}/lot-r8s-captures/${PHASE}`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function openApp(browser: Browser, theme: string, width: number, scale: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
  return { ctx, page };
}

test.describe("appli", () => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  for (const [theme, width, scale] of [
    ["beton", 384, 1],
    ["sable", 390, 1],
    ["beton", 384, 1.3],
  ] as const) {
    test(`barre et visionneuse ${theme} ${width} x${scale}`, async ({ browser }) => {
      test.setTimeout(240_000);
      await sql("delete from story_views");
      await sql("update stories set views_count = 0");
      const { ctx, page } = await openApp(browser, theme, width, scale);
      const tag = `appli-${theme}-${width}-x${String(scale).replace(".", "")}`;
      await shot(page, `${tag}-barre`);
      await page.getByLabel(/Voir les stories de Kenji_66/).click();
      await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("story-bars")).toBeVisible({ timeout: 30_000 });
      await shot(page, `${tag}-visionneuse-1`);
      await page.getByTestId("story-surface").click({ position: { x: width - 40, y: 400 } });
      await page.getByTestId("story-surface").click({ position: { x: width - 40, y: 400 } });
      await shot(page, `${tag}-visionneuse-3`);
      await page.getByTestId("story-surface").click({ position: { x: width - 40, y: 400 } });
      if (PHASE === "apres") {
        // Lecture enchaînée : l'auteur suivant s'ouvre seul ; on ferme ensuite par la croix.
        await expect(page.getByTestId("story-author")).not.toHaveText("Kenji_66", { timeout: 15_000 });
        await shot(page, `${tag}-auteur-suivant`);
        await page.getByTestId("story-close").click();
      }
      await page.waitForURL(/fil/, { timeout: 15_000 });
      await shot(page, `${tag}-fin-de-serie`);
      await ctx.close();
    });
  }
});

test.describe("site", () => {
  for (const [theme, width, height] of [
    ["beton", 390, 844],
    ["sable", 390, 844],
    ["beton", 1280, 800],
    ["sable", 1280, 800],
  ] as const) {
    test(`barre et visionneuse ${theme} ${width}`, async ({ browser }) => {
      test.setTimeout(240_000);
      await sql("delete from story_views");
      await sql("update stories set views_count = 0");
      const ctx = await browser.newContext({ viewport: { width, height }, locale: "fr-FR" });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", SEED_PASSWORD, "/app/fil");
      await page.goto("/app/fil");
      await expect(page.getByTestId("stories-bar")).toBeVisible({ timeout: 30_000 });
      const tag = `site-${theme}-${width}`;
      await shot(page, `${tag}-barre`);
      await page.getByLabel(/Voir les stories de Kenji_66/).click();
      await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("story-bars")).toBeVisible({ timeout: 30_000 });
      await shot(page, `${tag}-visionneuse-1`);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await shot(page, `${tag}-visionneuse-3`);
      await page.keyboard.press("ArrowRight");
      if (PHASE === "apres") {
        await expect(page.getByTestId("story-author")).not.toHaveText("Kenji_66", { timeout: 15_000 });
        await shot(page, `${tag}-auteur-suivant`);
        await page.keyboard.press("Escape");
      }
      await page.waitForURL(/\/app\/fil/, { timeout: 15_000 });
      await shot(page, `${tag}-fin-de-serie`);
      await ctx.close();
    });
  }
});
