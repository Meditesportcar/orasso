import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  MOBILE,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";
import { RELAIS } from "./relais";

// Lot M6 : paires « avant | après » des écrans touchés (consigne de Damien du 23/10 : aucune régression visuelle). Le
// même parcours est capturé avant les changements (`M6_PHASE=avant`) puis après (`M6_PHASE=apres`), en Béton et en
// Sable à 390 px : Ton coin (carte, liste), affiche à partager (Nuit, Sable, Néon, zones masquées), annonce « Retenue »
// sur Sorties, feuille Signaler d'un événement, réglages Préférences ; côté site : l'affiche à partager du garage et
// le signalement d'un événement.
// Lancer avec APP_URL (relais de Metro), l'API et le site lancés sur la base seedée.
const APP = process.env.APP_URL;
const PHASE = process.env.M6_PHASE ?? "apres";
const DIR = `${RELAIS}/lot-m6-captures/${PHASE}`;
const NOCTURNE = "nocturne-de-canet-2026";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

async function open(browser: Browser, theme: Theme, onboarded = true) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/auth");
  await page.evaluate(
    ([t, o]) => {
      localStorage.clear();
      if (o) localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t as string);
    },
    [theme, onboarded] as const,
  );
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
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function shot(page: Page, name: string, theme: string, fullPage = false) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage });
}

