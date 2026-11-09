import { mkdirSync } from "node:fs";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { apiCall, login, SEED_PASSWORD, setTheme } from "./helpers";
import { RELAIS } from "./relais";

// Lot R7l2 : captures avant / après des écrans touchés (éditeur d'événement, fiche de l'événement côté organisateur, Direct,
// mode staff), appli et site, Béton et Sable. Événement en cours « Rassemblement du Lydia » du seed (Sarah propriétaire,
// Damien staff de la structure). Aucune assertion de contenu : ce sont les photos de contrôle.
//   CAPTURES_DIR=<dossier> APP_URL=http://localhost:<appli compilée> pnpm exec playwright test lotr7l2-captures
// Sans APP_URL, seul le site est capturé. `EXTRA=1` ajoute les écrans neufs (étape « Votes », liste des votes).
const APP = process.env.APP_URL;
const DIR = (process.env.CAPTURES_DIR ?? `${RELAIS}/lot-r7l2-captures/avant`).replaceAll("\\", "/");
const EXTRA = process.env.EXTRA === "1";
const SLUG = "rassemblement-du-lydia";
test.use({ actionTimeout: 30_000 });
test.setTimeout(1_800_000);

type Theme = "beton" | "sable";
const THEMES: Theme[] = ["beton", "sable"];

type EventRow = { id: string; structure: { slug: string; id: string } };
async function lydia(): Promise<EventRow> {
  const cookie = await login("damien@orasso.local");
  return (await apiCall<EventRow>(cookie, "GET", `/events/by-slug/${SLUG}`)).data;
}

async function afterOpening(page: Page) {
  const skip = page.getByTestId("opening-skip");
  if (await skip.isVisible().catch(() => false))
    await skip.click({ position: { x: 40, y: 600 } }).catch(() => undefined);
  await expect(page.getByTestId("opening-battle")).toHaveCount(0, { timeout: 8_000 });
}

async function appContext(browser: Browser, theme: Theme, width: number, scale: number, email: string, height = 860) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    baseURL: APP,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  await ctx.addInitScript(
    ([t, s]) => {
      localStorage.setItem("orasso.onboarded", "1");
      localStorage.setItem("orasso.theme", t);
      if (s > 1) localStorage.setItem("orasso.recette.echellePolice", String(s));
      else localStorage.removeItem("orasso.recette.echellePolice");
    },
    [theme, scale] as const,
  );
  const page = await ctx.newPage();
  await page.goto("/auth");
  await afterOpening(page);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).first().fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await page.waitForURL(/accueil|explorer|sorties|profil|direct/, { timeout: 60_000 });
  return { ctx, page };
}

async function snap(page: Page, path: string, name: string, waitFor?: string) {
  await page.goto(path);
  await afterOpening(page).catch(() => undefined);
  if (waitFor)
    await page
      .getByTestId(waitFor)
      .first()
      .waitFor({ timeout: 45_000 })
      .catch(() => undefined);
  await page.waitForTimeout(2500);
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

const VARIANTS: [number, number][] = [
  [390, 1],
  [384, 1],
  [384, 1.3],
];
const tag = (w: number, s: number, theme: Theme) => `appli-${w}-x${String(s).replace(".", "")}-${theme}`;

test("captures de l'appli : organisateur (Direct, fiche, étapes de l'éditeur)", async ({ browser }) => {
  test.skip(!APP, "Appli : lancer avec APP_URL");
  const ev = await lydia();
  for (const theme of THEMES) {
    for (const [width, scale] of VARIANTS) {
      const sarah = await appContext(browser, theme, width, scale, "sarah@orasso.local", 1500);
      await sarah.page.goto("/moi");
      await afterOpening(sarah.page);
      await sarah.page
        .getByTestId("casquette-organizer")
        .filter({ hasText: "Roues Libres" })
        .first()
        .click()
        .catch(() => undefined);
      await sarah.page.waitForURL(/\/direct/, { timeout: 60_000 }).catch(() => undefined);
      await sarah.page.waitForTimeout(4000);
      await sarah.page.screenshot({ path: `${DIR}/${tag(width, scale, theme)}-direct.png` });
      await snap(sarah.page, `/evenement/${ev.id}`, `${tag(width, scale, theme)}-orga-fiche`);
      await snap(
        sarah.page,
        `/evenement/${ev.id}/modifier?temps=reglement`,
        `${tag(width, scale, theme)}-etape-reglement`,
      );
      await snap(sarah.page, `/evenement/${ev.id}/modifier?temps=affiche`, `${tag(width, scale, theme)}-etape-apercu`);
      if (EXTRA) {
        await snap(
          sarah.page,
          `/evenement/${ev.id}/modifier?temps=votes`,
          `${tag(width, scale, theme)}-etape-votes`,
          "wizard-votes",
        );
        await snap(sarah.page, `/evenement/${ev.id}/votes`, `${tag(width, scale, theme)}-votes-direct`, "votes-screen");
      }
      await sarah.ctx.close();
      const damien = await appContext(browser, theme, width, scale, "damien@orasso.local", 1500);
      await snap(damien.page, `/staff/${ev.id}`, `${tag(width, scale, theme)}-staff`);
      if (EXTRA)
        await snap(damien.page, `/staff/${ev.id}/votes`, `${tag(width, scale, theme)}-staff-votes`, "votes-screen");
      await damien.ctx.close();
    }
  }
});

async function siteContext(browser: Browser, theme: Theme, width: number, email: string) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  const page = await ctx.newPage();
  await setTheme(page, theme);
  await page.goto(`/connexion?retour=${encodeURIComponent("/app")}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

async function siteSnap(page: Page, path: string, file: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  mkdirSync(DIR, { recursive: true });
  await page.screenshot({ path: `${DIR}/${file}.png`, fullPage: true });
}

test("captures du site", async ({ browser }) => {
  const ev = await lydia();
  for (const theme of THEMES) {
    for (const width of [390, 1280]) {
      const sarah = await siteContext(browser, theme, width, "sarah@orasso.local");
      const base = `/orga/${ev.structure.slug}/e/${ev.id}`;
      await siteSnap(sarah.page, `${base}/jour-j`, `site-${width}-${theme}-orga-jour-j`);
      await siteSnap(sarah.page, base, `site-${width}-${theme}-orga-fiche`);
      await siteSnap(sarah.page, `${base}/modifier?temps=reglement`, `site-${width}-${theme}-etape-reglement`);
      await siteSnap(sarah.page, `${base}/modifier?temps=affiche`, `site-${width}-${theme}-etape-apercu`);
      if (EXTRA) {
        await siteSnap(sarah.page, `${base}/modifier?temps=votes`, `site-${width}-${theme}-etape-votes`);
        await siteSnap(sarah.page, `${base}/votes`, `site-${width}-${theme}-votes`);
      }
      await sarah.ctx.close();
    }
  }
});
