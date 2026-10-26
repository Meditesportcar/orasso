import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R5b : captures « avant » et « après » des écrans du profil et de leurs voisins (titres de section, boutons, cartes
// de véhicule), appli et site, Béton et Sable. Même liste avant et après : `CAPTURES_DIR` choisit le dossier
// (`…/lot-r5b-captures/avant` ou `…/apres`). Aucune assertion sur le contenu : ce sont des photos à comparer.
// Appli : 390 px, puis 384 px (largeur du Pixel de Damien) avec la police agrandie (×1,15 et ×1,3, posée par la page,
// faute de `fontScale` sur le web). Site : 390 et 1280 px. Lancer avec APP_URL (appli compilée), API et site seedés.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r5b-captures/avant`;
test.use({ actionTimeout: 30_000 });

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

/** Police agrandie simulée (contrôle web) : chaque texte multiplie son corps et son interligne (comme `fontScale`). */
async function scaleFonts(page: Page, k: number) {
  await page.evaluate((scale) => {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.dataset.scaled) continue;
      const s = getComputedStyle(el);
      const fs = Number.parseFloat(s.fontSize);
      const lh = Number.parseFloat(s.lineHeight);
      el.dataset.scaled = "1";
      if (fs > 0) el.style.setProperty("font-size", `${fs * scale}px`, "important");
      if (lh > 0) el.style.setProperty("line-height", `${lh * scale}px`, "important");
    }
  }, k);
}

async function openApp(browser: Browser, theme: Theme, width: number) {
  // Grande hauteur : tout l'écran dans une seule capture (le défilement de l'appli web est intérieur).
  const ctx = await browser.newContext({ viewport: { width, height: 2200 }, baseURL: APP });
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
  await page.waitForURL(/accueil|explorer|sorties|profil/, { timeout: 30_000 });
}