for (const theme of THEMES) {
  test(`Ton coin : carte et liste (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, theme, false);
    await page.goto("/arrivee");
    await page.getByRole("button", { name: "Commencer" }).click({ timeout: 30_000 });
    await page.waitForURL(/arrivee\/profil/);
    await page.getByTestId("profile-exhibitor").click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/arrivee\/departement/);
    await expect(page.getByTestId("dept-66")).toBeVisible({ timeout: 30_000 });
    await shot(page, "01-ton-coin-vide", theme);
    for (const d of ["66", "11", "34"]) await page.getByTestId(`dept-${d}`).click();
    await shot(page, "02-ton-coin-choisis", theme);
    await page.getByTestId("department-list-toggle").click();
    await shot(page, "03-ton-coin-liste", theme);
    await ctx.close();
  });

  test(`Affiche à partager (${theme})`, async ({ browser }) => {
    test.setTimeout(400_000);
    const kenji = await login("kenji@orasso.local");
    const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
    const vehicle = vehicles.data.find((v) => v.status === "active");
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.goto(`/vehicule/${vehicle?.id}/partager`);
    await afterOpening(page);
    const img = page.getByTestId("share-preview").locator("img");
    for (const [label, file] of [
      ["Nuit", "nuit"],
      ["Sable", "sable"],
      ["Néon", "neon"],
    ] as const) {
      await page.getByText(label, { exact: true }).first().click();
      await expect(img).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 }).toBe(1920);
      await shot(page, `10-affiche-${file}`, theme);
    }
    await page.getByTestId("share-safe-toggle").click();
    await shot(page, "11-affiche-zones", theme);
    const post = page.getByText("Post 4:5", { exact: true });
    if (await post.isVisible().catch(() => false)) {
      await page.getByTestId("share-safe-toggle").click();
      await post.click();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 }).toBe(1350);
      await shot(page, "12-affiche-post", theme);
    }
    await ctx.close();
    // Les PNG pleine taille, pour les regarder de près.
    if (theme === "beton") {
      for (const [format, style] of [
        ["story", "night"],
        ["story", "sand"],
        ["story", "neon"],
        ["post", "night"],
      ] as const) {
        const res = await fetch(
          `http://localhost:${process.env.API_PORT}/api/me/vehicles/${vehicle?.id}/share-image?format=${format}&style=${style}`,
          { headers: { cookie: kenji } },
        );
        expect(res.status).toBe(200);
        mkdirSync(DIR, { recursive: true });
        writeFileSync(`${DIR}/png-${format}-${style}.png`, Buffer.from(await res.arrayBuffer()));
      }
    }
  });

  test(`Annonce « Retenue » sur Sorties (${theme})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const damien = await login("damien@orasso.local");
    const s = unique();
    const pseudo = `Ann_${s}`.slice(0, 24);
    const email = `ann_${s}@e2e.orasso.test`;
    const cookie = await signUpApi(pseudo, email);
    const vehicleId = await addVehicleApi(cookie, randomPlate());
    const event = await createEvent(damien, { title: `Nocturne annonce ${s}` });
    const applicationId = await applyApi(cookie, event.id, vehicleId);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, email);
    await page.goto("/sorties");
    await afterOpening(page);
    await expect(page.getByText(new RegExp(event.title, "i")).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await decideApi(damien, event.id, applicationId, "accept");
    // Le bandeau arrive en direct (temps réel, puis relecture des candidatures) ; capture quand il est posé.
    await expect(page.getByTestId("announce-good")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await shot(page, "20-annonce-retenue", theme);
    await page.waitForTimeout(5000);
    await shot(page, "21-annonce-apres-4s", theme);
    await ctx.close();
  });

  test(`Signaler un événement (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.goto(`/e/${NOCTURNE}`);
    await afterOpening(page);
    const link = page.getByTestId("report-open-event");
    await link.scrollIntoViewIfNeeded({ timeout: 60_000 });
    await link.click();
    await page.waitForTimeout(800);
    await shot(page, "30-signaler", theme);
    await ctx.close();
  });

  test(`Réglages Apparence et Tes préférences (${theme})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await page.goto("/reglages/preferences");
    await afterOpening(page);
    await expect(page.getByText("Thème", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "40-reglages-preferences", theme);
    if (PHASE === "apres") {
      await page.goto("/preferences");
      await afterOpening(page);
      await expect(page.getByText("Ce que tu aimes").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, "41-tes-preferences", theme);
      await shot(page, "42-tes-preferences-page", theme, true);
    }
    await ctx.close();
  });
}

// Site raccord (rappel de Damien) : mêmes écrans à 390 et 1280 px. La page des préférences n'existe qu'après le lot.
const WIDTHS = [
  { name: "390", viewport: MOBILE },
  { name: "1280", viewport: { width: 1280, height: 900 } },
] as const;

test("site : affiche à partager, signaler, Ton coin, Tes préférences (deux thèmes, deux largeurs)", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const WEB = `http://localhost:${process.env.WEB_PORT}`;
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const tag = `${theme}-${w.name}`;
      // Ton coin du site (arrivée), sans compte.
      const anon = await browser.newContext({ viewport: w.viewport, baseURL: WEB });
      await anon.addCookies([{ name: "orasso-theme", value: theme, url: WEB }]);
      const a = await anon.newPage();
      await a.goto("/inscription");
      await a.waitForLoadState("networkidle");
      for (const d of ["66", "11"]) await a.getByTestId(`dept-${d}`).click();
      await shot(a, "52-site-ton-coin", tag);
      const toggle = a.getByTestId("department-list-toggle");
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await shot(a, "53-site-ton-coin-liste", tag);
      }
      await anon.close();

      const ctx = await browser.newContext({ viewport: w.viewport, baseURL: WEB });
      await ctx.addCookies([{ name: "orasso-theme", value: theme, url: WEB }]);
      const page = await ctx.newPage();
      await page.goto("/connexion?retour=/app/garage");
      await page.getByLabel("E-mail").fill("kenji@orasso.local");
      await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      await page.waitForURL(/\/app\/garage/);
      await page.waitForLoadState("networkidle");
      await page.locator('a[href^="/app/garage/"]').filter({ hasNotText: "Ajouter" }).first().click();
      const card = page.getByTestId("share-card");
      await expect(card).toBeVisible({ timeout: 30_000 });
      await card.scrollIntoViewIfNeeded();
      await expect
        .poll(() => card.locator("img").evaluate((el: HTMLImageElement) => el.naturalHeight), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await shot(page, "50-site-affiche", tag);
      await page.goto(`/e/${NOCTURNE}`);
      const rep = page.getByRole("button", { name: /Signaler/ }).last();
      await rep.scrollIntoViewIfNeeded({ timeout: 30_000 });
      await rep.click();
      await page.waitForTimeout(600);
      await shot(page, "51-site-signaler", tag);
      if (PHASE === "apres") {
        await page.goto("/app/preferences");
        await page.waitForLoadState("networkidle");
        await shot(page, "54-site-preferences", tag, true);
      }
      await ctx.close();
    }
  }
});
