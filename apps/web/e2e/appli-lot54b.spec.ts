import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, MOBILE, SEED_PASSWORD, samplePhoto } from "./helpers";
import { auditApp } from "./helpers/lot43";
import { sql } from "./helpers/lot48";

// Lot 54b, côté appli (version web de recette) : les six corrections complémentaires du lot 54.
//  1. caches de lecture propres au compte : changement de compte sur le même appareil, déconnexion ;
//  4. fiche pro : l'enregistrement rafraîchit l'écran (aperçu « Vue passionné ») sans le quitter ;
//  5. segments : cible tactile d'au moins 48 px, rôle « tab » avec « selected » ;
//  6. fiche publique d'un prestataire : ses photos en lecture.
// Les points 2 (« Circuit+ ») et 3 (motif de refus) sont couverts par `proPresta.test.ts`.
// Lancer avec APP_URL=http://localhost:8441 (relais `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/Dams/.claude/relais/orasso/lot-54b-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
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

async function signOut(page: Page) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("profil-sign-out").click();
  await page.waitForURL(/auth/, { timeout: 30_000 });
}

async function toPersona(page: Page, kind: "pro" | "provider", landing: RegExp) {
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId(`casquette-${kind}`).first().click();
  await page.waitForURL(landing, { timeout: 60_000 });
}

async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).first().click();
  await page.waitForTimeout(600);
}

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
}

const cacheKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("orasso.cache")));

/** Le segment de nom donné : onglet, sélectionné ou non, d'au moins 48 px de haut. */
async function expectSegment(page: Page, name: string | RegExp, selected: boolean) {
  const seg = page.getByRole("tab", { name }).first();
  await expect(seg).toBeVisible();
  await expect(seg).toHaveAttribute("aria-selected", selected ? "true" : "false");
  const box = await seg.boundingBox();
  expect(box?.height ?? 0, `segment ${name} : au moins le jeton touch (48 px)`).toBeGreaterThanOrEqual(47.5);
}

test("Caches de lecture : un autre compte sur le même appareil ne lit jamais ceux du précédent", async ({ browser }) => {
  test.setTimeout(300_000);
  const { ctx, page } = await open(browser, "beton");

  // Le pro charge sa fiche : le cache est rangé sous son compte.
  await signIn(page, "garage@orasso.local");
  await toPersona(page, "pro", /\/accueil/);
  await tab(page, "Ma fiche");
  await expect(page.getByTestId("pro-identity")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await cacheKeys(page)).some((k) => k.endsWith(".my-pro"))).toBe(true);
  const garageScope = await page.evaluate(() => localStorage.getItem("orasso.cache-scope"));
  expect(garageScope).toBeTruthy();
  expect(await cacheKeys(page)).toContain(`orasso.cache.${garageScope}.my-pro`);

  // Déconnexion : plus aucune clé de cache du compte (ni index, ni compte lié).
  await signOut(page);
  expect(await cacheKeys(page)).toEqual([]);

  // Le prestataire se connecte sur le même appareil : ses caches sont à lui seul.
  await signIn(page, "sofia@orasso.local");
  await toPersona(page, "provider", /\/accueil/);
  await tab(page, "Candidatures");
  await expect(page.getByTestId("provider-application").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await cacheKeys(page)).some((k) => k.endsWith(".provider-applications"))).toBe(true);
  const sofiaScope = await page.evaluate(() => localStorage.getItem("orasso.cache-scope"));
  expect(sofiaScope).not.toBe(garageScope);
  const keys = await cacheKeys(page);
  expect(keys.filter((k) => k.includes(garageScope as string))).toEqual([]);
  expect(keys.some((k) => k.endsWith(".my-pro"))).toBe(false);
  await ctx.close();
});

test("Caches de lecture : le cache d'un autre compte resté sur l'appareil est effacé à la connexion suivante", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, "beton");
  // Cache d'un compte qui ne s'est jamais déconnecté proprement (application fermée, jeton perdu…).
  await page.evaluate(() => {
    localStorage.setItem("orasso.cache-scope", "ancien-compte");
    localStorage.setItem("orasso.cache-index.ancien-compte", JSON.stringify(["my-pro"]));
    localStorage.setItem("orasso.cache.ancien-compte.my-pro", JSON.stringify({ name: "Garage de quelqu'un d'autre" }));
  });
  await signIn(page, "sofia@orasso.local");
  await expect.poll(async () => (await cacheKeys(page)).filter((k) => k.includes("ancien-compte")).length).toBe(0);
  await ctx.close();
});

