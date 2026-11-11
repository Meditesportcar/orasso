import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { phaseDir, RELAIS } from "./relais";

// Lot R8c2 : captures « avant » / « après » du Fil. Appli (version compilée, `APP_URL`) : Béton et Sable, 384 et 390 px, police ×1
// et ×1,3 ; site (API et site lancés) : 390 et 1280 px. PHASE=avant|apres. Les trois onglets, une carte de publication
// rattachée, le Fil juste après une publication (photo du seed). Les captures propres à « après » (feuille, rail, « Tu es à
// jour », pastille, bandeau, hors ligne) sont prises par les recettes `appli-lotr8c2.spec.ts` et `lotr8c2-site.spec.ts`.
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = phaseDir(`${RELAIS}/lot-r8c2-captures/${PHASE}`, PHASE);
const PHOTOS = resolve(import.meta.dirname, "../../api/scripts/seed/assets/photos");
const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: readFileSync(`${PHOTOS}/${name}`) });
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, theme: string, width: number, scale: number) {
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
  return { ctx, page };
}

async function goFil(page: Page, filter: "for_you" | "nearby" | "following") {
  await page.goto("/fil");
  await afterOpening(page);
  await expect(page.getByTestId("fil-publish-open")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`fil-filters-${filter}`).click();
  await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
}

/** La carte rattachée à un événement (organisateur : Roues Libres 66). */
async function attachedCard(page: Page) {
  const card = page.getByTestId("feed-card-feed_post").filter({ hasText: "Roues Libres 66" }).first();
  for (let i = 0; i < 16 && !(await card.isVisible().catch(() => false)); i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(350);
  }
  await card.scrollIntoViewIfNeeded();
  return card;
}

for (const theme of ["beton", "sable"]) {
  for (const width of [384, 390]) {
    for (const scale of [1, 1.3]) {
      test(`appli ${theme} ${width} police ${scale}`, async ({ browser }) => {
        test.skip(!APP, "Appli : lancer avec APP_URL");
        test.setTimeout(300_000);
        const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
        const { ctx, page } = await open(browser, theme, width, scale);
        for (const filter of ["for_you", "nearby", "following"] as const) {
          await goFil(page, filter);
          await shot(page, `onglet-${filter}-${tag}`);
        }
        await goFil(page, "following");
        const card = await attachedCard(page);
        await shot(page, `carte-rattachee-${tag}`);
        expect(await card.isVisible()).toBe(true);
        await ctx.close();
      });
    }
  }
}

// Le Fil juste après une publication : une fois par thème (chaque publication reste dans le seed).
for (const theme of ["beton", "sable"]) {
  test(`appli ${theme} : le Fil juste après une publication`, async ({ browser }) => {
    test.skip(!APP, "Appli : lancer avec APP_URL");
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme, 390, 1);
    await goFil(page, "following");
    await page.getByTestId("fil-publish-open").click();
    await page.getByTestId("fil-publish-choose-post").click();
    await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("fil-publish-add").click();
    await (await chooser).setFiles([photo("car-golf-gti.jpg")]);
    await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId("fil-publish-photo").nth(0).click();
    await page.getByTestId("fil-publish-none").click();
    await page.getByTestId("fil-publish-none-yes").click();
    await page.getByTestId("fil-publish-caption").fill(`Capture R8c2 ${theme} ${PHASE}`);
    await page.getByTestId("fil-publish-send").click();
    await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("fil-publish-back").click();
    await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
    await shot(page, `apres-publication-${theme}-390`);
    await ctx.close();
  });
}

for (const theme of ["beton", "sable"] as const) {
  for (const width of [390, 1280]) {
    test(`site ${theme} ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil");
      for (const filter of ["for_you", "nearby", "following"] as const) {
        await page.getByTestId(`fil-filters-${filter}`).click();
        await expect(page.getByTestId("fil-waiting")).toHaveCount(0, { timeout: 30_000 });
        await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
        await shot(page, `site-onglet-${filter}-${theme}-${width}`);
      }
      const card = page.getByTestId("feed-card-feed_post").filter({ hasText: "Roues Libres 66" }).first();
      await card.scrollIntoViewIfNeeded();
      await shot(page, `site-carte-rattachee-${theme}-${width}`);
    });
  }
}

test("site : le Fil juste après une publication", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await setTheme(page, "beton");
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/fil/publier");
  await expect(page.getByTestId("fil-publish")).toBeVisible();
  await page.getByTestId("fil-publish-file").setInputFiles([photo("car-golf-gti.jpg")]);
  await expect(page.getByTestId("fil-publish-photo")).toHaveCount(1, { timeout: 60_000 });
  await page.getByTestId("fil-publish-none").click();
  await page.getByTestId("fil-publish-none-yes").click();
  await page.getByTestId("fil-publish-caption").fill(`Capture site R8c2 ${PHASE}`);
  await page.getByTestId("fil-publish-send").click();
  await expect(page.getByTestId("fil-publish-done")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fil-publish-back").click();
  await expect(page.getByTestId("fil-list")).toBeVisible({ timeout: 30_000 });
  await shot(page, "site-apres-publication-beton-390");
});
