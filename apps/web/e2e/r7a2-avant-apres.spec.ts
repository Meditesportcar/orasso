import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7a2 : captures avant / après de l'Accueil (appli et site), un jour normal (Kenji, exposant) et pendant un événement
// (Damien_66, retenu et entré au « Rassemblement du Lydia »). À lancer sur la branche telle que reçue
// (`CAPTURES_DIR` = …/lot-r7a2-captures/avant) puis après le lot (…/apres). Appli à 384 px (police 1 et 1,3, Pixel de
// Damien) et 390 px (police 1), site à 390 et 1 280 px, Béton et Sable. « top » = l'écran tel qu'on l'ouvre, « long » =
// tout l'écran sur une fenêtre haute. Après : l'écran « Personnaliser » en plus. Seulement des captures : les règles se
// vérifient dans `appli-lotr7a2` et `lotr7a2-site`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7a2-captures/apres`;
// QUICK=1 : un seul réglage (appli 384 px, police 1, Béton ; site 390 px Béton), pour vérifier vite pendant le lot.
const QUICK = process.env.QUICK === "1";
const AFTER = !(process.env.CAPTURES_DIR ?? "").includes("avant");
test.use({ actionTimeout: 30_000 });

const DEMOS: readonly (readonly [string, string])[] = [
  ["normal", "kenji@orasso.local"],
  ["live", "damien@orasso.local"],
  // Après seulement : un compte hors événement (le « jour normal » de la maquette), Paul_Photo.
  ...(AFTER ? ([["horsevent", "paul.photo@orasso.local"]] as const) : []),
];

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

async function appLogin(
  browser: Browser,
  email: string,
  theme: string,
  width: number,
  scale: number,
  height = 844,
): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height }, baseURL: APP });
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
  await page.waitForTimeout(1_500);
}

test("R7a2 : captures avant / après de l'Accueil (appli et site)", async ({ browser }) => {
  test.setTimeout(2_400_000);
  mkdirSync(DIR, { recursive: true });

  if (APP) {
    for (const theme of QUICK ? (["beton"] as const) : (["beton", "sable"] as const)) {
      for (const [width, scale] of QUICK
        ? ([[384, 1]] as const)
        : ([
            [384, 1],
            [384, 1.3],
            [390, 1],
          ] as const)) {
        for (const [demo, email] of DEMOS) {
          const tag = `${demo}-${width}-x${scale}-${theme}`;
          for (const [kind, height] of [
            ["top", 844],
            ["long", 2600],
          ] as const) {
            const page = await appLogin(browser, email, theme, width, scale, height);
            await go(page, "/accueil");
            if (await page.getByTestId("whatsnew-dismiss").count()) await page.getByTestId("whatsnew-dismiss").click();
            await shot(page, `appli-accueil-${kind}-${tag}`);
            if (AFTER && kind === "top" && width === 384 && scale === 1 && demo === "normal") {
              await go(page, "/accueil-personnaliser");
              await shot(page, `appli-personnaliser-${tag}`);
            }
            await page.context().close();
          }
        }
      }
    }
  }

  for (const theme of QUICK ? (["beton"] as const) : (["beton", "sable"] as const)) {
    for (const width of QUICK ? [390] : [390, 1280]) {
      for (const [demo, email] of DEMOS) {
        const tag = `${demo}-${width}-${theme}`;
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
        const page = await ctx.newPage();
        await setTheme(page, theme);
        await loginInBrowser(page, email, undefined, "/app");
        await page.goto("/app");
        await page.waitForLoadState("networkidle");
        if (await page.getByTestId("whatsnew-dismiss").count()) {
          await page.getByTestId("whatsnew-dismiss").click();
          await page.waitForLoadState("networkidle");
        }
        await shot(page, `site-accueil-${tag}`);
        await page.screenshot({ path: `${DIR}/site-accueil-long-${tag}.png`, fullPage: true });
        if (AFTER && demo === "normal") {
          await page.goto("/app/accueil/personnaliser");
          await page.waitForLoadState("networkidle");
          await shot(page, `site-personnaliser-${tag}`);
        }
        await ctx.close();
      }
    }
  }
});