for (const theme of THEMES) {
  test(`Fiche pro : l'enregistrement rafraîchit l'aperçu, segments de 48 px (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "garage@orasso.local");
    await toPersona(page, "pro", /\/accueil/);
    await tab(page, "Ma fiche");
    await expect(page.getByTestId("pro-identity")).toBeVisible({ timeout: 30_000 });

    // Segments : onglets, sélection annoncée, cible tactile.
    await expect(page.getByTestId("pro-segments")).toHaveAttribute("role", "tablist");
    await expectSegment(page, "Vue passionné", true);
    await expectSegment(page, "Modifier ma fiche", false);
    await shot(page, "segments-fiche", theme);

    // Cocher une activité en plus, enregistrer, revenir à l'aperçu : la tuile y est tout de suite.
    const before = await page.getByTestId("pro-view-activities").getByText(/./).allTextContents();
    await page.getByRole("tab", { name: "Modifier ma fiche" }).click();
    await expect(page.getByTestId("pro-activities")).toBeVisible({ timeout: 20_000 });
    await expectSegment(page, "Modifier ma fiche", true);
    const labels = await page.getByTestId("pro-activities").getByRole("checkbox").evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label") ?? ""),
    );
    const label = labels.find((l) => l && !before.includes(l)) ?? "";
    expect(label).not.toBe("");
    await page.getByTestId("pro-activities").getByRole("checkbox", { name: label }).click();
    await page.getByTestId("pro-form-save").click();
    await expect(page.getByTestId("pro-form-notice")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "Vue passionné" }).click();
    await expect(page.getByTestId("pro-view-activities").getByText(label, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // On remet la fiche comme elle était.
    await page.getByRole("tab", { name: "Modifier ma fiche" }).click();
    await page.getByTestId("pro-activities").getByRole("checkbox", { name: label }).click();
    await page.getByTestId("pro-form-save").click();
    await expect(page.getByTestId("pro-form-notice")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "Vue passionné" }).click();
    await expect(page.getByTestId("pro-view-activities").getByText(label, { exact: true })).toHaveCount(0, {
      timeout: 10_000,
    });
    await ctx.close();
  });

  test(`Fiche publique d'un prestataire : ses photos en lecture (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const sofia = await login("sofia@orasso.local");
    const profile = await apiCall<{ profile: { id: string; photos: { id: string }[] } }>(
      sofia,
      "GET",
      "/me/provider-profile",
    );
    const id = profile.data.profile.id;
    const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
    const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
    // Trois photos de teintes différentes (le seed n'en a pas), ajoutées comme le fait le formulaire.
    const missing = Math.max(0, 3 - (profile.data.profile.photos?.length ?? 0));
    for (const rgb of ([
      [138, 74, 42],
      [60, 90, 140],
      [200, 160, 40],
    ] as [number, number, number][]).slice(0, missing)) {
      const form = new FormData();
      form.set("photo", new Blob([new Uint8Array(samplePhoto(rgb))], { type: "image/png" }), "photo.png");
      const res = await fetch(`${API}/api/me/provider-profile/photos`, {
        method: "POST",
        headers: { origin: WEB, cookie: sofia },
        body: form,
      });
      expect(res.status).toBe(201);
    }

    const { ctx, page } = await open(browser, theme);
    await signIn(page, "garage@orasso.local");
    await page.goto(`/providers/${id}`);
    await afterOpening(page);
    await expect(page.getByTestId("provider-identity")).toContainText("La Brasa", { timeout: 30_000 });
    const grid = page.getByTestId("provider-public-photos");
    await expect(grid).toBeVisible();
    await expect(page.getByText("Réalisations", { exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ photos?$/).first()).toBeVisible();
    expect(await grid.getByRole("img").count()).toBeGreaterThanOrEqual(3);
    // Les photos viennent de l'API (adresse réelle, pas vide) : la capture dit si elles s'affichent.
    const sources = await grid.locator("image").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources.every((s) => s.startsWith("http"))).toBe(true);
    const a = await auditApp(page, theme);
    expect(a.horizontalScroll).toBe(false);
    expect(a.buttonsWithoutIcon).toEqual([]);
    await shot(page, "prestataire-public-photos", theme);

    // Sans photo, rien n'est affiché : un prestataire sans photo n'a pas la section.
    const bare = await sql<{ id: string }>(
      "select id from provider_profiles where id not in (select provider_id from provider_photos) limit 1",
    );
    if (bare[0]) {
      await page.goto(`/providers/${bare[0].id}`);
      await afterOpening(page);
      await expect(page.getByTestId("provider-identity")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("provider-public-photos")).toHaveCount(0);
    }
    await ctx.close();
  });
}