async function shot(page: Page, path: string, name: string, scale?: number) {
  await page.goto(path);
  await afterOpening(page);
  await page.waitForTimeout(2200);
  if (scale) {
    await scaleFonts(page, scale);
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${DIR}/appli/${name}.png` });
}

test("R5b captures : appli", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(1_500_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  const kenji = await login("kenji@orasso.local");
  const damien = await login("damien@orasso.local");
  const crews = await apiCall<{ slug: string }[]>(damien, "GET", "/me/crews");
  const crewSlug = crews.data[0]?.slug;
  const vehicles = await apiCall<{ id: string; status: string }[]>(kenji, "GET", "/me/vehicles");
  const vehicleId = vehicles.data.find((v) => v.status === "active")?.id;
  const events = await apiCall<{ items?: { slug: string }[] } | { slug: string }[]>(kenji, "GET", "/events?limit=5");
  const list = Array.isArray(events.data) ? events.data : (events.data.items ?? []);
  const eventSlug = list[0]?.slug;

  const screens: [string, string, string][] = [
    ["kenji@orasso.local", "/profil", "profil-kenji"],
    // Tour 2 : l'écran « Réglages » et l'Accueil (titres de section dont l'aide ou le lien passe dessous).
    ["kenji@orasso.local", "/reglages", "reglages-kenji"],
    ["kenji@orasso.local", "/accueil", "voisin-accueil-kenji"],
    ["kenji@orasso.local", "/rejoindre-crew", "voisin-crews-kenji"],
    ["kenji@orasso.local", "/reglages/profil", "reglages-profil-kenji"],
    ["kenji@orasso.local", "/reglages/compte", "reglages-compte-kenji"],
    ["kenji@orasso.local", "/profil-public", "profil-public-kenji"],
    ["kenji@orasso.local", "/u/Julie_66", "u-julie-par-kenji"],
    ["kenji@orasso.local", "/u/Marc_66", "u-marc-prive-par-kenji"],
    ["kenji@orasso.local", "/garage", "voisin-garage-kenji"],
    ["kenji@orasso.local", "/reglages/aide", "voisin-aide-kenji"],
    ["damien@orasso.local", "/profil", "profil-damien"],
    ["damien@orasso.local", "/profil-public", "profil-public-damien"],
    ["damien@orasso.local", "/u/Kenji_66", "u-kenji-par-damien"],
  ];
  if (crewSlug) screens.push(["damien@orasso.local", `/crew/${crewSlug}`, "voisin-crew-damien"]);
  if (vehicleId) screens.push(["kenji@orasso.local", `/vehicule/${vehicleId}`, "voisin-vehicule-kenji"]);
  if (eventSlug) screens.push(["kenji@orasso.local", `/e/${eventSlug}`, "voisin-fiche-kenji"]);
  // Police agrandie à 384 px : les écrans des défauts « SON » et « AJOUT/ER ».
  // Tour 2 (décision du coordinateur) : les titres de section à police normale à 384 px aussi (aide à droite).
  const normal384 = new Set(["voisin-accueil-kenji", "voisin-crews-kenji"]);
  const big = new Set([
    "profil-public-damien",
    "u-julie-par-kenji",
    "u-kenji-par-damien",
    "profil-kenji",
    "reglages-kenji",
  ]);

  for (const theme of THEMES) {
    for (const who of ["kenji@orasso.local", "damien@orasso.local"]) {
      const mine = screens.filter(([w]) => w === who);
      for (const width of [390, 384]) {
        const { ctx, page } = await openApp(browser, theme, width);
        await signIn(page, who);
        for (const [, path, name] of mine) {
          if (width === 390) await shot(page, path, `${name}-${theme}-390`);
          else if (normal384.has(name)) await shot(page, path, `${name}-${theme}-384`);
          else if (big.has(name)) {
            await shot(page, path, `${name}-${theme}-384`);
            await shot(page, path, `${name}-${theme}-384-police115`, 1.15);
            await shot(page, path, `${name}-${theme}-384-police130`, 1.3);
          }
        }
        await ctx.close();
      }
    }
  }
});

// Tour 2 (décision du coordinateur) : les titres de section de l'Explorer (Personnes et crews) et de l'équipe de
// l'organisateur, à police normale, 390 et 384 px : l'aide reste à droite quand elle tient.
test("R5b captures : Explorer et équipe", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/appli`, { recursive: true });
  for (const theme of THEMES) {
    for (const width of [390, 384]) {
      const kenji = await openApp(browser, theme, width);
      await signIn(kenji.page, "kenji@orasso.local");
      await kenji.page.goto("/explorer");
      await afterOpening(kenji.page);
      await kenji.page.getByText("Personnes et crews", { exact: true }).first().click();
      await kenji.page.waitForTimeout(2500);
      await kenji.page.screenshot({ path: `${DIR}/appli/voisin-explorer-personnes-kenji-${theme}-${width}.png` });
      await kenji.ctx.close();

      const damien = await openApp(browser, theme, width);
      await signIn(damien.page, "damien@orasso.local");
      await damien.page.goto("/moi");
      await afterOpening(damien.page);
      await damien.page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).first().click();
      await damien.page.waitForURL(/direct/, { timeout: 20_000 });
      await damien.page.getByRole("tab", { name: "Équipe" }).click();
      await damien.page.waitForURL(/equipe/, { timeout: 20_000 });
      await damien.page.waitForTimeout(2500);
      await damien.page.screenshot({ path: `${DIR}/appli/voisin-equipe-damien-${theme}-${width}.png` });
      await damien.ctx.close();
    }
  }
});

test("R5b captures : site", async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(`${DIR}/site`, { recursive: true });
  const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;
  const pages: [string, string][] = [
    ["/app/moi", "moi"],
    ["/app/profil-public", "profil-public"],
    ["/u/Julie_66", "u-julie"],
    ["/u/Marc_66", "u-marc-prive"],
  ];
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: WEB });
      const page = await ctx.newPage();
      await setTheme(page, theme);
      await loginInBrowser(page, "kenji@orasso.local", SEED_PASSWORD, "/app/moi");
      for (const [path, name] of pages) {
        await page.goto(path);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${DIR}/site/${name}-${theme}-${width}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});
