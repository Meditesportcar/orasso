import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { landscape } from "./lotr7f3-setup";
import { RELAIS } from "./relais";

// Lot R7g : captures « avant » / « après » de ce que la vidéo ne doit pas faire bouger : la publication d'une story photo
// (choix, ajuster, aperçu) et la visionneuse d'une photo, appli (384 px police 1, 384 et 390 px police 1,3 ; Béton et
// Sable) et site (390 et 1280 px). PHASE=avant|apres. Photos de démonstration seulement (aucune plaque lisible).
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7g-captures/${PHASE}`;
test.use({ actionTimeout: 30_000 });

async function resetViews() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from story_views");
    await client.query("update stories set views_count = 0");
  } finally {
    await client.end();
  }
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function skipOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appLogin(browser: Browser, email: string, theme: string, width: number, scale: number): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, baseURL: APP });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await skipOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|evenements|equipe/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(2_000);
}

test("R7g : captures avant / après (publier une photo, visionneuse photo)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP) {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        await resetViews();
        const page = await appLogin(browser, "damien@orasso.local", theme, width, scale);
        await go(page, "/story/publier");
        await expect(page.getByTestId("story-pick")).toBeVisible({ timeout: 30_000 });
        await shot(page, `appli-publier-choix-${tag}`);
        const chooser = page.waitForEvent("filechooser");
        await page.getByTestId("story-pick-gallery").click();
        await (await chooser).setFiles(landscape());
        await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 60_000 });
        await shot(page, `appli-publier-ajuster-${tag}`);
        await go(page, "/fil");
        await shot(page, `appli-fil-${tag}`);
        await page.getByLabel("Voir les stories de Lea_11").click();
        await page.waitForTimeout(1_500);
        await shot(page, `appli-story-photo-${tag}`);
        await page.context().close();
      }
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      await resetViews();
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app/story/publier");
      await expect(page.getByTestId("story-publish")).toBeVisible();
      await shot(page, `site-publier-vide-${tag}`);
      await page.getByTestId("story-file").setInputFiles(landscape());
      await expect(page.getByTestId("story-fit")).toBeVisible({ timeout: 30_000 });
      await shot(page, `site-publier-photo-${tag}`);
      await page.goto("/app/fil");
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Voir les stories de Lea_11").click();
      await page.waitForTimeout(2_000);
      await shot(page, `site-story-photo-${tag}`);
      await ctx.close();
    }
  }
});
