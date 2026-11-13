import { appendFileSync, mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  setTheme,
  signUpApi,
  unique,
} from "./helpers";

// Lot R8b1 : captures « avant » / « après » du haut du Profil (appli et site). Même fichier avant et après : seuls des repères
// qui existaient avant (rôle « tab », `profil-head`, `profil-tabs`) servent à naviguer. CAPTURES_DIR = dossier de sortie,
// CAPTURE_TARGET = `app` (APP_URL) ou `site`. Les hauteurs « avant le contenu » (haut de l'en-tête au bas des onglets) vont
// dans `hauteurs.txt`.
const TARGET = process.env.CAPTURE_TARGET ?? "app";
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "captures-r8b1";
test.use({ actionTimeout: 30_000 });
mkdirSync(DIR, { recursive: true });

type Theme = "beton" | "sable";
const log = (line: string) => appendFileSync(`${DIR}/hauteurs.txt`, `${line}\n`);

async function height(page: Page, tag: string) {
  const h = await page.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    const head = q("profil-head") ?? q("public-head");
    const tabs = q("profil-tabs");
    return head && tabs ? Math.round(tabs.bottom - head.top) : -1;
  });
  log(`${tag} : ${h} px`);
}

// ---------------------------------------------------------------- appli
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
  await page.waitForTimeout(700);
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

  test("mon profil (partenaire), Garage et Sorties, quatre combinaisons", async ({ browser }) => {
    test.setTimeout(600_000);
    for (const [theme, width, scale] of combos) {
      const tag = `${theme}-${width}-x${scale}`;
      const { ctx, page } = await openApp(browser, theme, width, scale);
      await signIn(page, "kenji@orasso.local");
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await height(page, `mon-profil-garage-${tag}`);
      await shot(page, `mon-profil-garage-${tag}`);
      await page.getByRole("tab", { name: /^Sorties/ }).click();
      await shot(page, `mon-profil-sorties-${tag}`);
      await go(page, "/profil-public");
      await shot(page, `apercu-${tag}`);
      await go(page, "/u/Lea_11");
      await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
      await height(page, `profil-autre-${tag}`);
      await shot(page, `profil-autre-${tag}`);
      await ctx.close();
    }
  });

  test("autres états, Béton 390 x1", async ({ browser }) => {
    test.setTimeout(900_000);
    const tag = "beton-390-x1";
    // Sans partenaire.
    {
      const { ctx, page } = await openApp(browser, "beton", 390, 1);
      await signIn(page, "julie@orasso.local");
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await height(page, `sans-partenaire-${tag}`);
      await shot(page, `sans-partenaire-${tag}`);
      await go(page, "/reglages");
      await shot(page, `reglages-${tag}`);
      await go(page, "/crew");
      await shot(page, `crew-${tag}`);
      await ctx.close();
    }
    // Visiteur sans véhicule.
    {
      const { ctx, page } = await openApp(browser, "beton", 390, 1);
      await signIn(page, "paul.photo@orasso.local");
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await height(page, `visiteur-${tag}`);
      await shot(page, `visiteur-${tag}`);
      await ctx.close();
    }
    // Pseudo long + bio longue ; puis sans bio.
    {
      const pseudo = `Pilote_Rouss_${unique()}`.slice(0, 20);
      const cookie = await signUpApi(pseudo);
      await addVehicleApi(cookie, randomPlate());
      await apiCall(cookie, "PATCH", "/me/profile", {
        bio: "Passionné de drift et de rassemblement, du circuit au col, toujours partant pour une sortie entre amis le week-end.",
      });
      const { ctx, page } = await openApp(browser, "beton", 390, 1);
      await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await height(page, `pseudo-long-bio-longue-${tag}`);
      await shot(page, `pseudo-long-bio-longue-${tag}`);
      await apiCall(cookie, "PATCH", "/me/profile", { bio: "" });
      await go(page, "/profil");
      await expect(page.getByTestId("profil-head")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await height(page, `sans-bio-${tag}`);
      await shot(page, `sans-bio-${tag}`);
      await ctx.close();
    }
    // Profil d'un autre : suivi, privé inconnu, privé en attente.
    {
      const pseudo = `Vis${unique()}`.slice(0, 14);
      const cookie = await signUpApi(pseudo);
      await addVehicleApi(cookie, randomPlate());
      await apiCall(cookie, "POST", "/users/Lea_11/follow");
      const { ctx, page } = await openApp(browser, "beton", 390, 1);
      await signIn(page, `${pseudo.toLowerCase()}@e2e.orasso.test`);
      await go(page, "/u/Lea_11");
      await expect(page.getByTestId("profil-tabs")).toBeVisible({ timeout: 30_000 });
      await shot(page, `autre-suivi-${tag}`);
      await go(page, "/u/Marc_66");
      await expect(page.getByTestId("publications-private")).toBeVisible({ timeout: 30_000 });
      await shot(page, `autre-prive-inconnu-${tag}`);
      await apiCall(cookie, "POST", "/users/Marc_66/follow");
      await go(page, "/u/Marc_66");
      await expect(page.getByTestId("publications-private")).toBeVisible({ timeout: 30_000 });
      await shot(page, `autre-prive-attente-${tag}`);
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------- site
test.describe("site", () => {
  test.skip(TARGET !== "site", "Site : CAPTURE_TARGET=site");

  test("Mon compte et profil d'un autre, Béton et Sable, 390 et 1280 px", async ({ page }) => {
    test.setTimeout(600_000);
    for (const theme of ["beton", "sable"] as const) {
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", undefined, "/app/moi");
      for (const width of [390, 1280]) {
        const tag = `${theme}-${width}`;
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/app/moi");
        await page.waitForLoadState("networkidle");
        await height(page, `site-mon-compte-${tag}`);
        await page.screenshot({ path: `${DIR}/site-mon-compte-${tag}.png` });
        await page.goto("/app/moi?onglet=sorties");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-mon-compte-sorties-${tag}.png` });
        await page.goto("/u/Lea_11");
        await page.waitForLoadState("networkidle");
        await height(page, `site-profil-autre-${tag}`);
        await page.screenshot({ path: `${DIR}/site-profil-autre-${tag}.png` });
        await page.goto("/app/profil-public");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-apercu-${tag}.png` });
        await page.goto("/app/moi#reglages");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${DIR}/site-reglages-${tag}.png` });
      }
    }
    await setTheme(page, "beton");
    await page.setViewportSize({ width: 390, height: 900 });
    await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app/moi");
    await page.goto("/app/moi");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/site-visiteur-beton-390.png` });
    await page.goto("/u/Marc_66");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/site-prive-inconnu-beton-390.png` });
  });
});
