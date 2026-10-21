import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, MOBILE, SEED_PASSWORD, samplePhoto, unique } from "./helpers";
import { auditApp } from "./helpers/lot43";

// Lot 53, côté appli (version web de recette) : l'assistant de création en huit temps (`s-create`, parité D20 avec le
// site) — type, lieu avec épingle posée sur la carte, arrivées, critères en trois questions, avant-première, règlement,
// affiche générée (photo factice), « Tout est prêt » ; enregistré à chaque temps ; un brouillon rouvre au bon temps.
// Deux thèmes, captures à 390 px. Lancer avec APP_URL=http://localhost:8381 (Metro derrière
// `apps/mobile/scripts/web-isolated.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? "C:/Users/Dams/.claude/relais/orasso/lot-53-captures/appli";
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 20_000 });

type Theme = "beton" | "sable";

const parisDay = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

async function open(browser: Browser, theme: Theme) {
  const ctx = await browser.newContext({ viewport: MOBILE, baseURL: APP });
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

async function signInOrganizer(page: Page) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill("damien@orasso.local");
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil/, { timeout: 60_000 });
  await page.goto("/moi");
  await afterOpening(page);
  await page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).first().click();
  await page.waitForURL(/\/direct/, { timeout: 60_000 });
}

const v = (page: Page, id: string) => page.getByTestId(id).locator("visible=true").first();

async function shot(page: Page, name: string, theme: Theme) {
  mkdirSync(DIR, { recursive: true });
  // Le champ actif s'allume (néon du focus) : on le quitte avant l'audit, comme en quittant la saisie.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(700);
  const a = await auditApp(page, theme);
  expect(a.primaryButtons, `${name} : un seul bouton principal (${a.primaryLabels.join(" | ")})`).toBeLessThanOrEqual(
    1,
  );
  expect(a.neon, `${name} : un seul néon (${a.neonLabels.join(" | ")})`).toBeLessThanOrEqual(1);
  expect(a.buttonsWithoutIcon, `${name} : tout bouton porte une icône`).toEqual([]);
  expect(a.greens).toEqual([]);
  expect(a.horizontalScroll).toBe(false);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
}

async function next(page: Page, label: string) {
  await v(page, "wizard-next").click();
  await expect(v(page, "wizard-step")).toContainText(label, { timeout: 30_000 });
}

