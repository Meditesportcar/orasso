import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  type Cookie,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  samplePhoto,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M2, tour 2 : paires de captures « avant | après » des écrans où la plaque s'affiche (consigne de Damien : aucune
// régression visuelle). Le même fichier tourne sur `main` (avant) et sur la branche (après), CAPTURES_DIR différent.
// Appli (APP_URL) : garage, fiche du véhicule ; site (WEB_PORT) : garage, fiche du véhicule, ajout avec « sans flouter ».
const APP = process.env.APP_URL;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-m2-captures/paires/apres`;
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function appli(browser: Browser, theme: Theme, email: string) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function site(browser: Browser, theme: Theme, cookie: Cookie) {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const cookies: { name: string; value: string; url: string }[] = [{ name: "orasso-theme", value: theme, url: WEB }];
  for (const pair of cookie.split("; ").filter(Boolean)) {
    const i = pair.indexOf("=");
    cookies.push({ name: pair.slice(0, i), value: pair.slice(i + 1), url: WEB });
  }
  await ctx.addCookies(cookies);
  return { ctx, page: await ctx.newPage() };
}

test("paires : la plaque dans le garage et la fiche, appli et site", async ({ browser }) => {
  test.setTimeout(300_000);
  const pseudo = `PairesM2_${unique()}`.slice(0, 20);
  const email = `${pseudo.toLowerCase()}@e2e.orasso.test`;
  const cookie = await signUpApi(pseudo, email);
  // Saisie « n'importe comment » : bande F, minuscules, espaces, département (avant M2 : affichée telle quelle).
  const plate = randomPlate().replace(/[IOUSW]/g, "A");
  const id = await addVehicleApi(cookie, `f ${plate.replaceAll("-", " ").toLowerCase()} 66`);

  for (const theme of ["beton", "sable"] as Theme[]) {
    const a = await appli(browser, theme, email);
    await a.page.goto("/garage");
    const card = a.page.getByTestId("garage-card").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await a.page.waitForTimeout(2_500); // le O vivant de l'ouverture a fini
    await shot(a.page, `appli-garage-${theme}`);
    await card.click();
    await a.page.waitForURL(/\/vehicule\//, { timeout: 30_000 });
    const row = a.page.getByText("Plaque", { exact: true }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await a.page.waitForTimeout(2_500);
    await row.scrollIntoViewIfNeeded();
    await a.page.waitForTimeout(600);
    await a.page.screenshot({ path: `${DIR}/appli-fiche-plaque-${theme}.png` });
    await a.ctx.close();

    const s = await site(browser, theme, cookie);
    await s.page.goto(`${WEB}/app/garage`);
    await s.page.waitForLoadState("networkidle");
    await shot(s.page, `site-garage-${theme}`);
    await s.page.goto(`${WEB}/app/garage/${id}`);
    await s.page.waitForLoadState("networkidle");
    await shot(s.page, `site-fiche-${theme}`);
    // Ajout : photo choisie, puis « Envoyer sans flouter » (après M2 : la confirmation avec la photo).
    await s.page.goto(`${WEB}/app/garage/nouveau`);
    await s.page.locator('input[name="photo"]').setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: samplePhoto(),
    });
    await s.page.getByTestId("site-no-plate").click();
    await shot(s.page, `site-sans-flouter-${theme}`);
    await s.ctx.close();
  }
});
