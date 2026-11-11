import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD } from "./helpers";
import { phaseDir, RELAIS } from "./relais";

// Lot R8o : captures « après » (appli compilée, `APP_URL`) : Béton et Sable, 384 et 390 px, police ×1 et ×1,3. « Publier »,
// Activité > Demandes (la demande de MéditeSportCar du seed), la carte signée d'une collaboration acceptée du seed (Kenji_66 et
// Garage du Port) dans « Une par une », l'onglet « Publications » des deux profils. Base fraîche (seed).
const PHASE = process.env.PHASE ?? "apres";
const APP = process.env.APP_URL;
const DIR = phaseDir(`${RELAIS}/lot-r8o-captures/${PHASE}`, PHASE);
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, email: string, theme: string, width: number, scale: number) {
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
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(1200);
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 390, height: 1800 });
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const variants = [
  ["beton", 390, 1],
  ["sable", 390, 1],
  ["beton", 384, 1.3],
  ["sable", 384, 1.3],
] as const;

for (const [theme, width, scale] of variants) {
  test(`captures ${theme} ${width} px ×${scale}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const tag = `${theme}-${width}-x${String(scale).replace(".", "")}`;
    const { ctx, page } = await open(browser, "damien@orasso.local", theme, width, scale);
    await page.goto("/fil/publier");
    await afterOpening(page);
    await expect(page.getByTestId("fil-publish")).toBeVisible({ timeout: 30_000 });
    await shot(page, `publier-${tag}`);
    await page.goto("/activite/demandes");
    await afterOpening(page);
    await expect(page.getByTestId("request-list")).toBeVisible({ timeout: 30_000 });
    await shot(page, `demandes-${tag}`);
    await page.goto("/profil");
    await afterOpening(page);
    await expect(page.getByTestId("publications-tab")).toBeVisible({ timeout: 30_000 });
    await shot(page, `profil-${tag}`);
    // La carte signée, vue de Damien : la publication de Kenji_66 co-signée par Garage du Port, ouverte seule.
    const kenji = await login("kenji@orasso.local");
    const mine = await apiCall<{ items: { id: string; caption: string }[] }>(kenji, "GET", "/me/feed-posts");
    const signed = mine.data.items.find((p) => p.caption.startsWith("Révision terminée chez Garage du Port"));
    if (signed) {
      await page.goto(`/publication/${signed.id}`);
      await afterOpening(page);
      await expect(page.getByTestId("feed-card-signature")).toBeVisible({ timeout: 30_000 });
      await shot(page, `carte-signee-${tag}`);
    }
    await ctx.close();
  });
}
