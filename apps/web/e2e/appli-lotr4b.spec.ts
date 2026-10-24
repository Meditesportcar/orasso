import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { MOBILE, SEED_PASSWORD } from "./helpers";
import { type LineupFixture, lineupFixture, prosOnlyFixture } from "./helpers/lotr4b";
import { RELAIS } from "./relais";

// Lot R4b, côté appli (version web compilée), maquette R4 validée par Damien :
//   - R4.3 : le bloc « Le plateau » de la fiche, sous les lignes Quand / Où / Places (vignettes, « Toi », nombre,
//     pros sur place, « Voir le plateau · N voitures ») ; plus de bloc « Prestataires présents » à part ;
//   - R4.3b : le plein écran en mode fiche (pas de barre d'onglets), onglets Voitures et Pros, catégories, deux
//     colonnes, « Voir les N autres », cadenas d'un compte privé : sa feuille (voiture seule), jamais son profil ;
//   - R4.4 : la ligne « Le plateau · N voitures » d'une sortie retenue, « · N présentes » d'une sortie passée.
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r4b-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const NOCTURNE = "nocturne-de-canet-2026";
type Theme = "beton" | "sable";

let fx: LineupFixture;
test.beforeAll(async () => {
  mkdirSync(DIR, { recursive: true });
  fx = await lineupFixture();
});

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function open(browser: Browser, theme: Theme, signedIn = true) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  if (signedIn) {
    await goto(page, "/auth");
    await page.getByLabel("E-mail").fill("kenji@orasso.local");
    await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Me connecter" }).click();
    await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
  }
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function audit(page: Page) {
  const a = await auditPage(page);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  expect(a.truncated).toEqual([]);
  expect(a.brokenWords).toEqual([]);
  expect(a.primaryButtons).toBeLessThanOrEqual(1);
}

for (const theme of ["beton", "sable"] as Theme[]) {
  test(`fiche, plein écran et Mes sorties (${theme})`, async ({ browser }) => {
    const { ctx, page } = await open(browser, theme);
    // R4.3 : le bloc de la fiche.
    await goto(page, `/e/${NOCTURNE}`);
    const block = page.getByTestId("lineup-block");
    await block.scrollIntoViewIfNeeded();
    await expect(block.getByTestId("lineup-thumbs")).toBeVisible();
    await expect(block).toContainText("Toi");
    await expect(block.getByTestId("lineup-open")).toContainText("Voir le plateau");
    await expect(block.getByTestId("lineup-open")).not.toContainText("voitures");
    await expect(page.getByTestId("providers-present")).toHaveCount(0);
    await shot(page, `fiche-plateau-${theme}`);
    await audit(page);

    // R4.3b : le plein écran.
    await block.getByTestId("lineup-open").click();
    await expect(page).toHaveURL(new RegExp(`/e/${NOCTURNE}/plateau`));
    const grid = page.getByTestId("lineup-grid");
    await expect(grid.getByTestId("lineup-car-me")).toHaveCount(1);
    await expect(grid.getByTestId("lineup-car-name")).toHaveCount(30);
    // Mode fiche : en-tête de fiche, pas de barre d'onglets.
    await expect(page.getByTestId("appbar-close").filter({ visible: true })).toHaveCount(1);
    await expect(page.getByTestId("persona-tabbar").filter({ visible: true })).toHaveCount(0);
    await shot(page, `plateau-${theme}`);
    await audit(page);
    await page.getByTestId("lineup-more").click();
    await expect(grid.getByTestId("lineup-car-name")).toHaveCount(60);
    // Une catégorie (filtre côté serveur) puis toutes.
    const cats = page.getByRole("radio");
    if ((await cats.count()) > 1) {
      await cats.nth(1).click();
      await expect(page.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
      await cats.first().click();
    }
    await page.getByTestId("lineup-tab-pros").click();
    await expect(page.getByTestId("lineup-pros")).toBeVisible();
    await shot(page, `plateau-pros-${theme}`);

    // Compte privé : le cadenas, la feuille de sa voiture, jamais son profil.
    await goto(page, `/e/${fx.event.slug}/plateau`);
    const priv = page.getByTestId("lineup-car-private");
    await expect(priv).toHaveCount(1);
    await expect(priv).toContainText(fx.privatePseudo);
    await priv.click();
    const sheet = page.getByTestId("lineup-private-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(`La voiture de ${fx.privatePseudo}`);
    await expect(page).toHaveURL(/\/plateau/);
    await shot(page, `plateau-prive-feuille-${theme}`);

    // R4.4 : Mes sorties.
    await goto(page, "/sorties");
    const line = page.getByTestId("ticket-lineup").first();
    await expect(line).toContainText(/Le plateau · \d+ voitures/);
    await line.scrollIntoViewIfNeeded();
    await shot(page, `sorties-venir-${theme}`);
    await audit(page);
    await page
      .getByTestId("sorties-segments")
      .getByText(/Passées/)
      .click();
    const past = page.getByTestId("ticket-past").getByTestId("ticket-lineup").first();
    await expect(past).toContainText(/Le plateau · \d+ présentes?/);
    await shot(page, `sorties-passees-${theme}`);
    await past.click();
    await expect(page).toHaveURL(/\/plateau/);
    await ctx.close();
  });
}

test("sans compte : le plateau sans pseudo, rien ne s'ouvre", async ({ browser }) => {
  const { ctx, page } = await open(browser, "beton", false);
  await goto(page, `/e/${fx.event.slug}/plateau`);
  const grid = page.getByTestId("lineup-grid");
  await expect(grid.getByTestId("lineup-car-name")).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText(fx.publicPseudo);
  await expect(page.locator("body")).not.toContainText(fx.privatePseudo);
  await expect(page.getByTestId("lineup-car-private")).toHaveCount(0);
  await shot(page, "plateau-visiteur-beton");
  await ctx.close();
});

test("tour 2 : un plateau de pros seulement s'ouvre, la pastille d'un prestataire ouvre sa vitrine", async ({
  browser,
}) => {
  const pros = await prosOnlyFixture();
  const { ctx, page } = await open(browser, "beton");
  await goto(page, `/e/${pros.event.slug}`);
  const block = page.getByTestId("lineup-block");
  await block.scrollIntoViewIfNeeded();
  await expect(block.getByTestId("lineup-empty")).toBeVisible();
  await expect(block.getByTestId("lineup-open")).toBeVisible();
  await shot(page, "fiche-pros-seulement-beton");
  await block.getByTestId("lineup-pro-pill").first().click();
  await expect(page).toHaveURL(/\/providers\//);
  await goto(page, `/e/${pros.event.slug}/plateau`);
  await expect(page.getByTestId("lineup-tab-pros")).toBeVisible();
  await ctx.close();
});
