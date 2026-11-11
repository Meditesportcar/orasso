import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { loginInBrowser, MOBILE, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8r : captures « après » des retouches de la livraison 1 de R8 : la ligne météo d'« En cours » (Rassemblement du Lydia,
// plusieurs jours : la journée d'aujourd'hui), les compteurs du Profil (11,5 px), le bloc « Météo en cours de chargement » et la
// carte d'événement « Complet ». Appli compilée (`APP_URL`), Béton et Sable, 384 et 390 px, police ×1 et ×1,3 ; site à 390 px.
// `CAPTURES_DIR` sinon `lot-r8r-captures/apres`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8r-captures/apres`;
test.use({ actionTimeout: 30_000 });
test.setTimeout(240_000);

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function signIn(page: Page, width: number, scale: number, theme: string, email: string) {
  await page.setViewportSize({ width, height: 860 });
  await page.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (Number(s) > 1) localStorage.setItem("orasso.recette.echellePolice", s);
    },
    [theme, String(scale)] as const,
  );
  await page.goto(`${APP}/auth`);
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page
    .getByTestId("whatsnew-dismiss")
    .click({ timeout: 4_000 })
    .catch(() => undefined);
}

for (const theme of ["beton", "sable"] as const) {
  for (const [width, scale] of [
    [384, 1],
    [390, 1],
    [384, 1.3],
    [390, 1.3],
  ] as const) {
    test(`appli ${theme} ${width} x${scale} : « En cours » (Lydia), compteurs du Profil, Météo en chargement, carte Complet`, async ({
      page,
    }) => {
      test.skip(!APP, "Appli : lancer avec APP_URL");
      mkdirSync(DIR, { recursive: true });
      const tag = `${theme}-${width}-x${scale}`;
      await signIn(page, width, scale, theme, "kenji@orasso.local");
      const live = page.getByTestId("home-live-line");
      await expect(live).toBeVisible({ timeout: 30_000 });
      await live.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/appli-accueil-en-cours-lydia-${tag}.png` });

      // Le bloc « Météo » au premier chargement : la première lecture de l'Accueil est rendue « sans stock ».
      await page.context().route("**/api/me/home*", async (route) => {
        const res = await route.fetch();
        if (!route.request().url().includes("blocks=app")) return route.fulfill({ response: res });
        const json = (await res.json()) as Record<string, unknown>;
        return route.fulfill({ response: res, json: { ...json, weather: null, weatherPending: true } });
      });
      await page.goto(`${APP}/accueil`);
      await afterOpening(page);
      const pending = page.getByTestId("home-weather-pending");
      await expect(pending).toBeVisible({ timeout: 30_000 });
      await pending.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/appli-accueil-meteo-chargement-${tag}.png` });
      await page.context().unroute("**/api/me/home*");

      await page.goto(`${APP}/profil`);
      await afterOpening(page);
      await expect(page.locator('[data-testid^="profil-count-"]').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `${DIR}/appli-profil-compteurs-${tag}.png` });

      await page.goto(`${APP}/explorer`);
      await afterOpening(page);
      await page.getByTestId("segment-evenements").click({ timeout: 30_000 });
      await page.getByTestId("events-q").fill("Lydia");
      const row = page.getByTestId("event-row").first();
      await expect(row.getByTestId("event-seats")).toHaveText("Complet", { timeout: 30_000 });
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${DIR}/appli-explorer-complet-${tag}.png` });
    });
  }

  test(`site ${theme} 390 px : « En cours » (Lydia), carte Complet`, async ({ page }) => {
    mkdirSync(DIR, { recursive: true });
    await page.setViewportSize(MOBILE);
    await setTheme(page, theme);
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/app");
    const live = page.getByTestId("home-live-line");
    await expect(live).toBeVisible({ timeout: 30_000 });
    await live.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/site-accueil-en-cours-lydia-${theme}-390.png` });
    await page.goto("/app/explorer?segment=evenements&autour=partout");
    const lydia = page.getByTestId("event-tile").filter({ hasText: "Rassemblement du Lydia" }).first();
    await expect(lydia.getByTestId("event-seats")).toHaveText("Complet", { timeout: 30_000 });
    await lydia.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/site-explorer-complet-${theme}-390.png` });
  });
}
