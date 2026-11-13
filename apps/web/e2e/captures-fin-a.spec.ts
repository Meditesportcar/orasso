import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";
import { RELAIS } from "./relais";

// Petit lot de fin, partie A : captures de l'Accueil de l'appli (rail des événements) et des Demandes (« Je confirme le transfert »),
// Béton et Sable, 384 et 390 px, police ×1 et ×1,3. `CAPTURES_SUB` : « avant » ou « apres ». Aucun changement de base.
const APP = process.env.APP_URL;
const DIR = `${RELAIS}/lot-fin-a-captures/${process.env.CAPTURES_SUB ?? "apres"}`;
test.skip(!APP || !process.env.CAPTURES, "Captures : lancer avec APP_URL et CAPTURES=1");
test.use({ actionTimeout: 30_000 });

const variants = [
  ["beton", 384, 1],
  ["beton", 384, 1.3],
  ["beton", 390, 1],
  ["beton", 390, 1.3],
  ["sable", 384, 1],
  ["sable", 384, 1.3],
  ["sable", 390, 1],
  ["sable", 390, 1.3],
] as const;

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function open(browser: Browser, theme: string, width: number, scale: number, transfer: boolean) {
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
  if (transfer)
    await page.route("**/api/me/requests*", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.items = [
        {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "plate_transfer",
          from: { type: "person", pseudo: "Nico_66", avatarUrl: null },
          payload: { vehicleLabel: "Peugeot 205 GTI", answerBy: "2026-11-19T10:00:00.000Z" },
          createdAt: "2026-11-12T08:00:00.000Z",
        },
        ...body.items,
      ];
      await route.fulfill({ response: res, json: body });
    });
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  return { ctx, page };
}

const name = (what: string, theme: string, width: number, scale: number) =>
  `${DIR}/${what}-${theme}-${width}-x${String(scale).replace(".", "")}.png`;

for (const [theme, width, scale] of variants) {
  test(`accueil ${theme} ${width} ×${scale}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme, width, scale, false);
    await afterOpening(page);
    await page.waitForTimeout(2500);
    mkdirSync(DIR, { recursive: true });
    await page.setViewportSize({ width, height: 2600 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: name("accueil", theme, width, scale) });
    // Le rail des événements : cadré seul, pour lire les titres.
    const rail = page.getByTestId("home-rail");
    await expect(rail).toBeVisible({ timeout: 30_000 });
    await rail.scrollIntoViewIfNeeded();
    await rail.screenshot({ path: name("rail", theme, width, scale) });
    // L'affiche suivante (« Expo Rivesaltes ») : le rail défile jusqu'à elle.
    const expo = rail.getByTestId("home-rail-item").filter({ hasText: /Rivesaltes/i }).first();
    await expo.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await rail.screenshot({ path: name("rail-expo", theme, width, scale) });
    await ctx.close();
  });
  test(`demandes ${theme} ${width} ×${scale}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme, width, scale, true);
    await page.goto("/activite/demandes");
    await afterOpening(page);
    await expect(page.getByTestId("request-plate-transfer")).toBeVisible({ timeout: 30_000 });
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(1200);
    await page.setViewportSize({ width, height: 2000 });
    await page.screenshot({ path: name("demandes", theme, width, scale) });
    await ctx.close();
  });
}
