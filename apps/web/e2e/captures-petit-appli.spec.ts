import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { SEED_PASSWORD } from "./helpers";

// Petit lot appli, tour 2 : captures de la demande de transfert de plaque et des demandes de l'Activité (injectée dans la liste par
// interception de `GET /api/me/requests`, aucun changement de base). Béton et Sable, 390 ×1 et 384 ×1,3.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "captures-petit-appli";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

const variants = [
  ["beton", 390, 1],
  ["sable", 390, 1],
  ["beton", 384, 1.3],
  ["sable", 384, 1.3],
] as const;

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

for (const [theme, width, scale] of variants) {
  test(`demandes ${theme} ${width} ×${scale}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme, width, scale);
    await page.goto("/activite/demandes");
    await afterOpening(page);
    await expect(page.getByTestId("request-list")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("request-plate-transfer")).toBeVisible();
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(1200);
    await page.setViewportSize({ width, height: 2000 });
    await page.screenshot({ path: `${DIR}/demandes-${theme}-${width}-x${String(scale).replace(".", "")}.png` });
    await ctx.close();
  });
}
