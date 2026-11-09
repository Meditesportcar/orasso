import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7a1 : captures avant / après des écrans touchés par la nouvelle barre d'onglets et la barre du haut. À lancer sur
// la branche telle que reçue (`CAPTURES_DIR` = …/lot-r7a1-captures/avant) puis après le lot (…/apres). Kenji (exposant,
// chef du crew « Roussillon Drift »). Appli à 384 px (police 1 et 1,3, Pixel de Damien) et 390 px (police 1), site à
// 390 et 1 280 px, Béton et Sable. Écrans : Accueil, Sorties, Garage, Profil, Boîte, Journal. Seulement des captures :
// les règles se vérifient dans `appli-lotr7a1` et `lotr7a1-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7a1-captures/apres`;
const AFTER = (process.env.CAPTURES_DIR ?? "").includes("avant") ? false : true;
test.use({ actionTimeout: 30_000 });

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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  return page;
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await skipOpening(page);
  await page.waitForTimeout(1_200);
}

test("R7a1 : captures avant / après (barre, Accueil, Sorties, Garage, Profil, Boîte, Journal)", async ({ browser }) => {
  test.setTimeout(1_800_000);
  mkdirSync(DIR, { recursive: true });

  if (APP) {
    for (const theme of ["beton", "sable"] as const) {
      for (const [width, scale] of [
        [384, 1],
        [384, 1.3],
        [390, 1],
      ] as const) {
        const tag = `${width}-x${scale}-${theme}`;
        const page = await appLogin(browser, "kenji@orasso.local", theme, width, scale);
        await go(page, "/accueil");
        await shot(page, `appli-accueil-${tag}`);
        // Après : le bandeau « où sont passées les choses » est voulu ; la page sans lui se compare à l'avant.
        if (AFTER && (await page.getByTestId("whatsnew-dismiss").count())) {
          await page.getByTestId("whatsnew-dismiss").click();
          await shot(page, `appli-accueil-sans-bandeau-${tag}`);
        }
        await go(page, "/sorties");
        await shot(page, `appli-sorties-${tag}`);
        await go(page, "/garage");
        await shot(page, `appli-garage-${tag}`);
        await go(page, "/profil");
        await shot(page, `appli-profil-${tag}`);
        await go(page, "/boite");
        await shot(page, `appli-boite-${tag}`);
        if (AFTER) {
          await go(page, "/fil");
          await shot(page, `appli-fil-${tag}`);
          await go(page, "/crew");
          await shot(page, `appli-crew-${tag}`);
        }
        await page.context().close();
      }
    }
  }

  for (const theme of ["beton", "sable"] as const) {
    for (const width of [390, 1280]) {
      const tag = `${width}-${theme}`;
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
      for (const [name, path] of [
        ["accueil", "/app"],
        ["sorties", "/app/sorties"],
        ["garage", "/app/garage"],
        ["moi", "/app/moi"],
        ["boite", "/app/boite"],
        ["journal", "/app/journal"],
        ...(AFTER
          ? ([
              ["fil", "/app/fil"],
              ["crew", "/app/crew"],
            ] as const)
          : []),
      ] as const) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await shot(page, `site-${name}-${tag}`);
        if (AFTER && name === "accueil" && (await page.getByTestId("whatsnew-dismiss").count())) {
          await page.getByTestId("whatsnew-dismiss").click();
          await page.waitForLoadState("networkidle");
          await shot(page, `site-accueil-sans-bandeau-${tag}`);
        }
      }
      await ctx.close();
    }
  }
});
