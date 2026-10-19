import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, login, SEED_PASSWORD, unique } from "./helpers";

// Captures des écrans touchés par le lot 36 dans l'appli (navigateur, 390 px, Béton et Sable) et contrôle du système de
// design dans le DOM (pas de vert, rien de tronqué, pas de défilement horizontal) : case des conditions générales à
// l'inscription, photos du véhicule (croix, couverture, confirmation du retrait), raison d'une candidature impossible,
// aperçu d'un brouillon, lien de vérification de l'e-mail ouvert dans l'appli.
// Lancer avec APP_URL (relais isolé devant `expo start --web`) et CAPTURES_DIR.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/DELL/.claude/relais/orasso/lot-36-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const audits: Record<string, Pick<Audit, "greens" | "truncated" | "horizontalScroll">> = {};

async function context(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  return { ctx, page };
}

async function openApp(browser: Browser, email: string, theme: Theme) {
  const { ctx, page } = await context(browser, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, theme: Theme) {
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
  const a = await auditPage(page);
  audits[`${name}-${theme}`] = { greens: a.greens, truncated: a.truncated, horizontalScroll: a.horizontalScroll };
}

test("écrans touchés par le lot 36, deux thèmes à 390 px", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
  const sid = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
  const start = new Date(Date.now() + 400 * 86_400_000);
  const body = (title: string) => ({
    title,
    format: "gathering",
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 4 * 3_600_000).toISOString(),
    addressLine: "Parking du port",
    city: "Canet-en-Roussillon",
    admittedVehicleTypes: ["car"],
    admission: "filtered",
    registrationsOpenAt: new Date(start.getTime() - 10 * 86_400_000).toISOString(),
    previewHours: 0,
  });
  const later = await apiCall<{ id: string; slug: string }>(
    damien,
    "POST",
    `/structures/${sid}/events`,
    body(`Édition 2027 ${unique()}`),
  );
  expect((await apiCall(damien, "POST", `/events/${later.data.id}/publish`)).status).toBe(200);
  const draft = await apiCall<{ id: string; slug: string }>(
    damien,
    "POST",
    `/structures/${sid}/events`,
    body(`Brouillon ${unique()}`),
  );
  const vehicles = await apiCall<{ id: string; photos: unknown[] }[]>(damien, "GET", "/me/vehicles");
  const withPhotos = vehicles.data.find((x) => x.photos.length > 1) ?? vehicles.data[0];

  for (const theme of THEMES) {
    // Inscription : case des conditions générales, le bouton reste inactif sans elle.
    const anon = await context(browser, theme);
    // Depuis le lot 41, l'inscription est le flux d'arrivée : profil, département, puis « Qui es-tu ? » avec la case.
    await anon.page.goto("/auth?mode=signup");
    await anon.page.waitForURL(/arrivee\/profil/, { timeout: 30_000 });
    await anon.page.getByRole("button", { name: "Continuer" }).click();
    await anon.page.getByTestId("dept-66").click();
    await anon.page.getByRole("button", { name: "Continuer" }).click();
    await expect(anon.page.getByText("J'accepte les conditions générales d'utilisation d'Orasso").first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(anon.page, "01-inscription-conditions", theme);
    // Lien de vérification de l'e-mail ouvert dans l'appli (jeton invalide : message clair).
    await anon.page.goto("/verification-email?token=jeton-invalide");
    await expect(anon.page.getByText("Ce lien n'est plus valable").first()).toBeVisible({ timeout: 30_000 });
    await shot(anon.page, "02-verification-email", theme);
    await anon.ctx.close();

    const d = await openApp(browser, "damien@orasso.local", theme);
    // Raison d'une candidature impossible, avec l'année.
    await d.page.goto(`/e/${later.data.slug}`);
    const reason = d.page.getByTestId("registration-reason").filter({ visible: true });
    await expect(reason).toContainText(String(start.getFullYear()), { timeout: 30_000 });
    await shot(d.page, "03-raison-ouverture", theme);
    // Aperçu d'un brouillon (équipe organisatrice).
    await d.page.goto(`/e/${draft.data.slug}`);
    await expect(d.page.getByTestId("draft-preview").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
    await shot(d.page, "04-apercu-brouillon", theme);
    // Photos du véhicule : croix visible, couverture, confirmation du retrait (non confirmé).
    if (withPhotos) {
      await d.page.goto(`/vehicule/${withPhotos.id}`);
      const grid = d.page.getByTestId("vehicle-photos").filter({ visible: true });
      await expect(grid).toBeVisible({ timeout: 30_000 });
      await grid.scrollIntoViewIfNeeded();
      await shot(d.page, "05-vehicule-photos", theme);
      await grid.getByRole("button", { name: "Retirer cette photo" }).first().click();
      await expect(d.page.getByText("Retirer cette photo ?").filter({ visible: true }).first()).toBeVisible();
      await shot(d.page, "06-vehicule-retrait-confirmation", theme);
    }
    await d.ctx.close();
  }
  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [name, a] of Object.entries(audits)) {
    expect(a.greens, `${name} : vert`).toEqual([]);
    expect(a.horizontalScroll, `${name} : défilement horizontal`).toBe(false);
  }
});
