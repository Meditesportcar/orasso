import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, loginInBrowser, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R8d : les captures « après » de la fiche de l'événement (appli : Béton et Sable, 384 et 390 px, police x1 et x1,3 ; site :
// Béton et Sable, 390 et 1280 px), pour un événement à venir (Nocturne de Canet) et un événement en cours (Lydia) ou fini
// (Nocturne de rentrée), vus par un passionné, l'organisatrice et sans session ; l'écran des mentions et les menus. Lancer avec
// CAPTURES_DIR (le dossier `apres` du lot) et, pour l'appli, APP_URL.
const APP = process.env.APP_URL;
const DIR = process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r8d-captures/apres`;
test.use({ actionTimeout: 30_000 });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function open(browser: Browser, width: number, fontScale: number, theme: "beton" | "sable") {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: APP });
  await ctx.addInitScript(
    ([f, th]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", th as string);
      if (f !== 1) localStorage.setItem("orasso.recette.echellePolice", String(f));
    },
    [fontScale, theme] as const,
  );
  return { ctx, page: await ctx.newPage() };
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

async function go(page: Page, path: string) {
  await page.goto(path);
  await afterOpening(page);
}

const EVENTS = [
  ["canet", "nocturne-de-canet-2026"],
  ["lydia", "rassemblement-du-lydia"],
  ["rentree", "nocturne-de-rentree"],
] as const;

test("appli : la fiche (journal, mentions) en passionné, Béton et Sable, 384 et 390 px, police x1 et x1,3", async ({
  browser,
}) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(900_000);
  for (const [theme, width, scale] of [
    ["beton", 390, 1],
    ["beton", 384, 1.3],
    ["sable", 390, 1],
    ["sable", 384, 1.3],
  ] as const) {
    const { ctx, page } = await open(browser, width, scale, theme);
    await signIn(page, "kenji@orasso.local");
    for (const [name, slug] of EVENTS) {
      await go(page, `/e/${slug}`);
      const section = page.getByTestId("event-journal");
      await expect(section).toBeVisible({ timeout: 60_000 });
      await section.scrollIntoViewIfNeeded();
      await shot(page, `appli-fiche-${name}-passionne-${theme}-${width}-x${scale}`);
      const row = page.getByTestId("event-mentions-row");
      if (await row.isVisible().catch(() => false)) {
        await row.scrollIntoViewIfNeeded();
        await shot(page, `appli-fiche-${name}-mentions-ligne-${theme}-${width}-x${scale}`);
      }
    }
    await go(page, "/e/mentions/rassemblement-du-lydia");
    await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
    await shot(page, `appli-mentions-lydia-${theme}-${width}-x${scale}`);
    await go(page, "/e/mentions/nocturne-de-rentree");
    await expect(page.getByTestId("mentions-fans")).toBeVisible({ timeout: 30_000 });
    await shot(page, `appli-mentions-rentree-${theme}-${width}-x${scale}`);
    await ctx.close();
  }
});

test("appli : l'organisatrice (menus, une par une, mentions masquées) et sans session", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  test.setTimeout(600_000);
  for (const theme of ["beton", "sable"] as const) {
    const { ctx, page } = await open(browser, 390, 1, theme);
    await signIn(page, "sarah@orasso.local");
    await go(page, "/e/rassemblement-du-lydia");
    const section = page.getByTestId("event-journal");
    await expect(section).toBeVisible({ timeout: 60_000 });
    await section.scrollIntoViewIfNeeded();
    await shot(page, `appli-fiche-lydia-organisatrice-grille-${theme}`);
    await section.getByTestId("journal-tile-menu").nth(1).click();
    await expect(page.getByTestId("publication-menu-pin")).toBeVisible();
    await shot(page, `appli-menu-epingler-${theme}`);
    await page.getByTestId("publication-menu-close").click();
    await page.getByRole("button", { name: "Une par une" }).click();
    await section.scrollIntoViewIfNeeded();
    await shot(page, `appli-fiche-lydia-organisatrice-une-par-une-${theme}`);
    await page.getByRole("button", { name: "Grille de deux" }).click();
    await go(page, "/e/mentions/rassemblement-du-lydia");
    await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
    await shot(page, `appli-mentions-lydia-organisatrice-${theme}`);
    await page.getByTestId("mention-menu").first().click();
    await expect(page.getByTestId("mention-menu-hide")).toBeVisible();
    await shot(page, `appli-menu-masquer-${theme}`);
    await ctx.close();
    const anon = await open(browser, 390, 1, theme);
    await go(anon.page, "/e/rassemblement-du-lydia");
    await expect(anon.page.getByTestId("event-journal")).toBeVisible({ timeout: 60_000 });
    await anon.page.getByTestId("event-journal").scrollIntoViewIfNeeded();
    await shot(anon.page, `appli-fiche-lydia-sans-session-${theme}`);
    await anon.ctx.close();
  }
  // L'espace de l'organisateur et le jour J.
  const damien = await open(browser, 390, 1, "sable");
  await signIn(damien.page, "damien@orasso.local");
  await go(damien.page, "/moi");
  await damien.page.getByTestId("casquette-organizer").filter({ hasText: "MéditeSportCar" }).click();
  await damien.page.waitForURL(/\/direct/, { timeout: 30_000 });
  const ev = (
    await apiCall<{ id: string }>(await login("damien@orasso.local"), "GET", "/events/by-slug/nocturne-de-canet-2026")
  ).data;
  await go(damien.page, `/evenement/${ev.id}`);
  await expect(damien.page.getByTestId("orga-publish-for-event")).toBeVisible({ timeout: 60_000 });
  await shot(damien.page, "appli-evenement-organisateur-sable");
  await damien.ctx.close();
});

test("site : la fiche (journal, mentions) 390 et 1280 px, Béton et Sable, passionné, organisatrice, sans session", async ({
  page,
  browser,
}) => {
  test.setTimeout(900_000);
  for (const theme of ["beton", "sable"] as const) {
    await setTheme(page, theme);
    await page.context().clearCookies();
    await loginInBrowser(page, "kenji@orasso.local", undefined, "/e/nocturne-de-canet-2026");
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, slug] of EVENTS) {
        await page.goto(`/e/${slug}`);
        await expect(page.getByTestId("event-journal")).toBeVisible({ timeout: 60_000 });
        await page.getByTestId("event-journal").scrollIntoViewIfNeeded();
        await shot(page, `site-fiche-${name}-passionne-${theme}-${width}`);
      }
      await page.goto("/app/e/rassemblement-du-lydia/mentions");
      await expect(page.getByTestId("event-mentions")).toBeVisible({ timeout: 30_000 });
      await shot(page, `site-mentions-lydia-${theme}-${width}`);
      await page.goto("/app/e/nocturne-de-rentree/mentions");
      await expect(page.getByTestId("mentions-fans")).toBeVisible({ timeout: 30_000 });
      await shot(page, `site-mentions-rentree-${theme}-${width}`);
    }
    // Sans session.
    const anon = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const ap = await anon.newPage();
    await ap.goto("/e/rassemblement-du-lydia");
    await expect(ap.getByTestId("event-journal")).toBeVisible({ timeout: 60_000 });
    await ap.getByTestId("event-journal").scrollIntoViewIfNeeded();
    await shot(ap, `site-fiche-lydia-sans-session-${theme}-390`);
    await ap.setViewportSize({ width: 1280, height: 900 });
    await shot(ap, `site-fiche-lydia-sans-session-${theme}-1280`);
    await anon.close();
    // Organisatrice : menus.
    await page.context().clearCookies();
    await loginInBrowser(page, "sarah@orasso.local", undefined, "/e/rassemblement-du-lydia");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/e/rassemblement-du-lydia");
    await expect(page.getByTestId("event-journal")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("event-journal").scrollIntoViewIfNeeded();
    await shot(page, `site-fiche-lydia-organisatrice-${theme}-390`);
    await page.getByTestId("journal-tile-menu").nth(1).click();
    await expect(page.getByTestId("publication-menu-pin")).toBeVisible();
    await shot(page, `site-menu-epingler-${theme}-390`);
    // Communication.
    const sarah = await login("sarah@orasso.local");
    const ev = (
      await apiCall<{ id: string; structure: { slug: string } }>(sarah, "GET", "/events/by-slug/rassemblement-du-lydia")
    ).data;
    await page.goto(`/orga/${ev.structure.slug}/communication?e=${ev.id}`);
    await expect(page.getByTestId("publish-panel")).toBeVisible({ timeout: 30_000 });
    await shot(page, `site-communication-${theme}-390`);
  }
});
