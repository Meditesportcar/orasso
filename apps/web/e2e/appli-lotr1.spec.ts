import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { auditPage } from "./audit";
import { login, MOBILE, SEED_PASSWORD } from "./helpers";
import { mediteTitles, r1Events } from "./helpers/lotr1";
import { RELAIS } from "./relais";

// Lot R1 (retours de Damien sur l'APK du 24/10), côté appli (version web compilée) :
//   - « Mon garage » reste entier après un changement de casquette passionné → organisateur → passionné ;
//   - « Médite » trouve les événements de MéditeSportCar (nom de l'organisateur, sans accents ni casse) ;
//   - un événement terminé n'est plus dans l'Explorer (liste et carte), un événement de plusieurs jours en cours y reste ;
//   - les sélecteurs (segment, tri, « Autour de… », distance, filtres) gardent le choix d'un onglet à l'autre et après
//     un redémarrage, sans jamais garder la position ;
//   - plus de stations de lavage ni de carburant dans Explorer › Pros.
// Béton et Sable, 390 px. Lancer avec APP_URL (appli compilée : `node scripts/appli-compilee.mjs`), API seedée.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r1-captures/appli`;
test.skip(!APP, "Appli : lancer avec APP_URL");
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

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

async function signIn(page: Page, email: string) {
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties/, { timeout: 30_000 });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function tab(page: Page, label: string) {
  await page.getByRole("tab", { name: label, exact: true }).last().click();
}

/** Le grand titre est entier : visible, sur une ligne, sans points de suspension, dans l'écran. */
async function wholeTitle(page: Page, title: string) {
  const heading = page.getByRole("heading", { name: title, exact: true }).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const box = await heading.evaluate((el) => {
    const style = getComputedStyle(el);
    const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const r = el.getBoundingClientRect();
    return {
      lines: Math.round(r.height / line),
      cut: el.scrollWidth > el.clientWidth + 1,
      right: r.right,
      text: el.textContent,
    };
  });
  expect(box.text).toBe(title);
  expect(box.lines, `« ${title} » sur une ligne`).toBe(1);
  expect(box.cut, `« ${title} » sans points de suspension`).toBe(false);
  expect(box.right).toBeLessThanOrEqual(MOBILE.width);
}

test("« Mon garage » reste entier après un changement de casquette (passionné → organisateur → passionné)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "damien@orasso.local");
    await tab(page, "Garage");
    await wholeTitle(page, "Mon garage");
    // Passionné → organisateur (Mon profil, casquettes).
    await goto(page, "/moi");
    await page.getByTestId("casquette-organizer").first().click();
    await page.waitForURL(/\/direct/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Tri", exact: true }).last()).toBeVisible();
    // Organisateur → passionné, puis le Garage : le titre est entier.
    await goto(page, "/moi");
    await page.getByTestId("casquette-fan").first().click();
    await expect(page.getByRole("tab", { name: "Garage", exact: true }).last()).toBeVisible({ timeout: 30_000 });
    await tab(page, "Garage");
    await wholeTitle(page, "Mon garage");
    // Un aller-retour d'onglets ne le change pas.
    await tab(page, "Explorer");
    await tab(page, "Garage");
    await wholeTitle(page, "Mon garage");
    await shot(page, `garage-apres-casquette-${theme}`);
    await ctx.close();
  }
});

