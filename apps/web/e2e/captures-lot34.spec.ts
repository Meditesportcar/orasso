import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { type Audit, auditPage } from "./audit";
import { apiCall, createEvent, login, SEED_PASSWORD, SIGNUP_EXTRAS, signUpApi, unique } from "./helpers";

// Captures des écrans nouveaux du lot 34 dans l'appli (navigateur, 390 px, Béton et Sable) et contrôle du système de
// design dans le DOM (pas de vert, rien de tronqué, pas de défilement horizontal) : billets du public (bloc de la page
// d'un événement, Mes billets), création de la fiche pro, justificatif en PDF, filtre « Jour » du mode liste du tri.
// Lancer avec APP_URL (relais isolé devant `expo start --web`) et CAPTURES_DIR. Les captures du dépôt sont dans
// `docs/recette/suite/appli/`.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "../../docs/recette/suite/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];
const audits: Record<string, Pick<Audit, "greens" | "truncated" | "horizontalScroll">> = {};

async function openApp(browser: Browser, email: string, theme: Theme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("orasso.onboarded", "1");
    localStorage.setItem("orasso.theme", t);
  }, theme);
  await page.goto("/auth");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 30_000 });
  return { ctx, page };
}

async function shot(page: Page, name: string, theme: Theme) {
  // L'ouverture animée (logo) passe à chaque chargement d'une adresse : on attend qu'elle soit finie.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png` });
  const a = await auditPage(page);
  audits[`${name}-${theme}`] = { greens: a.greens, truncated: a.truncated, horizontalScroll: a.horizontalScroll };
}

test("écrans nouveaux du lot 34, deux thèmes à 390 px", async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const ev = await createEvent(damien, { publicAccess: "free_reservation", title: `Cars & Coffee ${unique()}` });
  expect((await apiCall(damien, "PUT", `/events/${ev.id}/ticketing`, { enabled: true, capacity: 40 })).status).toBe(
    200,
  );

  for (const theme of THEMES) {
    // Billets du public : bloc de la page de l'événement, puis Mes billets.
    const visitor = `Capt_${unique()}`.slice(0, 24);
    await signUpApi(visitor);
    const v = await openApp(browser, `${visitor.toLowerCase()}@e2e.orasso.test`, theme);
    await v.page.goto(`/e/${ev.slug}`);
    const block = v.page.getByTestId("ticket-block");
    await expect(block).toBeVisible({ timeout: 30_000 });
    await block.scrollIntoViewIfNeeded();
    await shot(v.page, "01-billets-visiteurs", theme);
    await v.page.getByTestId("ticket-reserve").click();
    await v.page.waitForURL(/billets/, { timeout: 30_000 });
    await expect(v.page.getByTestId("ticket-qr").first()).toBeVisible({ timeout: 20_000 });
    await shot(v.page, "02-mes-billets", theme);

    // Créer sa fiche pro depuis Mes casquettes.
    await v.page.goto("/accueil");
    await v.page.getByRole("button", { name: "Moi et mes casquettes" }).click();
    await v.page.getByTestId("casquette-create-pro").click();
    await expect(v.page.getByTestId("pro-form")).toBeVisible({ timeout: 30_000 });
    await shot(v.page, "03-creer-fiche-pro", theme);
    await v.ctx.close();

    // Justificatif en PDF : une structure neuve, non vérifiée.
    const email = `capt34-${unique()}@orasso.test`;
    expect(
      (
        await apiCall(null, "POST", "/auth/sign-up/email", {
          email,
          password: SEED_PASSWORD,
          name: "Capt 34",
          termsAccepted: true,
          ...SIGNUP_EXTRAS,
        })
      ).status,
    ).toBe(200);
    const cookie = await login(email);
    const name = `Club ${unique()}`.slice(0, 40);
    expect(
      (await apiCall(cookie, "POST", "/structures", { kind: "association", name, departments: ["66"] })).status,
    ).toBe(201);
    const o = await openApp(browser, email, theme);
    await o.page.getByRole("button", { name: "Moi et mes casquettes" }).click();
    await o.page.getByTestId("casquette-organizer").filter({ hasText: name }).click();
    await o.page.waitForURL(/\/direct/, { timeout: 20_000 });
    await o.page.goto("/ma-structure");
    await expect(o.page.getByTestId("orga-verification-add-pdf")).toBeVisible({ timeout: 30_000 });
    await o.page.getByTestId("orga-verification-add-pdf").scrollIntoViewIfNeeded();
    await shot(o.page, "04-justificatif-pdf", theme);
    await o.ctx.close();

    // Filtre « Jour » du mode liste (Salon de printemps, trois jours).
    const d = await openApp(browser, "damien@orasso.local", theme);
    await d.page.getByRole("button", { name: "Moi et mes casquettes" }).click();
    await d.page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
    await d.page.waitForURL(/\/direct/, { timeout: 20_000 });
    await d.page.getByRole("tab", { name: "Tri", exact: true }).click();
    await d.page.getByTestId("triage-event-picker").click();
    await d.page.getByTestId("triage-event-choice").filter({ hasText: "Salon de printemps" }).click();
    await d.page.getByRole("tab", { name: "Liste", exact: true }).click();
    const list = d.page.getByTestId("triage-list").filter({ visible: true }).last();
    await list.getByTestId("triage-filters").click();
    await expect(d.page.getByRole("combobox", { name: "Jour" })).toBeVisible({ timeout: 20_000 });
    await shot(d.page, "05-tri-filtre-jour", theme);
    await d.ctx.close();
  }

  writeFileSync(`${DIR}/audit.json`, JSON.stringify(audits, null, 2));
  for (const [key, a] of Object.entries(audits)) {
    expect(a.greens, `${key} : pas de vert`).toEqual([]);
    expect(a.truncated, `${key} : rien de tronqué`).toEqual([]);
    expect(a.horizontalScroll, `${key} : pas de défilement horizontal`).toBe(false);
  }
});