for (const theme of ["beton", "sable"] as const) {
  test(`appli : huit temps, épingle, affiche générée, ${theme}`, async ({ browser }) => {
    test.setTimeout(360_000);
    const { ctx, page } = await open(browser, theme);
    await signInOrganizer(page);
    await page.goto("/nouvel-evenement");
    await expect(v(page, "wizard-step")).toBeVisible({ timeout: 30_000 });
    if (
      await v(page, "wizard-restart")
        .isVisible()
        .catch(() => false)
    )
      await v(page, "wizard-restart").click();
    const title = `Appli 53 ${unique()}`;

    // (1) Type.
    await expect(v(page, "wizard-step")).toContainText("Étape 1 sur 8 · Type");
    await v(page, "wizard-formats").getByText("Nocturne", { exact: true }).click();
    await v(page, "wizard-title").fill(title);
    await v(page, "wizard-date").fill(parisDay(25));
    await v(page, "wizard-start-time").fill("19:00");
    await v(page, "wizard-start-time").blur();
    await v(page, "wizard-end-time").fill("23:30");
    await v(page, "wizard-end-time").blur();
    await shot(page, "01-type", theme);
    await next(page, "Lieu");

    // (2) Lieu : adresse, épingle posée sur la carte, précision, mission.
    await v(page, "wizard-next").click();
    await expect(v(page, "wizard-error")).toContainText("adresse");
    await v(page, "wizard-address").fill("Quai Arthur Rimbaud");
    await v(page, "wizard-postal-code").fill("66140");
    await v(page, "wizard-city").fill("Canet-en-Roussillon");
    const canvas = v(page, "wizard-map-canvas");
    await expect(canvas.locator("canvas")).toBeVisible({ timeout: 60_000 });
    await canvas.click({ position: { x: 150, y: 140 } });
    await expect(v(page, "wizard-coords")).toContainText(/N · .* E/);
    await v(page, "wizard-entrance").fill("Entrée par le quai Nord");
    await v(page, "wizard-panel-onsite-toggle").click();
    await v(page, "wizard-mission-add").click();
    await shot(page, "02-lieu", theme);
    await next(page, "Arrivées");

    // (3) Arrivées.
    await v(page, "arrival-exhibitors-set").click();
    await expect(v(page, "wizard-exhibitor-sees")).toContainText("Arrivée 18 h 30 – 19 h 15 (strict)");
    await shot(page, "03-arrivees", theme);
    await next(page, "Critères");

    // (4) Critères en trois questions.
    await v(page, "wizard-origins").getByText("Japonaise", { exact: true }).click();
    await v(page, "wizard-origins").getByText("Allemande", { exact: true }).click();
    await expect(v(page, "wizard-criteria-summary")).toContainText("Tu acceptes les japonaises et les allemandes");
    await shot(page, "04-criteres", theme);
    await next(page, "Avant-première");

    // (5) Avant-première.
    await expect(v(page, "wizard-open-subscribers")).toBeVisible();
    await shot(page, "05-avant-premiere", theme);
    await next(page, "Règlement");

    // (6) Règlement.
    await page.getByText("Modèle Nocturne", { exact: true }).locator("visible=true").first().click();
    await expect(
      page
        .getByText(/4 lignes · \d+ caractères/)
        .locator("visible=true")
        .first(),
    ).toBeVisible();
    await shot(page, "06-reglement", theme);
    await next(page, "Affiche");

    // (7) Affiche : photo factice, style, titre, aperçu rendu par l'API.
    const chooser = page.waitForEvent("filechooser");
    await v(page, "wizard-poster-photo").click();
    await (await chooser).setFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: samplePhoto([40, 60, 120]) });
    await v(page, "wizard-style-jdm").click();
    await v(page, "wizard-poster-title").fill("Nocturne de Canet");
    await expect(v(page, "wizard-poster-preview")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await shot(page, "07-affiche", theme);
    await next(page, "Tout est prêt");

    // (8) Tout est prêt.
    await expect(v(page, "wizard-ready-poster")).toBeVisible({ timeout: 30_000 });
    await expect(v(page, "wizard-recap")).toContainText(title);
    await expect(v(page, "wizard-publish")).toBeVisible();
    await shot(page, "08-tout-est-pret", theme);

    // Enregistré à chaque temps : le brouillon porte déjà tout.
    const damien = await login("damien@orasso.local");
    const me = await apiCall<{ memberships: { structureId: string; structureSlug: string }[] }>(damien, "GET", "/me");
    const structureId = me.data.memberships.find((m) => m.structureSlug === "meditesportcar")?.structureId;
    const list = await apiCall<{ id: string; title: string }[]>(damien, "GET", `/structures/${structureId}/events`);
    const id = list.data.find((e) => e.title === title)?.id ?? "";
    const ev = await apiCall<{
      status: string;
      lat: number | null;
      entranceNote: string | null;
      posterSettings: { style: string; photoKey: string | null } | null;
      posterUrl: string | null;
    }>(damien, "GET", `/events/${id}`);
    expect(ev.data).toMatchObject({
      status: "draft",
      entranceNote: "Entrée par le quai Nord",
      posterSettings: { style: "jdm" },
    });
    expect(ev.data.lat).not.toBeNull();
    expect(ev.data.posterSettings?.photoKey).toBeTruthy();
    expect(ev.data.posterUrl).toBeTruthy();
    expect((await apiCall<unknown[]>(damien, "GET", `/events/${id}/needs`)).data).toHaveLength(1);

    // Brouillon : garde-le, puis il rouvre sur « Tout est prêt » ; `?temps=` choisit le temps.
    await v(page, "wizard-save").click();
    await page.waitForURL(/\/evenement\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await page.goto(`/evenement/${id}/modifier`);
    await expect(v(page, "wizard-step")).toContainText("Tout est prêt", { timeout: 30_000 });
    await page.goto(`/evenement/${id}/modifier?temps=reglement`);
    await expect(v(page, "wizard-step")).toContainText("Règlement", { timeout: 30_000 });
    await ctx.close();
  });
}
