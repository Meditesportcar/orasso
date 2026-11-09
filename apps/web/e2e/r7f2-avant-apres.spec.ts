import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7f2 : captures avant / après des écrans qui reçoivent la barre de stories et l'anneau (Le Fil, mon profil, profil d'un
// autre), appli à 384 et 390 px (police 1 et 1,3), site à 390 et 1 280 px, Béton et Sable. À lancer sur la branche telle que
// reçue (`CAPTURES_DIR` = …/lot-r7f2-captures/avant) puis après le lot (…/apres). Seulement des captures : les règles se
// vérifient dans `appli-lotr7f2` et `lotr7f2-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7f2-captures/apres`;
const AFTER = process.env.AVANT !== "1";
test.use({ actionTimeout: 30_000 });

/** Les vues du seed sont remises à zéro : chaque série part d'une barre « non vue » (anneaux en couleur). */
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

test("R7f2 : captures avant / après (Le Fil, mon profil, profil d'un autre)", async ({ browser }) => {
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
        await go(page, "/fil");
        await shot(page, `appli-fil-${tag}`);
        await go(page, "/profil");
        await shot(page, `appli-profil-moi-${tag}`);
        await go(page, "/u/Kenji_66");
        await shot(page, `appli-profil-kenji-${tag}`);
        await go(page, "/u/Lea_11");
        await shot(page, `appli-profil-lea-${tag}`);
        if (AFTER) {
          // La visionneuse : une photo publique (Léa, « pour ses abonnés »), puis une story de crew (Kenji, bandeau brique).
          await go(page, "/fil");
          await page.getByLabel("Voir les stories de Lea_11").click();
          await expect(page.getByTestId("story-media"))
            .toHaveCount(0)
            .catch(() => undefined);
          await page.waitForTimeout(1_500);
          await shot(page, `appli-story-photo-${tag}`);
          await go(page, "/fil");
          await page.getByLabel(/Voir les stories de Kenji_66/).click();
          await page.waitForTimeout(1_200);
          await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(1_500);
          await shot(page, `appli-story-crew-${tag}`);
          await go(page, "/fil");
          await shot(page, `appli-fil-vues-${tag}`);
        }
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
      await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["fil", "/app/fil"],
        ["moi", "/app/moi"],
        ["profil-kenji", "/u/Kenji_66"],
        ["profil-lea", "/u/Lea_11"],
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
      }
      if (AFTER) {
        await page.goto("/app/fil");
        await page.waitForLoadState("networkidle");
        await page.getByLabel("Voir les stories de Lea_11").click();
        await page.waitForTimeout(2_000);
        await shot(page, `site-story-photo-${tag}`);
        await page.goto("/app/fil");
        await page.waitForLoadState("networkidle");
        await page.getByLabel(/Voir les stories de Kenji_66/).click();
        await page.waitForTimeout(1_500);
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(1_500);
        await shot(page, `site-story-crew-${tag}`);
      }
      await ctx.close();
    }
  }
});