test("Explorer : « Médite », événements terminés, plus de stations", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  const damien = await login("damien@orasso.local");
  const { over, running } = await r1Events(damien);
  const titles = await mediteTitles();
  expect(titles).toContain(running.title);
  expect(titles).not.toContain(over.title);

  for (const theme of THEMES) {
    const { ctx, page } = await open(browser, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/explorer");
    const later = page.getByText("Plus tard", { exact: true });
    if (await later.isVisible().catch(() => false)) await later.click();

    // « Médite » : les événements de MéditeSportCar, et eux seulement.
    await page.getByTestId("events-q").fill("Médite");
    const rows = page.getByTestId("event-row");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    for (const text of await rows.allTextContents()) expect(text).toContain("MéditeSportCar");
    await shot(page, `explorer-medite-${theme}`);
    // Sans accent ni majuscule, et un début de mot.
    await page.getByTestId("events-q").fill("medi");
    await expect(rows.first()).toContainText("MéditeSportCar", { timeout: 30_000 });

    // Terminé il y a une heure : plus là ; en cours depuis avant-hier (plusieurs jours) : là.
    await page.getByTestId("events-q").fill(over.title);
    await expect(page.getByText("Rien par ici", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(rows).toHaveCount(0);
    await page.getByTestId("events-q").fill(running.title);
    await expect(rows.filter({ hasText: running.title })).toHaveCount(1, { timeout: 30_000 });
    // La carte : le même événement terminé n'y est pas non plus.
    await page.getByTestId("events-q").fill(over.title);
    await page.getByTestId("map-toggle").click();
    await expect(page).toHaveURL(/\/carte/, { timeout: 30_000 });
    await expect(page.getByTestId("map-screen")).toBeVisible();
    await expect(page.getByText(over.title)).toHaveCount(0);
    await page.getByTestId("map-screen").getByTestId("list-toggle").click();
    await expect(page).toHaveURL(/explorer/, { timeout: 30_000 });
    await page.getByTestId("events-q").fill("");

    // Pros : le garage favori reste, ni lavage ni carburant.
    await page.getByText("Pros", { exact: true }).first().click();
    await expect(page.getByTestId("explorer-places")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Lavage le plus proche")).toHaveCount(0);
    await expect(page.getByText("Carburant le plus proche")).toHaveCount(0);
    await expect(page.getByTestId("widget-wash")).toHaveCount(0);
    await expect(page.getByTestId("widget-fuel")).toHaveCount(0);
    await shot(page, `explorer-pros-${theme}`);
    const audit = await auditPage(page);
    expect(audit.greens).toEqual([]);
    expect(audit.horizontalScroll).toBe(false);
    await ctx.close();
  }
});

test("Explorer : les sélecteurs gardent le choix (onglets, redémarrage), jamais la position", async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(DIR, { recursive: true });
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: MOBILE,
      baseURL: APP,
      permissions: ["geolocation"],
      geolocation: { latitude: 42.6986, longitude: 2.8956 },
    });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
    }, theme);
    await signIn(page, "kenji@orasso.local");
    await goto(page, "/explorer");
    await expect(page.getByTestId("sort-open")).toBeVisible({ timeout: 30_000 });

    // Tri « Places restantes », « Autour de » : Ailleurs… le 11, partout en France ; filtre « Ce week-end ».
    await page.getByTestId("sort-open").click();
    await page.getByTestId("sort-seats").click();
    await expect(page.getByTestId("sort-open")).toContainText("Places restantes");
    await page.getByTestId("around-open").click();
    await page.getByTestId("around-elsewhere").click();
    await page.getByTestId("around-find").fill("11");
    await page.getByRole("radio", { name: /^11 · / }).click();
    await expect(page.getByTestId("around-open")).toContainText("Le 11");
    await page.getByTestId("around-open").click();
    await page.getByRole("radio", { name: "Partout en France" }).click();
    await page.getByTestId("sheet-close").last().click();
    await page.getByTestId("filters-toggle").click();
    await page.getByText("Ce week-end", { exact: true }).click();
    await expect(page.getByTestId("filters-toggle")).toContainText("Filtres · 1");

    const kept = async () => {
      await expect(page.getByTestId("sort-open")).toContainText("Places restantes", { timeout: 30_000 });
      await expect(page.getByTestId("around-open")).toContainText("Le 11");
      await expect(page.getByTestId("filters-toggle")).toContainText("Filtres · 1");
      await expect(page.getByTestId("sort-line")).not.toContainText("à 50 km");
    };
    // Un autre onglet, puis retour.
    await tab(page, "Sorties");
    await tab(page, "Explorer");
    await kept();
    // Redémarrage de l'appli.
    await goto(page, "/explorer");
    await kept();
    await shot(page, `explorer-choix-garde-${theme}`);

    // Le segment aussi : Pros reste après un redémarrage.
    await page.getByText("Pros", { exact: true }).first().click();
    await expect(page.getByTestId("explorer-places")).toBeVisible({ timeout: 30_000 });
    await goto(page, "/explorer");
    await expect(page.getByTestId("explorer-places")).toBeVisible({ timeout: 30_000 });
    await page.getByText("Événements", { exact: true }).first().click();

    // « Autour de moi » : le mode reste, la position n'est jamais gardée sur l'appareil.
    await page.getByTestId("around-open").click();
    await page.getByTestId("around-me").click();
    await expect(page.getByTestId("around-open")).toContainText("Autour de moi", { timeout: 30_000 });
    const stored = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.includes("explorer-choice"))
        .map((k) => localStorage.getItem(k) ?? ""),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toContain('"kind":"me"');
    expect(stored[0]).not.toMatch(/lat|lng|42\.6|2\.89/);
    await goto(page, "/explorer");
    await expect(page.getByTestId("around-open")).toContainText("Autour de moi", { timeout: 30_000 });

    // « Revenir à mon coin » remet le point de départ, et c'est ce qui reste.
    await page.getByTestId("around-back").click();
    await expect(page.getByTestId("around-open")).toContainText("Mon coin");
    await goto(page, "/explorer");
    await expect(page.getByTestId("around-open")).toContainText("Mon coin", { timeout: 30_000 });
    await ctx.close();
  }
});
