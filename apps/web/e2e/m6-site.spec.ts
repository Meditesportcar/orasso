import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { auditPage } from "./audit";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  loginInBrowser,
  MOBILE,
  randomPlate,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M6, côté site (parité de l'appli) : la page « Tes préférences » du compte (lue et enregistrée par l'API, mêmes
// règles), et le bandeau d'annonce (une décision du tri reçue en direct : moutarde pour « Retenue », sobre pour la liste
// d'attente). Captures à 390 et 1280 px. Lancer avec l'API et le site sur la base seedée.
const DIR = `${RELAIS}/lot-m6-captures/apres`;

test("site : Tes préférences enregistrées sur le compte", async ({ page }) => {
  test.setTimeout(180_000);
  const s = unique();
  const email = `sprefs_${s}@e2e.orasso.test`;
  const cookie = await signUpApi(`Sprefs_${s}`.slice(0, 24), email);
  await page.setViewportSize(MOBILE);
  await loginInBrowser(page, email, undefined, "/app/preferences");
  await expect(page.getByRole("heading", { name: /Tes préférences/i })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Rassemblement").check();
  await page.getByLabel("Nocturne").check();
  await page.getByLabel(/Me prévenir des nouveaux événements dans mon coin/).uncheck();
  // « Partout en France » : plus de limite de distance (null), le curseur est grisé.
  await page.getByLabel("Partout en France").check();
  await expect(page.getByTestId("pref-radius")).toContainText("Partout");
  const audit = await auditPage(page);
  expect(audit.greens).toEqual([]);
  expect(audit.horizontalScroll).toBe(false);
  await page.getByRole("button", { name: /Enregistrer/ }).click();
  await expect
    .poll(async () =>
      (await apiCall<{ eventFormats: string[] }>(cookie, "GET", "/me/preferences")).data.eventFormats.sort(),
    )
    .toEqual(["gathering", "night"]);
  const after = await apiCall<{ newEvents: boolean; radiusKm: number | null; seenAt: string | null }>(
    cookie,
    "GET",
    "/me/preferences",
  );
  expect(after.data.newEvents).toBe(false);
  expect(after.data.radiusKm).toBeNull();
  expect(after.data.seenAt).not.toBeNull();
});

for (const [name, viewport] of [
  ["390", MOBILE],
  ["1280", { width: 1280, height: 900 }],
] as const) {
  test(`site : bandeau d'annonce d'une décision reçue en direct (${name} px)`, async ({ page }) => {
    test.setTimeout(240_000);
    const damien = await login("damien@orasso.local");
    const s = unique();
    const email = `sband_${s}@e2e.orasso.test`;
    const cookie = await signUpApi(`Sband_${s}`.slice(0, 24), email);
    const vehicleId = await addVehicleApi(cookie, randomPlate());
    const first = await createEvent(damien, { title: `Bandeau site ${s}` });
    const second = await createEvent(damien, { title: `Bandeau site deux ${s}` });
    const a1 = await applyApi(cookie, first.id, vehicleId);
    const a2 = await applyApi(cookie, second.id, vehicleId);
    await page.setViewportSize(viewport);
    await loginInBrowser(page, email, undefined, "/app/sorties");
    await page.waitForTimeout(2000);
    await decideApi(damien, first.id, a1, "accept");
    const good = page.getByTestId("announce-good");
    await expect(good).toBeVisible({ timeout: 30_000 });
    mkdirSync(DIR, { recursive: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/55-site-annonce-retenue-${name}.png` });
    await expect(good).toHaveCount(0, { timeout: 10_000 });
    await decideApi(damien, second.id, a2, "waitlist");
    await expect(page.getByTestId("announce-info")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/56-site-annonce-info-${name}.png` });
  });
}

// Sans JavaScript, la liste des départements est une vraie liste de cases (`departmentBox`) : ce qu'on coche, y compris
// « tout décocher », est enregistré tel quel par /app/preferences ; la distance du compte (150 km) n'est pas réécrite.
test.describe("site sans JavaScript : Tes préférences", () => {
  test.use({ javaScriptEnabled: false });

  test("les cases de départements font foi, tout décocher enregistre une liste vide, la distance reste", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const s = unique();
    const email = `snojs_${s}@e2e.orasso.test`;
    const cookie = await signUpApi(`Snojs_${s}`.slice(0, 24), email);
    // Le compte a une distance réglée : posée par l'API des réglages (le formulaire sans JavaScript ne la réécrit pas).
    await apiCall(cookie, "PATCH", "/me/settings", { radiusKm: 150 });
    await page.setViewportSize(MOBILE);
    await loginInBrowser(page, email, undefined, "/app/preferences");
    await expect(page.getByRole("heading", { name: /Tes préférences/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pref-radius")).toContainText("150");

    // Les cases sont dans un <details> : on l'ouvre, on coche le 34 et on décoche le 66.
    await page.getByTestId("department-details").locator("summary").click();
    await page.locator('input[name="departmentBox"][value="34"]').check();
    await page.locator('input[name="departmentBox"][value="66"]').uncheck();
    await page.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByTestId("preferences-saved")).toBeVisible({ timeout: 30_000 });
    const one = await apiCall<{ departments: string[]; radiusKm: number }>(cookie, "GET", "/me/preferences");
    expect(one.data.departments).toEqual(["34"]);
    expect(one.data.radiusKm).toBe(150);

    // Tout décocher : liste vide enregistrée.
    await page.getByTestId("department-details").locator("summary").click();
    await page.locator('input[name="departmentBox"][value="34"]').uncheck();
    await page.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByTestId("preferences-saved")).toBeVisible({ timeout: 30_000 });
    const none = await apiCall<{ departments: string[]; radiusKm: number }>(cookie, "GET", "/me/preferences");
    expect(none.data.departments).toEqual([]);
    expect(none.data.radiusKm).toBe(150);
  });

  // Lot M6, tour 3 : compte « Partout en France », case décochée sans JavaScript. Le curseur n'est pas grisé (sans
  // JavaScript) : sa valeur affichée (50) est enregistrée, jamais 0 ni une erreur silencieuse.
  test("décocher « Partout en France » enregistre la distance affichée", async ({ page }) => {
    test.setTimeout(180_000);
    const s = unique();
    const email = `snojs2_${s}@e2e.orasso.test`;
    const cookie = await signUpApi(`Snojs2_${s}`.slice(0, 24), email);
    await apiCall(cookie, "PATCH", "/me/settings", { radiusKm: null });
    await page.setViewportSize(MOBILE);
    await loginInBrowser(page, email, undefined, "/app/preferences");
    await expect(page.getByRole("heading", { name: /Tes préférences/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("pref-radius")).toContainText("Partout");
    await expect(page.locator("#pref-radius-range")).toBeEnabled();
    await page.getByLabel("Partout en France").uncheck();
    await page.getByRole("button", { name: /Enregistrer/ }).click();
    await expect(page.getByTestId("preferences-saved")).toBeVisible({ timeout: 30_000 });
    const after = await apiCall<{ radiusKm: number | null }>(cookie, "GET", "/me/preferences");
    expect(after.data.radiusKm).toBe(50);
  });
});
